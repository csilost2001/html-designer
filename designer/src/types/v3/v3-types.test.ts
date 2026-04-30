/**
 * v3 TS 型 smoke test (#541)
 *
 * 型レベルでの基本的な検証:
 * - Branded types が正しく解決される
 * - Step discriminated union が kind narrowing で機能する
 * - WorkflowApprover の order semantics が JSDoc で参照可能 (型は number)
 * - sample-project-v3 の実 JSON と TS 型の互換性 (parseable)
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";

import type {
  ProcessFlow,
  Step,
  WorkflowStep,
  DbAccessStep,
  ValidationStep,
  TransactionScopeStep,
} from "./process-flow";
import type { Project } from "./project";
import type { Table, Constraint, ForeignKeyConstraint } from "./table";
import type { Screen } from "./screen";
import type { ScreenItem, ValueSource } from "./screen-item";
import type {
  Uuid,
  TableId,
  ProcessFlowId,
  Identifier,
  IdentifierPath,
  FieldType,
  StructuredField,
} from "./common";

// ─── Branded types compile-time check ─────────────────────────────────────

describe("v3 branded types", () => {
  it("Uuid と TableId は別ブランド (代入互換性なし)", () => {
    // 型レベルテスト — 以下は compile error にならないか確認するためのコメント例:
    // const tableId: TableId = "..." as Uuid;  // ← Error: Uuid is not assignable to TableId
    // const uuid: Uuid = "..." as TableId;     // ← OK (TableId extends Uuid)
    // 実行時テストは代用として string 型互換性のみ確認
    const tableId = "11111111-1111-4111-8111-111111111111" as TableId;
    const asUuid: Uuid = tableId; // TableId is Uuid + brand → Uuid に代入可能
    expect(typeof asUuid).toBe("string");
  });

  it("Identifier と IdentifierPath は別ブランド", () => {
    const id = "userId" as Identifier;
    const path = "createdOrder.order_number" as IdentifierPath;
    expect(typeof id).toBe("string");
    expect(typeof path).toBe("string");
    // const wrongAssign: Identifier = path;  // ← compile error (different brands)
  });
});

// ─── Step discriminated union narrowing ─────────────────────────────────

describe("v3 Step discriminated union", () => {
  it("kind narrowing で variant が型推論される", () => {
    const step: Step = {
      id: "step-01" as Step["id"],
      kind: "validation",
      description: "test",
    };
    if (step.kind === "validation") {
      // Narrowed to ValidationStep
      const v: ValidationStep = step;
      expect(v.kind).toBe("validation");
      // v.tableId は存在しない (compile error)
    }
  });

  it("DbAccessStep は tableId 必須", () => {
    const dbStep: DbAccessStep = {
      id: "step-02" as DbAccessStep["id"],
      kind: "dbAccess",
      description: "select",
      tableId: "11111111-1111-4111-8111-111111111111" as TableId,
      operation: "SELECT",
    };
    expect(dbStep.tableId).toBeDefined();
  });

  it("WorkflowStep approval-quorum は quorum 必須 (型レベルでは optional だが TS 側で実装)", () => {
    const wf: WorkflowStep = {
      id: "step-wf" as WorkflowStep["id"],
      kind: "workflow",
      description: "test",
      pattern: "approval-quorum",
      approvers: [{ role: "@conv.role.x" }],
      quorum: { type: "nOfM", n: 2 },
    };
    expect(wf.quorum?.type).toBe("nOfM");
  });

  it("TransactionScopeStep の steps と onCommit/onRollback", () => {
    const tx: TransactionScopeStep = {
      id: "step-tx" as TransactionScopeStep["id"],
      kind: "transactionScope",
      description: "test",
      steps: [
        {
          id: "step-tx-1" as DbAccessStep["id"],
          kind: "dbAccess",
          description: "insert",
          tableId: "11111111-1111-4111-8111-111111111111" as TableId,
          operation: "INSERT",
        },
      ],
      isolationLevel: "SERIALIZABLE",
    };
    expect(tx.steps.length).toBe(1);
    expect(tx.isolationLevel).toBe("SERIALIZABLE");
  });
});

// ─── Constraint discriminated union ─────────────────────────────────────

describe("v3 Constraint discriminated union", () => {
  it("kind narrowing で variant が型推論", () => {
    const fk: ForeignKeyConstraint = {
      id: "fk-1" as ForeignKeyConstraint["id"],
      kind: "foreignKey",
      columnIds: ["col-1" as ForeignKeyConstraint["columnIds"][number]],
      referencedTableId: "22222222-2222-4222-8222-222222222222" as TableId,
      referencedColumnIds: ["col-2" as ForeignKeyConstraint["referencedColumnIds"][number]],
    };
    const c: Constraint = fk;
    if (c.kind === "foreignKey") {
      expect(c.referencedTableId).toBeDefined();
    }
  });
});

// ─── FieldType discriminated union ──────────────────────────────────────

describe("v3 FieldType", () => {
  it("プリミティブ型と object 型の使い分け", () => {
    const stringType: FieldType = "string";
    const objectType: FieldType = {
      kind: "object",
      fields: [
        {
          name: "id" as Identifier,
          type: "integer",
          required: true,
        },
      ],
    };
    expect(stringType).toBe("string");
    expect(typeof objectType).toBe("object");
  });

  it("StructuredField の name は Identifier", () => {
    const f: StructuredField = {
      name: "userId" as Identifier,
      type: "string",
      required: true,
    };
    expect(f.name).toBe("userId");
  });
});

// ─── ValueSource discriminated union ────────────────────────────────────

describe("v3 ScreenItem.valueFrom", () => {
  it("flowVariable は IdentifierPath で object field 参照可", () => {
    const item: ScreenItem = {
      id: "orderNumber" as Identifier,
      label: "指示番号",
      type: "string",
      direction: "output",
      valueFrom: {
        kind: "flowVariable",
        variableName: "createdOrder.order_number" as IdentifierPath,
      },
    };
    expect(item.valueFrom?.kind).toBe("flowVariable");
  });

  it("expression variant", () => {
    const v: ValueSource = { kind: "expression", expression: "@x + @y" };
    expect(v.kind).toBe("expression");
  });
});

// ─── 実 JSON との互換性 (sample-project-v3) ─────────────────────────────

const repoRoot = resolve(__dirname, "../../../../");
const samplesV3Dir = resolve(repoRoot, "docs/sample-project-v3");

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

describe("v3 TS 型 と sample-project-v3 JSON の compatibility (5 業界カバー)", () => {
  it("retail project.json を Project 型として parse できる", () => {
    const project = loadJson<Project>(join(samplesV3Dir, "retail/project.json"));
    expect(project.schemaVersion).toBe("v3");
    expect(project.meta.name).toBeDefined();
  });

  it("retail 在庫照会フローを ProcessFlow 型として parse できる + Step narrow", () => {
    const flow = loadJson<ProcessFlow>(
      join(samplesV3Dir, "retail/process-flows/506c266f-cc46-4d6f-86df-3c71f515bfcc.json"),
    );
    expect(flow.meta.kind).toBe("screen");
    const firstStep: Step = flow.actions[0].steps[0];
    expect(firstStep.kind).toBeDefined();
  });

  it("manufacturing items テーブルを Table 型として parse + Constraint narrow", () => {
    const table = loadJson<Table>(
      join(samplesV3Dir, "manufacturing/tables/38d3788e-092b-4fc4-8b97-ca359981d987.json"),
    );
    expect(table.physicalName).toBe("items");
    for (const c of table.constraints ?? []) {
      // discriminated union の narrowing
      switch (c.kind) {
        case "unique":
          expect(c.columnIds).toBeDefined();
          break;
        case "check":
          expect(c.expression).toBeDefined();
          break;
        case "foreignKey":
          expect(c.referencedTableId).toBeDefined();
          break;
      }
    }
  });

  it("retail 店舗在庫照会画面を Screen 型として parse できる", () => {
    const screen = loadJson<Screen>(
      join(samplesV3Dir, "retail/screens/3f378ca7-ad6f-44ad-8ebc-ab17fb806c2c.json"),
    );
    expect(screen.kind).toBe("search");
    expect(screen.path).toMatch(/\/inventory\//);
  });

  it("logistics 倉庫間転送 (approval-parallel + branch-merge) を ProcessFlow として parse + WorkflowStep narrow", () => {
    const flow = loadJson<ProcessFlow>(
      join(samplesV3Dir, "logistics/process-flows/0fe7af80-0f0c-4075-a46f-9c921866a52b.json"),
    );
    const workflowSteps = flow.actions[0].steps.filter(
      (s): s is WorkflowStep => s.kind === "workflow",
    );
    expect(workflowSteps.length).toBe(2); // approval-parallel + branch-merge
    expect(workflowSteps[0].pattern).toBe("approval-parallel");
    expect(workflowSteps[1].pattern).toBe("branch-merge");
  });

  it("finance 振込実行 (TX scope + Workflow approval-sequential) を ProcessFlow として parse", () => {
    const flow = loadJson<ProcessFlow>(
      join(samplesV3Dir, "finance/process-flows/a4d18f30-0524-4303-a656-1bf2390c386c.json"),
    );
    expect(flow.meta.kind).toBe("screen");
    const txSteps = flow.actions[0].steps.filter(
      (s): s is TransactionScopeStep => s.kind === "transactionScope",
    );
    expect(txSteps.length).toBeGreaterThanOrEqual(1);
    expect(txSteps[0].isolationLevel).toBe("SERIALIZABLE");
  });

  it("public-service 建築確認申請 (5 段 workflow) を ProcessFlow として parse", () => {
    const flow = loadJson<ProcessFlow>(
      join(samplesV3Dir, "public-service/process-flows/1cd900ee-0d69-4e0a-a32b-bb329f9bc983.json"),
    );
    const workflowSteps = flow.actions[0].steps.filter(
      (s): s is WorkflowStep => s.kind === "workflow",
    );
    expect(workflowSteps.length).toBe(5);
    const patterns = workflowSteps.map((w) => w.pattern);
    expect(patterns).toContain("acknowledge");
    expect(patterns).toContain("review");
    expect(patterns).toContain("sign-off");
    expect(patterns).toContain("approval-veto");
    expect(patterns).toContain("approval-sequential");
  });
});
