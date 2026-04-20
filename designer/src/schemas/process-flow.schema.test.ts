import { describe, it, expect, beforeAll } from "vitest";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const repoRoot = resolve(__dirname, "../../../");
const schemaPath = resolve(repoRoot, "schemas/process-flow.schema.json");
const samplesDir = resolve(repoRoot, "docs/sample-project/actions");

let validate: ValidateFunction;

beforeAll(() => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
  validate = ajv.compile(schema);
});

describe("process-flow.schema.json — docs/sample-project/actions/*.json", () => {
  const files = readdirSync(samplesDir).filter((f) => f.endsWith(".json"));

  it("サンプルファイルが存在する (防御)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file} がスキーマに適合する`, () => {
      const data = JSON.parse(readFileSync(join(samplesDir, file), "utf-8"));
      const ok = validate(data);
      if (!ok) {
        const msg = validate.errors
          ?.map((e) => `  - ${e.instancePath} ${e.message}${e.params ? " " + JSON.stringify(e.params) : ""}`)
          .join("\n");
        throw new Error(`スキーマ違反 (${file}):\n${msg}`);
      }
      expect(ok).toBe(true);
    });
  }
});

describe("process-flow.schema.json — v1.1 拡張 (#253)", () => {
  const base = {
    id: "a", name: "x", type: "screen", description: "",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  it("FieldType.array (itemType 再帰) が accept される", () => {
    const ok = validate({
      ...base,
      actions: [{
        id: "a1", name: "f", trigger: "click",
        inputs: [{
          name: "items",
          type: { kind: "array", itemType: { kind: "object", fields: [
            { name: "itemId", type: "number" },
            { name: "quantity", type: "number", required: true },
          ]}},
        }],
        steps: [],
      }],
    });
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });

  it("FieldType.object.fields で StructuredField 再帰", () => {
    const ok = validate({
      ...base,
      actions: [{
        id: "a1", name: "f", trigger: "click",
        inputs: [{
          name: "customer",
          type: { kind: "object", fields: [
            { name: "id", type: "number" },
            { name: "name", type: "string", required: true },
            { name: "addresses", type: { kind: "array", itemType: "string" } },
          ]},
        }],
        steps: [],
      }],
    });
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });

  it("BranchStep.elseBranch は condition を省略可能", () => {
    const ok = validate({
      ...base,
      actions: [{
        id: "a1", name: "f", trigger: "click",
        steps: [{
          id: "s1", type: "branch", description: "",
          branches: [{ id: "b1", code: "A", condition: "@flag == true", steps: [] }],
          elseBranch: { id: "b-else", code: "else", steps: [] },
        }],
      }],
    });
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });

  it("elseBranch に condition: \"\" があっても後方互換で accept", () => {
    const ok = validate({
      ...base,
      actions: [{
        id: "a1", name: "f", trigger: "click",
        steps: [{
          id: "s1", type: "branch", description: "",
          branches: [{ id: "b1", code: "A", condition: "@flag", steps: [] }],
          elseBranch: { id: "b-else", code: "else", condition: "", steps: [] },
        }],
      }],
    });
    expect(ok).toBe(true);
  });
});

describe("process-flow.schema.json — BranchConditionVariant 拡張 (#261 v1.3)", () => {
  const base = {
    id: "a", name: "x", type: "screen", description: "",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  function withBranch(condition: unknown) {
    return {
      ...base,
      actions: [{
        id: "a1", name: "f", trigger: "click",
        steps: [{
          id: "s1", type: "branch", description: "",
          branches: [{ id: "b1", code: "A", condition, steps: [] }],
        }],
      }],
    };
  }

  it("tryCatch variant (既存) accept", () => {
    const ok = validate(withBranch({ kind: "tryCatch", errorCode: "STOCK_SHORTAGE" }));
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });

  it("affectedRowsZero variant accept", () => {
    const ok = validate(withBranch({ kind: "affectedRowsZero", stepRef: "step-dbupd" }));
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });

  it("externalOutcome variant accept", () => {
    const ok = validate(withBranch({ kind: "externalOutcome", outcome: "failure" }));
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });

  it("externalOutcome.outcome enum 外は reject", () => {
    expect(validate(withBranch({ kind: "externalOutcome", outcome: "partial" }))).toBe(false);
  });

  it("未知 kind は reject", () => {
    expect(validate(withBranch({ kind: "unknownKind" }))).toBe(false);
  });

  it("string condition (旧) も引き続き accept", () => {
    expect(validate(withBranch("@flag == true"))).toBe(true);
  });
});

describe("process-flow.schema.json — typeCatalog (#261 v1.3)", () => {
  const base = {
    id: "a", name: "x", type: "screen", description: "",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  it("typeCatalog + bodySchema.typeRef で resolution 連携", () => {
    const ok = validate({
      ...base,
      typeCatalog: {
        ApiError: {
          description: "共通エラーレスポンス",
          schema: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              fieldErrors: { type: "object", additionalProperties: { type: "string" } },
            },
          },
        },
        CustomerResponse: {
          schema: { type: "object", properties: { id: { type: "number" }, name: { type: "string" } } },
        },
      },
      actions: [{
        id: "a1", name: "f", trigger: "click",
        responses: [
          { id: "400", status: 400, bodySchema: { typeRef: "ApiError" } },
          { id: "200", status: 200, bodySchema: { typeRef: "CustomerResponse" } },
        ],
        steps: [],
      }],
    });
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });

  it("typeCatalog 省略 accept (optional)", () => {
    expect(validate({ ...base, actions: [] })).toBe(true);
  });

  it("TypeCatalogEntry の schema 欠落は reject", () => {
    expect(validate({
      ...base,
      typeCatalog: { X: { description: "desc only" } },
      actions: [],
    })).toBe(false);
  });
});

describe("process-flow.schema.json — externalSystemCatalog + httpCall (#261 v1.3)", () => {
  const base = {
    id: "a", name: "x", type: "screen", description: "",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  it("externalSystemCatalog + ExternalSystemStep.systemRef + httpCall", () => {
    const ok = validate({
      ...base,
      externalSystemCatalog: {
        stripe: {
          name: "Stripe Japan",
          baseUrl: "https://api.stripe.com",
          auth: { kind: "bearer", tokenRef: "ENV:STRIPE_SECRET_KEY" },
          timeoutMs: 10000,
          retryPolicy: { maxAttempts: 3, backoff: "exponential", initialDelayMs: 500 },
          headers: { "Stripe-Version": "2024-06-20" },
        },
      },
      actions: [{
        id: "a1", name: "f", trigger: "click",
        steps: [{
          id: "s1", type: "externalSystem", description: "",
          systemName: "Stripe Japan", systemRef: "stripe",
          httpCall: {
            method: "POST",
            path: "/v1/payment_intents/@paymentAuth.id/cancel",
            query: { expand: "charges" },
          },
          idempotencyKey: "cancel-@paymentAuth.id",
        }],
      }],
    });
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });

  it("httpCall 構造 (method / path / body)", () => {
    const ok = validate({
      ...base,
      actions: [{
        id: "a1", name: "f", trigger: "click",
        steps: [{
          id: "s1", type: "externalSystem", description: "",
          systemName: "Stripe",
          httpCall: {
            method: "POST",
            path: "/v1/payment_intents",
            body: "{ amount: @order.totalAmount, currency: 'jpy' }",
          },
        }],
      }],
    });
    expect(ok).toBe(true);
  });

  it("protocol (legacy) と httpCall 併用 accept (後方互換)", () => {
    expect(validate({
      ...base,
      actions: [{
        id: "a1", name: "f", trigger: "click",
        steps: [{
          id: "s1", type: "externalSystem", description: "",
          systemName: "Stripe",
          protocol: "HTTPS POST /v1/foo",
          httpCall: { method: "POST", path: "/v1/foo" },
        }],
      }],
    })).toBe(true);
  });

  it("systemRef / httpCall 省略 accept (後方互換)", () => {
    expect(validate({
      ...base,
      actions: [{
        id: "a1", name: "f", trigger: "click",
        steps: [{
          id: "s1", type: "externalSystem", description: "",
          systemName: "Stripe",
          protocol: "HTTPS POST /v1/foo",
        }],
      }],
    })).toBe(true);
  });

  it("httpCall.method enum 外は reject", () => {
    expect(validate({
      ...base,
      actions: [{
        id: "a1", name: "f", trigger: "click",
        steps: [{
          id: "s1", type: "externalSystem", description: "",
          systemName: "Stripe",
          httpCall: { method: "CONNECT", path: "/x" },
        }],
      }],
    })).toBe(false);
  });
});

describe("process-flow.schema.json — sideEffects の return 禁止 (#261)", () => {
  const base = {
    id: "a", name: "x", type: "screen", description: "",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  function extWithSideEffects(sideEffects: unknown[]) {
    return {
      ...base,
      actions: [{
        id: "a1", name: "f", trigger: "click",
        steps: [{
          id: "s1", type: "externalSystem", description: "",
          systemName: "Stripe",
          outcomes: {
            failure: { action: "continue", sideEffects },
          },
        }],
      }],
    };
  }

  it("sideEffects に dbAccess / other は accept", () => {
    const ok = validate(extWithSideEffects([
      { id: "se1", type: "dbAccess", description: "", tableName: "t", operation: "UPDATE" },
      { id: "se2", type: "other", description: "" },
    ]));
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });

  it("sideEffects 内 ReturnStep は reject", () => {
    expect(validate(extWithSideEffects([
      { id: "ret", type: "return", description: "", responseRef: "201" },
    ]))).toBe(false);
  });

  it("sideEffects 空配列 accept", () => {
    expect(validate(extWithSideEffects([]))).toBe(true);
  });
});

describe("process-flow.schema.json — HttpResponseSpec.bodySchema union (#253)", () => {
  const base = {
    id: "a", name: "x", type: "screen", description: "",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  function withResponses(responses: unknown[]) {
    return {
      ...base,
      actions: [{ id: "a1", name: "f", trigger: "click", responses, steps: [] }],
    };
  }

  it("bodySchema: string (旧形式) accept", () => {
    const ok = validate(withResponses([{ id: "201", status: 201, bodySchema: "ApiResponse" }]));
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });

  it("bodySchema: {typeRef} 構造化 accept", () => {
    const ok = validate(withResponses([{ id: "201", status: 201, bodySchema: { typeRef: "CustomerResponse" } }]));
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });

  it("bodySchema: {schema} インライン accept", () => {
    const ok = validate(withResponses([{
      id: "409", status: 409,
      bodySchema: { schema: { type: "object", properties: { code: { type: "string" } } } },
    }]));
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });

  it("bodySchema 省略 accept", () => {
    expect(validate(withResponses([{ id: "204", status: 204 }]))).toBe(true);
  });

  it("{typeRef, schema} 両方指定は reject (union で排他)", () => {
    expect(validate(withResponses([{
      id: "409", status: 409,
      bodySchema: { typeRef: "X", schema: {} },
    }]))).toBe(false);
  });

  it("{typeRef} が空文字列でも type ref は string として accept (運用で検査)", () => {
    expect(validate(withResponses([{ id: "409", status: 409, bodySchema: { typeRef: "" } }]))).toBe(true);
  });
});

describe("process-flow.schema.json — ExternalSystemStep auth/idempotency/headers (#253)", () => {
  const base = {
    id: "a", name: "x", type: "screen", description: "",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  function ext(patch: Record<string, unknown>) {
    return {
      ...base,
      actions: [{
        id: "a1", name: "f", trigger: "click",
        steps: [{
          id: "s1", type: "externalSystem", description: "",
          systemName: "Stripe", ...patch,
        }],
      }],
    };
  }

  it("auth.kind=bearer + tokenRef accept", () => {
    const ok = validate(ext({ auth: { kind: "bearer", tokenRef: "ENV:STRIPE_SECRET_KEY" } }));
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });

  it("auth.kind=apiKey + headerName accept", () => {
    expect(validate(ext({ auth: { kind: "apiKey", tokenRef: "ENV:X_KEY", headerName: "X-API-Key" } }))).toBe(true);
  });

  it("auth.kind=none (tokenRef なし) accept", () => {
    expect(validate(ext({ auth: { kind: "none" } }))).toBe(true);
  });

  it("auth.kind enum 外は reject", () => {
    expect(validate(ext({ auth: { kind: "custom-kind" } }))).toBe(false);
  });

  it("idempotencyKey + headers accept", () => {
    expect(validate(ext({
      idempotencyKey: "order-@registeredOrder.id",
      headers: { "Stripe-Version": "2024-06-20", "X-Trace-Id": "@traceId" },
    }))).toBe(true);
  });

  it("auth / idempotencyKey / headers 全省略 accept (後方互換)", () => {
    expect(validate(ext({}))).toBe(true);
  });
});

describe("process-flow.schema.json — OutputBindingObject.initialValue (#253)", () => {
  const base = {
    id: "a", name: "x", type: "screen", description: "",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  it("accumulate + initialValue='0' accept", () => {
    const ok = validate({
      ...base,
      actions: [{
        id: "a1", name: "f", trigger: "click",
        steps: [{
          id: "s1", type: "compute", description: "",
          expression: "@subtotal + @line.amount",
          outputBinding: { name: "subtotal", operation: "accumulate", initialValue: "0" },
        }],
      }],
    });
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });

  it("push + initialValue='[]' accept", () => {
    const ok = validate({
      ...base,
      actions: [{
        id: "a1", name: "f", trigger: "click",
        steps: [{
          id: "s1", type: "compute", description: "",
          expression: "@line",
          outputBinding: { name: "lines", operation: "push", initialValue: "[]" },
        }],
      }],
    });
    expect(ok).toBe(true);
  });

  it("initialValue 省略 accept (optional)", () => {
    expect(validate({
      ...base,
      actions: [{
        id: "a1", name: "f", trigger: "click",
        steps: [{
          id: "s1", type: "compute", description: "",
          expression: "x",
          outputBinding: { name: "subtotal", operation: "accumulate" },
        }],
      }],
    })).toBe(true);
  });

  it("string 形式 outputBinding との併用 — string 側は影響なし", () => {
    expect(validate({
      ...base,
      actions: [{
        id: "a1", name: "f", trigger: "click",
        steps: [{
          id: "s1", type: "compute", description: "",
          expression: "x",
          outputBinding: "result",
        }],
      }],
    })).toBe(true);
  });
});

describe("process-flow.schema.json — errorCatalog (#253)", () => {
  const base = {
    id: "a", name: "x", type: "screen", description: "",
    actions: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  it("errorCatalog 全フィールド accept", () => {
    const ok = validate({
      ...base,
      errorCatalog: {
        STOCK_SHORTAGE: {
          httpStatus: 409,
          defaultMessage: "在庫不足",
          responseRef: "409-stock-shortage",
          description: "引当 UPDATE で rowCount=0",
        },
        VALIDATION: {
          httpStatus: 400,
          responseRef: "400-validation",
        },
      },
    });
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });

  it("errorCatalog 省略 accept (optional)", () => {
    expect(validate({ ...base })).toBe(true);
  });

  it("errorCatalog 空オブジェクト accept", () => {
    expect(validate({ ...base, errorCatalog: {} })).toBe(true);
  });

  it("ErrorCatalogEntry の未知フィールドは reject", () => {
    expect(validate({
      ...base,
      errorCatalog: {
        FOO: { httpStatus: 400, unknownField: "x" },
      },
    })).toBe(false);
  });

  it("httpStatus 範囲外は reject", () => {
    expect(validate({
      ...base,
      errorCatalog: { FOO: { httpStatus: 99 } },
    })).toBe(false);
  });
});

describe("process-flow.schema.json — 明示的な negative ケース", () => {
  it("必須フィールド欠落で reject される", () => {
    const invalid = {
      id: "a", name: "x", type: "screen", description: "", actions: [],
      createdAt: "2026-01-01T00:00:00Z",
      // updatedAt 欠落
    };
    expect(validate(invalid)).toBe(false);
  });

  it("未知の type で reject される", () => {
    const invalid = {
      id: "a", name: "x", type: "screen", description: "", actions: [
        {
          id: "act1", name: "ボタン", trigger: "click",
          steps: [
            { id: "s1", type: "UNKNOWN_TYPE", description: "" },
          ],
        },
      ],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    expect(validate(invalid)).toBe(false);
  });

  it("maturity が enum 外だと reject", () => {
    const invalid = {
      id: "a", name: "x", type: "screen", description: "", actions: [],
      maturity: "FINAL",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    expect(validate(invalid)).toBe(false);
  });
});
