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
