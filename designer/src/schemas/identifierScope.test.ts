import { describe, it, expect } from "vitest";
import { checkIdentifierScopes } from "./identifierScope";
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

describe("checkIdentifierScopes — inputs / outputs", () => {
  it("inputs で宣言された識別子は参照 OK", () => {
    const issues = checkIdentifierScopes(makeGroup({
      actions: [{
        id: "a1", name: "f", trigger: "click",
        inputs: [{ name: "userId", type: "number" }],
        steps: [
          { id: "s1", type: "compute", description: "", expression: "@userId + 1", outputBinding: "doubled" },
        ],
      }],
    }));
    expect(issues).toHaveLength(0);
  });

  it("@inputs 全体参照 (@inputs.items) は OK (structured inputs がある場合)", () => {
    const issues = checkIdentifierScopes(makeGroup({
      actions: [{
        id: "a1", name: "f", trigger: "click",
        inputs: [{ name: "items", type: { kind: "array", itemType: "number" } }],
        steps: [{
          id: "s1", type: "loop", description: "",
          loopKind: "collection",
          collectionSource: "@inputs.items",
          collectionItemName: "item",
          steps: [],
        }],
      }],
    }));
    expect(issues).toHaveLength(0);
  });

  it("@outputs 全体参照は OK (structured outputs がある場合)", () => {
    const issues = checkIdentifierScopes(makeGroup({
      actions: [{
        id: "a1", name: "f", trigger: "click",
        outputs: [{ name: "result", type: "string" }],
        steps: [{
          id: "s1", type: "compute", description: "",
          expression: "@outputs.result",
          outputBinding: "x",
        }],
      }],
    }));
    expect(issues).toHaveLength(0);
  });

  it("未定義 @identifier を検出", () => {
    const issues = checkIdentifierScopes(makeGroup({
      actions: [{
        id: "a1", name: "f", trigger: "click",
        steps: [
          { id: "s1", type: "compute", description: "", expression: "@unknownVar * 2", outputBinding: "r" },
        ],
      }],
    }));
    expect(issues).toHaveLength(1);
    expect(issues[0].identifier).toBe("unknownVar");
    expect(issues[0].code).toBe("UNKNOWN_IDENTIFIER");
  });
});

describe("checkIdentifierScopes — outputBinding が後続ステップで参照可能", () => {
  it("step1.outputBinding → step2 で参照 OK", () => {
    const issues = checkIdentifierScopes(makeGroup({
      actions: [{
        id: "a1", name: "f", trigger: "click",
        inputs: [{ name: "x", type: "number" }],
        steps: [
          { id: "s1", type: "compute", description: "", expression: "@x * 2", outputBinding: "doubled" },
          { id: "s2", type: "compute", description: "", expression: "@doubled + 1", outputBinding: "r" },
        ],
      }],
    }));
    expect(issues).toHaveLength(0);
  });
});

describe("checkIdentifierScopes — ambient 変数", () => {
  it("ambientVariables で宣言されれば参照 OK", () => {
    const issues = checkIdentifierScopes(makeGroup({
      ambientVariables: [{ name: "requestId", type: "string" }],
      actions: [{
        id: "a1", name: "f", trigger: "click",
        steps: [
          { id: "s1", type: "externalSystem", description: "", systemName: "x",
            idempotencyKey: "key-@requestId" },
        ],
      }],
    }));
    expect(issues).toHaveLength(0);
  });
});

describe("checkIdentifierScopes — ループ変数のスコープ", () => {
  it("ループ配下では collectionItemName が参照可能", () => {
    const issues = checkIdentifierScopes(makeGroup({
      actions: [{
        id: "a1", name: "f", trigger: "click",
        inputs: [{ name: "items", type: "string" }],
        steps: [
          {
            id: "lp", type: "loop", description: "",
            loopKind: "collection", collectionSource: "@items",
            collectionItemName: "item",
            steps: [
              { id: "s1", type: "compute", description: "", expression: "@item.quantity", outputBinding: "q" },
            ],
          },
        ],
      }],
    }));
    expect(issues).toHaveLength(0);
  });

  it("ループ外では item は未定義", () => {
    const issues = checkIdentifierScopes(makeGroup({
      actions: [{
        id: "a1", name: "f", trigger: "click",
        inputs: [{ name: "items", type: "string" }],
        steps: [
          {
            id: "lp", type: "loop", description: "",
            loopKind: "collection", collectionSource: "@items",
            collectionItemName: "item",
            steps: [],
          },
          { id: "s-after", type: "compute", description: "", expression: "@item.quantity", outputBinding: "q" },
        ],
      }],
    }));
    expect(issues.some((i) => i.identifier === "item")).toBe(true);
  });
});

describe("checkIdentifierScopes — ValidationStep.fieldErrorsVar", () => {
  it("既定 fieldErrors が ngBodyExpression で参照可能", () => {
    const issues = checkIdentifierScopes(makeGroup({
      actions: [{
        id: "a1", name: "f", trigger: "click",
        steps: [
          {
            id: "s1", type: "validation", description: "", conditions: "",
            rules: [{ field: "x", type: "required" }],
            inlineBranch: { ok: "ok", ng: "ng", ngBodyExpression: "{ errors: @fieldErrors }" },
          },
        ],
      }],
    }));
    expect(issues).toHaveLength(0);
  });

  it("カスタム fieldErrorsVar 名で宣言し参照可能", () => {
    const issues = checkIdentifierScopes(makeGroup({
      actions: [{
        id: "a1", name: "f", trigger: "click",
        steps: [
          {
            id: "s1", type: "validation", description: "", conditions: "",
            rules: [{ field: "x", type: "required" }],
            fieldErrorsVar: "myErrors",
          },
          {
            id: "s2", type: "return", description: "",
            bodyExpression: "{ errors: @myErrors }",
          },
        ],
      }],
    }));
    expect(issues).toHaveLength(0);
  });
});

describe("checkIdentifierScopes — @conv.* は検査対象外", () => {
  it("@conv.msg.* などは未定義扱いしない (別機能で解決)", () => {
    const issues = checkIdentifierScopes(makeGroup({
      actions: [{
        id: "a1", name: "f", trigger: "click",
        steps: [
          {
            id: "s1", type: "validation", description: "", conditions: "",
            rules: [{ field: "x", type: "custom", message: "@conv.msg.required" }],
          },
        ],
      }],
    }));
    expect(issues).toHaveLength(0);
  });
});

describe("checkIdentifierScopes — SQL 内の @identifier", () => {
  it("SQL 内の @ 参照も検査", () => {
    const issues = checkIdentifierScopes(makeGroup({
      actions: [{
        id: "a1", name: "f", trigger: "click",
        inputs: [{ name: "customerId", type: "number" }],
        steps: [
          {
            id: "s1", type: "dbAccess", description: "",
            tableName: "customers", operation: "SELECT",
            sql: "SELECT id FROM customers WHERE id = @customerId AND org_id = @unknownOrg",
          },
        ],
      }],
    }));
    expect(issues.some((i) => i.identifier === "unknownOrg")).toBe(true);
    expect(issues.every((i) => i.identifier !== "customerId")).toBe(true);
  });
});

describe("checkIdentifierScopes — サンプル (docs/sample-project/process-flows/*.json)", () => {
  const files = readdirSync(samplesDir).filter((f) => f.endsWith(".json"));
  for (const f of files) {
    it(`${f} の @ 参照が全て解決`, () => {
      const group = JSON.parse(readFileSync(join(samplesDir, f), "utf-8")) as ProcessFlow;
      const issues = checkIdentifierScopes(group);
      if (issues.length > 0) {
        throw new Error(
          `識別子スコープ違反:\n${issues.map((i) => `  - ${i.path}: @${i.identifier} (${i.message})`).join("\n")}`,
        );
      }
      expect(issues).toHaveLength(0);
    });
  }
});
