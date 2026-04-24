import { describe, it, expect } from "vitest";
import { checkReferentialIntegrity } from "./referentialIntegrity";
import type { ProcessFlow } from "../types/action";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const samplesDir = resolve(__dirname, "../../../docs/sample-project/process-flows");

function makeGroup(partial: Partial<ProcessFlow>): ProcessFlow {
  return {
    id: "a", name: "x", type: "screen", description: "",
    actions: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...partial,
  } as ProcessFlow;
}

describe("checkReferentialIntegrity — responseRef", () => {
  it("未定義 responseRef を検出", () => {
    const issues = checkReferentialIntegrity(makeGroup({
      actions: [{
        id: "a1", name: "f", trigger: "click",
        responses: [{ id: "201-ok", status: 201 }],
        steps: [
          { id: "s1", type: "return", description: "", responseRef: "999-missing" },
        ],
      }],
    }));
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("UNKNOWN_RESPONSE_REF");
    expect(issues[0].value).toBe("999-missing");
  });

  it("定義済み responseRef は問題なし", () => {
    const issues = checkReferentialIntegrity(makeGroup({
      actions: [{
        id: "a1", name: "f", trigger: "click",
        responses: [{ id: "201-ok", status: 201 }],
        steps: [{ id: "s1", type: "return", description: "", responseRef: "201-ok" }],
      }],
    }));
    expect(issues).toHaveLength(0);
  });

  it("ValidationStep.inlineBranch.ngResponseRef も検査", () => {
    const issues = checkReferentialIntegrity(makeGroup({
      actions: [{
        id: "a1", name: "f", trigger: "click",
        responses: [],
        steps: [{
          id: "s1", type: "validation", description: "", conditions: "",
          inlineBranch: { ok: "ok", ng: "ng", ngResponseRef: "400-not-defined" },
        }],
      }],
    }));
    expect(issues.some((i) => i.code === "UNKNOWN_RESPONSE_REF")).toBe(true);
  });

  it("errorCatalog.responseRef も検査", () => {
    const issues = checkReferentialIntegrity(makeGroup({
      errorCatalog: {
        STOCK_SHORTAGE: { responseRef: "409-missing" },
      },
      actions: [{
        id: "a1", name: "f", trigger: "click",
        responses: [{ id: "409-stock-shortage", status: 409 }],
        steps: [],
      }],
    }));
    expect(issues.some((i) => i.code === "UNKNOWN_RESPONSE_REF")).toBe(true);
  });
});

describe("checkReferentialIntegrity — errorCode", () => {
  it("errorCatalog 定義時、未登録 errorCode を検出", () => {
    const issues = checkReferentialIntegrity(makeGroup({
      errorCatalog: { STOCK_SHORTAGE: { httpStatus: 409 } },
      actions: [{
        id: "a1", name: "f", trigger: "click",
        steps: [{
          id: "s1", type: "dbAccess", description: "",
          tableName: "t", operation: "UPDATE",
          affectedRowsCheck: { operator: ">", expected: 0, onViolation: "throw", errorCode: "UNKNOWN_CODE" },
        }],
      }],
    }));
    expect(issues.some((i) => i.code === "UNKNOWN_ERROR_CODE")).toBe(true);
  });

  it("errorCatalog 未定義時は errorCode 検査をスキップ (後方互換)", () => {
    const issues = checkReferentialIntegrity(makeGroup({
      actions: [{
        id: "a1", name: "f", trigger: "click",
        steps: [{
          id: "s1", type: "dbAccess", description: "",
          tableName: "t", operation: "UPDATE",
          affectedRowsCheck: { operator: ">", expected: 0, onViolation: "throw", errorCode: "ANY" },
        }],
      }],
    }));
    expect(issues).toHaveLength(0);
  });

  it("BranchConditionVariant.errorCode も検査", () => {
    const issues = checkReferentialIntegrity(makeGroup({
      errorCatalog: { STOCK_SHORTAGE: {} },
      actions: [{
        id: "a1", name: "f", trigger: "click",
        steps: [{
          id: "s1", type: "branch", description: "",
          branches: [{
            id: "b1", code: "A",
            condition: { kind: "tryCatch", errorCode: "NOT_REGISTERED" },
            steps: [],
          }],
        }],
      }],
    }));
    expect(issues.some((i) => i.code === "UNKNOWN_ERROR_CODE")).toBe(true);
  });
});

describe("checkReferentialIntegrity — ネスト走査", () => {
  it("loop.steps 内の ReturnStep も検査", () => {
    const issues = checkReferentialIntegrity(makeGroup({
      actions: [{
        id: "a1", name: "f", trigger: "click",
        responses: [{ id: "200-ok", status: 200 }],
        steps: [{
          id: "lp", type: "loop", description: "", loopKind: "count",
          steps: [{ id: "ret", type: "return", description: "", responseRef: "missing" }],
        }],
      }],
    }));
    expect(issues).toHaveLength(1);
    expect(issues[0].path).toContain("steps[0].steps[0]");
  });

  it("externalSystem.outcomes.sideEffects 内も検査", () => {
    const issues = checkReferentialIntegrity(makeGroup({
      actions: [{
        id: "a1", name: "f", trigger: "click",
        responses: [],
        steps: [{
          id: "ext", type: "externalSystem", description: "", systemName: "s",
          outcomes: {
            failure: {
              action: "continue",
              sideEffects: [
                { id: "ret", type: "return", description: "", responseRef: "missing" },
              ],
            },
          },
        }],
      }],
    }));
    expect(issues.some((i) => i.path.includes("sideEffects"))).toBe(true);
  });
});

describe("checkReferentialIntegrity — @secret.* (#261 v1.6)", () => {
  it("secretsCatalog 定義時、未登録 @secret を検出", () => {
    const issues = checkReferentialIntegrity(makeGroup({
      secretsCatalog: { stripeKey: { source: "env", name: "STRIPE_SECRET_KEY" } },
      externalSystemCatalog: {
        stripe: { name: "Stripe", auth: { kind: "bearer", tokenRef: "@secret.unknown" } },
      },
      actions: [],
    }));
    expect(issues.some((i) => i.code === "UNKNOWN_SECRET_REF")).toBe(true);
  });

  it("catalog にある @secret は OK", () => {
    const issues = checkReferentialIntegrity(makeGroup({
      secretsCatalog: { stripeKey: { source: "env", name: "STRIPE_SECRET_KEY" } },
      externalSystemCatalog: {
        stripe: { name: "Stripe", auth: { kind: "bearer", tokenRef: "@secret.stripeKey" } },
      },
      actions: [],
    }));
    expect(issues).toHaveLength(0);
  });

  it("step 側 auth.tokenRef の @secret も検査", () => {
    const issues = checkReferentialIntegrity(makeGroup({
      secretsCatalog: { stripeKey: { source: "env", name: "STRIPE_SECRET_KEY" } },
      actions: [{
        id: "a1", name: "f", trigger: "click",
        steps: [{
          id: "s1", type: "externalSystem", description: "",
          systemName: "Stripe",
          auth: { kind: "bearer", tokenRef: "@secret.unknownKey" },
        }],
      }],
    }));
    expect(issues.some((i) => i.code === "UNKNOWN_SECRET_REF")).toBe(true);
  });

  it("secretsCatalog 未定義時は @secret 検査をスキップ (後方互換)", () => {
    const issues = checkReferentialIntegrity(makeGroup({
      externalSystemCatalog: {
        stripe: { name: "Stripe", auth: { kind: "bearer", tokenRef: "@secret.anything" } },
      },
      actions: [],
    }));
    expect(issues).toHaveLength(0);
  });

  it("ENV: / SECRET: 規約文字列は @secret と無関係で後方互換", () => {
    const issues = checkReferentialIntegrity(makeGroup({
      secretsCatalog: { k: { source: "env", name: "X" } },
      externalSystemCatalog: {
        stripe: { name: "Stripe", auth: { kind: "bearer", tokenRef: "ENV:STRIPE_SECRET_KEY" } },
      },
      actions: [],
    }));
    expect(issues).toHaveLength(0);
  });
});

describe("checkReferentialIntegrity — typeRef (#261)", () => {
  it("typeCatalog 定義時、未登録 typeRef を検出", () => {
    const issues = checkReferentialIntegrity(makeGroup({
      typeCatalog: { ApiError: { schema: { type: "object" } } },
      actions: [{
        id: "a1", name: "f", trigger: "click",
        responses: [{ id: "400", status: 400, bodySchema: { typeRef: "UnknownType" } }],
        steps: [],
      }],
    }));
    expect(issues.some((i) => i.code === "UNKNOWN_TYPE_REF")).toBe(true);
  });

  it("typeCatalog 未定義時は typeRef 検査をスキップ (後方互換)", () => {
    const issues = checkReferentialIntegrity(makeGroup({
      actions: [{
        id: "a1", name: "f", trigger: "click",
        responses: [{ id: "400", status: 400, bodySchema: { typeRef: "AnyType" } }],
        steps: [],
      }],
    }));
    expect(issues).toHaveLength(0);
  });

  it("bodySchema が string 形式なら typeRef 検査対象外", () => {
    const issues = checkReferentialIntegrity(makeGroup({
      typeCatalog: { ApiError: { schema: {} } },
      actions: [{
        id: "a1", name: "f", trigger: "click",
        responses: [{ id: "400", status: 400, bodySchema: "UnknownType" }],
        steps: [],
      }],
    }));
    expect(issues).toHaveLength(0);
  });
});

describe("checkReferentialIntegrity — systemRef (#261)", () => {
  it("externalSystemCatalog 定義時、未登録 systemRef を検出", () => {
    const issues = checkReferentialIntegrity(makeGroup({
      externalSystemCatalog: { stripe: { name: "Stripe" } },
      actions: [{
        id: "a1", name: "f", trigger: "click",
        steps: [{
          id: "s1", type: "externalSystem", description: "",
          systemName: "SendGrid", systemRef: "sendgrid",
        }],
      }],
    }));
    expect(issues.some((i) => i.code === "UNKNOWN_SYSTEM_REF")).toBe(true);
  });

  it("externalSystemCatalog 未定義時は systemRef 検査をスキップ (後方互換)", () => {
    const issues = checkReferentialIntegrity(makeGroup({
      actions: [{
        id: "a1", name: "f", trigger: "click",
        steps: [{
          id: "s1", type: "externalSystem", description: "",
          systemName: "Stripe", systemRef: "any",
        }],
      }],
    }));
    expect(issues).toHaveLength(0);
  });
});

describe("checkReferentialIntegrity — サンプル (docs/sample-project/process-flows/*.json)", () => {
  const files = readdirSync(samplesDir).filter((f) => f.endsWith(".json"));
  for (const f of files) {
    it(`${f} は参照整合性を満たす`, () => {
      const group = JSON.parse(readFileSync(join(samplesDir, f), "utf-8")) as ProcessFlow;
      const issues = checkReferentialIntegrity(group);
      if (issues.length > 0) {
        throw new Error(
          `参照整合性違反:\n${issues.map((i) => `  - [${i.code}] ${i.path}: ${i.message}`).join("\n")}`,
        );
      }
      expect(issues).toHaveLength(0);
    });
  }
});
