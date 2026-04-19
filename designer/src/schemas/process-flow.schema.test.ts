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
