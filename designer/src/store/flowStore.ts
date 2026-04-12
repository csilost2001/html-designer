import type { FlowProject, ScreenNode, ScreenEdge, ScreenType, TransitionTrigger } from "../types/flow";
import { SCREEN_TYPE_LABELS, TRIGGER_LABELS } from "../types/flow";

const FLOW_PROJECT_KEY = "flow-project";
const SCREEN_DATA_PREFIX = "gjs-screen-";
const LEGACY_KEY = "gjs-designer-project";

const DEFAULT_NODE_SIZE = { width: 200, height: 100 };

function now(): string {
  return new Date().toISOString();
}

function createEmptyProject(): FlowProject {
  return {
    version: 1,
    name: "新規プロジェクト",
    screens: [],
    edges: [],
    updatedAt: now(),
  };
}

/** 旧データ (gjs-designer-project) が存在すれば新構造へマイグレーション */
function migrateLegacy(): FlowProject | null {
  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw) return null;

  const screenId = crypto.randomUUID();
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

  // 旧データをスクリーン別キーにコピー
  localStorage.setItem(`${SCREEN_DATA_PREFIX}${screenId}`, raw);

  const project: FlowProject = {
    version: 1,
    name: "マイプロジェクト",
    screens: [screen],
    edges: [],
    updatedAt: now(),
  };

  localStorage.setItem(FLOW_PROJECT_KEY, JSON.stringify(project));
  // 旧キーは削除せず残す（安全策）
  return project;
}

/** プロジェクトを読み込み */
export function loadProject(): FlowProject {
  const raw = localStorage.getItem(FLOW_PROJECT_KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as FlowProject;
    } catch {
      // 破損時はリセット
    }
  }
  // マイグレーション試行
  const migrated = migrateLegacy();
  if (migrated) return migrated;
  // 新規
  const empty = createEmptyProject();
  localStorage.setItem(FLOW_PROJECT_KEY, JSON.stringify(empty));
  return empty;
}

/** プロジェクトを保存 */
export function saveProject(project: FlowProject): void {
  project.updatedAt = now();
  localStorage.setItem(FLOW_PROJECT_KEY, JSON.stringify(project));
}

/** 画面を追加 */
export function addScreen(
  project: FlowProject,
  name: string,
  type: ScreenType,
  path?: string,
  position?: { x: number; y: number },
): ScreenNode {
  const id = crypto.randomUUID();
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
  saveProject(project);
  return screen;
}

/** 画面メタを更新 */
export function updateScreen(
  project: FlowProject,
  screenId: string,
  patch: Partial<Pick<ScreenNode, "name" | "type" | "description" | "path" | "position" | "size">>,
): ScreenNode | null {
  const screen = project.screens.find((s) => s.id === screenId);
  if (!screen) return null;
  Object.assign(screen, patch, { updatedAt: now() });
  saveProject(project);
  return screen;
}

/** 画面を削除（関連エッジ + デザインデータも削除） */
export function removeScreen(project: FlowProject, screenId: string): boolean {
  const idx = project.screens.findIndex((s) => s.id === screenId);
  if (idx === -1) return false;
  project.screens.splice(idx, 1);
  project.edges = project.edges.filter(
    (e) => e.source !== screenId && e.target !== screenId,
  );
  localStorage.removeItem(`${SCREEN_DATA_PREFIX}${screenId}`);
  saveProject(project);
  return true;
}

/** エッジを追加 */
export function addEdge(
  project: FlowProject,
  source: string,
  target: string,
  label: string,
  trigger: TransitionTrigger = "click",
  sourceHandle?: string,
  targetHandle?: string,
): ScreenEdge {
  const edge: ScreenEdge = {
    id: crypto.randomUUID(),
    source,
    target,
    sourceHandle,
    targetHandle,
    label,
    trigger,
  };
  project.edges.push(edge);
  saveProject(project);
  return edge;
}

/** エッジを更新 */
export function updateEdge(
  project: FlowProject,
  edgeId: string,
  patch: Partial<Pick<ScreenEdge, "label" | "trigger">>,
): ScreenEdge | null {
  const edge = project.edges.find((e) => e.id === edgeId);
  if (!edge) return null;
  Object.assign(edge, patch);
  saveProject(project);
  return edge;
}

/** エッジを削除 */
export function removeEdge(project: FlowProject, edgeId: string): boolean {
  const idx = project.edges.findIndex((e) => e.id === edgeId);
  if (idx === -1) return false;
  project.edges.splice(idx, 1);
  saveProject(project);
  return true;
}

/** 画面のデザインデータ有無を更新 */
export function markScreenHasDesign(project: FlowProject, screenId: string, has: boolean): void {
  const screen = project.screens.find((s) => s.id === screenId);
  if (screen && screen.hasDesign !== has) {
    screen.hasDesign = has;
    saveProject(project);
  }
}

/** 画面のGrapesJSストレージキー */
export function screenStorageKey(screenId: string): string {
  return `${SCREEN_DATA_PREFIX}${screenId}`;
}

/** 画面が存在するか */
export function screenExists(project: FlowProject, screenId: string): boolean {
  return project.screens.some((s) => s.id === screenId);
}

// ── エクスポート / インポート ──

/** JSON エクスポート用オブジェクト */
export function exportProjectJSON(project: FlowProject): string {
  return JSON.stringify(project, null, 2);
}

/** JSON インポート: バリデーション + localStorage 反映 */
export function importProjectJSON(json: string): FlowProject {
  const parsed = JSON.parse(json) as FlowProject;
  if (parsed.version !== 1 || !Array.isArray(parsed.screens) || !Array.isArray(parsed.edges)) {
    throw new Error("不正なプロジェクトファイルです");
  }
  // 既存の画面デザインデータをクリア
  const current = loadProject();
  for (const s of current.screens) {
    localStorage.removeItem(`${SCREEN_DATA_PREFIX}${s.id}`);
  }
  // 保存
  localStorage.setItem(FLOW_PROJECT_KEY, JSON.stringify(parsed));
  return parsed;
}

// ── Mermaid 生成 ──

/** Mermaid フロー記法文字列を安全にエスケープ */
function mermaidEscape(text: string): string {
  return text.replace(/"/g, "#quot;").replace(/[[\](){}]/g, "");
}

/** プロジェクトから Mermaid flowchart 記法を生成 */
export function generateMermaid(project: FlowProject): string {
  if (project.screens.length === 0) return "flowchart TD\n  empty[画面なし]";

  const lines: string[] = ["flowchart TD"];

  // ノード ID → 短い安全な ID (S0, S1, ...)
  const idMap = new Map<string, string>();
  project.screens.forEach((s, i) => idMap.set(s.id, `S${i}`));

  // ノード定義
  for (const s of project.screens) {
    const sid = idMap.get(s.id)!;
    const label = mermaidEscape(s.name);
    const sub = s.path ? `<br/>${mermaidEscape(s.path)}` : "";
    const typeLabel = SCREEN_TYPE_LABELS[s.type] ?? s.type;
    lines.push(`    ${sid}["${label}${sub}<br/><small>${typeLabel}</small>"]`);
  }

  // エッジ定義
  for (const e of project.edges) {
    const src = idMap.get(e.source);
    const tgt = idMap.get(e.target);
    if (!src || !tgt) continue;
    const edgeLabel = e.label
      ? mermaidEscape(e.label)
      : (TRIGGER_LABELS[e.trigger] ?? "");
    if (edgeLabel) {
      lines.push(`    ${src} -->|${edgeLabel}| ${tgt}`);
    } else {
      lines.push(`    ${src} --> ${tgt}`);
    }
  }

  return lines.join("\n");
}

/** Mermaid 付き Markdown ドキュメントを生成 */
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
