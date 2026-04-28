import type { View, ViewEntry, ViewId, PhysicalName, DisplayName, Timestamp, Uuid } from "../types/v3";
import { generateUUID } from "../utils/uuid";
import { renumber, nextNo } from "../utils/listOrder";

// ─── ストレージバックエンド ──────────────────────────────────────────────

export interface ViewStorageBackend {
  loadView(viewId: string): Promise<unknown>;
  saveView(viewId: string, data: unknown): Promise<void>;
  deleteView(viewId: string): Promise<void>;
  loadViewsFile(): Promise<unknown>;
  reorderViews(orderedIds: string[]): Promise<void>;
}

let _backend: ViewStorageBackend | null = null;

export function setViewStorageBackend(b: ViewStorageBackend | null): void {
  _backend = b;
}

// ─── localStorage キー ───────────────────────────────────────────────────

const LS_PREFIX = "view-";
const LS_META_KEY = "views-meta";

function nowTs(): Timestamp {
  return new Date().toISOString() as Timestamp;
}

/** views.json ファイル構造 (v3 shape, 一覧 + 完全データ)。 */
export interface ViewsFile {
  $schema?: string;
  version: string;
  updatedAt: Timestamp;
  views: View[];
}

function makeEmptyFile(): ViewsFile {
  return { version: "1.0.0", updatedAt: nowTs(), views: [] };
}

function toEntry(v: View, no: number): ViewEntry {
  return {
    id: v.id,
    no,
    name: v.name,
    physicalName: v.physicalName,
    updatedAt: v.updatedAt,
    maturity: v.maturity,
  };
}

// ─── 公開 API ────────────────────────────────────────────────────────────

/** ビュー一覧を取得 (v3 ViewEntry[]) */
export async function listViews(): Promise<ViewEntry[]> {
  if (_backend) {
    const file = (await _backend.loadViewsFile()) as ViewsFile | null;
    if (!file?.views) return [];
    return file.views.map((v, i) => toEntry(v, i + 1));
  }
  const raw = localStorage.getItem(LS_META_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw) as ViewEntry[]; } catch { return []; }
}

/** ビュー定義を読み込み */
export async function loadView(viewId: string): Promise<View | null> {
  if (_backend) return (await _backend.loadView(viewId)) as View | null;
  const s = localStorage.getItem(`${LS_PREFIX}${viewId}`);
  if (!s) return null;
  try { return JSON.parse(s) as View; } catch { return null; }
}

/** ビュー定義を保存 */
export async function saveView(view: View): Promise<void> {
  const toSave: View = { ...view, updatedAt: nowTs() };
  if (_backend) {
    await _backend.saveView(toSave.id, toSave);
  } else {
    localStorage.setItem(`${LS_PREFIX}${toSave.id}`, JSON.stringify(toSave));
    await _syncLocalMeta(toSave);
  }
}

/** ビューを新規作成 */
export async function createView(
  physicalName: PhysicalName,
  name: DisplayName,
  description?: string,
): Promise<View> {
  const ts = nowTs();
  const view: View = {
    id: generateUUID() as ViewId,
    name,
    description,
    physicalName,
    selectStatement: "",
    outputColumns: [],
    dependencies: [],
    createdAt: ts,
    updatedAt: ts,
  };
  await saveView(view);
  return view;
}

/** ビューの並び順を永続化 */
export async function reorderViews(orderedIds: string[]): Promise<void> {
  if (_backend) {
    await _backend.reorderViews(orderedIds);
  } else {
    const metas = await listViews();
    const map = new Map(metas.map((m) => [m.id, m]));
    const reordered = orderedIds
      .map((id) => map.get(id as Uuid as ViewId))
      .filter(Boolean) as ViewEntry[];
    localStorage.setItem(LS_META_KEY, JSON.stringify(renumber(reordered)));
  }
}

/** ビューを削除 */
export async function deleteView(viewId: string): Promise<void> {
  if (_backend) {
    await _backend.deleteView(viewId);
  } else {
    localStorage.removeItem(`${LS_PREFIX}${viewId}`);
    const metas = await listViews();
    const filtered = renumber(metas.filter((v) => v.id !== viewId));
    localStorage.setItem(LS_META_KEY, JSON.stringify(filtered));
  }
}

// ─── 内部 ────────────────────────────────────────────────────────────────

async function _syncLocalMeta(view: View): Promise<void> {
  const metas = await listViews();
  const idx = metas.findIndex((v) => v.id === view.id);
  const meta: ViewEntry = {
    id: view.id,
    no: idx >= 0 ? metas[idx].no : nextNo(metas),
    name: view.name,
    physicalName: view.physicalName,
    updatedAt: view.updatedAt,
    maturity: view.maturity,
  };
  if (idx >= 0) metas[idx] = meta;
  else metas.push(meta);
  localStorage.setItem(LS_META_KEY, JSON.stringify(renumber(metas)));
}

/** views.json の全内容をロード（MCP ツール用・エクスポート用） */
export async function loadViewsFile(): Promise<ViewsFile> {
  if (_backend) {
    return ((await _backend.loadViewsFile()) as ViewsFile | null) ?? makeEmptyFile();
  }
  const metas = await listViews();
  const views: View[] = [];
  for (const m of metas) {
    const v = await loadView(m.id);
    if (v) views.push(v);
  }
  return { version: "1.0.0", updatedAt: nowTs(), views };
}
