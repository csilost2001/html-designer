/**
 * remoteStorage.ts
 *
 * GrapesJS カスタムストレージマネージャー。
 * store() はlocalStorageのみに書き込み、ドラフトマーカーをセットする（未保存状態）。
 * ファイルへの永続化は saveScreenToFile() を明示的に呼ぶことで行う。
 * 画面を閉じて再オープンしたときドラフトマーカーがあれば localStorage を優先して復元する。
 */
import type { Editor as GEditor } from "grapesjs";
import { mcpBridge } from "../mcp/mcpBridge";
import { screenStorageKey } from "../store/flowStore";
import { recordError } from "../utils/errorLog";

/**
 * GrapesJS が期待する最小プロジェクト構造。pages が欠落していると
 * Canvas.init の postLoad で getFrames() が undefined.length で落ちる (#131)。
 * この形状を load() の全フォールバック経路で保証する。
 */
const EMPTY_PROJECT: Record<string, unknown> = Object.freeze({
  assets: [],
  styles: [],
  pages: [{ frames: [{ component: { type: "wrapper" } }] }],
});

/**
 * 破損・不正形のプロジェクトデータを最低限起動可能な形に補正する。
 * 補正が発生した場合は errorLog に痕跡を残し、ユーザーが事後にエラーダイアログから
 * 履歴として確認できるようにする。
 */
function ensureValidProject(
  raw: Record<string, unknown> | null | undefined,
  screenId: string,
  source: string,
): Record<string, unknown> {
  if (!raw || typeof raw !== "object") {
    recordError({
      source: "manual",
      message: `画面データが空/不正のため、空のプロジェクトで起動します (screenId=${screenId}, source=${source})`,
      context: { screenId, source },
    });
    return { ...EMPTY_PROJECT };
  }
  if (!Array.isArray(raw.pages) || raw.pages.length === 0) {
    recordError({
      source: "manual",
      message: `画面データの pages が欠落しています。デフォルト構造で補正しました (screenId=${screenId}, source=${source})`,
      context: { screenId, source, keys: Object.keys(raw) },
    });
    return { ...raw, pages: EMPTY_PROJECT.pages };
  }
  return raw;
}

/** ドラフトマーカーのキー（localStorage 内容が未保存であることを示す） */
export function screenDraftMarkerKey(screenId: string): string {
  return `gjs-screen-${screenId}-draft`;
}

/** 画面にドラフト（未保存編集）が残っているか */
export function hasScreenDraft(screenId: string): boolean {
  return localStorage.getItem(screenDraftMarkerKey(screenId)) === "1";
}

/** ドラフトマーカーを解除（明示保存成功時／リセット時に呼ぶ） */
export function clearScreenDraft(screenId: string): void {
  try { localStorage.removeItem(screenDraftMarkerKey(screenId)); } catch { /* ignore */ }
}

/** GrapesJS に "remote" ストレージタイプを登録 */
export function registerRemoteStorage(editor: GEditor, screenId: string): void {
  const localKey = screenStorageKey(screenId);
  const draftKey = screenDraftMarkerKey(screenId);

  editor.StorageManager.add("remote", {
    async load(): Promise<Record<string, unknown>> {
      // ドラフトマーカーがあれば localStorage を優先（未保存の編集を復元）
      if (localStorage.getItem(draftKey) === "1") {
        const localRaw = localStorage.getItem(localKey);
        if (localRaw) {
          try {
            return ensureValidProject(
              JSON.parse(localRaw) as Record<string, unknown>,
              screenId,
              "draft-localStorage",
            );
          } catch { /* fallthrough */ }
        }
      }
      try {
        const data = await mcpBridge.request("loadScreen", { screenId }) as Record<string, unknown> | null;
        if (data && Object.keys(data).length > 0) {
          try { localStorage.setItem(localKey, JSON.stringify(data)); } catch { /* ignore */ }
          return ensureValidProject(data, screenId, "mcp-loadScreen");
        }
        const localRaw = localStorage.getItem(localKey);
        if (localRaw) {
          try {
            const localData = JSON.parse(localRaw) as Record<string, unknown>;
            await mcpBridge.request("saveScreen", { screenId, data: localData });
            return ensureValidProject(localData, screenId, "localStorage-fallback");
          } catch { /* ignore */ }
        }
        return ensureValidProject(null, screenId, "no-data");
      } catch {
        const raw = localStorage.getItem(localKey);
        if (raw) {
          try {
            return ensureValidProject(
              JSON.parse(raw) as Record<string, unknown>,
              screenId,
              "mcp-error-localStorage",
            );
          } catch { /* ignore */ }
        }
        return ensureValidProject(null, screenId, "mcp-error-no-data");
      }
    },

    async store(data: Record<string, unknown>): Promise<void> {
      // localStorage のみ（変更キャッシュ）。ファイル書き込みは saveScreenToFile() で行う
      try {
        localStorage.setItem(localKey, JSON.stringify(data));
        localStorage.setItem(draftKey, "1");
      } catch { /* ignore */ }
    },
  });
}

/** localStorageのキャッシュをファイルに永続化する（明示的保存） */
export async function saveScreenToFile(screenId: string): Promise<void> {
  const localKey = screenStorageKey(screenId);
  const raw = localStorage.getItem(localKey);
  if (!raw) {
    throw new Error("保存するデータがありません");
  }
  const data = JSON.parse(raw) as Record<string, unknown>;
  await mcpBridge.request("saveScreen", { screenId, data });
  clearScreenDraft(screenId);
}
