/**
 * processFlowStore.ts
 * 処理フロー定義の永続化ストア
 *
 * - wsBridge 接続済み: サーバー側ファイルに保存（mcpBridge 経由）
 * - 未接続: localStorage にフォールバック
 */
import type {
  ProcessFlow,
  ProcessFlowMeta,
  ActionDefinition,
  Step,
  StepType,
  ActionTrigger,
  ProcessFlowType,
} from "../types/action";
import type { FlowProject } from "../types/flow";
import { loadProject, saveProject } from "./flowStore";
import { generateUUID } from "../utils/uuid";
import { migrateProcessFlow } from "../utils/actionMigration";
import { renumber, nextNo } from "../utils/listOrder";

// ─── ストレージバックエンド ──────────────────────────────────────────────

export interface ProcessFlowStorageBackend {
  loadProcessFlow(id: string): Promise<unknown>;
  saveProcessFlow(id: string, data: unknown): Promise<void>;
  deleteProcessFlow(id: string): Promise<void>;
  listProcessFlows(): Promise<unknown>;
}

let _backend: ProcessFlowStorageBackend | null = null;

export function setProcessFlowStorageBackend(b: ProcessFlowStorageBackend | null): void {
  _backend = b;
}

// ─── localStorage キー ───────────────────────────────────────────────────

const ACTION_PREFIX = "process-flow-";

function now(): string {
  return new Date().toISOString();
}

// ─── 公開 API ────────────────────────────────────────────────────────────

/** 処理フロー一覧を取得（project.json のメタ情報） */
export async function listProcessFlows(): Promise<ProcessFlowMeta[]> {
  const project = await loadProject();
  return (project.processFlows ?? []) as ProcessFlowMeta[];
}

/** 処理フローを読み込み（旧形式データは自動マイグレーション） */
export async function loadProcessFlow(id: string): Promise<ProcessFlow | null> {
  if (_backend) {
    const data = await _backend.loadProcessFlow(id);
    return data ? migrateProcessFlow(data) : null;
  }
  const raw = localStorage.getItem(`${ACTION_PREFIX}${id}`);
  if (!raw) return null;
  try {
    return migrateProcessFlow(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** 処理フローを保存（project.json のメタも同期） */
export async function saveProcessFlow(group: ProcessFlow): Promise<void> {
  group.updatedAt = now();

  if (_backend) {
    await _backend.saveProcessFlow(group.id, group);
  } else {
    localStorage.setItem(`${ACTION_PREFIX}${group.id}`, JSON.stringify(group));
  }

  await syncProcessFlowMeta(group);
}

/** 処理フローを新規作成 */
export async function createProcessFlow(
  name: string,
  type: ProcessFlowType,
  screenId?: string,
  description?: string,
): Promise<ProcessFlow> {
  const id = generateUUID();
  const ts = now();
  const group: ProcessFlow = {
    id,
    name,
    type,
    screenId,
    description: description ?? "",
    actions: [],
    createdAt: ts,
    updatedAt: ts,
  };
  await saveProcessFlow(group);
  return group;
}

/** 処理フローを削除 */
export async function deleteProcessFlow(id: string): Promise<void> {
  if (_backend) {
    await _backend.deleteProcessFlow(id);
  } else {
    localStorage.removeItem(`${ACTION_PREFIX}${id}`);
  }

  const project = await loadProject();
  if (project.processFlows) {
    project.processFlows = renumber(project.processFlows.filter((a) => a.id !== id));
    await saveProject(project);
  }
}

/** 処理フロー一覧の並び順を変更する (project.processFlows の物理順) */
export async function reorderProcessFlows(fromIndex: number, toIndex: number): Promise<void> {
  const project = await loadProject();
  if (!project.processFlows) return;
  if (fromIndex < 0 || toIndex < 0) return;
  if (fromIndex >= project.processFlows.length || toIndex >= project.processFlows.length) return;
  if (fromIndex === toIndex) return;
  const [moved] = project.processFlows.splice(fromIndex, 1);
  project.processFlows.splice(toIndex, 0, moved);
  project.processFlows = renumber(project.processFlows);
  await saveProject(project);
}

/** アクションを追加 */
export function addAction(
  group: ProcessFlow,
  name: string,
  trigger: ActionTrigger,
): ActionDefinition {
  const action: ActionDefinition = {
    id: generateUUID(),
    name,
    trigger,
    steps: [],
  };
  group.actions.push(action);
  return action;
}

/** アクションを削除 */
export function removeAction(group: ProcessFlow, actionId: string): void {
  const idx = group.actions.findIndex((a) => a.id === actionId);
  if (idx >= 0) group.actions.splice(idx, 1);
}

/** ステップを追加 */
export function addStep(
  action: ActionDefinition,
  type: StepType,
  insertIndex?: number,
): Step {
  const step = createDefaultStep(type);
  if (insertIndex !== undefined && insertIndex >= 0 && insertIndex <= action.steps.length) {
    action.steps.splice(insertIndex, 0, step);
  } else {
    action.steps.push(step);
  }
  return step;
}

/** ステップを削除 */
export function removeStep(action: ActionDefinition, stepId: string): void {
  const idx = action.steps.findIndex((s) => s.id === stepId);
  if (idx >= 0) action.steps.splice(idx, 1);
}

/** ステップを移動 */
export function moveStep(
  action: ActionDefinition,
  fromIndex: number,
  toIndex: number,
): void {
  if (fromIndex < 0 || fromIndex >= action.steps.length) return;
  if (toIndex < 0 || toIndex >= action.steps.length) return;
  const [step] = action.steps.splice(fromIndex, 1);
  action.steps.splice(toIndex, 0, step);
}

/** サブステップを追加 */
export function addSubStep(
  parentStep: Step,
  type: StepType,
): Step {
  if (!parentStep.subSteps) parentStep.subSteps = [];
  const step = createDefaultStep(type);
  parentStep.subSteps.push(step);
  return step;
}

/** サブステップを削除 */
export function removeSubStep(parentStep: Step, subStepId: string): void {
  if (!parentStep.subSteps) return;
  const idx = parentStep.subSteps.findIndex((s) => s.id === subStepId);
  if (idx >= 0) parentStep.subSteps.splice(idx, 1);
}

// ─── 内部 ────────────────────────────────────────────────────────────────

export function createDefaultStep(type: StepType): Step {
  const base = {
    id: generateUUID(),
    type,
    description: "",
  };
  switch (type) {
    case "validation":
      return { ...base, type: "validation", conditions: "", inlineBranch: { ok: "続行", ng: "エラー表示" } };
    case "dbAccess":
      return { ...base, type: "dbAccess", tableName: "", operation: "SELECT" as const };
    case "externalSystem":
      return { ...base, type: "externalSystem", systemName: "" };
    case "commonProcess":
      return { ...base, type: "commonProcess", refId: "", refName: "" };
    case "screenTransition":
      return { ...base, type: "screenTransition", targetScreenName: "" };
    case "displayUpdate":
      return { ...base, type: "displayUpdate", target: "" };
    case "branch":
      return {
        ...base,
        type: "branch",
        branches: [
          { id: generateUUID(), code: "A", condition: "", steps: [] },
          { id: generateUUID(), code: "B", condition: "", steps: [] },
        ],
      };
    case "loop":
      return {
        ...base,
        type: "loop",
        loopKind: "count",
        steps: [],
      };
    case "loopBreak":
      return { ...base, type: "loopBreak" };
    case "loopContinue":
      return { ...base, type: "loopContinue" };
    case "jump":
      return { ...base, type: "jump", jumpTo: "" };
    case "compute":
      return { ...base, type: "compute", expression: "" };
    case "return":
      return { ...base, type: "return" };
    case "log":
      return { ...base, type: "log", level: "info", message: "" };
    case "audit":
      return { ...base, type: "audit", action: "" };
    case "workflow":
      return {
        ...base,
        type: "workflow",
        pattern: "approval-sequential",
        approvers: [],
        quorum: { type: "any" },
      };
    case "transactionScope":
      return {
        ...base,
        type: "transactionScope",
        isolationLevel: "READ_COMMITTED",
        propagation: "REQUIRED",
        steps: [],
      };
    case "eventPublish":
      return { ...base, type: "eventPublish", topic: "" };
    case "eventSubscribe":
      return { ...base, type: "eventSubscribe", topic: "" };
    case "closing":
      return { ...base, type: "closing", period: "monthly" };
    case "cdc":
      return {
        ...base,
        type: "cdc",
        tables: [],
        captureMode: "incremental",
        destination: { type: "auditLog" },
      };
    case "other":
      return { ...base, type: "other" };
  }
}

/** グループ内の全ステップを再帰走査して付箋合計をカウント (#228) */
function countGroupNotes(group: ProcessFlow): number {
  let count = 0;
  const visit = (steps: Step[]) => {
    for (const s of steps) {
      count += s.notes?.length ?? 0;
      if (s.subSteps) visit(s.subSteps);
      if (s.type === "branch") {
        for (const b of s.branches) visit(b.steps);
        if (s.elseBranch) visit(s.elseBranch.steps);
      }
      if (s.type === "loop") visit(s.steps);
      if (s.type === "transactionScope") {
        visit(s.steps);
        if (s.onCommit) visit(s.onCommit);
        if (s.onRollback) visit(s.onRollback);
      }
    }
  };
  for (const a of group.actions) visit(a.steps);
  return count;
}

/** project.json の処理フローメタを同期 */
async function syncProcessFlowMeta(group: ProcessFlow): Promise<void> {
  const project = await loadProject();
  if (!project.processFlows) project.processFlows = [];

  const idx = project.processFlows.findIndex((a) => a.id === group.id);
  const meta: FlowProject["processFlows"] extends (infer T)[] | undefined ? T : never = {
    id: group.id,
    no: idx >= 0 ? project.processFlows[idx].no : nextNo(project.processFlows),
    name: group.name,
    type: group.type,
    screenId: group.screenId,
    actionCount: group.actions.length,
    updatedAt: group.updatedAt as import("../types/v3").Timestamp,
    maturity: group.maturity,
    notesCount: countGroupNotes(group),
  };

  if (idx >= 0) {
    project.processFlows[idx] = meta;
  } else {
    project.processFlows.push(meta);
  }
  project.processFlows = renumber(project.processFlows);
  await saveProject(project);
}
