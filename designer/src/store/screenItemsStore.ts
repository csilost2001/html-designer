/**
 * screenItemsStore.ts (v3 Phase 3-α、#559)
 * 画面項目定義の永続化ストア。
 *
 * 正本は `data/screen-items/{screenId}.json`。wsBridge 経由で読み書きし、
 * ws 未接続時は localStorage にフォールバック。
 *
 * 注: v3 schema では ScreenItem は Screen.items に inline される設計。
 * 本 store は Phase 3-α として ScreenItemsFile wrapper を維持しているが、
 * Phase 3-β (Screen 自体の v3 化) で `data/screens/{id}.json` の `items` フィールドに
 * 統合される予定。そのため $schema 属性は本 store では出力しない (wrapper schema 不在)。
 */
import type { ScreenItem, SemVer, Timestamp, ScreenId } from "../types/v3";

/** 画面項目定義の wrapper file (Phase 3-α 過渡形式)。 */
export interface ScreenItemsFile {
  /** 紐付く画面 ID。 */
  screenId: ScreenId;
  /** SemVer。 */
  version: SemVer;
  /** ISO 8601。 */
  updatedAt: Timestamp;
  items: ScreenItem[];
}

/** 画面項目定義ファイルの初期状態。 */
export function createEmptyScreenItems(screenId: string): ScreenItemsFile {
  return {
    screenId: screenId as ScreenId,
    version: "0.1.0" as SemVer,
    updatedAt: new Date().toISOString() as Timestamp,
    items: [],
  };
}

export interface ScreenItemsStorageBackend {
  loadScreenItems(screenId: string): Promise<unknown>;
  saveScreenItems(screenId: string, data: unknown): Promise<void>;
  deleteScreenItems(screenId: string): Promise<void>;
}

let _backend: ScreenItemsStorageBackend | null = null;

export function setScreenItemsStorageBackend(b: ScreenItemsStorageBackend | null): void {
  _backend = b;
}

/** in-memory キャッシュ: applyRenameInBrowser でファイル未保存のまま id を更新するために使用。 */
const _cache = new Map<string, ScreenItemsFile>();

/** in-memory キャッシュを更新する (ファイルには書かない)。 */
export function setItemsInCache(file: ScreenItemsFile): void {
  _cache.set(file.screenId, { ...file });
}

/** in-memory キャッシュを削除する。 */
export function clearItemsFromCache(screenId: string): void {
  _cache.delete(screenId);
}

// ─── localStorage キー (v3 名前空間、#559) ───────────────────────────────

const LS_PREFIX = "v3-screen-items-";

function nowTs(): Timestamp {
  return new Date().toISOString() as Timestamp;
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
  const toSave: ScreenItemsFile = { ...file, updatedAt: nowTs() };
  _cache.delete(toSave.screenId);
  if (_backend) {
    await _backend.saveScreenItems(toSave.screenId, toSave);
    return;
  }
  localStorage.setItem(`${LS_PREFIX}${toSave.screenId}`, JSON.stringify(toSave));
}

export async function deleteScreenItems(screenId: string): Promise<void> {
  if (_backend) {
    await _backend.deleteScreenItems(screenId);
    return;
  }
  localStorage.removeItem(`${LS_PREFIX}${screenId}`);
}
