import { describe, it, expect } from "vitest";
import type { ActionGroup, BranchStep, OtherStep, JumpStep, LoopStep } from "../types/action";
import { migrateActionGroup, migrateStep } from "./actionMigration";

describe("migrateStep — BranchStep legacy → new", () => {
  it("旧 branchA/branchB/condition を branches[] に変換する", () => {
    const legacy = {
      id: "step-001",
      type: "branch",
      description: "認証結果判定",
      condition: "トークンが有効か",
      branchA: { label: "有効", description: "処理を続行" },
      branchB: { label: "無効", description: "ログイン画面へリダイレクト" },
    };
    const migrated = migrateStep(legacy) as BranchStep;

    expect(migrated.type).toBe("branch");
    expect(migrated.description).toBe("認証結果判定");
    expect(migrated.branches).toHaveLength(2);

    const a = migrated.branches[0];
    expect(a.code).toBe("A");
    expect(a.label).toBe("有効");
    expect(a.condition).toBe("トークンが有効か");
    expect(a.steps).toHaveLength(1);
    expect((a.steps[0] as OtherStep).type).toBe("other");
    expect((a.steps[0] as OtherStep).description).toBe("処理を続行");
    expect(a.id).toMatch(/[0-9a-f-]{36}/);

    const b = migrated.branches[1];
    expect(b.code).toBe("B");
    expect(b.label).toBe("無効");
    expect(b.condition).toBe("");
    expect((b.steps[0] as OtherStep).description).toBe("ログイン画面へリダイレクト");

    // 旧フィールドが除去されている
    expect((migrated as unknown as { condition?: string }).condition).toBeUndefined();
    expect((migrated as unknown as { branchA?: unknown }).branchA).toBeUndefined();
    expect((migrated as unknown as { branchB?: unknown }).branchB).toBeUndefined();
  });

  it("branchA/B の jumpTo は jump ステップに変換される", () => {
    const legacy = {
      id: "step-jump-001",
      type: "branch",
      description: "",
      condition: "",
      branchA: { label: "", description: "", jumpTo: "target-a" },
      branchB: { label: "", description: "処理", jumpTo: "target-b" },
    };
    const migrated = migrateStep(legacy) as BranchStep;

    expect(migrated.branches[0].steps).toHaveLength(1);
    const jumpA = migrated.branches[0].steps[0] as JumpStep;
    expect(jumpA.type).toBe("jump");
    expect(jumpA.jumpTo).toBe("target-a");

    // B は description と jumpTo 両方あり → other + jump の 2 ステップ
    expect(migrated.branches[1].steps).toHaveLength(2);
    expect((migrated.branches[1].steps[0] as OtherStep).description).toBe("処理");
    expect((migrated.branches[1].steps[1] as JumpStep).jumpTo).toBe("target-b");
  });

  it("description も jumpTo も空なら空の steps を持つ Branch を生成", () => {
    const legacy = {
      id: "step-empty",
      type: "branch",
      description: "",
      condition: "",
      branchA: { label: "", description: "" },
      branchB: { label: "", description: "" },
    };
    const migrated = migrateStep(legacy) as BranchStep;
    expect(migrated.branches[0].steps).toEqual([]);
    expect(migrated.branches[1].steps).toEqual([]);
    expect(migrated.branches[0].label).toBeUndefined();
  });

  it("subSteps 内の旧 BranchStep も再帰的に変換される", () => {
    const legacy = {
      id: "parent",
      type: "other",
      description: "parent",
      subSteps: [
        {
          id: "child-branch",
          type: "branch",
          description: "",
          condition: "cond",
          branchA: { label: "Y", description: "ok" },
          branchB: { label: "N", description: "ng" },
        },
      ],
    };
    const migrated = migrateStep(legacy) as OtherStep;
    const child = migrated.subSteps![0] as BranchStep;
    expect(child.branches[0].condition).toBe("cond");
    expect((child.branches[0].steps[0] as OtherStep).description).toBe("ok");
  });

  it("既に新形式の BranchStep は branches をそのまま保持する（冪等）", () => {
    const newShape = {
      id: "branch-new",
      type: "branch",
      description: "",
      branches: [
        { id: "br1", code: "A", label: "A", condition: "c1", steps: [] },
        { id: "br2", code: "B", condition: "", steps: [] },
      ],
    };
    const migrated = migrateStep(newShape) as BranchStep;
    expect(migrated.branches).toHaveLength(2);
    expect(migrated.branches[0].id).toBe("br1");
    expect(migrated.branches[0].condition).toBe("c1");
    expect(migrated.branches[1].code).toBe("B");
  });

  it("新形式の Branch.steps 内のネストした旧 branch も変換される", () => {
    const newShape = {
      id: "outer",
      type: "branch",
      description: "",
      branches: [
        {
          id: "br1",
          code: "A",
          condition: "",
          steps: [
            {
              id: "inner",
              type: "branch",
              description: "",
              condition: "inner-cond",
              branchA: { label: "", description: "x" },
              branchB: { label: "", description: "y" },
            },
          ],
        },
      ],
    };
    const migrated = migrateStep(newShape) as BranchStep;
    const inner = migrated.branches[0].steps[0] as BranchStep;
    expect(inner.branches).toHaveLength(2);
    expect(inner.branches[0].condition).toBe("inner-cond");
  });

  it("loop ステップの steps 内の旧 branch も再帰変換される", () => {
    const loopLegacy = {
      id: "loop-1",
      type: "loop",
      description: "",
      loopKind: "count",
      steps: [
        {
          id: "branch-inside-loop",
          type: "branch",
          description: "",
          condition: "cc",
          branchA: { label: "a", description: "" },
          branchB: { label: "b", description: "" },
        },
      ],
    };
    const migrated = migrateStep(loopLegacy) as LoopStep;
    const br = migrated.steps[0] as BranchStep;
    expect(br.branches[0].condition).toBe("cc");
    expect(br.branches[0].label).toBe("a");
  });

  it("非 branch ステップはそのまま保持される", () => {
    const other = {
      id: "x",
      type: "dbAccess",
      description: "",
      tableName: "users",
      operation: "SELECT",
    };
    const migrated = migrateStep(other);
    expect(migrated).toEqual(other);
    expect(migrated).not.toBe(other); // cloneされている
  });

  it("元データを破壊しない", () => {
    const legacy = {
      id: "s",
      type: "branch",
      description: "",
      condition: "orig-condition",
      branchA: { label: "A", description: "A-desc" },
      branchB: { label: "B", description: "B-desc" },
    };
    const before = JSON.stringify(legacy);
    migrateStep(legacy);
    expect(JSON.stringify(legacy)).toBe(before);
  });
});

describe("migrateActionGroup — ActionGroup 全体", () => {
  it("既存サンプルの認証チェック ActionGroup を正しく変換する", () => {
    // docs/sample-project/actions/cccccccc-0003 相当のデータ
    const sample = {
      id: "cccccccc-0003-4000-8000-cccccccccccc",
      name: "認証チェック",
      type: "common",
      description: "セッション・トークン検証を行う共通処理",
      actions: [
        {
          id: "act-auth-001",
          name: "認証処理",
          trigger: "other",
          steps: [
            {
              id: "step-auth-001",
              type: "validation",
              description: "セッション有効性チェック",
              conditions: "セッションIDの存在確認・有効期限チェック",
              inlineBranch: { ok: "トークン検証へ", ng: "ログイン画面へリダイレクト" },
            },
            {
              id: "step-auth-003",
              type: "branch",
              description: "認証結果判定",
              condition: "トークンが有効か",
              branchA: { label: "有効", description: "処理を続行" },
              branchB: { label: "無効", description: "ログイン画面へリダイレクト", jumpTo: "" },
            },
          ],
        },
      ],
      createdAt: "2026-04-14T00:00:00.000Z",
      updatedAt: "2026-04-14T00:00:00.000Z",
    };

    const migrated = migrateActionGroup(sample) as ActionGroup;

    expect(migrated.id).toBe(sample.id);
    expect(migrated.actions).toHaveLength(1);
    const steps = migrated.actions[0].steps;
    expect(steps).toHaveLength(2);

    // validation はそのまま
    expect(steps[0].type).toBe("validation");

    // branch は新形式に
    const branch = steps[1] as BranchStep;
    expect(branch.type).toBe("branch");
    expect(branch.branches).toHaveLength(2);
    expect(branch.branches[0].label).toBe("有効");
    expect(branch.branches[0].condition).toBe("トークンが有効か");
    expect(branch.branches[1].label).toBe("無効");
    // 空文字 jumpTo は jump ステップを作らない
    expect(branch.branches[1].steps).toHaveLength(1);
    expect((branch.branches[1].steps[0] as OtherStep).type).toBe("other");
  });

  it("冪等性: 2 回マイグレーションしても結果が同じ", () => {
    const sample = {
      id: "g",
      name: "x",
      type: "common",
      description: "",
      actions: [
        {
          id: "a",
          name: "a",
          trigger: "other",
          steps: [
            {
              id: "s",
              type: "branch",
              description: "",
              condition: "c",
              branchA: { label: "A", description: "ad" },
              branchB: { label: "B", description: "bd" },
            },
          ],
        },
      ],
      createdAt: "",
      updatedAt: "",
    };
    const once = migrateActionGroup(sample);
    const twice = migrateActionGroup(once);
    // IDs in once/twice should match (twice doesn't regenerate since already new)
    const onceJson = JSON.stringify(once);
    const twiceJson = JSON.stringify(twice);
    expect(twiceJson).toBe(onceJson);
  });
});
