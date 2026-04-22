/**
 * scripts/migrate-screen-items-rename.mjs
 *
 * ScreenItem.name → ScreenItem.id リネーム移行スクリプト (#330)
 *
 * 旧形式: { "id": "<UUID>", "name": "userName", "label": "...", ... }
 * 新形式: { "id": "userName", "label": "...", ... }
 *
 * 使い方:
 *   node scripts/migrate-screen-items-rename.mjs           # dry-run (変更なし)
 *   node scripts/migrate-screen-items-rename.mjs --apply   # 実際に変換
 *
 * 冪等: name フィールドが存在しない項目はスキップするため 2 回目以降は 0 件変更。
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREEN_ITEMS_DIR = path.resolve(__dirname, "../data/screen-items");
const apply = process.argv.includes("--apply");

if (!fs.existsSync(SCREEN_ITEMS_DIR)) {
  console.log(`ディレクトリが存在しません: ${SCREEN_ITEMS_DIR}`);
  console.log("data/screen-items/ が無い場合は移行対象がありません。");
  process.exit(0);
}

const files = fs.readdirSync(SCREEN_ITEMS_DIR).filter((f) => f.endsWith(".json"));
let totalChanged = 0;

for (const file of files) {
  const filePath = path.join(SCREEN_ITEMS_DIR, file);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    console.error(`[SKIP] ${file}: JSON parse error — ${e.message}`);
    continue;
  }

  if (!Array.isArray(data.items)) {
    console.log(`[SKIP] ${file}: items が配列ではありません`);
    continue;
  }

  let fileChanged = 0;
  const newItems = data.items.map((item) => {
    if (!("name" in item)) return item; // 既に移行済み → スキップ
    const { id: _oldId, name, ...rest } = item;
    fileChanged++;
    return { id: name, ...rest };
  });

  if (fileChanged === 0) {
    console.log(`[OK]   ${file}: 変更なし (移行済み)`);
    continue;
  }

  totalChanged += fileChanged;
  console.log(`[ITEM] ${file}: ${fileChanged} 件の項目を変換`);
  for (let i = 0; i < data.items.length; i++) {
    if (!("name" in data.items[i])) continue;
    const old = data.items[i];
    const next = newItems[i];
    console.log(`         ${i + 1}: { id: "${old.id}" (旧 UUID), name: "${old.name}" } → { id: "${next.id}" }`);
  }

  if (apply) {
    const newData = { ...data, items: newItems };
    fs.writeFileSync(filePath, JSON.stringify(newData, null, 2) + "\n", "utf8");
    console.log(`         → 書き込み完了`);
  }
}

console.log("");
if (apply) {
  console.log(`完了: 合計 ${totalChanged} 件を変換しました。`);
} else {
  console.log(`dry-run 完了: 合計 ${totalChanged} 件が変換対象です。`);
  if (totalChanged > 0) {
    console.log("実際に変換するには --apply オプションを付けて再実行してください。");
  }
}
