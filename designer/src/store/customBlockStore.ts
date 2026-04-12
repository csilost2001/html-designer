/**
 * customBlockStore.ts
 * カスタムブロックの localStorage CRUD + キャンバス CSS 注入ヘルパー
 */
import type { Editor as GEditor } from "grapesjs";

export interface CustomBlock {
  id: string;        // ブロックID
  label: string;     // カタログ表示名
  category: string;  // カテゴリ名
  content: string;   // HTML コンテンツ
  styles?: string;   // ブロック用 CSS（キャンバスに注入）
  media?: string;    // サムネイル SVG/HTML（省略可）
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

const STORAGE_KEY = "designer-custom-blocks";

/** すべてのカスタムブロックを読み込む */
export function loadCustomBlocks(): CustomBlock[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as CustomBlock[];
  } catch {
    return [];
  }
}

/** すべてのカスタムブロックを保存（全量書き込み） */
export function saveCustomBlocks(blocks: CustomBlock[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(blocks));
}

/** 追加 or 更新（id で upsert） */
export function upsertCustomBlock(block: CustomBlock): void {
  const blocks = loadCustomBlocks();
  const idx = blocks.findIndex((b) => b.id === block.id);
  if (idx >= 0) {
    blocks[idx] = block;
  } else {
    blocks.push(block);
  }
  saveCustomBlocks(blocks);
}

/** 削除（成功: true / 未存在: false） */
export function deleteCustomBlock(id: string): boolean {
  const blocks = loadCustomBlocks();
  const filtered = blocks.filter((b) => b.id !== id);
  if (filtered.length === blocks.length) return false;
  saveCustomBlocks(filtered);
  return true;
}

/** 単一取得 */
export function getCustomBlock(id: string): CustomBlock | undefined {
  return loadCustomBlocks().find((b) => b.id === id);
}

/**
 * 全カスタムブロックの CSS をキャンバス iframe に注入する。
 * `<style id="custom-blocks-css">` タグを使い、呼び出しのたびに全量を上書きする。
 */
export function injectCustomBlockCss(editor: GEditor, blocks: CustomBlock[]): void {
  try {
    const canvasDoc = editor.Canvas.getDocument();
    if (!canvasDoc) return;

    let styleEl = canvasDoc.getElementById(
      "custom-blocks-css"
    ) as HTMLStyleElement | null;

    if (!styleEl) {
      styleEl = canvasDoc.createElement("style");
      styleEl.id = "custom-blocks-css";
      canvasDoc.head.appendChild(styleEl);
    }

    const allCss = blocks
      .filter((b) => b.styles)
      .map((b) => `/* block: ${b.id} */\n${b.styles}`)
      .join("\n\n");

    styleEl.textContent = allCss;
  } catch {
    // キャンバスがまだ準備できていない場合は無視
  }
}
