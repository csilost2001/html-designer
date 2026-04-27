import { describe, it, expect, beforeAll } from "vitest";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const repoRoot = resolve(__dirname, "../../../");
const v3Dir = resolve(repoRoot, "schemas/v3");
const samplesV3Dir = resolve(repoRoot, "docs/sample-project-v3");

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf-8"));
}

let ajv: Ajv2020;
let validateProject: ValidateFunction;
let validateScreen: ValidateFunction;
let validateTable: ValidateFunction;
let validateProcessFlow: ValidateFunction;
let validateExtension: ValidateFunction;

beforeAll(() => {
  ajv = new Ajv2020({ allErrors: true, strict: false, discriminator: true });
  addFormats(ajv);
  ajv.addSchema(loadJson(join(v3Dir, "common.v3.schema.json")) as object);
  ajv.addSchema(loadJson(join(v3Dir, "screen-item.v3.schema.json")) as object);
  validateProject = ajv.compile(loadJson(join(v3Dir, "project.v3.schema.json")) as object);
  validateScreen = ajv.compile(loadJson(join(v3Dir, "screen.v3.schema.json")) as object);
  validateTable = ajv.compile(loadJson(join(v3Dir, "table.v3.schema.json")) as object);
  validateProcessFlow = ajv.compile(loadJson(join(v3Dir, "process-flow.v3.schema.json")) as object);
  validateExtension = ajv.compile(loadJson(join(v3Dir, "extensions.v3.schema.json")) as object);
});

function dumpErrors(file: string, validate: ValidateFunction): string {
  const errs = validate.errors ?? [];
  return `${file}\n${errs.map((e) => `  ${e.instancePath || "<root>"} ${e.keyword}: ${e.message ?? ""}`).join("\n")}`;
}

describe("schema v3 dogfood samples (#523)", () => {
  it("project.json validates against project.v3.schema.json", () => {
    const file = join(samplesV3Dir, "project.json");
    const data = loadJson(file);
    const ok = validateProject(data);
    expect(ok, ok ? "" : dumpErrors(file, validateProject)).toBe(true);
  });

  it("table samples validate against table.v3.schema.json", () => {
    const dir = join(samplesV3Dir, "tables");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const file = join(dir, f);
      const data = loadJson(file);
      const ok = validateTable(data);
      expect(ok, ok ? "" : dumpErrors(file, validateTable)).toBe(true);
    }
  });

  it("screen samples validate against screen.v3.schema.json", () => {
    const dir = join(samplesV3Dir, "screens");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const file = join(dir, f);
      const data = loadJson(file);
      const ok = validateScreen(data);
      expect(ok, ok ? "" : dumpErrors(file, validateScreen)).toBe(true);
    }
  });

  it("process-flow samples validate against process-flow.v3.schema.json", () => {
    const dir = join(samplesV3Dir, "process-flows");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const file = join(dir, f);
      const data = loadJson(file);
      const ok = validateProcessFlow(data);
      expect(ok, ok ? "" : dumpErrors(file, validateProcessFlow)).toBe(true);
    }
  });

  it("extension samples validate against extensions.v3.schema.json", () => {
    const dir = join(samplesV3Dir, "extensions");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const file = join(dir, f);
      const data = loadJson(file);
      const ok = validateExtension(data);
      expect(ok, ok ? "" : dumpErrors(file, validateExtension)).toBe(true);
    }
  });

  it("F-2: ExtensionStep can declare lineage at top-level (StepBaseProps への移植)", () => {
    const fixture = {
      meta: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "F-2 lineage 透過テスト",
        createdAt: "2026-04-27T00:00:00.000Z",
        updatedAt: "2026-04-27T00:00:00.000Z",
        kind: "screen",
      },
      actions: [
        {
          id: "act-001",
          name: "extension step lineage test",
          trigger: "submit",
          steps: [
            {
              id: "step-01",
              kind: "retail:CartManageStep",
              description: "ExtensionStep が lineage を top-level に持てる (StepBaseProps から継承)",
              lineage: {
                writes: [
                  { tableId: "eb574288-88f2-419f-ac5e-56a9948e8f46", purpose: "upsert" },
                ],
              },
              config: {
                cartId: "cart-001",
                productCode: "PROD001",
                quantity: 2,
              },
            },
          ],
        },
      ],
    };
    const ok = validateProcessFlow(fixture);
    expect(ok, ok ? "" : dumpErrors("F-2 fixture", validateProcessFlow)).toBe(true);
  });

  it("F-4: BranchCondition の不正 kind は discriminator で 1 branch のみエラー", () => {
    // 不正な kind を持つ BranchCondition を Step.branches[0].condition に置く
    const fixture = {
      meta: {
        id: "22222222-2222-4222-8222-222222222222",
        name: "F-4 discriminator テスト",
        createdAt: "2026-04-27T00:00:00.000Z",
        updatedAt: "2026-04-27T00:00:00.000Z",
        kind: "screen",
      },
      actions: [
        {
          id: "act-001",
          name: "branch discriminator test",
          trigger: "submit",
          steps: [
            {
              id: "step-01",
              kind: "branch",
              description: "BranchCondition kind ミスマッチで discriminator が効くか",
              branches: [
                {
                  id: "br-01-a",
                  code: "A",
                  condition: { kind: "invalidKind", expression: "@x" },
                  steps: [],
                },
              ],
            },
          ],
        },
      ],
    };
    const ok = validateProcessFlow(fixture);
    expect(ok).toBe(false);
    // discriminator が効いていれば、kind の値ミスマッチエラーが先頭に出る
    const errs = validateProcessFlow.errors ?? [];
    const discriminatorErr = errs.find(
      (e) => e.keyword === "discriminator" || (e.message ?? "").includes("discriminator"),
    );
    expect(discriminatorErr).toBeDefined();
  });
});
