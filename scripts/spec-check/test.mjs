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
    ...opts,
  });
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

// =============================================================================
// 1. extract-step-required.mjs snapshot test
// =============================================================================
console.log("\n## extract-step-required.mjs");
{
  const { stdout, status } = runScript("extract-step-required.mjs");
  assert("exits 0", status === 0);
  // 24 step kinds が列挙されているか
  assert("24 step kinds output", /Total: 24 step kinds/.test(stdout));
  // 主要 step kind がすべて出力されるか
  for (const k of [
    "validation", "dbAccess", "externalSystem", "commonProcess",
    "screenTransition", "displayUpdate", "branch", "loop",
    "loopBreak", "loopContinue", "jump", "compute", "return",
    "log", "audit", "workflow", "transactionScope",
    "eventPublish", "eventSubscribe", "closing", "cdc",
    "aiCall", "aiAgent", "extension",
  ]) {
    assert(`output contains \`${k}\``, new RegExp(`\\\`${k}\\\``).test(stdout));
  }
  // ? が出ていないこと (regression: ExtensionStep が `?` で出る bug)
  assert("no `?` placeholder in output", !/^- `\?`/m.test(stdout), "kind 未解決の variant が残存");
  // 特定 required の機械検証
  assert("compute → expression", /`compute` → expression/.test(stdout));
  assert("dbAccess → tableId, operation", /`dbAccess` → tableId, operation/.test(stdout));
  assert("loop → loopKind, steps", /`loop` → loopKind, steps/.test(stdout));
  assert("workflow → pattern, approvers", /`workflow` → pattern, approvers/.test(stdout));
  assert("aiAgent → modelRef, messages, tools", /`aiAgent` → modelRef, messages, tools/.test(stdout));
}

// =============================================================================
// 2. extract-nested-required.mjs snapshot test
// =============================================================================
console.log("\n## extract-nested-required.mjs");
{
  const { stdout, status } = runScript("extract-nested-required.mjs");
  assert("exits 0", status === 0);
  assert("Branch required = id/code/condition/steps",
    /Branch: required = \[id, code, condition, steps\]/.test(stdout));
  assert("ElseBranch required = id/code/steps",
    /ElseBranch: required = \[id, code, steps\]/.test(stdout));
  assert("WorkflowApprover required = role",
    /WorkflowApprover: required = \[role\]/.test(stdout));
  assert("AiMessage required = role/content",
    /AiMessage: required = \[role, content\]/.test(stdout));
  assert("OutputBinding required = name",
    /OutputBinding: required = \[name\]/.test(stdout));
  assert("TxBoundary required = role/txId",
    /TxBoundary: required = \[role, txId\]/.test(stdout));
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
// Summary
// =============================================================================
console.log();
console.log(`Pass: ${pass}, Fail: ${fail}`);
process.exit(fail > 0 ? 1 : 0);
