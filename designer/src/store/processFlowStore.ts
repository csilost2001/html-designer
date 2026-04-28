// @ts-nocheck
import type {
  ActionDefinition,
  ActionTrigger,
  ProcessFlow,
  ProcessFlowType,
  Step,
  StepType,
} from "../types/action";
import type { ProcessFlowId, ScreenId, Timestamp } from "../types/v3";
import type { ProcessFlowMeta as FlowProcessFlowMeta } from "../types/flow";
import { migrateProcessFlow, PROCESS_FLOW_V3_SCHEMA_REF } from "../utils/actionMigration";
import { generateUUID } from "../utils/uuid";
import { nextNo, renumber } from "../utils/listOrder";
import { loadProject, saveProject } from "./flowStore";

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

const ACTION_PREFIX = "v3-process-flow-";
const LEGACY_ACTION_PREFIX = "process-flow-";

function now(): Timestamp {
  return new Date().toISOString() as Timestamp;
}

export async function listProcessFlows(): Promise<FlowProcessFlowMeta[]> {
  const project = await loadProject();
  return (project.processFlows ?? []) as FlowProcessFlowMeta[];
}

export async function loadProcessFlow(id: string): Promise<ProcessFlow | null> {
  if (_backend) {
    const data = await _backend.loadProcessFlow(id);
    return data ? migrateProcessFlow(data) : null;
  }

  let raw = localStorage.getItem(`${ACTION_PREFIX}${id}`);
  if (!raw) {
    const legacyRaw = localStorage.getItem(`${LEGACY_ACTION_PREFIX}${id}`);
    if (legacyRaw) {
      raw = legacyRaw;
      localStorage.setItem(`${ACTION_PREFIX}${id}`, legacyRaw);
      localStorage.removeItem(`${LEGACY_ACTION_PREFIX}${id}`);
    }
  }
  if (!raw) return null;

  try {
    return migrateProcessFlow(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveProcessFlow(group: ProcessFlow): Promise<void> {
  const v3 = migrateProcessFlow(group);
  v3.$schema = PROCESS_FLOW_V3_SCHEMA_REF;
  v3.meta.updatedAt = now();

  if (_backend) {
    await _backend.saveProcessFlow(v3.meta.id, v3);
  } else {
    localStorage.setItem(`${ACTION_PREFIX}${v3.meta.id}`, JSON.stringify(v3));
  }

  await syncProcessFlowMeta(v3);
}

export async function createProcessFlow(
  name: string,
  type: ProcessFlowType,
  screenId?: string,
  description?: string,
): Promise<ProcessFlow> {
  const id = generateUUID() as ProcessFlowId;
  const ts = now();
  const group: ProcessFlow = {
    $schema: PROCESS_FLOW_V3_SCHEMA_REF,
    meta: {
      id,
      name,
      kind: type,
      screenId: screenId as ScreenId | undefined,
      description: description ?? "",
      version: "1.0.0",
      maturity: "draft",
      mode: "upstream",
      createdAt: ts,
      updatedAt: ts,
    },
    actions: [],
  };
  await saveProcessFlow(group);
  return group;
}

export async function deleteProcessFlow(id: string): Promise<void> {
  if (_backend) {
    await _backend.deleteProcessFlow(id);
  } else {
    localStorage.removeItem(`${ACTION_PREFIX}${id}`);
    localStorage.removeItem(`${LEGACY_ACTION_PREFIX}${id}`);
  }

  const project = await loadProject();
  if (project.processFlows) {
    project.processFlows = renumber(project.processFlows.filter((a) => a.id !== id));
    await saveProject(project);
  }
}

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

export function addAction(group: ProcessFlow, name: string, trigger: ActionTrigger): ActionDefinition {
  const action: ActionDefinition = {
    id: generateUUID() as never,
    name,
    trigger,
    steps: [],
  };
  group.actions.push(action);
  return action;
}

export function removeAction(group: ProcessFlow, actionId: string): void {
  const idx = group.actions.findIndex((a) => a.id === actionId);
  if (idx >= 0) group.actions.splice(idx, 1);
}

export function addStep(action: ActionDefinition, type: StepType, insertIndex?: number): Step {
  const step = createDefaultStep(type);
  if (insertIndex !== undefined && insertIndex >= 0 && insertIndex <= action.steps.length) {
    action.steps.splice(insertIndex, 0, step);
  } else {
    action.steps.push(step);
  }
  return step;
}

export function removeStep(action: ActionDefinition, stepId: string): void {
  const idx = action.steps.findIndex((s) => s.id === stepId);
  if (idx >= 0) action.steps.splice(idx, 1);
}

export function moveStep(action: ActionDefinition, fromIndex: number, toIndex: number): void {
  if (fromIndex < 0 || fromIndex >= action.steps.length) return;
  if (toIndex < 0 || toIndex >= action.steps.length) return;
  const [step] = action.steps.splice(fromIndex, 1);
  action.steps.splice(toIndex, 0, step);
}

export function addSubStep(parentStep: Step, type: StepType): Step {
  const step = createDefaultStep(type);
  const parent = parentStep as Step & { steps?: Step[] };
  if (!Array.isArray(parent.steps)) parent.steps = [];
  parent.steps.push(step);
  return step;
}

export function removeSubStep(parentStep: Step, subStepId: string): void {
  const parent = parentStep as Step & { steps?: Step[] };
  if (!parent.steps) return;
  const idx = parent.steps.findIndex((s) => s.id === subStepId);
  if (idx >= 0) parent.steps.splice(idx, 1);
}

export function createDefaultStep(type: StepType): Step {
  const base = { id: generateUUID() as never, kind: type, description: "" };
  switch (type) {
    case "validation":
      return { ...base, kind: "validation", conditions: "", inlineBranch: { ok: [], ng: [] } };
    case "dbAccess":
      return { ...base, kind: "dbAccess", tableId: "" as never, operation: "SELECT" };
    case "externalSystem":
      return { ...base, kind: "externalSystem", systemRef: "" as never };
    case "commonProcess":
      return { ...base, kind: "commonProcess", refId: "" as never };
    case "screenTransition":
      return { ...base, kind: "screenTransition", targetScreenId: "" as never };
    case "displayUpdate":
      return { ...base, kind: "displayUpdate", target: "" };
    case "branch":
      return {
        ...base,
        kind: "branch",
        branches: [
          { id: generateUUID() as never, code: "A", condition: { kind: "expression", expression: "" }, steps: [] },
          { id: generateUUID() as never, code: "B", condition: { kind: "expression", expression: "" }, steps: [] },
        ],
      };
    case "loop":
      return { ...base, kind: "loop", loopKind: "count", steps: [] };
    case "loopBreak":
      return { ...base, kind: "loopBreak" };
    case "loopContinue":
      return { ...base, kind: "loopContinue" };
    case "jump":
      return { ...base, kind: "jump", jumpTo: "" as never };
    case "compute":
      return { ...base, kind: "compute", expression: "" };
    case "return":
      return { ...base, kind: "return" };
    case "log":
      return { ...base, kind: "log", level: "info", message: "" };
    case "audit":
      return { ...base, kind: "audit", action: "" };
    case "workflow":
      return { ...base, kind: "workflow", pattern: "approval-sequential", approvers: [], quorum: { type: "any" } };
    case "transactionScope":
      return { ...base, kind: "transactionScope", isolationLevel: "READ_COMMITTED", propagation: "REQUIRED", steps: [] };
    case "eventPublish":
      return { ...base, kind: "eventPublish", topic: "" as never };
    case "eventSubscribe":
      return { ...base, kind: "eventSubscribe", topic: "" as never };
    case "closing":
      return { ...base, kind: "closing", period: "monthly" };
    case "cdc":
      return { ...base, kind: "cdc", tableIds: [], captureMode: "incremental", destination: { kind: "auditLog", auditAction: "" } };
    case "extension":
      return { ...base, kind: "legacy:OtherStep", config: {} } as Step;
  }
}

function countGroupNotes(group: ProcessFlow): number {
  let count = group.authoring?.notes?.length ?? 0;
  const visit = (steps: Step[]) => {
    for (const s of steps) {
      count += s.notes?.length ?? 0;
      if (s.kind === "branch") {
        for (const b of s.branches) visit(b.steps);
        if (s.elseBranch) visit(s.elseBranch.steps);
      }
      if (s.kind === "loop") visit(s.steps);
      if (s.kind === "transactionScope") {
        visit(s.steps);
        if (s.onCommit) visit(s.onCommit);
        if (s.onRollback) visit(s.onRollback);
      }
    }
  };
  for (const a of group.actions) visit(a.steps);
  return count;
}

async function syncProcessFlowMeta(group: ProcessFlow): Promise<void> {
  const project = await loadProject();
  if (!project.processFlows) project.processFlows = [];

  const idx = project.processFlows.findIndex((a) => a.id === group.meta.id);
  const meta: FlowProcessFlowMeta = {
    id: group.meta.id as ProcessFlowId,
    no: idx >= 0 ? project.processFlows[idx].no : nextNo(project.processFlows),
    name: group.meta.name,
    kind: group.meta.kind,
    screenId: group.meta.screenId as ScreenId | undefined,
    actionCount: group.actions.length,
    updatedAt: group.meta.updatedAt as Timestamp,
    maturity: group.meta.maturity,
    notesCount: countGroupNotes(group),
  };

  if (idx >= 0) project.processFlows[idx] = meta;
  else project.processFlows.push(meta);
  project.processFlows = renumber(project.processFlows);
  await saveProject(project);
}
