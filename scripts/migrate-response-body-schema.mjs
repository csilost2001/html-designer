#!/usr/bin/env node
/**
 * migrate-response-body-schema.mjs
 *
 * HttpResponseSpec.bodySchema を旧 string 形式から構造化形式へ移行する。
 *
 * 変換ルール:
 *   - 単純識別子 (英数字のみ, 例: "ApiError", "CustomerResponse")
 *     → { "typeRef": "ApiError" }
 *   - その他の文字列 (スペース・記号含む, 例: "{ sessionId, userId }")
 *     → 変換せず警告 (手動対応)
 *
 * 使い方:
 *   node scripts/migrate-response-body-schema.mjs [--apply] [dir...]
 *
 *   --apply  : ファイルを上書き (省略時は dry-run)
 *   dir...   : 対象ディレクトリ (省略時は docs/sample-project/actions data/actions)
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const APPLY = process.argv.includes("--apply");
const dirs = process.argv
  .filter((a) => !a.startsWith("--") && a !== process.argv[0] && a !== process.argv[1])
  .map((d) => resolve(d));

if (dirs.length === 0) {
  dirs.push(
    resolve("docs/sample-project/actions"),
    resolve("data/actions"),
  );
}

/**
 * bodySchema が単純識別子かどうか (typeRef に変換可能)。
 * アルファベット + 数字のみ (アンダースコアは含まない)。
 * 例: "ApiError" → true, "ApiError_V2" → false (手動対応)
 */
function isSimpleIdentifier(s) {
  return /^[A-Za-z][A-Za-z0-9]*$/.test(s);
}

/** ActionGroup JSON を再帰的に走査し bodySchema を変換する */
function migrateBodySchemas(obj, path, warnings) {
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => migrateBodySchemas(item, `${path}[${i}]`, warnings));
  } else if (obj && typeof obj === "object") {
    if ("bodySchema" in obj && typeof obj.bodySchema === "string") {
      const raw = obj.bodySchema;
      if (isSimpleIdentifier(raw)) {
        obj.bodySchema = { typeRef: raw };
      } else {
        warnings.push(`${path}.bodySchema: "${raw}" — 単純識別子ではないため変換スキップ (手動対応)`);
      }
    }
    for (const key of Object.keys(obj)) {
      if (key !== "bodySchema") {
        migrateBodySchemas(obj[key], `${path}.${key}`, warnings);
      }
    }
  }
}

let totalConverted = 0;
let totalWarnings = 0;
let totalFiles = 0;

for (const dir of dirs) {
  let files;
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    continue;
  }

  for (const file of files) {
    const fullPath = join(dir, file);
    let data;
    try {
      data = JSON.parse(readFileSync(fullPath, "utf-8"));
    } catch {
      console.warn(`[SKIP] ${fullPath} — JSON parse error`);
      continue;
    }

    const warnings = [];
    const before = JSON.stringify(data);
    migrateBodySchemas(data, "", warnings);
    const after = JSON.stringify(data);

    const changed = before !== after;
    // 変換前 string bodySchema 数 - スキップ数 = 実変換数
    const totalStringBefore = (before.match(/"bodySchema"\s*:\s*"[^"]+"/g) || []).length;
    const converted = totalStringBefore - warnings.length;

    totalFiles++;
    if (warnings.length) {
      totalWarnings += warnings.length;
      warnings.forEach((w) => console.warn(`[WARN] ${file}: ${w}`));
    }

    if (changed) {
      totalConverted += converted;
      if (APPLY) {
        writeFileSync(fullPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
        console.log(`[APPLY] ${fullPath} — string bodySchema を typeRef に変換`);
      } else {
        console.log(`[DRY-RUN] ${fullPath} — string bodySchema が見つかりました (--apply で変換)`);
      }
    }
  }
}

console.log(`\n合計: ${totalFiles} ファイル, 変換対象 ${totalConverted} 件, 警告 ${totalWarnings} 件`);
if (!APPLY && totalConverted > 0) {
  console.log("--apply オプションで実際に変換します。");
}
