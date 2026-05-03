#!/usr/bin/env node
/**
 * product-scope.md の内容を data/conventions/catalog.json の 8 新カテゴリとしてマージする。
 *
 * Dry-run (差分表示のみ):  node scripts/migrate-product-scope.mjs
 * 適用:                    node scripts/migrate-product-scope.mjs --apply
 *
 * 動作:
 *   - 既存 catalog に無いキーを seed から追加 (ADD 表示)
 *   - 既存 catalog に既にあるキーは上書きしない (SKIP 表示)
 *   - msg / regex / limit など既存カテゴリは一切触らない
 *   - 冪等 (2 回目実行で差分 0)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const catalogPath = resolve(repoRoot, "data/conventions/catalog.json");
const seedPath = resolve(repoRoot, "examples/retail/conventions/catalog.json");

const NEW_CATEGORIES = [
  "scope",
  "currency",
  "tax",
  "auth",
  "db",
  "numbering",
  "tx",
  "externalOutcomeDefaults",
];

const applyMode = process.argv.includes("--apply");

// seed を読む
const seed = JSON.parse(readFileSync(seedPath, "utf-8"));

// 既存 catalog を読む。なければ seed 全体を copy して完了
if (!existsSync(catalogPath)) {
  if (applyMode) {
    mkdirSync(dirname(catalogPath), { recursive: true });
    writeFileSync(catalogPath, JSON.stringify(seed, null, 2) + "\n", "utf-8");
    console.log("CREATED data/conventions/catalog.json from seed (file did not exist)");
  } else {
    console.log("data/conventions/catalog.json not found. --apply で seed 全体を copy します。");
  }
  process.exit(0);
}

const catalog = JSON.parse(readFileSync(catalogPath, "utf-8"));

let hasChanges = false;

for (const cat of NEW_CATEGORIES) {
  const seedEntries = seed[cat];
  if (!seedEntries || typeof seedEntries !== "object") continue;

  if (!catalog[cat]) catalog[cat] = {};

  for (const [key, entry] of Object.entries(seedEntries)) {
    if (key in catalog[cat]) {
      console.log(`SKIP existing  ${cat}.${key}`);
    } else {
      console.log(`ADD            ${cat}.${key}`);
      catalog[cat][key] = entry;
      hasChanges = true;
    }
  }
}

if (!hasChanges) {
  console.log("差分なし (catalog は既に最新です)");
  process.exit(0);
}

if (applyMode) {
  catalog.updatedAt = new Date().toISOString();
  writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + "\n", "utf-8");
  console.log("\ndata/conventions/catalog.json を更新しました。");
} else {
  console.log("\n--apply を付けて実行すると上記の差分を適用します。");
}
