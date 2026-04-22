/**
 * GrapesJS 画面デザイナーで input/select/textarea 要素に `data-item-id` を
 * 自動発番するフック (#322)。
 *
 * 画面項目定義 (#318) の ScreenItem.id と画面 DOM 要素を紐付けるキーとなる。
 * ScreenItemsView の候補抽出モーダル (#323) が data-item-id を読み取って
 * ScreenItem.id として採用することで、同じ要素に対する再抽出がべき等になる。
 *
 * 発番戦略:
 * - component:add: 新規追加 (ブロック drop / カスタムブロック挿入) 時に
 *   form field であり data-item-id 未設定なら UUID を発番
 * - 子孫コンポーネントも再帰的にチェック (ブロックが input を内包するケース)
 * - 既存画面の未発番要素は load 後に自動付与しない (dirty 化を避けるため)
 *   → 必要なら別コマンド (Follow-up) で一括付与を提供
 */
import type { Editor as GEditor, Component } from "grapesjs";
import { generateUUID } from "../utils/uuid";

const FORM_FIELD_TAGS = new Set(["input", "select", "textarea"]);
const EXCLUDED_INPUT_TYPES = new Set(["button", "submit", "reset", "hidden", "image"]);

function isFormField(cmp: Component): boolean {
  const tag = String(cmp.get("tagName") ?? "").toLowerCase();
  if (!FORM_FIELD_TAGS.has(tag)) return false;
  if (tag === "input") {
    const attrs = cmp.getAttributes() ?? {};
    const t = String(attrs.type ?? "text").toLowerCase();
    if (EXCLUDED_INPUT_TYPES.has(t)) return false;
  }
  return true;
}

/**
 * form field に data-item-id / name / id を一括で付与する。
 * 既に値がある属性は絶対に上書きしない。
 * @returns 何か 1 つ以上付与した場合 true
 */
export function ensureFormFieldIdentity(cmp: Component): boolean {
  if (!isFormField(cmp)) return false;
  const attrs = cmp.getAttributes() ?? {};
  const patch: Record<string, string> = {};

  if (!attrs["data-item-id"]) {
    patch["data-item-id"] = generateUUID();
  }
  const dataItemId = (patch["data-item-id"] ?? String(attrs["data-item-id"])) as string;
  const shortId = dataItemId.split("-")[0]; // 先頭 8 文字 (hex)

  if (!attrs.name) {
    patch.name = `field_${shortId}`;
  }
  if (!attrs.id) {
    patch.id = (patch.name ?? String(attrs.name)) as string;
  }

  if (Object.keys(patch).length === 0) return false;
  cmp.addAttributes(patch);
  return true;
}

/** component とその子孫を再帰走査 */
function walk(cmp: Component, visit: (c: Component) => void): void {
  visit(cmp);
  const children = cmp.components?.();
  if (children) {
    children.forEach((c: Component) => walk(c, visit));
  }
}

/**
 * GrapesJS editor にフックを張って新規 form field に data-item-id を発番する。
 * @returns unsubscribe 関数
 */
export function attachDataItemIdAutoAssign(editor: GEditor): () => void {
  const onAdd = (cmp: Component) => {
    // 自身 + 子孫を走査 (ブロック drop 時にラッパー要素経由で来ることが多い)
    walk(cmp, (c) => { ensureFormFieldIdentity(c); });
  };
  editor.on("component:add", onAdd);

  return () => {
    editor.off("component:add", onAdd);
  };
}

/**
 * 画面全体をスキャンして未発番の form field に data-item-id を一括発番する。
 * ScreenItemsView の「画面デザインから追加」モーダル等、明示的なユーザー操作
 * から呼び出す想定 (load 時の自動実行はしない)。
 *
 * @returns 発番した要素数
 */
export function assignAllMissingDataItemIds(editor: GEditor): number {
  const wrapper = editor.getWrapper();
  if (!wrapper) return 0;
  let count = 0;
  walk(wrapper, (c) => {
    if (ensureFormFieldIdentity(c)) count++;
  });
  return count;
}
