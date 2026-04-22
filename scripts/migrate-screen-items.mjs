/**
 * scripts/migrate-screen-items.mjs
 *
 * 既存の data/screens/*.json に name / data-item-id が付いていない
 * <input|select|textarea> 要素を in-place でマイグレーションする。
 *
 * 使用方法:
 *   node scripts/migrate-screen-items.mjs            # dry-run (変更一覧のみ表示)
 *   node scripts/migrate-screen-items.mjs --apply    # 実書き込み
 *
 * 冪等性:
 *   - 既に data-item-id がある要素はスキップ
 *   - 既に name がある要素は name を尊重 (id / data-item-id だけ追加)
 *   - 2 回目以降の実行は何もしないで終わる
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");
const SCREENS_DIR = path.join(DATA_DIR, "screens");
const SCREEN_ITEMS_DIR = path.join(DATA_DIR, "screen-items");

const APPLY = process.argv.includes("--apply");

// ── 対象タグ / 除外 type ──────────────────────────────────────────────────
const FORM_FIELD_TAGS = ["input", "select", "textarea"];
const EXCLUDED_INPUT_TYPES = new Set(["button", "submit", "reset", "hidden", "image"]);

// 開始タグにマッチする正規表現 (属性を含む可能性あり)
// <input ...> / <select ...> / <textarea ...>
const OPEN_TAG_RE = /<(input|select|textarea)(\s[^>]*)?>/gi;

function generateUUID() {
  return crypto.randomUUID();
}

/**
 * 開始タグ文字列から指定属性の値を取得する
 */
function getAttr(tag, attr) {
  const re = new RegExp(`\\b${attr}="([^"]*)"`, "i");
  const m = re.exec(tag);
  return m ? m[1] : null;
}

/**
 * 開始タグ文字列に属性を追加する (既にある属性はスキップ)
 * @returns { tag: string, added: string[] }
 */
function addAttrsToTag(tag, attrs) {
  const added = [];
  let result = tag;
  for (const [k, v] of Object.entries(attrs)) {
    if (getAttr(result, k) !== null) continue; // 既存属性はスキップ
    // '>' の直前に挿入
    result = result.replace(/>$/, ` ${k}="${v}">`);
    added.push(k);
  }
  return { tag: result, added };
}

/**
 * HTML 文字列を走査して未発番の form field に name / id / data-item-id を挿入する。
 * @returns { html: string, changes: Array<{field: string, added: string[]}> }
 */
function migrateHtml(html) {
  const changes = [];
  const result = html.replace(OPEN_TAG_RE, (match, tagName) => {
    const tag = tagName.toLowerCase();
    if (!FORM_FIELD_TAGS.includes(tag)) return match;

    // input type チェック
    if (tag === "input") {
      const t = (getAttr(match, "type") ?? "text").toLowerCase();
      if (EXCLUDED_INPUT_TYPES.has(t)) return match;
    }

    const existingDataItemId = getAttr(match, "data-item-id");
    const existingName = getAttr(match, "name");

    // 既に両方あればスキップ
    if (existingDataItemId && existingName && getAttr(match, "id")) return match;

    const newUUID = existingDataItemId ?? generateUUID();
    const shortId = newUUID.split("-")[0];
    const newName = existingName ?? `field_${shortId}`;

    const toAdd = {};
    if (!existingDataItemId) toAdd["data-item-id"] = newUUID;
    if (!existingName) toAdd.name = newName;
    if (!getAttr(match, "id")) toAdd.id = newName;

    const { tag: newTag, added } = addAttrsToTag(match, toAdd);
    if (added.length > 0) {
      changes.push({ field: newName, added });
    }
    return newTag;
  });

  return { html: result, changes };
}

/**
 * 画面ごとに data/screen-items/{screenId}.json を生成・マージする。
 * 既存ファイルがあれば既存 item は保持し、未登録 data-item-id のみ追加する。
 */
function upsertScreenItems(screenId, html, apply) {
  const itemsPath = path.join(SCREEN_ITEMS_DIR, `${screenId}.json`);
  let existing = { screenId, version: "0.1.0", updatedAt: new Date().toISOString(), items: [] };
  if (fs.existsSync(itemsPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(itemsPath, "utf8"));
    } catch (_) {}
  }

  const existingIds = new Set(existing.items.map((i) => i.id));
  const newItems = [];

  // HTML から data-item-id を抽出して未登録分を追加
  let m;
  const re = /<(input|select|textarea)(\s[^>]*)?>/gi;
  while ((m = re.exec(html)) !== null) {
    const tagName = m[1].toLowerCase();
    if (tagName === "input") {
      const t = (getAttr(m[0], "type") ?? "text").toLowerCase();
      if (EXCLUDED_INPUT_TYPES.has(t)) continue;
    }
    const name = getAttr(m[0], "name");
    if (!name) continue;
    if (existingIds.has(name)) continue;

    newItems.push({
      id: name,    // #330: 業務識別子。後で変更可能
      label: name, // 後でユーザーが日本語に変更可能
      type: inferType(tagName, getAttr(m[0], "type")),
    });
  }

  if (newItems.length === 0) return 0;

  if (apply) {
    fs.mkdirSync(SCREEN_ITEMS_DIR, { recursive: true });
    const merged = {
      ...existing,
      updatedAt: new Date().toISOString(),
      items: [...existing.items, ...newItems],
    };
    fs.writeFileSync(itemsPath, JSON.stringify(merged, null, 2), "utf8");
  }

  return newItems.length;
}

function inferType(tag, inputType) {
  if (tag === "select") return "string";
  if (tag === "textarea") return "string";
  const t = (inputType ?? "text").toLowerCase();
  if (t === "number" || t === "range") return "number";
  if (t === "date" || t === "datetime-local" || t === "month" || t === "week") return "date";
  if (t === "checkbox") return "boolean";
  return "string";
}

// ── メイン処理 ─────────────────────────────────────────────────────────────
if (!fs.existsSync(SCREENS_DIR)) {
  console.error(`data/screens/ が存在しません: ${SCREENS_DIR}`);
  process.exit(1);
}

const files = fs.readdirSync(SCREENS_DIR).filter((f) => f.endsWith(".json"));
if (files.length === 0) {
  console.log("data/screens/ にファイルがありません。");
  process.exit(0);
}

let totalScreens = 0;
let totalItems = 0;

for (const file of files) {
  const screenId = file.replace(".json", "");
  const filePath = path.join(SCREENS_DIR, file);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    console.warn(`[skip] ${file}: JSON parse error`);
    continue;
  }

  const page = data?.pages?.[0];
  const frame = page?.frames?.[0];
  const component = frame?.component;
  if (!component || typeof component.components !== "string") continue;

  const { html: newHtml, changes } = migrateHtml(component.components);
  const newItemCount = upsertScreenItems(screenId, newHtml, APPLY);

  if (changes.length === 0 && newItemCount === 0) continue;

  console.log(`[${file}] フィールド変更: ${changes.length} 件, 画面項目追加: ${newItemCount} 件`);
  for (const c of changes) {
    console.log(`  - ${c.field}: +${c.added.join(", ")}`);
  }

  if (APPLY && changes.length > 0) {
    // .bak.<timestamp> に旧版退避
    const ts = Date.now();
    fs.copyFileSync(filePath, `${filePath}.bak.${ts}`);

    component.components = newHtml;
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  }

  totalScreens++;
  totalItems += changes.length;
}

console.log("");
if (APPLY) {
  console.log(`✅ マイグレーション完了: 画面 ${totalScreens} 件、属性付与 ${totalItems} 件`);
} else {
  console.log(`🔍 Dry-run: 画面 ${totalScreens} 件、属性付与予定 ${totalItems} 件`);
  if (totalScreens > 0) {
    console.log("実際に書き込むには --apply を付けて実行してください。");
  } else {
    console.log("変更対象なし (冪等)。");
  }
}
