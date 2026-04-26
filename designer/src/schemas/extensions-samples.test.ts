import { describe, it, expect } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join, basename } from "node:path";

const repoRoot = resolve(__dirname, "../../../");
const samplesDir = resolve(repoRoot, "docs/sample-project/extensions");
const schemasDir = resolve(repoRoot, "schemas");

/**
 * ファイル名 → スキーマ種別の対応
 * field-types.json → extensions-field-types.schema.json
 */
function schemaPathForSample(fileName: string): string | null {
  // README.md など JSON 以外は除外
  if (!fileName.endsWith(".json")) return null;
  const kind = basename(fileName, ".json"); // e.g. "field-types"
  return join(schemasDir, `extensions-${kind}.schema.json`);
}

const sampleFiles = readdirSync(samplesDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => ({
    file: f,
    samplePath: join(samplesDir, f),
    schemaPath: schemaPathForSample(f)!,
  }));

describe("docs/sample-project/extensions — スキーマバリデーション", () => {
  it("検証対象のサンプルファイルが 1 件以上存在する", () => {
    expect(sampleFiles.length).toBeGreaterThan(0);
  });

  it.each(sampleFiles)("$file が対応スキーマで valid", ({ file, samplePath, schemaPath }) => {
    const sample = JSON.parse(readFileSync(samplePath, "utf-8")) as unknown;
    const schema = JSON.parse(readFileSync(schemaPath, "utf-8")) as object;

    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    const ok = validate(sample);

    if (!ok) {
      throw new Error(
        `${file} failed schema validation:\n${JSON.stringify(validate.errors, null, 2)}`
      );
    }
    expect(ok).toBe(true);
  });
});
