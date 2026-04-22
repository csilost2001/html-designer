/**
 * 画面項目 ID のリネーム処理 (#332)。
 *
 * - screen-items JSON の `id` フィールドを更新
 * - 画面 HTML (GrapesJS JSON 内の name/id 属性) を更新
 * - 全アクショングループの `screenItemRef.itemId` を更新
 */
import {
  readScreenItems,
  writeScreenItems,
  readScreen,
  writeScreen,
  listActionGroups,
  readActionGroup,
  writeActionGroup,
} from "./projectStorage.js";

// JS 識別子として有効かチェック
const JS_IDENTIFIER_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

const JS_RESERVED = new Set([
  "break","case","catch","class","const","continue","debugger","default",
  "delete","do","else","export","extends","false","finally","for",
  "function","if","import","in","instanceof","let","new","null","return",
  "static","super","switch","this","throw","true","try","typeof","var",
  "void","while","with","yield","enum","await","implements","package",
  "protected","interface","private","public",
]);

export interface CheckRefsResult {
  affectedActionGroups: Array<{ id: string; name: string; refCount: number }>;
  totalRefs: number;
}

export interface RenameResult {
  screenItemsUpdated: boolean;
  screenHtmlUpdated: boolean;
  actionGroupsUpdated: string[];
  refsRenamed: number;
  warnings: string[];
}

// ── 参照カウント (変更なし) ──────────────────────────────────────────────

function countRefsInValue(val: unknown, screenId: string, itemId: string): number {
  if (!val || typeof val !== "object") return 0;
  if (Array.isArray(val)) {
    return val.reduce<number>((s, v) => s + countRefsInValue(v, screenId, itemId), 0);
  }
  const obj = val as Record<string, unknown>;
  const ref = obj.screenItemRef as Record<string, unknown> | undefined;
  if (ref && ref.screenId === screenId && ref.itemId === itemId) {
    return 1;
  }
  return Object.values(obj).reduce<number>((s, v) => s + countRefsInValue(v, screenId, itemId), 0);
}

export async function checkScreenItemRefs(screenId: string, itemId: string): Promise<CheckRefsResult> {
  const ags = (await listActionGroups()) as Array<{ id: string; name: string }>;
  const affected: Array<{ id: string; name: string; refCount: number }> = [];
  let totalRefs = 0;
  for (const agMeta of ags) {
    const ag = await readActionGroup(agMeta.id);
    if (!ag) continue;
    const count = countRefsInValue(ag, screenId, itemId);
    if (count > 0) {
      affected.push({ id: agMeta.id, name: agMeta.name ?? agMeta.id, refCount: count });
      totalRefs += count;
    }
  }
  return { affectedActionGroups: affected, totalRefs };
}

// ── アクショングループ内の参照リネーム ──────────────────────────────────

function renameRefsInValue(
  val: unknown,
  screenId: string,
  oldId: string,
  newId: string,
): { updated: unknown; count: number } {
  if (!val || typeof val !== "object") return { updated: val, count: 0 };

  if (Array.isArray(val)) {
    let total = 0;
    const arr = val.map((v) => {
      const r = renameRefsInValue(v, screenId, oldId, newId);
      total += r.count;
      return r.updated;
    });
    return { updated: arr, count: total };
  }

  const obj = val as Record<string, unknown>;
  let total = 0;
  const result: Record<string, unknown> = {};

  for (const [key, v] of Object.entries(obj)) {
    if (
      key === "screenItemRef" &&
      v && typeof v === "object" &&
      (v as Record<string, unknown>).screenId === screenId &&
      (v as Record<string, unknown>).itemId === oldId
    ) {
      result[key] = { ...(v as Record<string, unknown>), itemId: newId };
      total++;
    } else {
      const r = renameRefsInValue(v, screenId, oldId, newId);
      result[key] = r.updated;
      total += r.count;
    }
  }

  return { updated: result, count: total };
}

// ── 画面 HTML (GrapesJS JSON) 内のリネーム ──────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 二重引用符・単引用符の両形式に対応。クォートなし属性 (name=value) は未対応
// (GrapesJS は常に引用符付きで出力するため実用上問題なし)
function renameAttrInHtml(html: string, oldId: string, newId: string): { html: string; changed: boolean } {
  const esc = escapeRegex(oldId);
  let changed = false;
  let result = html;
  for (const attr of ["name", "id"]) {
    result = result.replace(
      new RegExp(`(\\b${attr}=["'])${esc}(["'])`, "g"),
      (_, p1, p2) => { changed = true; return `${p1}${newId}${p2}`; },
    );
  }
  return { html: result, changed };
}

function renameInScreenValue(val: unknown, oldId: string, newId: string): { updated: unknown; changed: boolean } {
  if (typeof val === "string") {
    const r = renameAttrInHtml(val, oldId, newId);
    return { updated: r.html, changed: r.changed };
  }
  if (Array.isArray(val)) {
    let changed = false;
    const arr = val.map((v) => {
      const r = renameInScreenValue(v, oldId, newId);
      if (r.changed) changed = true;
      return r.updated;
    });
    return { updated: arr, changed };
  }
  if (val && typeof val === "object") {
    const obj = val as Record<string, unknown>;
    let changed = false;
    const result: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(obj)) {
      // GrapesJS component attributes オブジェクトを直接操作
      if (key === "attributes" && v && typeof v === "object" && !Array.isArray(v)) {
        const attrs = v as Record<string, unknown>;
        const newAttrs = { ...attrs };
        if (attrs.name === oldId) { newAttrs.name = newId; changed = true; }
        if (attrs.id === oldId)   { newAttrs.id   = newId; changed = true; }
        result[key] = newAttrs;
      } else {
        const r = renameInScreenValue(v, oldId, newId);
        if (r.changed) changed = true;
        result[key] = r.updated;
      }
    }
    return { updated: result, changed };
  }
  return { updated: val, changed: false };
}

// ── 公開 API ────────────────────────────────────────────────────────────

export async function renameScreenItemId(
  screenId: string,
  oldId: string,
  newId: string,
): Promise<RenameResult> {
  const warnings: string[] = [];

  // バリデーション
  if (!oldId) throw new Error("oldId は必須です");
  if (!newId) throw new Error("newId は必須です");
  if (!JS_IDENTIFIER_RE.test(newId)) {
    throw new Error(
      `"${newId}" は有効な JS 識別子ではありません。英字/_/$で始まり、英数字/_/$のみ使用可能です。`,
    );
  }
  if (JS_RESERVED.has(newId)) {
    warnings.push(`"${newId}" は JS 予約語です。動作はしますが推奨しません。`);
  }

  // screen-items ファイルを読み込み
  const siFile = (await readScreenItems(screenId)) as {
    screenId: string;
    version: string;
    updatedAt: string;
    items: Array<{ id: string; [key: string]: unknown }>;
  } | null;
  if (!siFile) throw new Error(`画面項目ファイルが見つかりません: screenId=${screenId}`);

  const itemIdx = siFile.items.findIndex((item) => item.id === oldId);
  if (itemIdx < 0) throw new Error(`画面項目 "${oldId}" が見つかりません (screenId=${screenId})`);

  if (siFile.items.some((item) => item.id === newId)) {
    throw new Error(`ID "${newId}" は既に同じ画面内で使用されています`);
  }

  // 1. screen-items JSON を更新
  siFile.items[itemIdx].id = newId;
  siFile.updatedAt = new Date().toISOString();
  await writeScreenItems(screenId, siFile);

  // 2. 画面 HTML (GrapesJS JSON) を更新
  let screenHtmlUpdated = false;
  const screenDoc = await readScreen(screenId);
  if (screenDoc) {
    const { updated, changed } = renameInScreenValue(screenDoc, oldId, newId);
    if (changed) {
      await writeScreen(screenId, updated);
      screenHtmlUpdated = true;
    }
  }

  // 3. 全アクショングループの screenItemRef を更新
  const ags = (await listActionGroups()) as Array<{ id: string; name: string }>;
  const updatedAgs: string[] = [];
  let refsRenamed = 0;
  for (const agMeta of ags) {
    const ag = await readActionGroup(agMeta.id);
    if (!ag) continue;
    const { updated, count } = renameRefsInValue(ag, screenId, oldId, newId);
    if (count > 0) {
      (updated as Record<string, unknown>).updatedAt = new Date().toISOString();
      await writeActionGroup(agMeta.id, updated);
      updatedAgs.push(agMeta.id);
      refsRenamed += count;
    }
  }

  return {
    screenItemsUpdated: true,
    screenHtmlUpdated,
    actionGroupsUpdated: updatedAgs,
    refsRenamed,
    warnings,
  };
}
