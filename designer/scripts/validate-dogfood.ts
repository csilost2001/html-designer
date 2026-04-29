#!/usr/bin/env node
/**
 * ドッグフード検証スイート (#496)
 *
 * docs/sample-project/ 配下の全サンプルフローを 4 バリデータで一括検証する。
 * CI 統合の前段として、サンプルの drift を検出するためのコマンドライン ツール。
 *
 * 使用法:
 *   cd designer && npm run validate:dogfood
 *   cd designer && npm run validate:dogfood -- --flow <path>   # 単一フローのみ検証 (#599)
 *
 * 終了コード:
 *   0: 全件 pass
 *   1: 1 件以上 fail
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, basename, relative, isAbsolute } from "node:path";
import type { ProcessFlow } from "../src/types/action.js";
import { checkSqlColumns, type TableDefinition } from "../src/schemas/sqlColumnValidator.js";
import { checkConventionReferences, type ConventionsCatalog } from "../src/schemas/conventionsValidator.js";
import { checkReferentialIntegrity } from "../src/schemas/referentialIntegrity.js";
import { checkIdentifierScopes } from "../src/schemas/identifierScope.js";
import { loadExtensionsFromBundle, type LoadedExtensions, type ExtensionsBundle } from "../src/schemas/loadExtensions.js";

// ─── パス解決 ──────────────────────────────────────────────────────────────

// CJS モード (scripts/package.json で "type": "commonjs") のため __dirname が使用可能
const designerDir = resolve(__dirname, "..");
const repoRoot = resolve(designerDir, "..");
const samplesDir = resolve(repoRoot, "docs/sample-project");
const flowsDir = resolve(samplesDir, "process-flows");
const tablesDir = resolve(samplesDir, "tables");
const conventionsFile = resolve(samplesDir, "conventions/conventions-catalog.json");
const extensionsDir = resolve(samplesDir, "extensions");

// ─── 型定義 ────────────────────────────────────────────────────────────────

interface FlowValidationResult {
  filePath: string;
  displayName: string;
  issues: Array<{
    validator: string;
    message: string;
  }>;
}

interface ValidationSummary {
  totalFlows: number;
  passedFlows: number;
  failedFlows: number;
  results: FlowValidationResult[];
  tableCount: number;
  extensionFileCount: number;
}

// ─── データ読み込み ────────────────────────────────────────────────────────

function loadTables(): TableDefinition[] {
  try {
    const files = readdirSync(tablesDir).filter((f) => f.endsWith(".json"));
    return files.map((f) => {
      const raw = readFileSync(join(tablesDir, f), "utf-8");
      return JSON.parse(raw) as TableDefinition;
    });
  } catch {
    return [];
  }
}

function loadConventions(): ConventionsCatalog | null {
  try {
    const raw = readFileSync(conventionsFile, "utf-8");
    return JSON.parse(raw) as ConventionsCatalog;
  } catch {
    return null;
  }
}

/**
 * extensions/ ディレクトリを再帰走査して LoadedExtensions に統合する。
 * process-flow.schema.test.ts の loadSampleExtensionsBundle と同等のロジック。
 */
function loadExtensions(): { extensions: LoadedExtensions; fileCount: number } {
  let fileCount = 0;
  const bundle: {
    steps: { namespace: string; steps: Record<string, unknown> };
    fieldTypes: { namespace: string; fieldTypes: unknown[] };
    triggers: { namespace: string; triggers: unknown[] };
    dbOperations: { namespace: string; dbOperations: unknown[] };
    responseTypes: { namespace: string; responseTypes: Record<string, unknown> };
  } = {
    steps: { namespace: "", steps: {} },
    fieldTypes: { namespace: "", fieldTypes: [] },
    triggers: { namespace: "", triggers: [] },
    dbOperations: { namespace: "", dbOperations: [] },
    responseTypes: { namespace: "", responseTypes: {} },
  };

  function withNamespace(namespace: string, key: string): string {
    return namespace ? `${namespace}:${key}` : key;
  }

  function mergeObjectExtension(
    target: Record<string, unknown>,
    raw: Record<string, unknown>,
    bodyKey: string,
  ): void {
    const namespace = typeof raw.namespace === "string" ? raw.namespace : "";
    const body = raw[bodyKey];
    if (!body || typeof body !== "object" || Array.isArray(body)) return;
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      target[withNamespace(namespace, key)] = value;
    }
  }

  try {
    const allFiles = readdirSync(extensionsDir, { recursive: true })
      .filter((f): f is string => typeof f === "string" && f.endsWith(".json"));

    for (const file of allFiles) {
      const fullPath = join(extensionsDir, file);
      try {
        const raw = JSON.parse(readFileSync(fullPath, "utf-8")) as Record<string, unknown>;
        fileCount++;
        switch (basename(file)) {
          case "field-types.json":
            if (Array.isArray(raw.fieldTypes)) {
              bundle.fieldTypes.fieldTypes.push(...raw.fieldTypes);
            }
            break;
          case "triggers.json":
            if (Array.isArray(raw.triggers)) {
              bundle.triggers.triggers.push(...raw.triggers);
            }
            break;
          case "db-operations.json":
            if (Array.isArray(raw.dbOperations)) {
              bundle.dbOperations.dbOperations.push(...raw.dbOperations);
            }
            break;
          case "steps.json":
            mergeObjectExtension(bundle.steps.steps, raw, "steps");
            break;
          case "response-types.json":
            mergeObjectExtension(bundle.responseTypes.responseTypes, raw, "responseTypes");
            break;
        }
      } catch {
        // 読み込みエラーは無視 (extension が壊れていても検証を続行)
      }
    }
  } catch {
    // extensions ディレクトリが存在しない場合は空の extensions を返す
  }

  const extBundle: ExtensionsBundle = {
    steps: bundle.steps.steps && Object.keys(bundle.steps.steps).length > 0 ? bundle.steps : undefined,
    fieldTypes: bundle.fieldTypes.fieldTypes.length > 0 ? bundle.fieldTypes : undefined,
    triggers: bundle.triggers.triggers.length > 0 ? bundle.triggers : undefined,
    dbOperations: bundle.dbOperations.dbOperations.length > 0 ? bundle.dbOperations : undefined,
    responseTypes: bundle.responseTypes.responseTypes && Object.keys(bundle.responseTypes.responseTypes).length > 0 ? bundle.responseTypes : undefined,
  };

  const result = loadExtensionsFromBundle(extBundle);
  return { extensions: result.extensions, fileCount };
}

function loadFlows(explicitPath?: string): Array<{ filePath: string; displayName: string; flow: ProcessFlow }> {
  if (explicitPath) {
    const filePath = isAbsolute(explicitPath) ? explicitPath : resolve(process.cwd(), explicitPath);
    let stat;
    try {
      stat = statSync(filePath);
    } catch {
      throw new Error(`--flow に指定されたファイルが見つかりません: ${filePath}`);
    }
    if (!stat.isFile()) {
      throw new Error(`--flow に指定されたパスはファイルではありません: ${filePath}`);
    }
    const displayName = relative(repoRoot, filePath).replace(/\\/g, "/");
    const raw = readFileSync(filePath, "utf-8");
    let flow: ProcessFlow;
    try {
      flow = JSON.parse(raw) as ProcessFlow;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`--flow の JSON parse に失敗しました: ${filePath} — ${message}`);
    }
    return [{ filePath, displayName, flow }];
  }

  const files = readdirSync(flowsDir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  return files.map((f) => {
    const filePath = join(flowsDir, f);
    const displayName = relative(repoRoot, filePath).replace(/\\/g, "/");
    const raw = readFileSync(filePath, "utf-8");
    return {
      filePath,
      displayName,
      flow: JSON.parse(raw) as ProcessFlow,
    };
  });
}

// ─── 検証実行 ──────────────────────────────────────────────────────────────

/**
 * 全サンプルフローを 4 バリデータで検証し、サマリを返す。
 * CI / テストから直接呼び出せるようにエクスポートする。
 *
 * @param flowPath 指定時はこのパスのフローのみを対象とする (単一フロー検証、#599)
 */
export async function runValidation(flowPath?: string): Promise<ValidationSummary> {
  const tables = loadTables();
  const conventions = loadConventions();
  const { extensions, fileCount: extensionFileCount } = loadExtensions();
  const flows = loadFlows(flowPath);

  const results: FlowValidationResult[] = [];

  for (const { filePath, displayName, flow } of flows) {
    const issues: FlowValidationResult["issues"] = [];

    // 1. SQL 列検証
    const sqlIssues = checkSqlColumns(flow, tables);
    for (const issue of sqlIssues) {
      issues.push({ validator: "sqlColumnValidator", message: `[${issue.code}] ${issue.path}: ${issue.message}` });
    }

    // 2. 規約カタログ参照検証
    const convIssues = checkConventionReferences(flow, conventions);
    for (const issue of convIssues) {
      issues.push({ validator: "conventionsValidator", message: `[${issue.code}] ${issue.path}: ${issue.message}` });
    }

    // 3. クロスリファレンス整合性検証
    const integrityIssues = checkReferentialIntegrity(flow, extensions);
    for (const issue of integrityIssues) {
      issues.push({ validator: "referentialIntegrity", message: `[${issue.code}] ${issue.path}: ${issue.message}` });
    }

    // 4. 識別子スコープ検証
    const scopeIssues = checkIdentifierScopes(flow);
    for (const issue of scopeIssues) {
      issues.push({ validator: "identifierScope", message: `[${issue.code}] ${issue.path}: @${issue.identifier} — ${issue.message}` });
    }

    results.push({ filePath, displayName, issues });
  }

  const passedFlows = results.filter((r) => r.issues.length === 0).length;
  const failedFlows = results.filter((r) => r.issues.length > 0).length;

  return {
    totalFlows: flows.length,
    passedFlows,
    failedFlows,
    results,
    tableCount: tables.length,
    extensionFileCount,
  };
}

// ─── CLI 出力 ──────────────────────────────────────────────────────────────

function printSummary(summary: ValidationSummary, options: { singleFlow: boolean }): void {
  const conventionsExists = (() => {
    try {
      readFileSync(conventionsFile);
      return true;
    } catch {
      return false;
    }
  })();

  console.log(options.singleFlow ? "🔍 ドッグフード検証スイート (単一フロー)" : "🔍 ドッグフード検証スイート");
  console.log();
  console.log(
    `📂 サンプル数: ${summary.totalFlows} flows / ${summary.tableCount} tables` +
    ` / ${conventionsExists ? 1 : 0} conventions catalog` +
    ` / ${summary.extensionFileCount} extension files`,
  );
  console.log();

  for (const result of summary.results) {
    if (result.issues.length === 0) {
      console.log(`✅ ${result.displayName} (4 validators pass)`);
    } else {
      console.log(`❌ ${result.displayName}`);
      // バリデータごとにグループ化して表示
      const byValidator = new Map<string, string[]>();
      for (const issue of result.issues) {
        const msgs = byValidator.get(issue.validator) ?? [];
        msgs.push(issue.message);
        byValidator.set(issue.validator, msgs);
      }
      for (const [, msgs] of byValidator) {
        for (const msg of msgs) {
          console.log(`   ${msg}`);
        }
      }
    }
  }

  console.log();
  console.log("━".repeat(57));

  if (summary.failedFlows === 0) {
    console.log(`Summary: ${summary.passedFlows} / ${summary.totalFlows} flows passed.`);
    console.log("━".repeat(57));
    console.log();
    console.log("✅ 全件検証 pass。");
  } else {
    // 全 failed flows の issue を validator ごとに集計
    const totalByValidator = new Map<string, number>();
    let totalIssues = 0;
    for (const result of summary.results.filter((r) => r.issues.length > 0)) {
      for (const issue of result.issues) {
        totalByValidator.set(issue.validator, (totalByValidator.get(issue.validator) ?? 0) + 1);
        totalIssues++;
      }
    }

    console.log(`Summary: ${summary.passedFlows} / ${summary.totalFlows} flows passed.`);
    console.log(`${summary.failedFlows} flow${summary.failedFlows > 1 ? "s" : ""} failed with ${totalIssues} issues:`);
    for (const [validator, count] of totalByValidator) {
      console.log(`  - [${validator}] ${count} 件`);
    }
    console.log("━".repeat(57));
    console.log();
    console.log("❌ 検証失敗。修正してから再実行してください。");
  }
}

// ─── エントリーポイント ────────────────────────────────────────────────────

function parseArgs(argv: string[]): { flowPath?: string } {
  const out: { flowPath?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--flow") {
      const next = argv[i + 1];
      if (!next) throw new Error("--flow にはファイルパスを指定してください");
      out.flowPath = next;
      i++;
    } else if (arg.startsWith("--flow=")) {
      out.flowPath = arg.slice("--flow=".length);
    }
  }
  return out;
}

(async () => {
  let flowPath: string | undefined;
  try {
    ({ flowPath } = parseArgs(process.argv.slice(2)));
    const summary = await runValidation(flowPath);
    printSummary(summary, { singleFlow: Boolean(flowPath) });
    process.exit(summary.failedFlows > 0 ? 1 : 0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`❌ ${message}`);
    process.exit(2);
  }
})();
