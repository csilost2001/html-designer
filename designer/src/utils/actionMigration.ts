/**
 * actionMigration.ts
 * 処理フロー定義の旧データ → 新データ構造への変換
 *
 * 変換対象:
 *  - 旧 BranchStep { condition, branchA, branchB } → 新 { branches: Branch[], elseBranch? } (Issue #68 Phase 1)
 *  - 旧 step.note: string → 新 step.notes: StepNote[] ({type: "assumption"} で包む)
 *    (docs/spec/process-flow-maturity.md Phase 1, Issue #154)
 *  - step/action/group に maturity 既定値 ("draft") を付与
 *  - group に mode 既定値 ("upstream") を付与
 *
 * 旧データとの互換性維持のため、JSON ロード時に必ず通す。
 * 変換は冪等で、既に新形式の場合はそのまま返す。
 */
import type {
  ActionDefinition,
  ProcessFlow,
  ProcessFlowMode,
  Branch,
  Maturity,
  Step,
  StepNote,
} from "../types/action";
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
      maturity: "draft",
    });
  }
  if (jumpTo) {
    steps.push({
      id: generateUUID(),
      type: "jump",
      description: "",
      jumpTo,
      maturity: "draft",
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

function isValidMaturity(v: unknown): v is Maturity {
  return v === "draft" || v === "provisional" || v === "committed";
}

function isValidMode(v: unknown): v is ProcessFlowMode {
  return v === "upstream" || v === "downstream";
}

/**
 * step の note/notes/maturity を正規化する (#154)。
 *  - 旧 note: string (非空) + notes 未設定 → notes[] 新規作成 (type="assumption")
 *  - notes[] が既にあるか、変換を終えた時点で note フィールドは削除
 *  - maturity 無効値/未設定 → "draft"
 * 破壊的、冪等。
 */
function normalizeNotesAndMaturityOnStep(step: Record<string, unknown>): void {
  const hasNotes = Array.isArray(step.notes) && (step.notes as unknown[]).length > 0;
  const oldNote = typeof step.note === "string" ? step.note.trim() : "";
  if (!hasNotes && oldNote) {
    const converted: StepNote = {
      id: generateUUID(),
      type: "assumption",
      body: typeof step.note === "string" ? step.note : oldNote,
      createdAt: new Date().toISOString(),
    };
    step.notes = [converted];
  }
  // notes[] を正とする: note フィールドは削除 (空文字・未設定・変換済みいずれも)
  if ("note" in step) {
    delete step.note;
  }
  if (!isValidMaturity(step.maturity)) {
    step.maturity = "draft";
  }
}

/** ステップを再帰的にマイグレーション。引数は破壊的に書き換える想定（呼び出し側で cloneDeep する） */
function migrateStepInPlace(raw: unknown): Step {
  if (!raw || typeof raw !== "object") return raw as Step;
  const step = raw as Record<string, unknown>;

  normalizeNotesAndMaturityOnStep(step);

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
  } else if (step.type === "transactionScope") {
    if (Array.isArray(step.steps)) {
      step.steps = (step.steps as unknown[]).map(migrateStepInPlace);
    }
    if (Array.isArray(step.onCommit)) {
      step.onCommit = (step.onCommit as unknown[]).map(migrateStepInPlace);
    }
    if (Array.isArray(step.onRollback)) {
      step.onRollback = (step.onRollback as unknown[]).map(migrateStepInPlace);
    }
  }

  // #172: outcome.sideEffects 内のステップも再帰的にマイグレーション
  if (step.type === "externalSystem" && step.outcomes && typeof step.outcomes === "object") {
    const outcomes = step.outcomes as Record<string, Record<string, unknown>>;
    for (const key of Object.keys(outcomes)) {
      const spec = outcomes[key];
      if (spec && Array.isArray(spec.sideEffects)) {
        spec.sideEffects = (spec.sideEffects as unknown[]).map(migrateStepInPlace);
      }
    }
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

/** アクション内の全ステップをマイグレーション + maturity 既定付与 */
function migrateActionInPlace(raw: unknown): ActionDefinition {
  if (!raw || typeof raw !== "object") return raw as ActionDefinition;
  const action = raw as Record<string, unknown>;
  if (Array.isArray(action.steps)) {
    action.steps = (action.steps as unknown[]).map(migrateStepInPlace);
  }
  if (!isValidMaturity(action.maturity)) {
    action.maturity = "draft";
  }
  return action as unknown as ActionDefinition;
}

/**
 * ProcessFlow を旧形式から新形式に変換。
 * 元データは変更せず、deep clone した結果を返す。
 * 既に新形式の場合は実質コピーのみ (冪等)。
 * docs/spec/process-flow-maturity.md Phase 1 に基づき、maturity ("draft") / mode ("upstream")
 * の既定値も付与する。
 */
export function migrateProcessFlow(raw: unknown): ProcessFlow {
  if (!raw || typeof raw !== "object") {
    throw new Error("migrateProcessFlow: input is not an object");
  }
  const cloned = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
  if (Array.isArray(cloned.actions)) {
    cloned.actions = (cloned.actions as unknown[]).map(migrateActionInPlace);
  }
  if (!isValidMaturity(cloned.maturity)) {
    cloned.maturity = "draft";
  }
  if (!isValidMode(cloned.mode)) {
    cloned.mode = "upstream";
  }
  return cloned as unknown as ProcessFlow;
}

/** 単一 Step のマイグレーション（テスト・特定用途向け） */
export function migrateStep(raw: unknown): Step {
  const cloned = raw && typeof raw === "object" ? JSON.parse(JSON.stringify(raw)) : raw;
  return migrateStepInPlace(cloned);
}
