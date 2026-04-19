/**
 * actionStore.ts
 * 処理フロー定義の永続化ストア
 *
 * - wsBridge 接続済み: サーバー側ファイルに保存（mcpBridge 経由）
 * - 未接続: localStorage にフォールバック
 */
import type {
  ActionGroup,
  ActionGroupMeta,
  ActionDefinition,
  Step,
  StepType,
  ActionTrigger,
  ActionGroupType,
} from "../types/action";
import type { FlowProject } from "../types/flow";
import { loadProject, saveProject } from "./flowStore";
import { generateUUID } from "../utils/uuid";
import { migrateActionGroup } from "../utils/actionMigration";
import { renumber, nextNo } from "../utils/listOrder";

// ─── ストレージバックエンド ──────────────────────────────────────────────

export interface ActionStorageBackend {
  loadActionGroup(id: string): Promise<unknown>;
  saveActionGroup(id: string, data: unknown): Promise<void>;
  deleteActionGroup(id: string): Promise<void>;
  listActionGroups(): Promise<unknown>;
}

let _backend: ActionStorageBackend | null = null;

export function setActionStorageBackend(b: ActionStorageBackend | null): void {
  _backend = b;
}

// ─── localStorage キー ───────────────────────────────────────────────────

const ACTION_PREFIX = "action-group-";

function now(): string {
  return new Date().toISOString();
}

// ─── 公開 API ────────────────────────────────────────────────────────────

/** アクショングループ一覧を取得（project.json のメタ情報） */
export async function listActionGroups(): Promise<ActionGroupMeta[]> {
  const project = await loadProject();
  return (project.actionGroups ?? []) as ActionGroupMeta[];
}

/** アクショングループを読み込み（旧形式データは自動マイグレーション） */
export async function loadActionGroup(id: string): Promise<ActionGroup | null> {
  if (_backend) {
    const data = await _backend.loadActionGroup(id);
    return data ? migrateActionGroup(data) : null;
  }
  const raw = localStorage.getItem(`${ACTION_PREFIX}${id}`);
  if (!raw) return null;
  try {
    return migrateActionGroup(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** アクショングループを保存（project.json のメタも同期） */
export async function saveActionGroup(group: ActionGroup): Promise<void> {
  group.updatedAt = now();

  if (_backend) {
    await _backend.saveActionGroup(group.id, group);
  } else {
    localStorage.setItem(`${ACTION_PREFIX}${group.id}`, JSON.stringify(group));
  }

  await syncActionGroupMeta(group);
}

/** アクショングループを新規作成 */
export async function createActionGroup(
  name: string,
  type: ActionGroupType,
  screenId?: string,
  description?: string,
): Promise<ActionGroup> {
  const id = generateUUID();
  const ts = now();
  const group: ActionGroup = {
    id,
    name,
    type,
    screenId,
    description: description ?? "",
    actions: [],
    createdAt: ts,
    updatedAt: ts,
  };
  await saveActionGroup(group);
  return group;
}

/** アクショングループを削除 */
export async function deleteActionGroup(id: string): Promise<void> {
  if (_backend) {
    await _backend.deleteActionGroup(id);
  } else {
    localStorage.removeItem(`${ACTION_PREFIX}${id}`);
  }

  const project = await loadProject();
  if (project.actionGroups) {
    project.actionGroups = renumber(project.actionGroups.filter((a) => a.id !== id));
    await saveProject(project);
  }
}

/** 処理フロー一覧の並び順を変更する (project.actionGroups の物理順) */
export async function reorderActionGroups(fromIndex: number, toIndex: number): Promise<void> {
  const project = await loadProject();
  if (!project.actionGroups) return;
  if (fromIndex < 0 || toIndex < 0) return;
  if (fromIndex >= project.actionGroups.length || toIndex >= project.actionGroups.length) return;
  if (fromIndex === toIndex) return;
  const [moved] = project.actionGroups.splice(fromIndex, 1);
  project.actionGroups.splice(toIndex, 0, moved);
  project.actionGroups = renumber(project.actionGroups);
  await saveProject(project);
}

/** アクションを追加 */
export function addAction(
  group: ActionGroup,
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
export function removeAction(group: ActionGroup, actionId: string): void {
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
    case "other":
      return { ...base, type: "other" };
  }
}

/** project.json のアクショングループメタを同期 */
async function syncActionGroupMeta(group: ActionGroup): Promise<void> {
  const project = await loadProject();
  if (!project.actionGroups) project.actionGroups = [];

  const idx = project.actionGroups.findIndex((a) => a.id === group.id);
  const meta: FlowProject["actionGroups"] extends (infer T)[] | undefined ? T : never = {
    id: group.id,
    no: idx >= 0 ? project.actionGroups[idx].no : nextNo(project.actionGroups),
    name: group.name,
    type: group.type,
    screenId: group.screenId,
    actionCount: group.actions.length,
    updatedAt: group.updatedAt,
  };

  if (idx >= 0) {
    project.actionGroups[idx] = meta;
  } else {
    project.actionGroups.push(meta);
  }
  project.actionGroups = renumber(project.actionGroups);
  await saveProject(project);
}
