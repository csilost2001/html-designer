import { describe, it, expect, beforeAll } from "vitest";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join, basename } from "node:path";

const repoRoot = resolve(__dirname, "../../../");
const samplesDir = resolve(repoRoot, "docs/sample-project/extensions");
const schemasDir = resolve(repoRoot, "schemas");

/**
 * ファイル名 → スキーマ種別の対応
 * field-types.json → extensions-field-types.schema.json
 * ※ .json 以外は呼び出し元でフィルタ済みのため常に string を返す
 */
function schemaPathForSample(fileName: string): string {
  const kind = basename(fileName, ".json"); // e.g. "field-types"
  const rootPath = join(schemasDir, `extensions-${kind}.schema.json`);
  return existsSync(rootPath) ? rootPath : join(schemasDir, "v1", `extensions-${kind}.schema.json`);
}

const sampleFiles = readdirSync(samplesDir, { recursive: true })
  .filter((f) => f.endsWith(".json"))
  .map((f) => ({
    file: f,
    samplePath: join(samplesDir, f),
    schemaPath: schemaPathForSample(f),
  }));

let ajv: Ajv2020;

beforeAll(() => {
  ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
});

describe("docs/sample-project/extensions — スキーマバリデーション", () => {
  it("検証対象のサンプルファイルが 1 件以上存在する", () => {
    expect(sampleFiles.length).toBeGreaterThan(0);
  });

  it.each(sampleFiles)("$file が対応スキーマで valid", ({ file, samplePath, schemaPath }) => {
    const sample = JSON.parse(readFileSync(samplePath, "utf-8")) as unknown;
    const schema = JSON.parse(readFileSync(schemaPath, "utf-8")) as { $id?: string };

    const validate: ValidateFunction = schema.$id
      ? ajv.getSchema(schema.$id) ?? ajv.compile(schema)
      : ajv.compile(schema);
    const ok = validate(sample);

    if (!ok) {
      throw new Error(
        `${file} failed schema validation:\n${JSON.stringify(validate.errors, null, 2)}`
      );
    }
    expect(ok).toBe(true);
  });
});
