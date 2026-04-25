import { describe, it, expect } from "vitest";
import { generateSpecJson, type SpecStep } from "./specExporter";
import type { TableDefinition } from "../types/table";
import type { FlowProject } from "../types/flow";
import type { ErLayout } from "../types/table";
import type {
  AuditStep,
  CdcStep,
  ClosingStep,
  ComputeStep,
  DbAccessStep,
  EventPublishStep,
  EventSubscribeStep,
  LogStep,
  LoopBreakStep,
  LoopContinueStep,
  OtherStep,
  ProcessFlow,
  ReturnStep,
  Step,
  ValidationStep,
  WorkflowStep,
} from "../types/action";

function makeFlow(steps: Step[]): ProcessFlow {
  return {
    id: "pf1",
    name: "テストフロー",
    type: "screen",
    description: "テスト用",
    maturity: "draft",
    actions: [{ id: "a1", name: "アクション", trigger: "click", steps }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function getStep(stepDef: Step): SpecStep {
  const spec = generateSpecJson(emptyProject, [], emptyErLayout, [makeFlow([stepDef])]);
  return spec.processFlows![0].actions[0].steps[0];
}

const emptyProject: FlowProject = {
  name: "テストプロジェクト",
  screens: [],
  edges: [],
};

const emptyErLayout: ErLayout = {
  positions: {},
  updatedAt: new Date().toISOString(),
};

function makeTable(overrides: Partial<TableDefinition> = {}): TableDefinition {
  return {
    id: "t1",
    name: "orders",
    logicalName: "注文",
    description: "注文テーブル",
    columns: [
      {
        id: "c1", no: 1, name: "id", logicalName: "ID",
        dataType: "INTEGER", notNull: true, primaryKey: true, unique: false, autoIncrement: true,
      },
      {
        id: "c2", no: 2, name: "customer_id", logicalName: "顧客ID",
        dataType: "INTEGER", notNull: true, primaryKey: false, unique: false,
      },
    ],
    indexes: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("generateSpecJson — SpecTable", () => {
  it("constraints/defaults/triggers が空のとき出力に含まれない", () => {
    const spec = generateSpecJson(emptyProject, [makeTable()], emptyErLayout);
    const t = spec.tables[0];
    expect(t.constraints).toBeUndefined();
    expect(t.defaults).toBeUndefined();
    expect(t.triggers).toBeUndefined();
  });

  it("UNIQUE 制約が出力に含まれる", () => {
    const table = makeTable({
      constraints: [
        { id: "uq1", kind: "unique", columns: ["customer_id"], description: "顧客IDは一意" },
      ],
    });
    const spec = generateSpecJson(emptyProject, [table], emptyErLayout);
    const t = spec.tables[0];
    expect(t.constraints).toHaveLength(1);
    expect(t.constraints![0]).toMatchObject({ kind: "unique", columns: ["customer_id"] });
  });

  it("CHECK 制約が出力に含まれる", () => {
    const table = makeTable({
      constraints: [
        { id: "ck1", kind: "check", expression: "amount > 0", description: "金額は正の値" },
      ],
    });
    const spec = generateSpecJson(emptyProject, [table], emptyErLayout);
    expect(spec.tables[0].constraints![0]).toMatchObject({ kind: "check", expression: "amount > 0" });
  });

  it("FOREIGN KEY 制約が出力に含まれる", () => {
    const table = makeTable({
      constraints: [
        {
          id: "fk1", kind: "foreignKey",
          columns: ["customer_id"], referencedTable: "customers", referencedColumns: ["id"],
          onDelete: "CASCADE",
        },
      ],
    });
    const spec = generateSpecJson(emptyProject, [table], emptyErLayout);
    expect(spec.tables[0].constraints![0]).toMatchObject({
      kind: "foreignKey", referencedTable: "customers", onDelete: "CASCADE",
    });
  });

  it("DEFAULT 定義が出力に含まれる", () => {
    const table = makeTable({
      defaults: [
        { column: "created_at", kind: "function", value: "NOW()", description: "作成日時自動設定" },
        { column: "status", kind: "literal", value: "'active'" },
      ],
    });
    const spec = generateSpecJson(emptyProject, [table], emptyErLayout);
    const t = spec.tables[0];
    expect(t.defaults).toHaveLength(2);
    expect(t.defaults![0]).toMatchObject({ column: "created_at", kind: "function", value: "NOW()" });
    expect(t.defaults![1]).toMatchObject({ column: "status", kind: "literal" });
  });

  it("トリガー定義が出力に含まれる", () => {
    const table = makeTable({
      triggers: [
        {
          id: "tr1", timing: "BEFORE", events: ["INSERT", "UPDATE"],
          body: "SET NEW.updated_at = NOW();", description: "更新日時自動セット",
        },
      ],
    });
    const spec = generateSpecJson(emptyProject, [table], emptyErLayout);
    const t = spec.tables[0];
    expect(t.triggers).toHaveLength(1);
    expect(t.triggers![0]).toMatchObject({ timing: "BEFORE", events: ["INSERT", "UPDATE"] });
  });

  it("constraints / defaults / triggers が混在しても全て出力される", () => {
    const table = makeTable({
      constraints: [{ id: "uq1", kind: "unique", columns: ["customer_id"] }],
      defaults: [{ column: "status", kind: "literal", value: "'active'" }],
      triggers: [{ id: "tr1", timing: "AFTER", events: ["INSERT"], body: "..." }],
    });
    const spec = generateSpecJson(emptyProject, [table], emptyErLayout);
    const t = spec.tables[0];
    expect(t.constraints).toHaveLength(1);
    expect(t.defaults).toHaveLength(1);
    expect(t.triggers).toHaveLength(1);
  });
});

describe("toSpecStep — step detail", () => {
  it("validation: conditions and optional inlineBranch", () => {
    const withInlineBranch = getStep({
      id: "v1",
      type: "validation",
      description: "入力検証",
      conditions: "@amount > 0",
      inlineBranch: { ok: "ok", ng: "ng", ngJumpTo: "input-error" },
    } as ValidationStep);

    expect(withInlineBranch.detail.conditions).toBe("@amount > 0");
    expect(withInlineBranch.detail.inlineBranch).toEqual({
      ok: "ok",
      ng: "ng",
      ngJumpTo: "input-error",
    });

    const withoutInlineBranch = getStep({
      id: "v2",
      type: "validation",
      description: "入力検証",
      conditions: "@name != ''",
    } as ValidationStep);

    expect(withoutInlineBranch.detail.conditions).toBe("@name != ''");
    expect(withoutInlineBranch.detail).not.toHaveProperty("inlineBranch");
  });

  it("dbAccess: tableName and operation", () => {
    const step = getStep({
      id: "db1",
      type: "dbAccess",
      description: "注文登録",
      tableName: "orders",
      operation: "INSERT",
    } as DbAccessStep);

    expect(step.detail).toMatchObject({
      tableName: "orders",
      operation: "INSERT",
    });
  });

  it("externalSystem: systemName", () => {
    const step = getStep({
      id: "ex1",
      type: "externalSystem",
      description: "外部決済",
      systemName: "Stripe",
    } as Step);

    expect(step.detail.systemName).toBe("Stripe");
  });

  it("commonProcess: refName", () => {
    const step = getStep({
      id: "cp1",
      type: "commonProcess",
      description: "共通処理",
      refId: "common-1",
      refName: "在庫引当",
    } as Step);

    expect(step.detail.refName).toBe("在庫引当");
    expect(step.detail.refId).toBe("common-1");
  });

  it("screenTransition: targetScreenName", () => {
    const step = getStep({
      id: "st1",
      type: "screenTransition",
      description: "完了画面へ遷移",
      targetScreenName: "注文完了",
    } as Step);

    expect(step.detail.targetScreenName).toBe("注文完了");
  });

  it("displayUpdate: target", () => {
    const step = getStep({
      id: "du1",
      type: "displayUpdate",
      description: "表示更新",
      target: "明細一覧",
    } as Step);

    expect(step.detail.target).toBe("明細一覧");
  });

  it("branch: conditions in branches", () => {
    const step = getStep({
      id: "br1",
      type: "branch",
      description: "条件分岐",
      branches: [
        {
          id: "b1",
          code: "A",
          label: "承認済み",
          condition: "@status == 'approved'",
          steps: [],
        },
      ],
    } as Step);

    expect(step.detail.branches).toEqual([
      expect.objectContaining({ condition: "@status == 'approved'" }),
    ]);
  });

  it("loop: count expression and nested steps", () => {
    const step = getStep({
      id: "lp1",
      type: "loop",
      description: "3回繰り返し",
      loopKind: "count",
      countExpression: "3",
      steps: [],
    } as Step);

    expect(step.detail.countExpression).toBe("3");
    expect(step.detail.steps).toHaveLength(0);
  });

  it("jump: jumpTo label", () => {
    const step = getStep({
      id: "jp1",
      type: "jump",
      description: "終了へ移動",
      jumpTo: "done",
    } as Step);

    expect(step.detail.jumpTo).toBe("done");
  });

  it("transactionScope: steps sub-array", () => {
    const step = getStep({
      id: "tx1",
      type: "transactionScope",
      description: "トランザクション",
      steps: [
        {
          id: "db1",
          type: "dbAccess",
          description: "注文登録",
          tableName: "orders",
          operation: "INSERT",
        } as DbAccessStep,
      ],
    } as Step);

    expect(step.detail.steps).toHaveLength(1);
    expect((step.detail.steps as Array<{ type: string }>)[0].type).toBe("dbAccess");
  });

  it("closing: period and rollbackOnFailure false", () => {
    const step = getStep({
      id: "cl1",
      type: "closing",
      description: "月次締め",
      period: "monthly",
      rollbackOnFailure: false,
    } as ClosingStep);

    expect(step.detail.period).toBe("monthly");
    expect(step.detail.rollbackOnFailure).toBe(false);
  });

  it("cdc: tables, captureMode, and destination", () => {
    const destination = { type: "eventStream", target: "orders-topic" } as const;
    const step = getStep({
      id: "cdc1",
      type: "cdc",
      description: "注文変更通知",
      tables: ["orders", "order_items"],
      captureMode: "incremental",
      destination,
    } as CdcStep);

    expect(step.detail.tables).toEqual(["orders", "order_items"]);
    expect(step.detail.captureMode).toBe("incremental");
    expect(step.detail.destination).toEqual(destination);
  });

  it("eventPublish: topic and optional payload", () => {
    const withPayload = getStep({
      id: "ep1",
      type: "eventPublish",
      description: "イベント発行",
      topic: "order.created",
      payload: "{ orderId: @orderId }",
    } as EventPublishStep);

    expect(withPayload.detail.topic).toBe("order.created");
    expect(withPayload.detail.payload).toBe("{ orderId: @orderId }");

    const withoutPayload = getStep({
      id: "ep2",
      type: "eventPublish",
      description: "イベント発行",
      topic: "order.created",
    } as EventPublishStep);

    expect(withoutPayload.detail.topic).toBe("order.created");
    expect(withoutPayload.detail).not.toHaveProperty("payload");
  });

  it("eventSubscribe: topic and optional filter", () => {
    const withFilter = getStep({
      id: "es1",
      type: "eventSubscribe",
      description: "イベント購読",
      topic: "order.created",
      filter: "@event.region == 'jp'",
    } as EventSubscribeStep);

    expect(withFilter.detail.topic).toBe("order.created");
    expect(withFilter.detail.filter).toBe("@event.region == 'jp'");

    const withoutFilter = getStep({
      id: "es2",
      type: "eventSubscribe",
      description: "イベント購読",
      topic: "order.created",
    } as EventSubscribeStep);

    expect(withoutFilter.detail.topic).toBe("order.created");
    expect(withoutFilter.detail).not.toHaveProperty("filter");
  });

  it("loopBreak: detail は空オブジェクト", () => {
    const step = getStep({
      id: "lb1",
      type: "loopBreak",
      description: "ループ脱出",
    } as LoopBreakStep);
    expect(step.type).toBe("loopBreak");
    expect(step.detail).toEqual({});
  });

  it("loopContinue: detail は空オブジェクト", () => {
    const step = getStep({
      id: "lc1",
      type: "loopContinue",
      description: "ループ継続",
    } as LoopContinueStep);
    expect(step.type).toBe("loopContinue");
    expect(step.detail).toEqual({});
  });

  it("return: detail は空オブジェクト", () => {
    const step = getStep({
      id: "r1",
      type: "return",
      description: "レスポンス返却",
    } as ReturnStep);
    expect(step.type).toBe("return");
    expect(step.detail).toEqual({});
  });

  it("log: detail は空オブジェクト", () => {
    const step = getStep({
      id: "l1",
      type: "log",
      description: "ログ記録",
      level: "info",
      message: "処理完了",
    } as LogStep);
    expect(step.type).toBe("log");
    expect(step.detail).toEqual({});
  });

  it("audit: detail は空オブジェクト", () => {
    const step = getStep({
      id: "au1",
      type: "audit",
      description: "監査ログ",
      action: "order.create",
    } as AuditStep);
    expect(step.type).toBe("audit");
    expect(step.detail).toEqual({});
  });

  it("workflow: detail は空オブジェクト", () => {
    const step = getStep({
      id: "wf1",
      type: "workflow",
      description: "承認フロー",
      pattern: "approval-sequential",
      approvers: [{ role: "manager" }],
    } as WorkflowStep);
    expect(step.type).toBe("workflow");
    expect(step.detail).toEqual({});
  });

  it("compute: detail は空オブジェクト", () => {
    const step = getStep({
      id: "comp1",
      type: "compute",
      description: "税額計算",
      expression: "@subtotal * 0.10",
    } as ComputeStep);
    expect(step.type).toBe("compute");
    expect(step.detail).toEqual({});
  });

  it("other: detail は空オブジェクト", () => {
    const step = getStep({
      id: "oth1",
      type: "other",
      description: "その他処理",
    } as OtherStep);
    expect(step.type).toBe("other");
    expect(step.detail).toEqual({});
  });
});
