import { describe, it, expect } from "vitest";
import type { ProcessFlow, BranchStep, OtherStep, JumpStep, LoopStep } from "../types/action";
import { migrateProcessFlow, migrateStep } from "./actionMigration";

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

  it("非 branch ステップは構造を保持しつつ maturity 既定値を追加する (#154)", () => {
    const other = {
      id: "x",
      type: "dbAccess",
      description: "",
      tableName: "users",
      operation: "SELECT",
    };
    const migrated = migrateStep(other);
    expect(migrated).toEqual({ ...other, maturity: "draft" });
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

describe("migrateProcessFlow — ProcessFlow 全体", () => {
  it("既存サンプルの認証チェック ProcessFlow を正しく変換する", () => {
    // docs/sample-project/process-flows/cccccccc-0003 相当のデータ
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

    const migrated = migrateProcessFlow(sample) as ProcessFlow;

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
    const once = migrateProcessFlow(sample);
    const twice = migrateProcessFlow(once);
    // IDs in once/twice should match (twice doesn't regenerate since already new)
    const onceJson = JSON.stringify(once);
    const twiceJson = JSON.stringify(twice);
    expect(twiceJson).toBe(onceJson);
  });
});

describe("migrateStep — 旧 note → notes[] / maturity 既定付与 (#154)", () => {
  it("旧 note: string を notes[] ({type: 'assumption'}) に変換する", () => {
    const legacy = {
      id: "s1",
      type: "other",
      description: "",
      note: "想定: 共通処理は後ほど設計予定",
    };
    const migrated = migrateStep(legacy);
    const s = migrated as unknown as { note?: string; notes?: Array<{ id: string; type: string; body: string; createdAt: string }> };
    expect(s.notes).toHaveLength(1);
    expect(s.notes![0].type).toBe("assumption");
    expect(s.notes![0].body).toBe("想定: 共通処理は後ほど設計予定");
    expect(s.notes![0].id).toMatch(/[0-9a-f-]{36}/);
    expect(s.notes![0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // 旧 note フィールドは削除される
    expect(s.note).toBeUndefined();
  });

  it("note が空文字・空白のみ・未設定の場合は notes[] を作らず、note フィールドを消す", () => {
    const empty1 = migrateStep({ id: "a", type: "other", description: "", note: "" });
    expect((empty1 as unknown as { notes?: unknown[] }).notes).toBeUndefined();
    expect((empty1 as unknown as { note?: string }).note).toBeUndefined();

    const empty2 = migrateStep({ id: "b", type: "other", description: "", note: "   " });
    expect((empty2 as unknown as { notes?: unknown[] }).notes).toBeUndefined();
    expect((empty2 as unknown as { note?: string }).note).toBeUndefined();

    const empty3 = migrateStep({ id: "c", type: "other", description: "" });
    expect((empty3 as unknown as { notes?: unknown[] }).notes).toBeUndefined();
  });

  it("notes[] が既にあれば note を破棄し、notes[] をそのまま維持する", () => {
    const existing = {
      id: "s",
      type: "other",
      description: "",
      note: "これは無視される",
      notes: [{ id: "n-1", type: "todo", body: "既存", createdAt: "2026-01-01T00:00:00.000Z" }],
    };
    const migrated = migrateStep(existing);
    const s = migrated as unknown as { note?: string; notes?: Array<{ id: string; type: string; body: string }> };
    expect(s.notes).toHaveLength(1);
    expect(s.notes![0].id).toBe("n-1");
    expect(s.notes![0].body).toBe("既存");
    expect(s.note).toBeUndefined();
  });

  it("maturity が未設定なら 'draft' を付与する", () => {
    const legacy = { id: "s", type: "other", description: "" };
    const migrated = migrateStep(legacy) as unknown as { maturity?: string };
    expect(migrated.maturity).toBe("draft");
  });

  it("maturity が有効値 ('provisional' / 'committed') なら保持する", () => {
    const provisional = migrateStep({ id: "s", type: "other", description: "", maturity: "provisional" }) as unknown as { maturity?: string };
    expect(provisional.maturity).toBe("provisional");
    const committed = migrateStep({ id: "s", type: "other", description: "", maturity: "committed" }) as unknown as { maturity?: string };
    expect(committed.maturity).toBe("committed");
  });

  it("maturity が不正値 (未知文字列 / 数値 / null) なら 'draft' に矯正する", () => {
    const invalid1 = migrateStep({ id: "s", type: "other", description: "", maturity: "unknown" }) as unknown as { maturity?: string };
    expect(invalid1.maturity).toBe("draft");
    const invalid2 = migrateStep({ id: "s", type: "other", description: "", maturity: 42 }) as unknown as { maturity?: string };
    expect(invalid2.maturity).toBe("draft");
    const invalid3 = migrateStep({ id: "s", type: "other", description: "", maturity: null }) as unknown as { maturity?: string };
    expect(invalid3.maturity).toBe("draft");
  });

  it("ネスト (branch.branches[].steps / loop.steps / subSteps) の note / maturity も再帰的に正規化", () => {
    const legacy = {
      id: "parent-loop",
      type: "loop",
      description: "",
      loopKind: "collection",
      note: "親の想定",
      steps: [
        {
          id: "inner-branch",
          type: "branch",
          description: "",
          branches: [
            {
              id: "b1",
              code: "A",
              condition: "",
              steps: [
                {
                  id: "leaf",
                  type: "dbAccess",
                  description: "",
                  tableName: "x",
                  operation: "SELECT",
                  note: "葉の想定",
                },
              ],
            },
          ],
        },
      ],
    };
    const migrated = migrateStep(legacy) as unknown as {
      maturity?: string;
      notes?: Array<{ body: string }>;
      steps: Array<{
        branches: Array<{
          steps: Array<{ notes?: Array<{ body: string }>; maturity?: string }>;
        }>;
      }>;
    };
    expect(migrated.maturity).toBe("draft");
    expect(migrated.notes?.[0].body).toBe("親の想定");
    const innerBranch = migrated.steps[0];
    const leaf = innerBranch.branches[0].steps[0];
    expect(leaf.maturity).toBe("draft");
    expect(leaf.notes?.[0].body).toBe("葉の想定");
  });
});

describe("migrateProcessFlow — action/group レベルの maturity / mode 既定付与 (#154)", () => {
  it("group.maturity 未設定なら 'draft'、group.mode 未設定なら 'upstream' を付与する", () => {
    const raw = {
      id: "g1",
      name: "x",
      type: "screen",
      description: "",
      actions: [],
      createdAt: "",
      updatedAt: "",
    };
    const migrated = migrateProcessFlow(raw);
    expect(migrated.maturity).toBe("draft");
    expect(migrated.mode).toBe("upstream");
  });

  it("group.maturity / mode の有効値は保持する", () => {
    const raw = {
      id: "g1",
      name: "x",
      type: "screen",
      description: "",
      actions: [],
      createdAt: "",
      updatedAt: "",
      maturity: "committed",
      mode: "downstream",
    };
    const migrated = migrateProcessFlow(raw);
    expect(migrated.maturity).toBe("committed");
    expect(migrated.mode).toBe("downstream");
  });

  it("action.maturity 未設定なら 'draft' を付与する", () => {
    const raw = {
      id: "g1",
      name: "x",
      type: "screen",
      description: "",
      actions: [
        {
          id: "a1",
          name: "a",
          trigger: "click",
          steps: [],
        },
      ],
      createdAt: "",
      updatedAt: "",
    };
    const migrated = migrateProcessFlow(raw);
    expect(migrated.actions[0].maturity).toBe("draft");
  });

  it("冪等性: note → notes[] 変換 + maturity/mode 付与後、再度マイグレーションしても同じ JSON になる", () => {
    const raw = {
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
              id: "s1",
              type: "other",
              description: "",
              note: "想定: X",
            },
          ],
        },
      ],
      createdAt: "",
      updatedAt: "",
    };
    const once = migrateProcessFlow(raw);
    const twice = migrateProcessFlow(once);
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
    // 1 回目で note は消えて notes[] になっている
    const step = once.actions[0].steps[0] as unknown as { note?: string; notes?: Array<{ body: string }> };
    expect(step.note).toBeUndefined();
    expect(step.notes?.[0].body).toBe("想定: X");
  });
});
