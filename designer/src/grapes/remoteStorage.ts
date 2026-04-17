/**
 * remoteStorage.ts
 *
 * GrapesJS カスタムストレージマネージャー。
 * store() はlocalStorageのみに書き込む（変更キャッシュ）。
 * ファイルへの永続化は saveScreenToFile() を明示的に呼ぶことで行う。
 */
import type { Editor as GEditor } from "grapesjs";
import { mcpBridge } from "../mcp/mcpBridge";
import { screenStorageKey } from "../store/flowStore";

/** GrapesJS に "remote" ストレージタイプを登録 */
export function registerRemoteStorage(editor: GEditor, screenId: string): void {
  const localKey = screenStorageKey(screenId);

  editor.StorageManager.add("remote", {
    async load(): Promise<Record<string, unknown>> {
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
      try { localStorage.setItem(localKey, JSON.stringify(data)); } catch { /* ignore */ }
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
}
