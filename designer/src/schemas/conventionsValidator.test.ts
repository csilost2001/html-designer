import { describe, it, expect } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { checkConventionReferences, type ConventionsCatalog } from "./conventionsValidator";
import type { ActionGroup } from "../types/action";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const repoRoot = resolve(__dirname, "../../../");
const catalogPath = resolve(repoRoot, "docs/sample-project/conventions/conventions-catalog.json");
const catalogSchemaPath = resolve(repoRoot, "schemas/conventions.schema.json");
const samplesDir = resolve(repoRoot, "docs/sample-project/actions");

function loadCatalog(): ConventionsCatalog {
  return JSON.parse(readFileSync(catalogPath, "utf-8")) as ConventionsCatalog;
}

function makeGroup(partial: Partial<ActionGroup>): ActionGroup {
  return {
    id: "a", name: "x", type: "screen", description: "",
    actions: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...partial,
  } as ActionGroup;
}

describe("conventions-catalog.json がスキーマに適合", () => {
  it("ajv でスキーマ検証 pass", () => {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    const schema = JSON.parse(readFileSync(catalogSchemaPath, "utf-8"));
    const catalog = JSON.parse(readFileSync(catalogPath, "utf-8"));
    const validate = ajv.compile(schema);
    const ok = validate(catalog);
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });
});

describe("checkConventionReferences", () => {
  const catalog = loadCatalog();

  it("既知の @conv.msg.* は accept", () => {
    const issues = checkConventionReferences(
      makeGroup({
        actions: [{
          id: "a1", name: "f", trigger: "click",
          steps: [{
            id: "s1", type: "validation", description: "", conditions: "",
            rules: [{ field: "x", type: "required", message: "@conv.msg.required" }],
          }],
        }],
      }),
      catalog,
    );
    expect(issues).toHaveLength(0);
  });

  it("未知の @conv.msg.* を検出", () => {
    const issues = checkConventionReferences(
      makeGroup({
        actions: [{
          id: "a1", name: "f", trigger: "click",
          steps: [{
            id: "s1", type: "validation", description: "", conditions: "",
            rules: [{ field: "x", type: "required", message: "@conv.msg.unknownKey" }],
          }],
        }],
      }),
      catalog,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("UNKNOWN_CONV_MSG");
  });

  it("@conv.regex.email-simple は accept", () => {
    const issues = checkConventionReferences(
      makeGroup({
        actions: [{
          id: "a1", name: "f", trigger: "click",
          steps: [{
            id: "s1", type: "validation", description: "", conditions: "@conv.regex.email-simple",
            rules: [],
          }],
        }],
      }),
      catalog,
    );
    expect(issues).toHaveLength(0);
  });

  it("@conv.regex.unknownPattern を検出", () => {
    const issues = checkConventionReferences(
      makeGroup({
        actions: [{
          id: "a1", name: "f", trigger: "click",
          steps: [{
            id: "s1", type: "validation", description: "", conditions: "@conv.regex.unknownPattern",
            rules: [],
          }],
        }],
      }),
      catalog,
    );
    expect(issues.some((i) => i.code === "UNKNOWN_CONV_REGEX")).toBe(true);
  });

  it("@conv.limit.quantityMax は accept", () => {
    const issues = checkConventionReferences(
      makeGroup({
        actions: [{
          id: "a1", name: "f", trigger: "click",
          steps: [{
            id: "s1", type: "other", description: "上限 @conv.limit.quantityMax まで",
          }],
        }],
      }),
      catalog,
    );
    expect(issues).toHaveLength(0);
  });

  it("未知のカテゴリ @conv.xxx.* は UNKNOWN_CONV_CATEGORY", () => {
    const issues = checkConventionReferences(
      makeGroup({
        actions: [{
          id: "a1", name: "f", trigger: "click",
          steps: [{
            id: "s1", type: "other", description: "@conv.color.red",
          }],
        }],
      }),
      catalog,
    );
    expect(issues.some((i) => i.code === "UNKNOWN_CONV_CATEGORY")).toBe(true);
  });

  it("catalog が null (未ロード) なら検査スキップ", () => {
    const issues = checkConventionReferences(
      makeGroup({
        actions: [{
          id: "a1", name: "f", trigger: "click",
          steps: [{
            id: "s1", type: "validation", description: "", conditions: "",
            rules: [{ field: "x", type: "required", message: "@conv.msg.anything" }],
          }],
        }],
      }),
      null,
    );
    expect(issues).toHaveLength(0);
  });
});

describe("checkConventionReferences — サンプル (docs/sample-project/actions/*.json) 横断", () => {
  const catalog = loadCatalog();
  const files = readdirSync(samplesDir).filter((f) => f.endsWith(".json"));

  for (const f of files) {
    it(`${f} の @conv.* 参照が全て解決`, () => {
      const group = JSON.parse(readFileSync(join(samplesDir, f), "utf-8")) as ActionGroup;
      const issues = checkConventionReferences(group, catalog);
      if (issues.length > 0) {
        throw new Error(
          `@conv.* 違反:\n${issues.map((i) => `  - ${i.path}: ${i.value} (${i.message})`).join("\n")}`,
        );
      }
      expect(issues).toHaveLength(0);
    });
  }
});
