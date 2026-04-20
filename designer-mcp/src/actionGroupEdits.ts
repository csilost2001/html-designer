/**
 * ActionGroup の細粒度編集ヘルパー (#261 MCP リアルタイム編集対応)。
 *
 * 各関数は ActionGroup を mutate して返す (同じ参照)。呼び出し側で writeActionGroup し、
 * wsBridge.broadcast("actionGroupChanged", { id }) してブラウザを再描画させる。
 */

type Step = {
  id: string;
  type: string;
  description?: string;
  subSteps?: Step[];
  branches?: Array<{ id: string; steps: Step[] }>;
  elseBranch?: { id: string; steps: Step[] };
  steps?: Step[]; // loop body
  outcomes?: Record<string, { sideEffects?: Step[] } | undefined>;
  notes?: Array<{ id: string; type: string; body: string; createdAt: string }>;
  [k: string]: unknown;
};

type Action = {
  id: string;
  steps: Step[];
  [k: string]: unknown;
};

export type ActionGroupDoc = {
  id: string;
  maturity?: string;
  actions: Action[];
  errorCatalog?: Record<string, unknown>;
  secretsCatalog?: Record<string, unknown>;
  typeCatalog?: Record<string, unknown>;
  externalSystemCatalog?: Record<string, unknown>;
  updatedAt?: string;
  [k: string]: unknown;
};

/** 全 step を再帰走査。親配列も併せて返す (move/remove 用) */
function walkSteps(
  steps: Step[],
  visit: (step: Step, parentArray: Step[], index: number) => boolean | void,
): boolean {
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (visit(s, steps, i) === true) return true;
    if (s.subSteps && walkSteps(s.subSteps, visit)) return true;
    if (s.branches) {
      for (const b of s.branches) {
        if (walkSteps(b.steps, visit)) return true;
      }
    }
    if (s.elseBranch && walkSteps(s.elseBranch.steps, visit)) return true;
    if (s.type === "loop" && s.steps && walkSteps(s.steps, visit)) return true;
    if (s.outcomes) {
      for (const oc of Object.values(s.outcomes)) {
        if (oc?.sideEffects && walkSteps(oc.sideEffects, visit)) return true;
      }
    }
  }
  return false;
}

/** 全 step を対象にコールバック実行 */
export function forEachStep(ag: ActionGroupDoc, visit: (step: Step) => void): void {
  for (const a of ag.actions) walkSteps(a.steps, (s) => { visit(s); });
}

/** stepId で step を探す (見つからなければ null) */
export function findStep(ag: ActionGroupDoc, stepId: string): Step | null {
  let found: Step | null = null;
  for (const a of ag.actions) {
    walkSteps(a.steps, (s) => {
      if (s.id === stepId) { found = s; return true; }
    });
    if (found) break;
  }
  return found;
}

/** stepId を含む配列と index を探す */
function findStepWithContext(
  ag: ActionGroupDoc,
  stepId: string,
): { parentArray: Step[]; index: number } | null {
  let result: { parentArray: Step[]; index: number } | null = null;
  for (const a of ag.actions) {
    walkSteps(a.steps, (s, arr, idx) => {
      if (s.id === stepId) { result = { parentArray: arr, index: idx }; return true; }
    });
    if (result) break;
  }
  return result;
}

export function updateStep(ag: ActionGroupDoc, stepId: string, patch: Record<string, unknown>): void {
  const s = findStep(ag, stepId);
  if (!s) throw new Error(`step ${stepId} が見つかりません`);
  Object.assign(s, patch);
}

export function removeStep(ag: ActionGroupDoc, stepId: string): void {
  const ctx = findStepWithContext(ag, stepId);
  if (!ctx) throw new Error(`step ${stepId} が見つかりません`);
  ctx.parentArray.splice(ctx.index, 1);
}

export function moveStep(ag: ActionGroupDoc, stepId: string, newIndex: number): void {
  const ctx = findStepWithContext(ag, stepId);
  if (!ctx) throw new Error(`step ${stepId} が見つかりません`);
  const [removed] = ctx.parentArray.splice(ctx.index, 1);
  const clamped = Math.max(0, Math.min(newIndex, ctx.parentArray.length));
  ctx.parentArray.splice(clamped, 0, removed);
}

export function setMaturity(
  ag: ActionGroupDoc,
  target: "group" | "action" | "step",
  targetId: string | undefined,
  maturity: "draft" | "provisional" | "committed",
): void {
  if (target === "group") {
    ag.maturity = maturity;
    return;
  }
  if (!targetId) throw new Error("target=action/step では targetId が必須です");
  if (target === "action") {
    const act = ag.actions.find((a) => a.id === targetId);
    if (!act) throw new Error(`action ${targetId} が見つかりません`);
    (act as Record<string, unknown>).maturity = maturity;
    return;
  }
  // step
  const s = findStep(ag, targetId);
  if (!s) throw new Error(`step ${targetId} が見つかりません`);
  (s as Record<string, unknown>).maturity = maturity;
}

export function addStepNote(
  ag: ActionGroupDoc,
  stepId: string,
  type: string,
  body: string,
): { id: string } {
  const s = findStep(ag, stepId);
  if (!s) throw new Error(`step ${stepId} が見つかりません`);
  const note = {
    id: `note-${Date.now()}`,
    type,
    body,
    createdAt: new Date().toISOString(),
  };
  const notes = s.notes ?? [];
  notes.push(note);
  s.notes = notes;
  return { id: note.id };
}

export type CatalogName = "errorCatalog" | "secretsCatalog" | "typeCatalog" | "externalSystemCatalog";

export function addCatalogEntry(
  ag: ActionGroupDoc,
  catalog: CatalogName,
  key: string,
  value: Record<string, unknown>,
): void {
  const current = (ag[catalog] as Record<string, unknown> | undefined) ?? {};
  current[key] = value;
  ag[catalog] = current;
}

export function removeCatalogEntry(
  ag: ActionGroupDoc,
  catalog: CatalogName,
  key: string,
): void {
  const current = (ag[catalog] as Record<string, unknown> | undefined) ?? {};
  delete current[key];
  if (Object.keys(current).length === 0) {
    delete ag[catalog];
  } else {
    ag[catalog] = current;
  }
}

export function insertStepAt(
  ag: ActionGroupDoc,
  actionId: string,
  step: Step,
  position?: number,
): void {
  const act = ag.actions.find((a) => a.id === actionId);
  if (!act) throw new Error(`action ${actionId} が見つかりません`);
  const steps = act.steps ?? [];
  const idx = position === undefined || position < 0 || position > steps.length
    ? steps.length
    : position;
  steps.splice(idx, 0, step);
  act.steps = steps;
}
