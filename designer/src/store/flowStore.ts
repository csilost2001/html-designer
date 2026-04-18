/**
 * flowStore.ts
 * フロープロジェクトの永続化ストア
 *
 * - wsBridge が接続済みの場合: サーバー側ファイルに保存（mcpBridge 経由）
 * - 未接続の場合: localStorage にフォールバック
 *
 * NOTE: I/O バックエンドは mcpBridge.ts が setFlowStorageBackend() で差し替える。
 *       循環依存を避けるため flowStore は mcpBridge をインポートしない。
 */
import type { FlowProject, ScreenNode, ScreenEdge, ScreenGroup, ScreenType, TransitionTrigger } from "../types/flow";
import { SCREEN_TYPE_LABELS, TRIGGER_LABELS } from "../types/flow";
import { generateUUID } from "../utils/uuid";
import { saveDraft, clearDraft, loadDraft } from "../utils/draftStorage";

// ─── ストレージバックエンドインターフェース ────────────────────────────────

export interface FlowStorageBackend {
  loadProject(): Promise<unknown>;
  saveProject(project: unknown): Promise<void>;
  deleteScreenData(screenId: string): Promise<void>;
}

let _backend: FlowStorageBackend | null = null;

/** mcpBridge が接続時にセット、切断時に null をセット */
export function setFlowStorageBackend(b: FlowStorageBackend | null): void {
  _backend = b;
}

// ─── ドラフトモード（UI 起点の編集を localStorage ドラフトに流す） ─────────
//
// FlowEditor のような明示的保存画面で setDraftMode(true) を呼ぶと、
// saveProject() は backend へ書かず draft-flow-project に書き込むようになる。
// persistProject() を呼ぶと draft をクリアして backend に永続化する。

const FLOW_DRAFT_KIND = "flow";
const FLOW_DRAFT_ID = "project";

let _draftMode = false;

const _draftSaveListeners: Set<() => void> = new Set();

export function setFlowDraftMode(enabled: boolean): void {
  _draftMode = enabled;
}

export function isFlowDraftMode(): boolean {
  return _draftMode;
}

export function loadFlowDraft(): FlowProject | null {
  return loadDraft<FlowProject>(FLOW_DRAFT_KIND, FLOW_DRAFT_ID);
}

export function clearFlowDraft(): void {
  clearDraft(FLOW_DRAFT_KIND, FLOW_DRAFT_ID);
}

/** draft モード中に saveProject が呼ばれると通知される（FlowEditor の isDirty 検知用） */
export function subscribeToFlowDraftSaves(cb: () => void): () => void {
  _draftSaveListeners.add(cb);
  return () => _draftSaveListeners.delete(cb);
}

// ─── localStorage キー ────────────────────────────────────────────────────

const FLOW_PROJECT_KEY = "flow-project";
const SCREEN_DATA_PREFIX = "gjs-screen-";
const LEGACY_KEY = "gjs-designer-project";

export const DEFAULT_NODE_SIZE = { width: 200, height: 100 };

function now(): string {
  return new Date().toISOString();
}

// ─── ローカルユーティリティ ───────────────────────────────────────────────

function createEmptyProject(): FlowProject {
  return {
    version: 1,
    name: "新規プロジェクト",
    screens: [],
    groups: [],
    edges: [],
    updatedAt: now(),
  };
}

/** 旧データ (gjs-designer-project) から新構造へマイグレーション */
function migrateLegacyLocalStorage(): FlowProject | null {
  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw) return null;

  const screenId = generateUUID();
  const screen: ScreenNode = {
    id: screenId,
    name: "メイン画面",
    type: "other",
    description: "既存デザインから移行",
    path: "/",
    position: { x: 250, y: 150 },
    size: { ...DEFAULT_NODE_SIZE },
    hasDesign: true,
    createdAt: now(),
    updatedAt: now(),
  };
  localStorage.setItem(`${SCREEN_DATA_PREFIX}${screenId}`, raw);

  const project: FlowProject = {
    version: 1,
    name: "マイプロジェクト",
    screens: [screen],
    groups: [],
    edges: [],
    updatedAt: now(),
  };
  localStorage.setItem(FLOW_PROJECT_KEY, JSON.stringify(project));
  return project;
}

/** localStorage からプロジェクトを読み込む（ファイルが存在しない場合の初期化用） */
export function loadProjectFromLocalStorage(): FlowProject | null {
  const raw = localStorage.getItem(FLOW_PROJECT_KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as FlowProject;
    } catch { /* 破損時は無視 */ }
  }
  const migrated = migrateLegacyLocalStorage();
  if (migrated) return migrated;
  return null;
}

// ─── 公開 API（非同期）────────────────────────────────────────────────────

/** 旧プロジェクトデータに不足フィールドを補完 */
function ensureProjectDefaults(project: FlowProject): FlowProject {
  if (!project.groups) project.groups = [];
  for (const s of project.screens) {
    if (s.groupId === undefined) s.groupId = undefined;
  }
  return project;
}

/** プロジェクトを読み込み */
export async function loadProject(): Promise<FlowProject> {
  if (_backend) {
    const data = await _backend.loadProject();
    if (data) return ensureProjectDefaults(data as FlowProject);
    // ファイルが存在しない → localStorage から移行
    const local = loadProjectFromLocalStorage();
    if (local) {
      await _backend.saveProject(local);
      console.log("[flowStore] Migrated project from localStorage to file");
      return local;
    }
    // 新規プロジェクト
    const empty = createEmptyProject();
    await _backend.saveProject(empty);
    return empty;
  }
  // localStorage フォールバック
  return loadProjectFromLocalStorage() ?? (() => {
    const empty = createEmptyProject();
    localStorage.setItem(FLOW_PROJECT_KEY, JSON.stringify(empty));
    return empty;
  })();
}

/** プロジェクトを保存（draftMode 有効時は localStorage のドラフトに書き込む） */
export async function saveProject(project: FlowProject): Promise<void> {
  project.updatedAt = now();
  if (_draftMode) {
    saveDraft(FLOW_DRAFT_KIND, FLOW_DRAFT_ID, project);
    _draftSaveListeners.forEach((cb) => cb());
    return;
  }
  if (_backend) {
    await _backend.saveProject(project);
    return;
  }
  localStorage.setItem(FLOW_PROJECT_KEY, JSON.stringify(project));
}

/** ドラフトを介さず必ず永続化する（明示的保存ボタン用） */
export async function persistProject(project: FlowProject): Promise<void> {
  project.updatedAt = now();
  if (_backend) {
    await _backend.saveProject(project);
  } else {
    localStorage.setItem(FLOW_PROJECT_KEY, JSON.stringify(project));
  }
  clearDraft(FLOW_DRAFT_KIND, FLOW_DRAFT_ID);
}

/** 画面を追加 */
export async function addScreen(
  project: FlowProject,
  name: string,
  type: ScreenType,
  path?: string,
  position?: { x: number; y: number },
): Promise<ScreenNode> {
  const id = generateUUID();
  const screen: ScreenNode = {
    id,
    name,
    type,
    description: "",
    path: path ?? "",
    position: position ?? { x: 100 + project.screens.length * 250, y: 150 },
    size: { ...DEFAULT_NODE_SIZE },
    hasDesign: false,
    createdAt: now(),
    updatedAt: now(),
  };
  project.screens.push(screen);
  await saveProject(project);
  return screen;
}

/** 画面メタを更新 */
export async function updateScreen(
  project: FlowProject,
  screenId: string,
  patch: Partial<Pick<ScreenNode, "name" | "type" | "description" | "path" | "position" | "size">>,
): Promise<ScreenNode | null> {
  const screen = project.screens.find((s) => s.id === screenId);
  if (!screen) return null;
  Object.assign(screen, patch, { updatedAt: now() });
  await saveProject(project);
  return screen;
}

/** 画面を削除（関連エッジ + デザインデータも削除） */
export async function removeScreen(project: FlowProject, screenId: string): Promise<boolean> {
  const idx = project.screens.findIndex((s) => s.id === screenId);
  if (idx === -1) return false;
  project.screens.splice(idx, 1);
  project.edges = project.edges.filter(
    (e) => e.source !== screenId && e.target !== screenId,
  );
  // デザインデータを削除
  if (_backend) {
    await _backend.deleteScreenData(screenId);
  } else {
    localStorage.removeItem(`${SCREEN_DATA_PREFIX}${screenId}`);
  }
  await saveProject(project);
  return true;
}

/** エッジを追加 */
export async function addEdge(
  project: FlowProject,
  source: string,
  target: string,
  label: string,
  trigger: TransitionTrigger = "click",
  sourceHandle?: string,
  targetHandle?: string,
): Promise<ScreenEdge> {
  const edge: ScreenEdge = {
    id: generateUUID(),
    source,
    target,
    sourceHandle,
    targetHandle,
    label,
    trigger,
  };
  project.edges.push(edge);
  await saveProject(project);
  return edge;
}

/** エッジを更新 */
export async function updateEdge(
  project: FlowProject,
  edgeId: string,
  patch: Partial<Pick<ScreenEdge, "label" | "trigger" | "sourceHandle" | "targetHandle">>,
): Promise<ScreenEdge | null> {
  const edge = project.edges.find((e) => e.id === edgeId);
  if (!edge) return null;
  Object.assign(edge, patch);
  await saveProject(project);
  return edge;
}

/** エッジを削除 */
export async function removeEdge(project: FlowProject, edgeId: string): Promise<boolean> {
  const idx = project.edges.findIndex((e) => e.id === edgeId);
  if (idx === -1) return false;
  project.edges.splice(idx, 1);
  await saveProject(project);
  return true;
}

/** 画面のサムネイルを更新 */
export async function updateScreenThumbnail(
  project: FlowProject,
  screenId: string,
  thumbnail: string,
): Promise<void> {
  const screen = project.screens.find((s) => s.id === screenId);
  if (!screen) return;
  screen.thumbnail = thumbnail;
  screen.updatedAt = now();
  await saveProject(project);
}

/** 画面のデザインデータ有無を更新 */
export async function markScreenHasDesign(
  project: FlowProject,
  screenId: string,
  has: boolean,
): Promise<void> {
  const screen = project.screens.find((s) => s.id === screenId);
  if (screen && screen.hasDesign !== has) {
    screen.hasDesign = has;
    await saveProject(project);
  }
}

/** 画面のストレージキー（localStorage フォールバック用） */
export function screenStorageKey(screenId: string): string {
  return `${SCREEN_DATA_PREFIX}${screenId}`;
}

/** 画面が存在するか */
export function screenExists(project: FlowProject, screenId: string): boolean {
  return project.screens.some((s) => s.id === screenId);
}

// ─── グループ操作 ─────────────────────────────────────────────────────────

/** グループを追加 */
export async function addGroup(
  project: FlowProject,
  name: string,
  position: { x: number; y: number },
): Promise<ScreenGroup> {
  const group: ScreenGroup = {
    id: generateUUID(),
    name,
    position,
    size: { width: 360, height: 280 },
    createdAt: now(),
    updatedAt: now(),
  };
  project.groups.push(group);
  await saveProject(project);
  return group;
}

/** グループを更新 */
export async function updateGroup(
  project: FlowProject,
  groupId: string,
  patch: Partial<Pick<ScreenGroup, "name" | "position" | "size" | "color">>,
): Promise<ScreenGroup | null> {
  const group = project.groups.find((g) => g.id === groupId);
  if (!group) return null;
  Object.assign(group, patch, { updatedAt: now() });
  await saveProject(project);
  return group;
}

/** グループを削除（所属画面は ungrouped に戻す） */
export async function removeGroup(
  project: FlowProject,
  groupId: string,
): Promise<boolean> {
  const idx = project.groups.findIndex((g) => g.id === groupId);
  if (idx === -1) return false;
  project.groups.splice(idx, 1);
  // 所属画面の groupId をクリア
  for (const s of project.screens) {
    if (s.groupId === groupId) {
      s.groupId = undefined;
    }
  }
  await saveProject(project);
  return true;
}

/** 画面をグループに割り当て（null でグループ解除） */
export async function assignScreenGroup(
  project: FlowProject,
  screenId: string,
  groupId: string | undefined,
): Promise<void> {
  const screen = project.screens.find((s) => s.id === screenId);
  if (!screen) return;
  screen.groupId = groupId;
  screen.updatedAt = now();
  await saveProject(project);
}

// ─── エクスポート / インポート ────────────────────────────────────────────

/** JSON エクスポート */
export function exportProjectJSON(project: FlowProject): string {
  return JSON.stringify(project, null, 2);
}

/** JSON インポート: バリデーション + 保存 */
export async function importProjectJSON(json: string): Promise<FlowProject> {
  const parsed = JSON.parse(json) as FlowProject;
  if (parsed.version !== 1 || !Array.isArray(parsed.screens) || !Array.isArray(parsed.edges)) {
    throw new Error("不正なプロジェクトファイルです");
  }
  // 既存の画面デザインデータをクリア
  const current = await loadProject();
  for (const s of current.screens) {
    if (_backend) {
      await _backend.deleteScreenData(s.id);
    } else {
      localStorage.removeItem(`${SCREEN_DATA_PREFIX}${s.id}`);
    }
  }
  await saveProject(parsed);
  return parsed;
}

// ─── Mermaid 生成 ─────────────────────────────────────────────────────────

function mermaidEscape(text: string): string {
  return text.replace(/"/g, "#quot;").replace(/[[\](){}]/g, "");
}

export function generateMermaid(project: FlowProject): string {
  if (project.screens.length === 0) return "flowchart TD\n  empty[画面なし]";

  const lines: string[] = ["flowchart TD"];
  const idMap = new Map<string, string>();
  project.screens.forEach((s, i) => idMap.set(s.id, `S${i}`));

  for (const s of project.screens) {
    const sid = idMap.get(s.id)!;
    const label = mermaidEscape(s.name);
    const sub = s.path ? `<br/>${mermaidEscape(s.path)}` : "";
    const typeLabel = SCREEN_TYPE_LABELS[s.type] ?? s.type;
    lines.push(`    ${sid}["${label}${sub}<br/><small>${typeLabel}</small>"]`);
  }
  for (const e of project.edges) {
    const src = idMap.get(e.source);
    const tgt = idMap.get(e.target);
    if (!src || !tgt) continue;
    const edgeLabel = e.label ? mermaidEscape(e.label) : (TRIGGER_LABELS[e.trigger] ?? "");
    if (edgeLabel) {
      lines.push(`    ${src} -->|${edgeLabel}| ${tgt}`);
    } else {
      lines.push(`    ${src} --> ${tgt}`);
    }
  }
  return lines.join("\n");
}

export function generateFlowMarkdown(project: FlowProject): string {
  const mermaid = generateMermaid(project);
  const screenRows = project.screens.map((s) => {
    const type = SCREEN_TYPE_LABELS[s.type] ?? s.type;
    const desc = s.description.replace(/\|/g, "\\|").replace(/\n/g, " ");
    return `| ${s.name} | ${type} | ${s.path || "—"} | ${desc || "—"} | ${s.hasDesign ? "✓" : "—"} |`;
  });
  const edgeRows = project.edges.map((e) => {
    const src = project.screens.find((s) => s.id === e.source)?.name ?? e.source;
    const tgt = project.screens.find((s) => s.id === e.target)?.name ?? e.target;
    const trigger = TRIGGER_LABELS[e.trigger] ?? e.trigger;
    return `| ${src} | → | ${tgt} | ${e.label || "—"} | ${trigger} |`;
  });

  return [
    `# ${project.name} — 画面フロー図`,
    "",
    "```mermaid",
    mermaid,
    "```",
    "",
    "## 画面一覧",
    "",
    "| 画面名 | 種別 | URL | 説明 | デザイン |",
    "|--------|------|-----|------|----------|",
    ...screenRows,
    "",
    "## 遷移一覧",
    "",
    "| 遷移元 | | 遷移先 | ラベル | トリガー |",
    "|--------|---|--------|--------|----------|",
    ...edgeRows,
    "",
    `> 生成日時: ${new Date().toLocaleString("ja-JP")}`,
    "",
  ].join("\n");
}
