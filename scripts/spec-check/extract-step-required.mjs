#!/usr/bin/env node
// Extract required fields for each Step kind variant from
// schemas/v3/process-flow.v3.schema.json. Output is the source-of-truth for
// docs/spec/conversion-guideline-for-ai.md §3.3 cheatsheet (upper table).
//
// Usage: node scripts/spec-check/extract-step-required.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(__dirname, "../../schemas/v3/process-flow.v3.schema.json");
const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
const $defs = schema.$defs;

const stepUnion = $defs.Step.oneOf.map((r) => r.$ref.replace("#/$defs/", ""));

const results = [];
for (const stepName of stepUnion) {
  const def = $defs[stepName];
  if (!def || !def.allOf || def.allOf.length < 2) {
    results.push({ stepName, kind: "?", required: [], note: "(def shape unexpected)" });
    continue;
  }
  const variant = def.allOf[1];
  const required = variant.required || [];
  const kindConst = variant.properties?.kind?.const || "?";
  const extraRequired = required.filter((r) => !["id", "kind", "description"].includes(r));
  results.push({ stepName, kind: kindConst, required: extraRequired, allRequired: required });
}

console.log("Step kind required fields (id/kind/description は全 kind 共通で省略):");
console.log();
for (const r of results) {
  const req = r.required.length > 0 ? r.required.join(", ") : "(なし)";
  console.log(`- \`${r.kind}\` → ${req}`);
}
console.log();
console.log(`Total: ${results.length} step kinds (schemas/v3/process-flow.v3.schema.json#/$defs/Step)`);
