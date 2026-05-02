#!/usr/bin/env node
/**
 * samples/<project-id>/ 形式 (samples/retail 等) を 1 プロジェクトとして検証するスクリプト (#709)。
 * 既存 validate-dogfood.ts (docs/sample-project-v3/ 専用) を踏襲しつつ、
 * actions/ ディレクトリ命名と conventions/catalog.json 配置に対応した薄いラッパー。
 *
 * 使用法:
 *   cd designer && npm run validate:samples -- ../data
 *   cd designer && npm run validate:samples -- ../samples/retail
 *
 * 終了コード: 0 = pass, 1 = fail
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import type { ProcessFlow } from "../src/types/action.js";
import { checkSqlColumns, type TableDefinition } from "../src/schemas/sqlColumnValidator.js";
import { checkSqlOrder, type OrderTableDefinition } from "../src/schemas/sqlOrderValidator.js";
import { checkConventionReferences, type ConventionsCatalog } from "../src/schemas/conventionsValidator.js";
import { checkReferentialIntegrity } from "../src/schemas/referentialIntegrity.js";
import { checkIdentifierScopes } from "../src/schemas/identifierScope.js";
import { checkScreenItemFlowConsistency } from "../src/schemas/screenItemFlowValidator.js";
import { checkScreenItemFieldTypeConsistency } from "../src/schemas/screenItemFieldTypeValidator.js";
import { checkScreenItemRefKeyConsistency } from "../src/schemas/screenItemRefKeyValidator.js";
import { checkViewDefinitions } from "../src/schemas/viewDefinitionValidator.js";
import { checkScreenNavigation } from "../src/schemas/screenNavigationValidator.js";
import { loadExtensionsFromBundle, type ExtensionsBundle, type LoadedExtensions } from "../src/schemas/loadExtensions.js";
import type { Screen } from "../src/types/v3/screen.js";
import type { Conventions } from "../src/types/v3/conventions.js";
import type { ViewDefinition } from "../src/types/v3/view-definition.js";
import type { ScreenTransitionEntry } from "../src/types/v3/project.js";

const designerDir = resolve(__dirname, "..");
const repoRoot = resolve(designerDir, "..");

interface ProjectResources {
  projectId: string;
  displayName: string;
  projectDir: string;
  tables: TableDefinition[];
  conventions: ConventionsCatalog | null;
  conventionsV3: Conventions | null;
  screens: Screen[];
  viewDefinitions: ViewDefinition[];
  screenTransitions: ScreenTransitionEntry[];
  flowsDir: string;
}

interface ValidationIssue {
  validator: string;
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
}

interface FlowValidationResult {
  filePath: string;
  displayName: string;
  projectId: string;
  issues: ValidationIssue[];
}

interface ProjectValidationResult {
  projectId: string;
  displayName: string;
  issues: ValidationIssue[];
}

export interface ValidationSummary {
  totalFlows: number;
  passedFlows: number;
  failedFlows: number;
  results: FlowValidationResult[];
  projectResults: ProjectValidationResult[];
  projectCount: number;
  totalTableCount: number;
  totalConventionsCount: number;
  totalScreenCount: number;
  totalViewDefinitionCount: number;
  extensionFileCount: number;
}

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

function loadScreensFromDir(dir: string): Screen[] {
  if (!existsSync(dir)) return [];
  try {
    // `.design.json` は GrapesJS 状態ファイルのため除外 (Screen 定義ではない)
    const files = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.endsWith(".design.json"));
    return files.map((f) => JSON.parse(readFileSync(join(dir, f), "utf-8")) as Screen);
  } catch {
    return [];
  }
}

function loadViewDefinitionsFromDir(dir: string): ViewDefinition[] {
  if (!existsSync(dir)) return [];
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    return files.map((f) => JSON.parse(readFileSync(join(dir, f), "utf-8")) as ViewDefinition);
  } catch {
    return [];
  }
}

function loadScreenTransitionsFromProjectJson(projectDir: string): ScreenTransitionEntry[] {
  const filePath = join(projectDir, "project.json");
  if (!existsSync(filePath)) return [];
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf-8")) as { entities?: { screenTransitions?: ScreenTransitionEntry[] } };
    return raw.entities?.screenTransitions ?? [];
  } catch {
    return [];
  }
}

function discoverProject(projectDirArg: string): ProjectResources {
  const projectDir = isAbsolute(projectDirArg) ? projectDirArg : resolve(process.cwd(), projectDirArg);
  const stat = statSync(projectDir);
  if (!stat.isDirectory()) {
    throw new Error(`対象パスはディレクトリではありません: ${projectDir}`);
  }
  const projectId = basename(projectDir);
  const displayName = relative(repoRoot, projectDir).replace(/\\/g, "/") || ".";
  const conventions = loadConventionsFromFile(join(projectDir, "conventions", "catalog.json"));
  return {
    projectId,
    displayName,
    projectDir,
    tables: loadTablesFromDir(join(projectDir, "tables")),
    conventions,
    conventionsV3: conventions as Conventions | null,
    screens: loadScreensFromDir(join(projectDir, "screens")),
    viewDefinitions: loadViewDefinitionsFromDir(join(projectDir, "view-definitions")),
    screenTransitions: loadScreenTransitionsFromProjectJson(projectDir),
    flowsDir: join(projectDir, "actions"),
  };
}

function loadExtensions(projectDir: string): { extensions: LoadedExtensions; fileCount: number } {
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

  const extDir = join(projectDir, "extensions");
  if (existsSync(extDir)) {
    const allFiles = readdirSync(extDir, { recursive: true })
      .filter((f): f is string => typeof f === "string" && f.endsWith(".json"));
    for (const file of allFiles) {
      const fullPath = join(extDir, file);
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
        // 個別 extension の読み込みエラーは validator 側の互換性維持のため無視する。
      }
    }
  }

  const extBundle: ExtensionsBundle = {
    steps: Object.keys(bundle.steps.steps).length > 0 ? bundle.steps : undefined,
    fieldTypes: bundle.fieldTypes.fieldTypes.length > 0 ? bundle.fieldTypes : undefined,
    triggers: bundle.triggers.triggers.length > 0 ? bundle.triggers : undefined,
    dbOperations: bundle.dbOperations.dbOperations.length > 0 ? bundle.dbOperations : undefined,
    responseTypes: Object.keys(bundle.responseTypes.responseTypes).length > 0 ? bundle.responseTypes : undefined,
  };

  return { extensions: loadExtensionsFromBundle(extBundle).extensions, fileCount };
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

function issue(
  validator: string,
  code: string,
  path: string,
  message: string,
  severity: "error" | "warning" = "error",
): ValidationIssue {
  return { validator, code, path, message, severity };
}

/** items 必須 kind 白リスト — 該当しない kind は warning 発報をスキップ */
const ITEMS_REQUIRED_KINDS: ReadonlySet<string> = new Set([
  "form",
  "detail",
  "search",
  "confirm",
  "wizard",
]);

/** items 代替として viewDefinitionRefs を持てる kind */
const ITEMS_OR_VIEW_DEF_KINDS: ReadonlySet<string> = new Set([
  "list",
]);

/**
 * Check 1: Screen.items embed check (#714)
 *
 * - screens/<id>.json の items が空または未定義 → warning (EMPTY_SCREEN_ITEMS)
 *   ただし kind に応じた条件付き発報 (#723):
 *   - ITEMS_REQUIRED_KINDS (form/detail/search/confirm/wizard): items 空なら発報
 *   - ITEMS_OR_VIEW_DEF_KINDS (list): items 空 かつ viewDefinitionRefs も空/未定義なら発報
 *   - 拡張 kind (<ns>:<name>): 判定不能のため warning スキップ (安全側)
 *   - その他の kind (dashboard/complete/error 等): warning スキップ
 * - screen-items/ ディレクトリに .json ファイルが存在 → error (LEGACY_SCREEN_ITEMS_DIR)
 */
export function checkScreenItemsEmbedded(project: ProjectResources): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check 1a: items が空または未定義の screen (kind 別の条件付き発報 #723)
  for (const screen of project.screens) {
    if (screen.items && screen.items.length > 0) continue; // items あり → skip

    const id = screen.id ?? "unknown";
    const kind = typeof screen.kind === "string" ? screen.kind : "";

    // 拡張 ScreenKind (<ns>:<name>) は判定不能 → warning スキップ (安全側)
    if (kind.includes(":")) continue;

    // items 必須 kind にも viewDefinitionRefs 代替 kind にも該当しなければ warning スキップ
    if (!ITEMS_REQUIRED_KINDS.has(kind) && !ITEMS_OR_VIEW_DEF_KINDS.has(kind)) {
      continue;
    }

    // list 系で viewDefinitionRefs が 1+ 件あれば items 空でも OK
    if (
      ITEMS_OR_VIEW_DEF_KINDS.has(kind) &&
      Array.isArray(screen.viewDefinitionRefs) &&
      screen.viewDefinitionRefs.length > 0
    ) {
      continue;
    }

    // ここまで到達 → 真に items が必要なのに空
    const isViewDefKind = ITEMS_OR_VIEW_DEF_KINDS.has(kind);
    issues.push({
      validator: "runtimeContractValidator",
      severity: "warning",
      code: "EMPTY_SCREEN_ITEMS",
      path: `screens/${id}.json`,
      message: isViewDefKind
        ? `Screen.items が空です (kind=${kind})。viewDefinitionRefs も未定義のため UI で表示する内容がありません。\`items\` または \`viewDefinitionRefs\` を定義してください`
        : `Screen.items が空です (kind=${kind || "<undefined>"})。runtime は別ファイル \`screen-items/${id}.json\` を読まないため UI で空フォームになります。\`screens/${id}.json#items\` 配列に画面項目を embed してください`,
    });
  }

  // Check 1b: legacy screen-items/ ディレクトリが存在する場合
  const screenItemsDir = join(project.projectDir, "screen-items");
  if (existsSync(screenItemsDir)) {
    try {
      const files = readdirSync(screenItemsDir).filter((f) => f.endsWith(".json"));
      for (const file of files) {
        issues.push({
          validator: "runtimeContractValidator",
          severity: "error",
          code: "LEGACY_SCREEN_ITEMS_DIR",
          path: `screen-items/${file}`,
          message: `legacy 配置 \`screen-items/${file}\` を検出しました。runtime はこのディレクトリを読みません。\`screens/<id>.json#items\` に embed してください (#714)`,
        });
      }
    } catch {
      // ディレクトリ読み取りエラーは無視
    }
  }

  return issues;
}

/**
 * Check 2: Design file presence check (#714)
 *
 * - screens/<id>.design.json が存在しない → warning (MISSING_DESIGN_FILE)
 * - screen.design?.designFileRef が外部参照 (basename が <id>.design.json と不一致) → error (EXTERNAL_DESIGN_REF)
 */
export function checkDesignFilePresence(project: ProjectResources): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const screen of project.screens) {
    const id = screen.id ?? "unknown";
    const expectedDesignFile = `${id}.design.json`;

    // Check 2a: design.json ファイルが存在するか
    const designFilePath = join(project.projectDir, "screens", expectedDesignFile);
    if (!existsSync(designFilePath)) {
      issues.push({
        validator: "runtimeContractValidator",
        severity: "warning",
        code: "MISSING_DESIGN_FILE",
        path: `screens/${id}.json`,
        message: `\`screens/${expectedDesignFile}\` が存在しません。UI で空キャンバスになります (recoverable)`,
      });
    }

    // Check 2b: designFileRef が外部参照でないか
    const designFileRef = screen.design?.designFileRef;
    if (typeof designFileRef === "string" && basename(designFileRef) !== expectedDesignFile) {
      issues.push({
        validator: "runtimeContractValidator",
        severity: "error",
        code: "EXTERNAL_DESIGN_REF",
        path: `screens/${id}.json`,
        message: `designFileRef='${designFileRef}' は外部参照です。runtime はこれを読まず hard-coded path 'screens/${expectedDesignFile}' のみ参照します (#714)`,
      });
    }
  }

  return issues;
}

export async function runValidation(projectDirArg: string): Promise<ValidationSummary> {
  const project = discoverProject(projectDirArg);
  const { extensions, fileCount: extensionFileCount } = loadExtensions(project.projectDir);
  const flows = loadFlowsForProject(project);
  const results: FlowValidationResult[] = [];
  const projectResults: ProjectValidationResult[] = [];

  function validateOne(filePath: string, displayName: string, flow: ProcessFlow): FlowValidationResult {
    const issues: ValidationIssue[] = [];

    for (const i of checkSqlColumns(flow, project.tables)) {
      issues.push(issue("sqlColumnValidator", i.code, i.path, i.message));
    }

    for (const i of checkSqlOrder(flow, project.tables as unknown as OrderTableDefinition[])) {
      issues.push(issue("sqlOrderValidator", i.code, i.path, i.message, i.severity ?? "error"));
    }

    for (const i of checkConventionReferences(flow, project.conventions)) {
      issues.push(issue("conventionsValidator", i.code, i.path, i.message));
    }

    for (const i of checkReferentialIntegrity(flow, extensions)) {
      issues.push(issue("referentialIntegrity", i.code, i.path, i.message));
    }

    for (const i of checkIdentifierScopes(flow)) {
      issues.push(issue("identifierScope", i.code, i.path, `@${i.identifier} - ${i.message}`));
    }

    return { filePath, displayName, projectId: project.projectId, issues };
  }

  for (const { filePath, displayName, flow } of flows) {
    results.push(validateOne(filePath, displayName, flow));
  }

  const projectIssues: ValidationIssue[] = [];

  for (const i of checkScreenItemFlowConsistency(flows.map((f) => f.flow), project.screens)) {
    projectIssues.push(issue("screenItemFlowValidator", i.code, i.path, i.message, i.severity));
  }

  for (const i of checkScreenItemFieldTypeConsistency(flows.map((f) => f.flow), project.screens)) {
    projectIssues.push(issue("screenItemFieldTypeValidator", i.code, i.path, i.message, i.severity));
  }

  for (const i of checkScreenItemRefKeyConsistency(project.screens, project.conventionsV3)) {
    projectIssues.push(issue("screenItemRefKeyValidator", i.code, i.path, i.message, i.severity));
  }

  for (const i of checkViewDefinitions(
    project.viewDefinitions,
    project.tables as unknown as import("../src/schemas/viewDefinitionValidator.js").TableDefinitionForView[],
  )) {
    projectIssues.push(issue("viewDefinitionValidator", i.code, i.path, i.message, i.severity));
  }

  for (const i of checkScreenNavigation(flows.map((f) => f.flow), project.screens, project.screenTransitions)) {
    projectIssues.push(issue("screenNavigationValidator", i.code, i.path, i.message, i.severity));
  }

  for (const i of checkScreenItemsEmbedded(project)) {
    projectIssues.push(i);
  }

  for (const i of checkDesignFilePresence(project)) {
    projectIssues.push(i);
  }

  if (projectIssues.length > 0) {
    projectResults.push({
      projectId: project.projectId,
      displayName: project.displayName,
      issues: projectIssues,
    });
  }

  const hasErrorIssues = (r: FlowValidationResult) => r.issues.some((i) => i.severity === "error");
  const passedFlows = results.filter((r) => !hasErrorIssues(r)).length;
  const failedFlows = results.filter((r) => hasErrorIssues(r)).length;

  return {
    totalFlows: results.length,
    passedFlows,
    failedFlows,
    results,
    projectResults,
    projectCount: 1,
    totalTableCount: project.tables.length,
    totalConventionsCount: project.conventions ? 1 : 0,
    totalScreenCount: project.screens.length,
    totalViewDefinitionCount: project.viewDefinitions.length,
    extensionFileCount,
  };
}

const validatorDisplayOrder = [
  "sqlColumnValidator",
  "sqlOrderValidator",
  "conventionsValidator",
  "referentialIntegrity",
  "identifierScope",
  "screenItemFlowValidator",
  "screenItemFieldTypeValidator",
  "screenItemRefKeyValidator",
  "viewDefinitionValidator",
  "screenNavigationValidator",
  "runtimeContractValidator",
];

export function printSummary(summary: ValidationSummary): void {
  console.log("samples dogfood validation");
  console.log();
  console.log(
    `projects: ${summary.projectCount} / ${summary.totalFlows} flows / ${summary.totalTableCount} tables` +
    ` / ${summary.totalScreenCount} screens / ${summary.totalViewDefinitionCount} viewDefinitions` +
    ` / ${summary.totalConventionsCount} conventions catalogs / ${summary.extensionFileCount} extension files`,
  );
  console.log();

  for (const result of summary.results) {
    const errorIssues = result.issues.filter((i) => i.severity === "error");
    const warnIssues = result.issues.filter((i) => i.severity === "warning");
    if (errorIssues.length === 0 && warnIssues.length === 0) {
      console.log(`PASS ${result.displayName} (${validatorDisplayOrder.length} validators pass)`);
    } else if (errorIssues.length === 0) {
      console.log(`WARN ${result.displayName} (${validatorDisplayOrder.length} validators pass, ${warnIssues.length} warning(s))`);
      for (const i of warnIssues) {
        console.log(`   [WARN] [${i.validator}] [${i.code}] ${i.path}: ${i.message}`);
      }
    } else {
      console.log(`FAIL ${result.displayName}`);
      for (const i of result.issues) {
        const tag = i.severity === "warning" ? "WARN" : "ERROR";
        console.log(`   [${tag}] [${i.validator}] [${i.code}] ${i.path}: ${i.message}`);
      }
    }
  }

  if (summary.projectResults.length > 0) {
    console.log();
    console.log("project-level validation:");
    for (const pr of summary.projectResults) {
      console.log(`  ${pr.displayName}`);
      for (const i of pr.issues) {
        const tag = i.severity === "warning" ? "WARN" : "ERROR";
        console.log(`     [${tag}] [${i.validator}] [${i.code}] ${i.path}: ${i.message}`);
      }
    }
  }

  console.log();
  console.log("---------------------------------------------------------");

  const totalByValidator = new Map<string, number>();    // error
  const totalWarnByValidator = new Map<string, number>(); // warning
  let totalErrors = 0;
  let totalWarnings = 0;
  for (const result of summary.results) {
    for (const i of result.issues) {
      const map = i.severity === "warning" ? totalWarnByValidator : totalByValidator;
      map.set(i.validator, (map.get(i.validator) ?? 0) + 1);
      if (i.severity === "warning") totalWarnings++;
      else totalErrors++;
    }
  }
  for (const pr of summary.projectResults) {
    for (const i of pr.issues) {
      const map = i.severity === "warning" ? totalWarnByValidator : totalByValidator;
      map.set(i.validator, (map.get(i.validator) ?? 0) + 1);
      if (i.severity === "warning") totalWarnings++;
      else totalErrors++;
    }
  }

  console.log(`Summary: ${summary.passedFlows} / ${summary.totalFlows} flows passed.`);
  if (totalErrors === 0 && totalWarnings === 0) {
    console.log("All validations passed.");
  } else if (totalErrors === 0) {
    console.log(`All errors resolved (${totalWarnings} warning${totalWarnings > 1 ? "s remain" : " remains"}):`);
    for (const validator of validatorDisplayOrder) {
      const w = totalWarnByValidator.get(validator) ?? 0;
      if (w > 0) console.log(`  - [${validator}] ${w} warning${w > 1 ? "s" : ""}`);
    }
  } else {
    console.log(`${summary.failedFlows} flow${summary.failedFlows > 1 ? "s" : ""} failed with ${totalErrors} error${totalErrors > 1 ? "s" : ""}${totalWarnings > 0 ? ` and ${totalWarnings} warning${totalWarnings > 1 ? "s" : ""}` : ""}:`);
    for (const validator of validatorDisplayOrder) {
      const e = totalByValidator.get(validator) ?? 0;
      const w = totalWarnByValidator.get(validator) ?? 0;
      if (e > 0 || w > 0) {
        const parts: string[] = [];
        if (e > 0) parts.push(`${e} error${e > 1 ? "s" : ""}`);
        if (w > 0) parts.push(`${w} warning${w > 1 ? "s" : ""}`);
        console.log(`  - [${validator}] ${parts.join(", ")}`);
      }
    }
  }
  console.log("---------------------------------------------------------");
}

function parseArgs(argv: string[]): { projectDir: string } {
  const projectDir = argv.find((arg) => !arg.startsWith("-"));
  if (!projectDir) {
    throw new Error("対象プロジェクトディレクトリを指定してください。例: npm run validate:samples -- ../data");
  }
  return { projectDir };
}

// CLI エントリポイント: tsx で直接実行された場合のみ起動する
if (process.argv[1]?.endsWith("validate-samples.ts") || process.argv[1]?.endsWith("validate-samples.js")) {
  (async () => {
    try {
      const { projectDir } = parseArgs(process.argv.slice(2));
      const summary = await runValidation(projectDir);
      printSummary(summary);
      const projectErrorCount = summary.projectResults.reduce(
        (acc, pr) => acc + pr.issues.filter((i) => i.severity === "error").length,
        0,
      );
      process.exit(summary.failedFlows > 0 || projectErrorCount > 0 ? 1 : 0);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`ERROR ${message}`);
      process.exit(1);
    }
  })();
}
