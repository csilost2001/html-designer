#!/usr/bin/env node
/**
 * ドッグフード検証スイート (#496, per-project 化 #607)
 *
 * docs/sample-project (v1) および docs/sample-project-v3/<project>/ 配下の
 * 各サンプルプロジェクトを 1 プロジェクト = 1 完結成果物セットとしてスキャンし、
 * プロジェクト内の tables / conventions / process-flows を 4 バリデータで検証する。
 *
 * 1 プロジェクトに必要な完結成果物の規約は docs/spec/sample-project-structure.md
 * を参照。各プロジェクトの規約カタログ (conventions-catalog) は per-project 配置。
 *
 * 使用法:
 *   cd designer && npm run validate:dogfood
 *   cd designer && npm run validate:dogfood -- --flow <path>   # 単一フローのみ検証 (#599)
 *
 * 終了コード:
 *   0: 全件 pass
 *   1: 1 件以上 fail
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
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
const samplesV1Dir = resolve(repoRoot, "docs/sample-project");
const samplesV3Dir = resolve(repoRoot, "docs/sample-project-v3");

// ─── 型定義 ────────────────────────────────────────────────────────────────

interface ProjectResources {
  projectId: string;          // 識別用 (v1: "v1", v3: subdir 名)
  displayName: string;        // 表示用 (repoRoot からの相対パス)
  projectDir: string;         // プロジェクトディレクトリ絶対パス
  tables: TableDefinition[];
  conventions: ConventionsCatalog | null;
  flowsDir: string;           // process-flows/ の絶対パス
}

interface FlowValidationResult {
  filePath: string;
  displayName: string;
  projectId: string;
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
  projectCount: number;
  totalTableCount: number;
  totalConventionsCount: number;
  extensionFileCount: number;
}

// ─── プロジェクト発見・データ読み込み ──────────────────────────────────────

function loadTablesFromDir(dir: string): TableDefinition[] {
  if (!existsSync(dir)) return [];
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    return files.map((f) => JSON.parse(readFileSync(join(dir, f), "utf-8")) as TableDefinition);
  } catch {
    return [];
  }
}

function loadConventionsFromFile(filePath: string): ConventionsCatalog | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as ConventionsCatalog;
  } catch {
    return null;
  }
}

/**
 * v1 + v3 のサンプルプロジェクトを発見してリソース情報を返す。
 *
 * 発見規則:
 *   - v1: docs/sample-project/ (1 project、conventions は conventions/conventions-catalog.json、tables は tables/)
 *   - v3 per-project: docs/sample-project-v3/<subdir>/ に project.json があれば 1 project
 *
 * spec: docs/spec/sample-project-structure.md
 */
function discoverProjects(): ProjectResources[] {
  const projects: ProjectResources[] = [];

  // v1
  if (existsSync(join(samplesV1Dir, "project.json")) || existsSync(join(samplesV1Dir, "process-flows"))) {
    projects.push({
      projectId: "v1",
      displayName: relative(repoRoot, samplesV1Dir).replace(/\\/g, "/"),
      projectDir: samplesV1Dir,
      tables: loadTablesFromDir(join(samplesV1Dir, "tables")),
      conventions: loadConventionsFromFile(join(samplesV1Dir, "conventions/conventions-catalog.json")),
      flowsDir: join(samplesV1Dir, "process-flows"),
    });
  }

  // v3 per-project (旧 v3-root 過渡期 fallback は #616 で retail/ に移動完了したため削除)
  if (existsSync(samplesV3Dir)) {
    for (const entry of readdirSync(samplesV3Dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const projectDir = join(samplesV3Dir, entry.name);
      if (!existsSync(join(projectDir, "project.json"))) continue;
      projects.push({
        projectId: entry.name,
        displayName: relative(repoRoot, projectDir).replace(/\\/g, "/"),
        projectDir,
        tables: loadTablesFromDir(join(projectDir, "tables")),
        conventions: loadConventionsFromFile(join(projectDir, "conventions-catalog.v3.json")),
        flowsDir: join(projectDir, "process-flows"),
      });
    }
  }

  return projects;
}

/**
 * extensions は当面 global 統合 (per-project 化は将来課題)。
 * docs/sample-project/extensions/ (v1) と docs/sample-project-v3 の .v3.json (v3) の両方を読む。
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

  function mergeObjectExtension(target: Record<string, unknown>, raw: Record<string, unknown>, bodyKey: string): void {
    const namespace = typeof raw.namespace === "string" ? raw.namespace : "";
    const body = raw[bodyKey];
    if (!body || typeof body !== "object" || Array.isArray(body)) return;
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      target[withNamespace(namespace, key)] = value;
    }
  }

  // v1 extensions/
  const v1ExtDir = join(samplesV1Dir, "extensions");
  if (existsSync(v1ExtDir)) {
    try {
      const allFiles = readdirSync(v1ExtDir, { recursive: true })
        .filter((f): f is string => typeof f === "string" && f.endsWith(".json"));
      for (const file of allFiles) {
        const fullPath = join(v1ExtDir, file);
        try {
          const raw = JSON.parse(readFileSync(fullPath, "utf-8")) as Record<string, unknown>;
          fileCount++;
          switch (basename(file)) {
            case "field-types.json":
              if (Array.isArray(raw.fieldTypes)) bundle.fieldTypes.fieldTypes.push(...raw.fieldTypes);
              break;
            case "triggers.json":
              if (Array.isArray(raw.triggers)) bundle.triggers.triggers.push(...raw.triggers);
              break;
            case "db-operations.json":
              if (Array.isArray(raw.dbOperations)) bundle.dbOperations.dbOperations.push(...raw.dbOperations);
              break;
            case "steps.json":
              mergeObjectExtension(bundle.steps.steps, raw, "steps");
              break;
            case "response-types.json":
              mergeObjectExtension(bundle.responseTypes.responseTypes, raw, "responseTypes");
              break;
          }
        } catch {
          // 個別 extension の読み込みエラーは無視
        }
      }
    } catch {
      // extensions ディレクトリが存在しない場合は無視
    }
  }

  // v3 拡張定義 (per-project single-file 形式 .v3.json) を再帰スキャン
  if (existsSync(samplesV3Dir)) {
    try {
      const v3Files = readdirSync(samplesV3Dir, { recursive: true })
        .filter((f): f is string => typeof f === "string" && f.endsWith(".v3.json"))
        .filter((f) => f.includes("extensions"));

      for (const file of v3Files) {
        const fullPath = join(samplesV3Dir, file);
        try {
          const raw = JSON.parse(readFileSync(fullPath, "utf-8")) as Record<string, unknown>;
          fileCount++;
          const namespace = typeof raw.namespace === "string" ? raw.namespace : "";
          if (Array.isArray(raw.fieldTypes)) bundle.fieldTypes.fieldTypes.push(...raw.fieldTypes);
          if (Array.isArray(raw.actionTriggers)) bundle.triggers.triggers.push(...raw.actionTriggers);
          if (Array.isArray(raw.dbOperations)) bundle.dbOperations.dbOperations.push(...raw.dbOperations);
          if (raw.stepKinds && typeof raw.stepKinds === "object" && !Array.isArray(raw.stepKinds)) {
            for (const [key, value] of Object.entries(raw.stepKinds as Record<string, unknown>)) {
              bundle.steps.steps[withNamespace(namespace, key)] = value;
            }
          }
          if (raw.responseTypes && typeof raw.responseTypes === "object" && !Array.isArray(raw.responseTypes)) {
            for (const [key, value] of Object.entries(raw.responseTypes as Record<string, unknown>)) {
              bundle.responseTypes.responseTypes[withNamespace(namespace, key)] = value;
            }
          }
        } catch {
          // 個別 v3 拡張の読み込みエラーは無視
        }
      }
    } catch {
      // sample-project-v3 が存在しない場合は無視
    }
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

/**
 * --flow で指定された単一フローを発見。所属プロジェクトを path から特定する。
 */
function findProjectForFlow(filePath: string, projects: ProjectResources[]): ProjectResources | null {
  const normalized = filePath.replace(/\\/g, "/");
  // 最も deep にマッチするプロジェクトを返す (v3 per-project が v3-root より先にマッチするように)
  let best: ProjectResources | null = null;
  let bestLength = 0;
  for (const project of projects) {
    const projectPath = project.projectDir.replace(/\\/g, "/");
    if (normalized.startsWith(projectPath + "/") && projectPath.length > bestLength) {
      best = project;
      bestLength = projectPath.length;
    }
  }
  return best;
}

function loadFlowsForProject(project: ProjectResources): Array<{ filePath: string; displayName: string; flow: ProcessFlow }> {
  if (!existsSync(project.flowsDir)) return [];
  const files = readdirSync(project.flowsDir).filter((f) => f.endsWith(".json")).sort();
  return files.map((f) => {
    const filePath = join(project.flowsDir, f);
    return {
      filePath,
      displayName: relative(repoRoot, filePath).replace(/\\/g, "/"),
      flow: JSON.parse(readFileSync(filePath, "utf-8")) as ProcessFlow,
    };
  });
}

function loadSingleFlow(explicitPath: string): { filePath: string; displayName: string; flow: ProcessFlow } {
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
  return { filePath, displayName, flow };
}

// ─── 検証実行 ──────────────────────────────────────────────────────────────

/**
 * 全サンプルフローを 4 バリデータで検証し、サマリを返す。
 *
 * @param flowPath 指定時はこのパスのフローのみを対象とする (単一フロー検証、#599)
 */
export async function runValidation(flowPath?: string): Promise<ValidationSummary> {
  const projects = discoverProjects();
  const { extensions, fileCount: extensionFileCount } = loadExtensions();

  const totalTableCount = projects.reduce((acc, p) => acc + p.tables.length, 0);
  const totalConventionsCount = projects.filter((p) => p.conventions !== null).length;

  const results: FlowValidationResult[] = [];

  function validateOne(filePath: string, displayName: string, flow: ProcessFlow, project: ProjectResources): FlowValidationResult {
    const issues: FlowValidationResult["issues"] = [];

    // 1. SQL 列検証
    const sqlIssues = checkSqlColumns(flow, project.tables);
    for (const issue of sqlIssues) {
      issues.push({ validator: "sqlColumnValidator", message: `[${issue.code}] ${issue.path}: ${issue.message}` });
    }

    // 2. 規約カタログ参照検証
    const convIssues = checkConventionReferences(flow, project.conventions);
    for (const issue of convIssues) {
      issues.push({ validator: "conventionsValidator", message: `[${issue.code}] ${issue.path}: ${issue.message}` });
    }

    // 3. クロスリファレンス整合性検証 (extensions は global 統合)
    const integrityIssues = checkReferentialIntegrity(flow, extensions);
    for (const issue of integrityIssues) {
      issues.push({ validator: "referentialIntegrity", message: `[${issue.code}] ${issue.path}: ${issue.message}` });
    }

    // 4. 識別子スコープ検証
    const scopeIssues = checkIdentifierScopes(flow);
    for (const issue of scopeIssues) {
      issues.push({ validator: "identifierScope", message: `[${issue.code}] ${issue.path}: @${issue.identifier} — ${issue.message}` });
    }

    return { filePath, displayName, projectId: project.projectId, issues };
  }

  if (flowPath) {
    const single = loadSingleFlow(flowPath);
    const project = findProjectForFlow(single.filePath, projects);
    if (!project) {
      throw new Error(`--flow のファイルが既知のサンプルプロジェクトに属していません: ${single.filePath}`);
    }
    results.push(validateOne(single.filePath, single.displayName, single.flow, project));
  } else {
    for (const project of projects) {
      const flows = loadFlowsForProject(project);
      for (const { filePath, displayName, flow } of flows) {
        results.push(validateOne(filePath, displayName, flow, project));
      }
    }
  }

  const passedFlows = results.filter((r) => r.issues.length === 0).length;
  const failedFlows = results.filter((r) => r.issues.length > 0).length;

  return {
    totalFlows: results.length,
    passedFlows,
    failedFlows,
    results,
    projectCount: projects.length,
    totalTableCount,
    totalConventionsCount,
    extensionFileCount,
  };
}

// ─── CLI 出力 ──────────────────────────────────────────────────────────────

function printSummary(summary: ValidationSummary, options: { singleFlow: boolean }): void {
  console.log(options.singleFlow ? "🔍 ドッグフード検証スイート (単一フロー)" : "🔍 ドッグフード検証スイート");
  console.log();
  console.log(
    `📂 プロジェクト数: ${summary.projectCount} / ${summary.totalFlows} flows / ${summary.totalTableCount} tables` +
    ` / ${summary.totalConventionsCount} conventions catalogs / ${summary.extensionFileCount} extension files`,
  );
  console.log();

  for (const result of summary.results) {
    if (result.issues.length === 0) {
      console.log(`✅ ${result.displayName} (4 validators pass)`);
    } else {
      console.log(`❌ ${result.displayName}`);
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
