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

const LS_PREFIX = "screen-items-";

function now(): string {
  return new Date().toISOString();
}

export async function loadScreenItems(screenId: string): Promise<ScreenItemsFile> {
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
