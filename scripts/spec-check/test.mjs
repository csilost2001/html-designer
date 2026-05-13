#!/usr/bin/env node
// scripts/spec-check/ 内 script の自動テスト。schema 更新による drift / spec 表との
// 一致を CI で gate する。
//
// Usage: node scripts/spec-check/test.mjs
// Exit code: 0 = pass, 1 = fail

import { execSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { readSpecDoc, extractFences, stripJsoncComments, parseStepCheatsheet, SPEC_DOC_PATH } from "./lib/spec-doc.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

let pass = 0;
let fail = 0;

function assert(name, cond, detail = "") {
  if (cond) {
    console.log(`  ✓ ${name}`);
    pass++;
  } else {
    console.log(`  ✗ ${name}${detail ? `: ${detail}` : ""}`);
    fail++;
  }
}

function runScript(scriptName, args = [], opts = {}) {
  const result = spawnSync("node", [join(__dirname, scriptName), ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 30_000, // 30s timeout — extract / lint は秒未満で終わる前提、hang は immediate fail
    ...opts,
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status,
    signal: result.signal, // SIGTERM 等 (timeout 時)
    error: result.error, // spawn 失敗時の Error
  };
}

// =============================================================================
// Schema 読み込み (full snapshot test 用)
// =============================================================================
const schemaJson = JSON.parse(readFileSync(join(ROOT, "schemas/v3/process-flow.v3.schema.json"), "utf8"));
const $defs = schemaJson.$defs;

// =============================================================================
// 1. extract-step-required.mjs FULL snapshot test (24 row 全件 exact compare)
// =============================================================================
console.log("\n## extract-step-required.mjs (full snapshot)");
{
  const { stdout, status, signal, error } = runScript("extract-step-required.mjs");
  if (error) console.log(`  (spawn error: ${error.message})`);
  if (signal) console.log(`  (signal: ${signal})`);
  assert("exits 0", status === 0);
  assert("Total: 24 step kinds output", /Total: 24 step kinds/.test(stdout));
  assert("no `?` placeholder", !/^- `\?`/m.test(stdout), "kind 未解決の variant が残存");

  // schema から動的に 24 step variant の (kind, required - [id,kind,description]) を抽出
  const stepUnion = $defs.Step.oneOf.map((r) => r.$ref.replace("#/$defs/", ""));
  for (const stepName of stepUnion) {
    const def = $defs[stepName];
    if (!def?.allOf || def.allOf.length < 2) continue;
    const variant = def.allOf[1];
    const required = variant.required || [];
    const kindConst = variant.properties?.kind?.const
      ?? (stepName === "ExtensionStep" ? "extension" : "?");
    const extra = required.filter((r) => !["id", "kind", "description"].includes(r));
    const expected = extra.length > 0 ? extra.join(", ") : "(なし)";
    // 行末まで含めた逐字一致
    const lineRegex = new RegExp(`^- \`${kindConst}\` → ${expected.replace(/[()]/g, "\\$&")}$`, "m");
    assert(`row exact match: \`${kindConst}\` → ${expected}`, lineRegex.test(stdout));
  }
}

// =============================================================================
// 2. extract-nested-required.mjs FULL snapshot test (全 nested $defs 動的検証)
// =============================================================================
console.log("\n## extract-nested-required.mjs (full snapshot)");
{
  const { stdout, status, signal, error } = runScript("extract-nested-required.mjs");
  if (error) console.log(`  (spawn error: ${error.message})`);
  if (signal) console.log(`  (signal: ${signal})`);
  assert("exits 0", status === 0);

  // script が列挙している全 nested def を実 schema から検証
  const nestedDefs = [
    "Branch", "ElseBranch", "BranchCondition",
    "ValidationRule", "ValidationInlineBranch",
    "WorkflowApprover", "WorkflowQuorum",
    "AiMessage", "AiMessageItem", "AiTool", "AiToolRef", "AiToolChoice", "AiResponseFormat",
    "AffectedRowsCheck", "DataLineage",
    "CdcDestination",
    "OutputBinding", "TxBoundary",
  ];
  for (const name of nestedDefs) {
    const def = $defs[name];
    if (!def) {
      // script が「not found in $defs」と出力するはず
      assert(`${name}: marked as "not found"`, new RegExp(`${name}: \\(not found`).test(stdout));
      continue;
    }
    if (def.oneOf) {
      // oneOf variant ごとに required を確認
      def.oneOf.forEach((variant, i) => {
        const req = (variant.required || []).join(", ");
        const expected = `    variant ${i}: required = [${req}]`;
        assert(
          `${name} variant ${i}: required = [${req}]`,
          stdout.includes(expected)
        );
      });
    } else {
      const req = (def.required || []).join(", ");
      const expected = `- ${name}: required = [${req}]`;
      assert(`${name}: required = [${req}]`, stdout.includes(expected));
    }
  }
}

// =============================================================================
// 3. lint-generic-definitions.mjs fixture test (正例 + 負例)
// =============================================================================
console.log("\n## lint-generic-definitions.mjs (fixture)");
const FIXTURE_ROOT = join(ROOT, ".tmp/spec-check-fixtures");
try {
  // 既存があれば削除して clean state
  rmSync(FIXTURE_ROOT, { recursive: true, force: true });

  // (A) Valid project
  const validRoot = join(FIXTURE_ROOT, "valid-project");
  mkdirSync(join(validRoot, "harmony/generic-definitions/data-contract"), { recursive: true });
  writeFileSync(
    join(validRoot, "harmony.json"),
    JSON.stringify({ schemaVersion: "v3", dataDir: "harmony", meta: { id: "00000000-0000-4000-8000-000000000001", name: "test", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" } }, null, 2)
  );
  writeFileSync(
    join(validRoot, "harmony/generic-definitions/data-contract/OrderForm.json"),
    JSON.stringify({
      kind: "data-contract",
      name: "OrderForm",
      purpose: "注文フォーム",
      responsibilities: ["注文入力値保持"],
      targets: ["backend", "frontend"],
    }, null, 2)
  );
  {
    const { status } = runScript("lint-generic-definitions.mjs", [validRoot]);
    assert("valid project exits 0", status === 0);
  }

  // (B) Invalid: kind enum 違反
  const invalidKindRoot = join(FIXTURE_ROOT, "invalid-kind");
  mkdirSync(join(invalidKindRoot, "harmony/generic-definitions/data-contract"), { recursive: true });
  writeFileSync(
    join(invalidKindRoot, "harmony.json"),
    JSON.stringify({ schemaVersion: "v3", dataDir: "harmony", meta: { id: "00000000-0000-4000-8000-000000000002", name: "test", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" } })
  );
  writeFileSync(
    join(invalidKindRoot, "harmony/generic-definitions/data-contract/Bad.json"),
    JSON.stringify({ kind: "unknown-kind", name: "Bad", purpose: "x", responsibilities: [], targets: ["backend"] })
  );
  {
    const { status, stdout } = runScript("lint-generic-definitions.mjs", [invalidKindRoot]);
    assert("invalid-kind exits 1", status === 1);
    assert("error mentions kind", /invalid kind/.test(stdout));
  }

  // (C) Invalid: path/kind mismatch
  const mismatchRoot = join(FIXTURE_ROOT, "path-mismatch");
  mkdirSync(join(mismatchRoot, "harmony/generic-definitions/domain-type"), { recursive: true });
  writeFileSync(
    join(mismatchRoot, "harmony.json"),
    JSON.stringify({ schemaVersion: "v3", dataDir: "harmony", meta: { id: "00000000-0000-4000-8000-000000000003", name: "test", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" } })
  );
  writeFileSync(
    join(mismatchRoot, "harmony/generic-definitions/domain-type/Foo.json"),
    JSON.stringify({ kind: "data-contract", name: "Foo", purpose: "x", responsibilities: [], targets: ["backend"] })
  );
  {
    const { status, stdout } = runScript("lint-generic-definitions.mjs", [mismatchRoot]);
    assert("path/kind mismatch exits 1", status === 1);
    assert("error mentions path/kind mismatch", /path\/kind mismatch/.test(stdout));
  }

  // (D) Invalid: 必須 field 欠落
  const missingRoot = join(FIXTURE_ROOT, "missing-field");
  mkdirSync(join(missingRoot, "harmony/generic-definitions/data-contract"), { recursive: true });
  writeFileSync(
    join(missingRoot, "harmony.json"),
    JSON.stringify({ schemaVersion: "v3", dataDir: "harmony", meta: { id: "00000000-0000-4000-8000-000000000004", name: "test", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" } })
  );
  writeFileSync(
    join(missingRoot, "harmony/generic-definitions/data-contract/Missing.json"),
    JSON.stringify({ kind: "data-contract", name: "Missing" })
  );
  {
    const { status, stdout } = runScript("lint-generic-definitions.mjs", [missingRoot]);
    assert("missing-field exits 1", status === 1);
    assert("error mentions missing required", /missing required field/.test(stdout));
  }

  // (D2) 空 generic-definitions/ → nothing to lint (exit 2、S-1/round5 fix)
  const emptyRoot = join(FIXTURE_ROOT, "empty-gd");
  mkdirSync(join(emptyRoot, "harmony/generic-definitions"), { recursive: true });
  writeFileSync(
    join(emptyRoot, "harmony.json"),
    JSON.stringify({ schemaVersion: "v3", dataDir: "harmony", meta: { id: "00000000-0000-4000-8000-000000000005", name: "test", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" } })
  );
  {
    const { status, stdout } = runScript("lint-generic-definitions.mjs", [emptyRoot]);
    assert("空 generic-definitions/ は exit 2 (silent pass 禁止)", status === 2, `status=${status}`);
    assert("error message: nothing to lint", /nothing to lint/.test(stdout));
  }

  // (E) harmony.json 不在 → error (S-4 fix)
  const noHarmonyRoot = join(FIXTURE_ROOT, "no-harmony");
  mkdirSync(join(noHarmonyRoot, "harmony/generic-definitions/data-contract"), { recursive: true });
  writeFileSync(
    join(noHarmonyRoot, "harmony/generic-definitions/data-contract/Ok.json"),
    JSON.stringify({ kind: "data-contract", name: "Ok", purpose: "x", responsibilities: [], targets: ["backend"] })
  );
  {
    const { status, stdout, stderr } = runScript("lint-generic-definitions.mjs", [noHarmonyRoot]);
    assert("harmony.json 不在は exit 1 (silent fallback 禁止)", status === 1, `status=${status}`);
    assert("error mentions harmony.json", /harmony\.json/.test(stdout + stderr));
  }
} finally {
  rmSync(FIXTURE_ROOT, { recursive: true, force: true });
}

// =============================================================================
// 4. spec doc 本体を input にした gate (Round 11 review M-1/M-2/M-3 対応)
//    Round 11 で指摘された「test.mjs が spec doc を一切読まない → cheatsheet /
//    jsonc fence / ✅ JSON 例の drift が CI gate を素通り」を解消する。
// =============================================================================
const specDoc = readSpecDoc();
const jsoncFences = extractFences(specDoc, "jsonc");

// -----------------------------------------------------------------------------
// 4-A. jsonc fence parseability (Round 11 M-2)
//      §0.5 で AI に「// 行を全削除してから AJV / JSON.parse / loader に渡す」と
//      契約しているため、各 fence は stripJsoncComments 後に必ず JSON.parse 可能。
// -----------------------------------------------------------------------------
console.log("\n## jsonc fence parseability (spec doc §0.5 contract)");
{
  assert("jsonc fence count >= 14", jsoncFences.length >= 14, `actual=${jsoncFences.length}`);
  for (const f of jsoncFences) {
    const stripped = stripJsoncComments(f.body);
    let ok = true;
    let err = "";
    try {
      JSON.parse(stripped);
    } catch (e) {
      ok = false;
      err = e.message;
    }
    assert(`L${f.line}: parse OK after stripping \`//\` lines`, ok, err);
  }
}

// -----------------------------------------------------------------------------
// 4-B. ✅ 現行 schema 例 AJV gate (Round 11 M-3)
//      `$schema` field を持つ jsonc fence は現行 schema 適合の ✅ 例。
//      schemas/v3/ に対する AJV validate を gate に組み込む。
//      ✨ RFC 将来案 (`$schema` なし) は対象外 (§10 B の soft gate)。
// -----------------------------------------------------------------------------
console.log("\n## ✅ 例 AJV validation against schemas/v3/");
{
  // ajv の dynamic import (root devDep にしてある)
  const { default: Ajv2020 } = await import("ajv/dist/2020.js");
  const { default: addFormats } = await import("ajv-formats");
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);

  const schemaFiles = [
    "schemas/v3/common.v3.schema.json",
    "schemas/v3/screen-item.v3.schema.json",
    "schemas/v3/screen.v3.schema.json",
    "schemas/v3/process-flow.v3.schema.json",
  ];
  for (const f of schemaFiles) {
    const s = JSON.parse(readFileSync(join(ROOT, f), "utf8"));
    ajv.addSchema(s);
  }

  let validated = 0;
  for (const f of jsoncFences) {
    let parsed;
    try {
      parsed = JSON.parse(stripJsoncComments(f.body));
    } catch {
      continue; // M-2 で既に detect 済
    }
    const schemaRef = parsed?.$schema;
    if (typeof schemaRef !== "string") continue;
    const filename = schemaRef.split("/").pop();
    if (!/^[a-z-]+\.v3\.schema\.json$/.test(filename)) continue;
    const $id = `https://raw.githubusercontent.com/csilost2001/harmony/main/schemas/v3/${filename}`;
    const validate = ajv.getSchema($id);
    if (!validate) {
      assert(`L${f.line}: schema registered (${filename})`, false, `$id not found: ${$id}`);
      continue;
    }
    const valid = validate(parsed);
    const detail = valid
      ? ""
      : (validate.errors || []).slice(0, 3).map((e) => `${e.instancePath || "/"} ${e.message}`).join("; ");
    assert(`L${f.line}: AJV valid against ${filename}`, valid, detail);
    validated++;
  }
  // Round 11 で reviewer が確認した 4 例 (L171/L293/L340/L468) は必ず検出される
  assert("✅ examples validated against schemas/v3/ (>= 4)", validated >= 4, `validated=${validated}`);
}

// -----------------------------------------------------------------------------
// 4-C. cheatsheet drift gate (Round 11 M-1)
//      §3.3 Step kind cheatsheet の各行が
//      `schemas/v3/process-flow.v3.schema.json` の required と整合するか検証。
//      行ごとの required field が cell に backtick で出現することを assert。
//      ExtensionStep だけは `kind` が pattern (const なし) のため特殊扱い。
// -----------------------------------------------------------------------------
console.log("\n## §3.3 cheatsheet rows vs schema required (drift gate)");
{
  const cheatsheet = parseStepCheatsheet(specDoc);
  assert("cheatsheet has 24 step kind rows", cheatsheet.size === 24, `actual=${cheatsheet.size}`);

  const BASE = new Set(["id", "kind", "description"]);
  const stepUnion = $defs.Step.oneOf.map((r) => r.$ref.replace("#/$defs/", ""));
  for (const stepName of stepUnion) {
    const def = $defs[stepName];
    if (!def?.allOf || def.allOf.length < 2) continue;
    const variant = def.allOf[1];
    const required = (variant.required || []).filter((r) => !BASE.has(r));
    const kindConst = variant.properties?.kind?.const
      ?? (stepName === "ExtensionStep" ? "extension" : null);
    if (!kindConst) continue;
    const cell = cheatsheet.get(kindConst);
    assert(`cheatsheet row exists: \`${kindConst}\``, cell !== undefined);
    if (cell === undefined) continue;

    if (stepName === "ExtensionStep") {
      // ExtensionStep は `kind` が pattern (namespace:name)、required は base のみ。
      // cell が `kind` パターン or "namespace:name" / "variant" / "pattern" に
      // 言及していることを drift 検出として要求する。
      const ok = /pattern|namespace:name|variant/i.test(cell);
      assert(`extension row mentions pattern/variant`, ok, `cell=${cell.slice(0, 100)}`);
      continue;
    }

    if (required.length === 0) {
      // 表現の揺れを許容するため、`(なし` を含むか確認
      assert(`\`${kindConst}\` row has "(なし" marker`, /\(なし/.test(cell), `cell=${cell.slice(0, 100)}`);
    } else {
      for (const f of required) {
        assert(
          `\`${kindConst}\` row contains \`${f}\``,
          cell.includes(`\`${f}\``),
          `cell=${cell.slice(0, 120)}`
        );
      }
    }
  }
}

// -----------------------------------------------------------------------------
// 4-D. import-project-profile schema 14 セクションが spec §7.3 に列挙されているか
//      (Round 11 S-1 — TS scaffold tsc gate の代替に近い軽量 drift gate)
//      schema の top-level property を spec §7.3 enumeration と突合し、抜けが
//      無いか確認。schema 側に section が増えても spec が追従していなければ fail。
// -----------------------------------------------------------------------------
console.log("\n## profile schema sections vs spec §7.3 enumeration");
{
  const profileSchema = JSON.parse(readFileSync(join(ROOT, "schemas/import-project-profile.v1.schema.json"), "utf8"));
  const skipKeys = new Set(["$schema", "profileVersion", "name", "description"]);
  const sections = Object.keys(profileSchema.properties || {}).filter((k) => !skipKeys.has(k));
  assert("profile schema declares >= 14 sections", sections.length >= 14, `actual=${sections.length}`);
  for (const s of sections) {
    // §7.3 の enumeration 行 (`N. \`<name>\` — ...`) に該当 section が出現すること
    const regex = new RegExp(`^\\d+\\.\\s+\`${s}\`\\s+—`, "m");
    assert(`profile section \`${s}\` enumerated in spec §7.3`, regex.test(specDoc));
  }
}

// =============================================================================
// Summary
// =============================================================================
console.log();
console.log(`Pass: ${pass}, Fail: ${fail}`);
process.exit(fail > 0 ? 1 : 0);
