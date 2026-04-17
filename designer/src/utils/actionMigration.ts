/**
 * actionMigration.ts
 * 処理フロー定義の旧データ → 新データ構造への変換
 *
 * 変換対象（Issue #68 Phase 1）:
 *  - 旧 BranchStep { condition, branchA, branchB } → 新 { branches: Branch[], elseBranch? }
 *
 * 旧データとの互換性維持のため、JSON ロード時に必ず通す。
 * 変換は冪等で、既に新形式の場合はそのまま返す。
 */
import type { ActionDefinition, ActionGroup, Branch, Step } from "../types/action";
import { generateUUID } from "./uuid";

interface LegacyBranchFields {
  label?: string;
  description?: string;
  jumpTo?: string;
}

function isLegacyBranchStep(step: Record<string, unknown>): boolean {
  if (step.type !== "branch") return false;
  if (Array.isArray(step.branches)) return false;
  return "branchA" in step || "branchB" in step || "condition" in step;
}

/** 旧 branchA/B フィールドを新 Branch に変換（description/jumpTo はサブ step に展開） */
function legacyToBranch(
  code: string,
  condition: string,
  raw: LegacyBranchFields | undefined,
): Branch {
  const steps: Step[] = [];
  const description = raw?.description?.trim();
  const jumpTo = raw?.jumpTo?.trim();

  if (description) {
    steps.push({
      id: generateUUID(),
      type: "other",
      description,
    });
  }
  if (jumpTo) {
    steps.push({
      id: generateUUID(),
      type: "jump",
      description: "",
      jumpTo,
    });
  }

  const label = raw?.label?.trim();
  return {
    id: generateUUID(),
    code,
    label: label || undefined,
    condition,
    steps,
  };
}

/** ステップを再帰的にマイグレーション。引数は破壊的に書き換える想定（呼び出し側で cloneDeep する） */
function migrateStepInPlace(raw: unknown): Step {
  if (!raw || typeof raw !== "object") return raw as Step;
  const step = raw as Record<string, unknown>;

  if (Array.isArray(step.subSteps)) {
    step.subSteps = (step.subSteps as unknown[]).map(migrateStepInPlace);
  }

  if (isLegacyBranchStep(step)) {
    const condition = typeof step.condition === "string" ? step.condition : "";
    const branchA = (step.branchA as LegacyBranchFields | undefined) ?? undefined;
    const branchB = (step.branchB as LegacyBranchFields | undefined) ?? undefined;

    const branches: Branch[] = [
      legacyToBranch("A", condition, branchA),
      legacyToBranch("B", "", branchB),
    ];

    delete step.condition;
    delete step.branchA;
    delete step.branchB;
    step.branches = branches;
  } else if (step.type === "branch" && Array.isArray(step.branches)) {
    step.branches = (step.branches as unknown[]).map(migrateBranchInPlace);
    if (step.elseBranch && typeof step.elseBranch === "object") {
      step.elseBranch = migrateBranchInPlace(step.elseBranch);
    }
  } else if (step.type === "loop" && Array.isArray(step.steps)) {
    step.steps = (step.steps as unknown[]).map(migrateStepInPlace);
  }

  return step as unknown as Step;
}

function migrateBranchInPlace(raw: unknown): Branch {
  if (!raw || typeof raw !== "object") return raw as Branch;
  const branch = raw as Record<string, unknown>;
  if (Array.isArray(branch.steps)) {
    branch.steps = (branch.steps as unknown[]).map(migrateStepInPlace);
  } else {
    branch.steps = [];
  }
  return branch as unknown as Branch;
}

/** アクション内の全ステップをマイグレーション */
function migrateActionInPlace(raw: unknown): ActionDefinition {
  if (!raw || typeof raw !== "object") return raw as ActionDefinition;
  const action = raw as Record<string, unknown>;
  if (Array.isArray(action.steps)) {
    action.steps = (action.steps as unknown[]).map(migrateStepInPlace);
  }
  return action as unknown as ActionDefinition;
}

/**
 * ActionGroup を旧形式から新形式に変換。
 * 元データは変更せず、deep clone した結果を返す。
 * 既に新形式の場合は実質コピーのみ。
 */
export function migrateActionGroup(raw: unknown): ActionGroup {
  if (!raw || typeof raw !== "object") {
    throw new Error("migrateActionGroup: input is not an object");
  }
  const cloned = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
  if (Array.isArray(cloned.actions)) {
    cloned.actions = (cloned.actions as unknown[]).map(migrateActionInPlace);
  }
  return cloned as unknown as ActionGroup;
}

/** 単一 Step のマイグレーション（テスト・特定用途向け） */
export function migrateStep(raw: unknown): Step {
  const cloned = raw && typeof raw === "object" ? JSON.parse(JSON.stringify(raw)) : raw;
  return migrateStepInPlace(cloned);
}
