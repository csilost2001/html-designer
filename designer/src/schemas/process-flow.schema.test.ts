import { describe, it, expect, beforeAll } from "vitest";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const repoRoot = resolve(__dirname, "../../../");
const schemaPath = resolve(repoRoot, "schemas/process-flow.schema.json");
const samplesDir = resolve(repoRoot, "docs/sample-project/process-flows");

let validate: ValidateFunction;

beforeAll(() => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
  validate = ajv.compile(schema);
});

describe("process-flow.schema.json - LogStep / AuditStep (#397)", () => {
  const makeFlow = (step: object) => ({
    id: "a", name: "x", type: "screen", description: "",
    actions: [{
      id: "act-1", name: "test", trigger: "submit",
      steps: [step],
    }],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  });

  it("LogStep validates", () => {
    const ok = validate(makeFlow({
      id: "log-1", type: "log", description: "", level: "info", message: "ok",
    }));
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });

  it("LogStep missing level fails", () => {
    expect(validate(makeFlow({
      id: "log-1", type: "log", description: "", message: "ok",
    }))).toBe(false);
  });

  it("LogStep missing message fails", () => {
    expect(validate(makeFlow({
      id: "log-1", type: "log", description: "", level: "info",
    }))).toBe(false);
  });

  it("LogStep invalid level fails", () => {
    expect(validate(makeFlow({
      id: "log-1", type: "log", description: "", level: "critical", message: "ok",
    }))).toBe(false);
  });

  it("AuditStep validates", () => {
    const ok = validate(makeFlow({
      id: "audit-1", type: "audit", description: "", action: "order.create",
    }));
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });

  it("AuditStep missing action fails", () => {
    expect(validate(makeFlow({
      id: "audit-1", type: "audit", description: "",
    }))).toBe(false);
  });

  it("AuditStep invalid result fails", () => {
    expect(validate(makeFlow({
      id: "audit-1", type: "audit", description: "", action: "order.create", result: "partial",
    }))).toBe(false);
  });

  it("AuditStep sensitive non-boolean fails", () => {
    expect(validate(makeFlow({
      id: "audit-1", type: "audit", description: "", action: "order.create", sensitive: "true",
    }))).toBe(false);
  });

  it("AuditStep with resource validates", () => {
    const ok = validate(makeFlow({
      id: "audit-1", type: "audit", description: "", action: "order.create",
      resource: { type: "Order", id: "@orderId" },
    }));
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });

  it("AuditStep resource missing type or id fails", () => {
    expect(validate(makeFlow({
      id: "audit-1", type: "audit", description: "", action: "order.create",
      resource: { id: "@orderId" },
    }))).toBe(false);
    expect(validate(makeFlow({
      id: "audit-1", type: "audit", description: "", action: "order.create",
      resource: { type: "Order" },
    }))).toBe(false);
  });
});

describe("process-flow.schema.json — docs/sample-project/process-flows/*.json", () => {
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

describe("process-flow.schema.json — secretsCatalog (#261 v1.6)", () => {
  const base = {
    id: "a", name: "x", type: "screen", description: "",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  it("secretsCatalog 全 source (env/vault/file) accept", () => {
    const ok = validate({
      ...base,
      secretsCatalog: {
        stripeKey: { source: "env", name: "STRIPE_SECRET_KEY", rotationDays: 90 },
        dbPass: { source: "vault", name: "secret/db/main", description: "main DB" },
        devSsh: { source: "file", name: "/etc/secrets/dev.pem" },
      },
      actions: [],
    });
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });

  it("source が enum 外なら reject", () => {
    expect(validate({
      ...base,
      secretsCatalog: { x: { source: "aws", name: "foo" } },
      actions: [],
    })).toBe(false);
  });

  it("source / name 欠落は reject", () => {
    expect(validate({
      ...base,
      secretsCatalog: { x: { source: "env" } },
      actions: [],
    })).toBe(false);
    expect(validate({
      ...base,
      secretsCatalog: { x: { name: "foo" } },
      actions: [],
    })).toBe(false);
  });
});

describe("process-flow.schema.json — ambientVariables + fieldErrorsVar (#261 v1.4)", () => {
  const base = {
    id: "a", name: "x", type: "screen", description: "",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  it("ambientVariables + ValidationStep.fieldErrorsVar accept", () => {
    const ok = validate({
      ...base,
      ambientVariables: [
        { name: "requestId", type: "string", required: true },
        { name: "traceId", type: "string" },
        { name: "fieldErrors", type: { kind: "custom", label: "Record<string, string>" } },
      ],
      actions: [{
        id: "a1", name: "f", trigger: "click",
        steps: [{
          id: "s1", type: "validation", description: "",
          conditions: "",
          rules: [{ field: "x", type: "required" }],
          fieldErrorsVar: "fieldErrors",
        }],
      }],
    });
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });

  it("ambientVariables 省略 accept", () => {
    expect(validate({ ...base, actions: [] })).toBe(true);
  });

  it("ambientVariables.items が StructuredField 型外なら reject", () => {
    expect(validate({
      ...base,
      ambientVariables: [{ foo: "bar" }],
      actions: [],
    })).toBe(false);
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

describe("process-flow.schema.json — StructuredField.format + ValidationRule.maxRef/minRef (#253 v1.3)", () => {
  const makeGroup = (action: object) => ({
    id: "a", name: "x", type: "screen", description: "",
    actions: [action],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  });

  const baseAction = {
    id: "act-1", name: "test", trigger: "submit",
    steps: [{ id: "s1", type: "other", description: "" }],
  };

  it("StructuredField.format accept (@conv.numbering 参照)", () => {
    const ok = validate(makeGroup({
      ...baseAction,
      outputs: [{ name: "poNumber", type: "string", format: "@conv.numbering.orderNumber" }],
    }));
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });

  it("StructuredField.format accept (任意文字列)", () => {
    const ok = validate(makeGroup({
      ...baseAction,
      outputs: [{ name: "code", type: "string", format: "^[A-Z]{3}-\\d{4}$" }],
    }));
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });

  it("StructuredField.format + description 併記 accept", () => {
    const ok = validate(makeGroup({
      ...baseAction,
      outputs: [{
        name: "poNumber", type: "string",
        format: "@conv.numbering.orderNumber",
        description: "ORD-YYYY-NNNN 形式",
      }],
    }));
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });

  it("ValidationRule.maxRef accept (@conv.limit 参照)", () => {
    const ok = validate(makeGroup({
      ...baseAction,
      steps: [{
        id: "s1", type: "validation", description: "",
        conditions: "",
        rules: [{ field: "qty", type: "range", min: 1, maxRef: "@conv.limit.quantityMax", message: "@conv.msg.outOfRange" }],
      }],
    }));
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });

  it("ValidationRule.minRef accept (@conv.limit 参照)", () => {
    const ok = validate(makeGroup({
      ...baseAction,
      steps: [{
        id: "s1", type: "validation", description: "",
        conditions: "",
        rules: [{ field: "qty", type: "range", minRef: "@conv.limit.quantityMin", max: 9999 }],
      }],
    }));
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });

  it("ValidationRule.min + maxRef 混在 accept", () => {
    const ok = validate(makeGroup({
      ...baseAction,
      steps: [{
        id: "s1", type: "validation", description: "",
        conditions: "",
        rules: [{ field: "qty", type: "range", min: 1, maxRef: "@conv.limit.quantityMax" }],
      }],
    }));
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });
});

describe("process-flow.schema.json — OutputBindingObject.initialValue JSON 値 (#253 #378)", () => {
  const base = {
    id: "a", name: "x", type: "screen", description: "",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  it("initialValue: [] (実 JSON 配列) accept", () => {
    const ok = validate({
      ...base,
      actions: [{
        id: "a1", name: "f", trigger: "click",
        steps: [{
          id: "s1", type: "compute", description: "",
          expression: "@line",
          outputBinding: { name: "lines", operation: "push", initialValue: [] },
        }],
      }],
    });
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });

  it("initialValue: 0 (数値) accept", () => {
    const ok = validate({
      ...base,
      actions: [{
        id: "a1", name: "f", trigger: "click",
        steps: [{
          id: "s1", type: "compute", description: "",
          expression: "@line.amount",
          outputBinding: { name: "subtotal", operation: "accumulate", initialValue: 0 },
        }],
      }],
    });
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });

  it("initialValue: {} (空オブジェクト) accept", () => {
    expect(validate({
      ...base,
      actions: [{
        id: "a1", name: "f", trigger: "click",
        steps: [{
          id: "s1", type: "compute", description: "",
          expression: "{ ...@acc, [@key]: @val }",
          outputBinding: { name: "result", operation: "assign", initialValue: {} },
        }],
      }],
    })).toBe(true);
  });

  it("initialValue: 文字列式 '[]' も引き続き accept (後方互換)", () => {
    expect(validate({
      ...base,
      actions: [{
        id: "a1", name: "f", trigger: "click",
        steps: [{
          id: "s1", type: "compute", description: "",
          expression: "@line",
          outputBinding: { name: "lines", operation: "push", initialValue: "[]" },
        }],
      }],
    })).toBe(true);
  });
});

describe("process-flow.schema.json — HttpResponseSpec.bodySchema {schema} inline (#253 #378)", () => {
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

  it("bodySchema: {schema} インライン JSON Schema accept", () => {
    const ok = validate(withResponses([{
      id: "200", status: 200,
      bodySchema: {
        schema: {
          type: "object",
          required: ["sessionId", "userId"],
          properties: {
            sessionId: { type: "string" },
            userId: { type: "integer" },
            permissions: { type: "array", items: { type: "string" } },
          },
        },
      },
    }]));
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });

  it("bodySchema: {typeRef} 型カタログ参照 accept", () => {
    expect(validate(withResponses([{ id: "200", status: 200, bodySchema: { typeRef: "LoginResponse" } }]))).toBe(true);
  });

  it("bodySchema: string (旧形式) 後方互換 accept", () => {
    expect(validate(withResponses([{ id: "200", status: 200, bodySchema: "LoginResponse" }]))).toBe(true);
  });
});

describe("process-flow.schema.json — ReturnStep.responseRef スキーマ検証 (#378)", () => {
  const base = {
    id: "a", name: "x", type: "screen", description: "",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  it("ReturnStep.responseRef 任意文字列 accept (参照整合性はランタイム)", () => {
    const ok = validate({
      ...base,
      actions: [{
        id: "a1", name: "f", trigger: "click",
        responses: [{ id: "201-created", status: 201 }],
        steps: [{
          id: "s1", type: "return", description: "",
          responseRef: "201-created",
          bodyExpression: "{ poId: @newOrder.id }",
        }],
      }],
    });
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });

  it("responseRef 省略 accept (optional)", () => {
    expect(validate({
      ...base,
      actions: [{
        id: "a1", name: "f", trigger: "click",
        steps: [{ id: "s1", type: "return", description: "" }],
      }],
    })).toBe(true);
  });
});

describe("process-flow.schema.json — ExternalSystemStep auth structured (#253 #378)", () => {
  const base = {
    id: "a", name: "x", type: "screen", description: "",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  it("auth.kind=bearer + secretsCatalog + idempotencyKey + headers フル構成 accept", () => {
    const ok = validate({
      ...base,
      secretsCatalog: { stripeKey: { source: "env", name: "STRIPE_SECRET_KEY" } },
      externalSystemCatalog: {
        stripe: {
          name: "Stripe Japan",
          baseUrl: "https://api.stripe.com",
          auth: { kind: "bearer", tokenRef: "@secret.stripeKey" },
          headers: { "Stripe-Version": "2024-06-20" },
        },
      },
      actions: [{
        id: "a1", name: "f", trigger: "click",
        steps: [{
          id: "s1", type: "externalSystem", description: "",
          systemName: "Stripe", systemRef: "stripe",
          httpCall: { method: "POST", path: "/v1/payment_intents" },
          idempotencyKey: "order-@registeredOrder.id",
          headers: { "X-Trace-Id": "@requestId" },
          auth: { kind: "bearer", tokenRef: "@secret.stripeKey" },
        }],
      }],
    });
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });
});

describe("process-flow.schema.json — DbAccessStep.bulkValues + BranchStep.tryScope (#253)", () => {
  const makeGroup = (action: object) => ({
    id: "a", name: "x", type: "screen", description: "",
    actions: [action],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  });

  const baseAction = {
    id: "act-1", name: "test", trigger: "submit",
    steps: [{ id: "s1", type: "other", description: "" }],
  };

  it("DbAccessStep.bulkValues accept", () => {
    const ok = validate(makeGroup({
      ...baseAction,
      steps: [{
        id: "s1", type: "dbAccess", description: "",
        tableName: "items", operation: "INSERT",
        bulkValues: "@poItemValues",
        sql: "INSERT INTO items SELECT ... FROM (VALUES @poItemValues) AS v(...)",
      }],
    }));
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });

  it("DbAccessStep.bulkValues なしも accept (optional)", () => {
    const ok = validate(makeGroup({
      ...baseAction,
      steps: [{
        id: "s1", type: "dbAccess", description: "",
        tableName: "items", operation: "SELECT",
        sql: "SELECT * FROM items",
      }],
    }));
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });

  it("BranchStep.tryScope accept", () => {
    const ok = validate(makeGroup({
      ...baseAction,
      steps: [{
        id: "s1", type: "branch", description: "",
        tryScope: ["step-db-insert", "step-inventory-update"],
        branches: [{
          id: "br-1", code: "A", label: "catch",
          condition: { kind: "tryCatch", errorCode: "DEADLOCK" },
          steps: [],
        }],
      }],
    }));
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });

  it("BranchStep.tryScope なしも accept (optional)", () => {
    const ok = validate(makeGroup({
      ...baseAction,
      steps: [{
        id: "s1", type: "branch", description: "",
        branches: [{
          id: "br-1", code: "A", label: "x",
          condition: "@val == null",
          steps: [],
        }],
      }],
    }));
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });
});

describe("process-flow.schema.json — Sla 3 レベル + p95LatencyMs + 条件付き errorCode (#412)", () => {
  const ts = {
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  it("3 レベル (Flow / Action / Step) すべてに sla を含む process-flow が valid", () => {
    const ok = validate({
      id: "a", name: "x", type: "screen", description: "",
      sla: { timeoutMs: 30000, p95LatencyMs: 5000, warningThresholdMs: 20000, onTimeout: "log" },
      actions: [{
        id: "act-1", name: "submit", trigger: "submit",
        sla: { timeoutMs: 5000, p95LatencyMs: 500, onTimeout: "throw", errorCode: "ACTION_TIMEOUT" },
        steps: [{
          id: "s1", type: "dbAccess", description: "",
          tableName: "orders", operation: "SELECT",
          sla: { timeoutMs: 1000, p95LatencyMs: 100, onTimeout: "compensate", errorCode: "DB_TIMEOUT" },
        }],
      }],
      ...ts,
    });
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });

  it("onTimeout: \"abort\" (enum 外) は reject", () => {
    expect(validate({
      id: "a", name: "x", type: "screen", description: "",
      sla: { timeoutMs: 1000, onTimeout: "abort", errorCode: "X" },
      actions: [],
      ...ts,
    })).toBe(false);
  });

  it("timeoutMs: -1 (minimum 違反) は reject", () => {
    expect(validate({
      id: "a", name: "x", type: "screen", description: "",
      sla: { timeoutMs: -1 },
      actions: [],
      ...ts,
    })).toBe(false);
  });

  it("onTimeout: \"throw\" で errorCode 無しは reject (条件付き必須)", () => {
    expect(validate({
      id: "a", name: "x", type: "screen", description: "",
      sla: { timeoutMs: 1000, onTimeout: "throw" },
      actions: [],
      ...ts,
    })).toBe(false);
  });

  it("onTimeout: \"compensate\" で errorCode 無しは reject (条件付き必須)", () => {
    expect(validate({
      id: "a", name: "x", type: "screen", description: "",
      sla: { timeoutMs: 1000, onTimeout: "compensate" },
      actions: [],
      ...ts,
    })).toBe(false);
  });

  it("onTimeout: \"log\" で errorCode 無しは accept (errorCode 不要)", () => {
    const ok = validate({
      id: "a", name: "x", type: "screen", description: "",
      sla: { timeoutMs: 1000, onTimeout: "log" },
      actions: [],
      ...ts,
    });
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });
});

describe("process-flow.schema.json — ambientOverrides (#369)", () => {
  const base = {
    id: "a", name: "x", type: "screen", description: "",
    actions: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  it("ambientOverrides (Record<string, string>) accept", () => {
    const ok = validate({
      ...base,
      ambientOverrides: {
        "currency": "@conv.currency.usd",
        "scope.timezone": "UTC",
      },
    });
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });

  it("ambientOverrides 省略 accept", () => {
    expect(validate({ ...base })).toBe(true);
  });

  it("ambientOverrides の value が string 以外 (number) なら reject", () => {
    expect(validate({
      ...base,
      ambientOverrides: { "currency": 123 },
    })).toBe(false);
  });
});
