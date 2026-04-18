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
          try { return JSON.parse(localRaw) as Record<string, unknown>; } catch { /* fallthrough */ }
        }
      }
      try {
        const data = await mcpBridge.request("loadScreen", { screenId }) as Record<string, unknown> | null;
        if (data && Object.keys(data).length > 0) {
          try { localStorage.setItem(localKey, JSON.stringify(data)); } catch { /* ignore */ }
          return data;
        }
        const localRaw = localStorage.getItem(localKey);
        if (localRaw) {
          try {
            const localData = JSON.parse(localRaw) as Record<string, unknown>;
            await mcpBridge.request("saveScreen", { screenId, data: localData });
            return localData;
          } catch { /* ignore */ }
        }
        return {};
      } catch {
        const raw = localStorage.getItem(localKey);
        if (raw) {
          try { return JSON.parse(raw) as Record<string, unknown>; } catch { /* ignore */ }
        }
        return {};
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
