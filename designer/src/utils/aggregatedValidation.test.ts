import { describe, it, expect } from "vitest";
import { aggregateValidation } from "./aggregatedValidation";
import type { ProcessFlow } from "../types/action";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(__dirname, "../../../");

function makeGroup(partial: Partial<ProcessFlow>): ProcessFlow {
  return {
    meta: { id: "a", name: "x", kind: "screen", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
    actions: [],
    ...partial,
  } as ProcessFlow;
}

describe("aggregateValidation — 統合テスト", () => {
  it("既存の structural error (loopBreak out of loop) を保持", () => {
    const errors = aggregateValidation(makeGroup({
      actions: [{
        id: "a1", name: "f", trigger: "click",
        steps: [{ id: "s1", kind: "loopBreak", description: "" }],
      }],
    }));
    expect(errors.some((e) => e.severity === "error")).toBe(true);
    expect(errors.some((e) => e.stepId === "s1")).toBe(true);
  });

  it("referentialIntegrity の UNKNOWN_RESPONSE_REF を取り込む", () => {
    const errors = aggregateValidation(makeGroup({
      actions: [{
        id: "a1", name: "f", trigger: "click",
        responses: [{ id: "201", status: 201 }],
        steps: [{ id: "s1", kind: "return", description: "", responseId: "404-missing" }],
      }],
    }));
    const w = errors.find((e) => e.code === "UNKNOWN_RESPONSE_REF");
    expect(w).toBeDefined();
    expect(w?.severity).toBe("warning");
    expect(w?.stepId).toBe("s1");
    expect(w?.path).toBeDefined();
  });

  it("identifierScope の UNKNOWN_IDENTIFIER を取り込む", () => {
    const errors = aggregateValidation(makeGroup({
      actions: [{
        id: "a1", name: "f", trigger: "click",
        steps: [{ id: "s1", kind: "compute", description: "", expression: "@unknownX * 2", outputBinding: "r" }],
      }],
    }));
    const w = errors.find((e) => e.code === "UNKNOWN_IDENTIFIER");
    expect(w).toBeDefined();
    expect(w?.stepId).toBe("s1");
  });

  it("ネストした step (branch 内) の issue の stepId 解決", () => {
    const errors = aggregateValidation(makeGroup({
      actions: [{
        id: "a1", name: "f", trigger: "click",
        responses: [{ id: "201", status: 201 }],
        steps: [{
          id: "branch1", kind: "branch", description: "",
          branches: [{
            id: "b1", code: "A", condition: "@flag",
            steps: [{ id: "inner-return", kind: "return", description: "", responseId: "missing" }],
          }],
        }],
      }],
    }));
    const w = errors.find((e) => e.code === "UNKNOWN_RESPONSE_REF");
    expect(w?.stepId).toBe("inner-return");
  });

  it("externalSystem.outcomes.sideEffects 内の step も stepId 解決", () => {
    const errors = aggregateValidation(makeGroup({
      actions: [{
        id: "a1", name: "f", trigger: "click",
        steps: [{
          id: "ext", kind: "externalSystem", description: "", systemRef: "x",
          outcomes: {
            failure: {
              action: "continue",
              sideEffects: [{ id: "se-unknown", kind: "compute", description: "", expression: "@unknownVar", outputBinding: "r" }],
            },
          },
        }],
      }],
    }));
    const w = errors.find((e) => e.code === "UNKNOWN_IDENTIFIER");
    expect(w?.stepId).toBe("se-unknown");
  });

  it("UNKNOWN_SECRET_REF は catalog 階層なので stepId は空 ok", () => {
    const errors = aggregateValidation(makeGroup({
      context: { catalogs: {
        secrets: { k: { source: "env", name: "X" } },
        externalSystems: {
          stripe: { name: "Stripe", auth: { kind: "bearer", tokenRef: "@secret.unknown" } },
        },
      } },
      actions: [],
    }));
    const w = errors.find((e) => e.code === "UNKNOWN_SECRET_REF");
    expect(w).toBeDefined();
    expect(w?.path).toContain("context.catalogs.externalSystems");
  });

  it("legacy サンプル 0005 は clean (structural error なし + warning 最小)", () => {
    // Phase 4-2 で docs/sample-project は retail (gggggggg-*) に置き換え、
    // 既存 cccccccc-* は docs/legacy-sample-project に退避済。
    const group = JSON.parse(readFileSync(
      resolve(repoRoot, "docs/legacy-sample-project/process-flows/cccccccc-0005-4000-8000-cccccccccccc.json"),
      "utf-8",
    )) as ProcessFlow;
    const errors = aggregateValidation(group);
    const structuralErrors = errors.filter((e) => e.severity === "error");
    expect(structuralErrors).toHaveLength(0);
  });

  it("options.tables / conventions 未指定時は SQL/conv 検査はスキップ", () => {
    // sql の列チェックは tables 未指定 → skip
    // conv 参照は conventions null/undefined → skip
    const errors = aggregateValidation(makeGroup({
      actions: [{
        id: "a1", name: "f", trigger: "click",
        inputs: [{ name: "x", type: "number" }],
        steps: [{
          id: "s1", kind: "dbAccess", description: "",
          tableId: "unknown-table-id", operation: "SELECT",
          sql: "SELECT never_existing_col FROM unknown_table WHERE id = @x",
        }],
      }],
    }));
    // UNKNOWN_COLUMN は tables 未指定なので出ない
    expect(errors.every((e) => e.code !== "UNKNOWN_COLUMN")).toBe(true);
  });
});
