import { describe, expect, it } from "vitest";
import { migrateProcessFlow, migrateStep, PROCESS_FLOW_V3_SCHEMA_REF } from "./actionMigration";

describe("migrateProcessFlow v1 -> v3", () => {
  it("root type/meta/catalog/authoring を v3 shape に移行する", () => {
    const migrated = migrateProcessFlow({
      id: "aaaaaaaa-0000-4000-8000-000000000001",
      name: "注文登録",
      type: "screen",
      screenId: "bbbbbbbb-0000-4000-8000-000000000001",
      description: "desc",
      mode: "downstream",
      maturity: "committed",
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-02T00:00:00.000Z",
      errorCatalog: { VALIDATION: { httpStatus: 400 } },
      externalSystemCatalog: { payment: { name: "Payment" } },
      secretsCatalog: { paymentKey: { source: "env", name: "PAYMENT_KEY" } },
      ambientVariables: [{ name: "requestId", type: "string" }],
      markers: [{ id: "aaaaaaaa-0000-4000-8000-000000000002", kind: "todo", body: "確認", author: "human", createdAt: "2026-04-01T00:00:00.000Z" }],
      actions: [],
    });

    expect(migrated.$schema).toBe(PROCESS_FLOW_V3_SCHEMA_REF);
    expect(migrated.meta).toMatchObject({
      id: "aaaaaaaa-0000-4000-8000-000000000001",
      name: "注文登録",
      kind: "screen",
      screenId: "bbbbbbbb-0000-4000-8000-000000000001",
      mode: "downstream",
      maturity: "committed",
    });
    expect(migrated.context?.catalogs?.errors?.VALIDATION.httpStatus).toBe(400);
    expect(migrated.context?.catalogs?.externalSystems?.payment.name).toBe("Payment");
    expect(migrated.context?.catalogs?.secrets?.paymentKey.name).toBe("PAYMENT_KEY");
    expect(migrated.context?.ambientVariables?.[0].name).toBe("requestId");
    expect(migrated.authoring?.markers?.[0].body).toBe("確認");
  });

  it("step type/rule kind/branch condition/outputBinding を v3 に変換する", () => {
    const migrated = migrateStep({
      id: "b1",
      type: "branch",
      description: "分岐",
      condition: "@ok",
      outputBinding: "branchResult",
      branchA: {
        label: "OK",
        description: "続行",
      },
      branchB: {
        label: "NG",
        jumpTo: "end",
      },
    });

    expect(migrated.kind).toBe("branch");
    expect(migrated.outputBinding).toEqual({ name: "branchResult" });
    if (migrated.kind !== "branch") throw new Error("not branch");
    expect(migrated.branches[0].condition).toEqual({ kind: "expression", expression: "@ok" });
    expect(migrated.branches[0].steps[0].kind).toBe("legacy:OtherStep");
    expect(migrated.branches[1].steps[0].kind).toBe("jump");
  });

  it("v3 shape は再実行しても JSON が変化しない", () => {
    const raw = {
      $schema: PROCESS_FLOW_V3_SCHEMA_REF,
      meta: {
        id: "aaaaaaaa-0000-4000-8000-000000000003",
        name: "v3",
        kind: "common",
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
      },
      actions: [{
        id: "act",
        name: "act",
        trigger: "other",
        steps: [{ id: "s1", kind: "validation", description: "", rules: [{ field: "x", type: "required", severity: "error" }] }],
      }],
    };
    const once = migrateProcessFlow(raw);
    const twice = migrateProcessFlow(once);
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });
});
