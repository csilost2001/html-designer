/**
 * remoteStorage.ts
 * GrapesJS カスタムストレージマネージャー
 *
 * wsBridge 経由でサーバー側ファイル (data/screens/{screenId}.json) に保存。
 * wsBridge 未接続時は localStorage にフォールバック。
 */
import type { Editor as GEditor } from "grapesjs";
import { mcpBridge } from "../mcp/mcpBridge";
import { screenStorageKey } from "../store/flowStore";

const AUTOSAVE_DEBOUNCE_MS = 500;

/** GrapesJS に "remote" ストレージタイプを登録 */
export function registerRemoteStorage(editor: GEditor, screenId: string): void {
  const localKey = screenStorageKey(screenId);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  editor.StorageManager.add("remote", {
    async load(): Promise<Record<string, unknown>> {
      try {
        const data = await mcpBridge.request("loadScreen", { screenId }) as Record<string, unknown> | null;
        if (data && Object.keys(data).length > 0) {
          // リモートデータを localStorage にもキャッシュ（フォールバック用）
          try { localStorage.setItem(localKey, JSON.stringify(data)); } catch { /* ignore */ }
          return data;
        }
        // ファイルが空/存在しない → localStorage から移行
        const localRaw = localStorage.getItem(localKey);
        if (localRaw) {
          try {
            const localData = JSON.parse(localRaw) as Record<string, unknown>;
            // 移行: localStorage → ファイル
            await mcpBridge.request("saveScreen", { screenId, data: localData });
            console.log(`[remoteStorage] Migrated screen ${screenId} from localStorage to file`);
            return localData;
          } catch { /* ignore */ }
        }
        return {};
      } catch {
        // wsBridge 未接続 → localStorage フォールバック
        const raw = localStorage.getItem(localKey);
        if (raw) {
          try { return JSON.parse(raw) as Record<string, unknown>; } catch { /* ignore */ }
        }
        return {};
      }
    },

    async store(data: Record<string, unknown>): Promise<void> {
      // localStorage に常に書き込む（フォールバック用キャッシュ）
      try { localStorage.setItem(localKey, JSON.stringify(data)); } catch { /* ignore */ }

      // wsBridge に保存（デバウンス: GrapesJS autosave の連打を抑制）
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        debounceTimer = null;
        try {
          await mcpBridge.request("saveScreen", { screenId, data });
        } catch {
          // 未接続時は localStorage キャッシュで代用
          console.log("[remoteStorage] saveScreen failed, using localStorage cache");
        }
      }, AUTOSAVE_DEBOUNCE_MS);
    },
  });
}
