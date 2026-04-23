/**
 * screenItemsStore.ts
 * 画面項目定義の永続化ストア (#318 プロトタイプ)。
 *
 * 正本は `data/screen-items/{screenId}.json`。wsBridge 経由で読み書きし、
 * ws 未接続時は localStorage にフォールバック。
 */
import { createEmptyScreenItems, type ScreenItemsFile } from "../types/screenItem";

export interface ScreenItemsStorageBackend {
  loadScreenItems(screenId: string): Promise<unknown>;
  saveScreenItems(screenId: string, data: unknown): Promise<void>;
  deleteScreenItems(screenId: string): Promise<void>;
}

let _backend: ScreenItemsStorageBackend | null = null;

export function setScreenItemsStorageBackend(b: ScreenItemsStorageBackend | null): void {
  _backend = b;
}

/** in-memory キャッシュ: applyRenameInBrowser でファイル未保存のまま id を更新するために使用 */
const _cache = new Map<string, ScreenItemsFile>();

/** in-memory キャッシュを更新する (ファイルには書かない) */
export function setItemsInCache(file: ScreenItemsFile): void {
  _cache.set(file.screenId, { ...file });
}

/** in-memory キャッシュを削除する */
export function clearItemsFromCache(screenId: string): void {
  _cache.delete(screenId);
}

const LS_PREFIX = "screen-items-";

function now(): string {
  return new Date().toISOString();
}

export async function loadScreenItems(screenId: string): Promise<ScreenItemsFile> {
  const cached = _cache.get(screenId);
  if (cached) return cached;
  if (_backend) {
    const data = await _backend.loadScreenItems(screenId);
    if (data) return data as ScreenItemsFile;
  } else {
    const raw = localStorage.getItem(`${LS_PREFIX}${screenId}`);
    if (raw) {
      try {
        return JSON.parse(raw) as ScreenItemsFile;
      } catch { /* ignore */ }
    }
  }
  return createEmptyScreenItems(screenId);
}

export async function saveScreenItems(file: ScreenItemsFile): Promise<void> {
  file.updatedAt = now();
  _cache.delete(file.screenId);
  if (_backend) {
    await _backend.saveScreenItems(file.screenId, file);
    return;
  }
  localStorage.setItem(`${LS_PREFIX}${file.screenId}`, JSON.stringify(file));
}

export async function deleteScreenItems(screenId: string): Promise<void> {
  if (_backend) {
    await _backend.deleteScreenItems(screenId);
    return;
  }
  localStorage.removeItem(`${LS_PREFIX}${screenId}`);
}
