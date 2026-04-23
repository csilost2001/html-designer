import type { ViewDefinition, ViewMeta, ViewsFile } from "../types/view";
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

function now(): string {
  return new Date().toISOString();
}

function makeEmptyFile(): ViewsFile {
  return { version: "1.0.0", updatedAt: now(), views: [] };
}

// ─── 公開 API ────────────────────────────────────────────────────────────

/** ビュー一覧を取得 */
export async function listViews(): Promise<ViewMeta[]> {
  if (_backend) {
    const file = (await _backend.loadViewsFile()) as ViewsFile | null;
    if (!file?.views) return [];
    return file.views.map((v, i) => ({
      id: v.id,
      no: i + 1,
      description: v.description,
      updatedAt: v.updatedAt,
    }));
  }
  const raw = localStorage.getItem(LS_META_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw) as ViewMeta[]; } catch { return []; }
}

/** ビュー定義を読み込み */
export async function loadView(viewId: string): Promise<ViewDefinition | null> {
  const raw = await (async () => {
    if (_backend) return (await _backend.loadView(viewId)) as ViewDefinition | null;
    const s = localStorage.getItem(`${LS_PREFIX}${viewId}`);
    if (!s) return null;
    try { return JSON.parse(s) as ViewDefinition; } catch { return null; }
  })();
  return raw;
}

/** ビュー定義を保存 */
export async function saveView(view: ViewDefinition): Promise<void> {
  const toSave = { ...view, updatedAt: now() };
  if (_backend) {
    await _backend.saveView(toSave.id, toSave);
  } else {
    localStorage.setItem(`${LS_PREFIX}${toSave.id}`, JSON.stringify(toSave));
    await _syncLocalMeta(toSave);
  }
}

/** ビューを新規作成 */
export async function createView(id: string, description?: string): Promise<ViewDefinition> {
  const ts = now();
  const view: ViewDefinition = {
    id,
    selectStatement: "",
    outputColumns: [],
    dependencies: [],
    description: description ?? "",
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
    const reordered = orderedIds.map((id) => map.get(id)).filter(Boolean) as ViewMeta[];
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

async function _syncLocalMeta(view: ViewDefinition): Promise<void> {
  const metas = await listViews();
  const idx = metas.findIndex((v) => v.id === view.id);
  const meta: ViewMeta = {
    id: view.id,
    no: idx >= 0 ? metas[idx].no : nextNo(metas),
    description: view.description,
    updatedAt: view.updatedAt,
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
  const views: ViewDefinition[] = [];
  for (const m of metas) {
    const v = await loadView(m.id);
    if (v) views.push(v);
  }
  return { version: "1.0.0", updatedAt: now(), views };
}
