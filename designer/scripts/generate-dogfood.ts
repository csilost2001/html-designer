#!/usr/bin/env node
/**
 * 設計データ投入スクリプト基盤 (#501)
 *
 * 業務概要から全仕様書 (ProcessFlow / テーブル / 拡張定義 / 規約) を生成するための
 * フレームワーク基盤。本 ISSUE では基盤実装のみで、AI 推論呼び出しは仮実装 (ダミー生成)。
 *
 * 使用法:
 *   cd designer && npm run generate:dogfood -- \
 *     --industry <業界名> \
 *     --scenarios <シナリオ概要> \
 *     --output <出力ディレクトリ> \
 *     [--dry-run]
 *
 * 終了コード:
 *   0: 生成成功 (validate:dogfood も pass)
 *   1: エラーあり
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

// ─── CLI 引数解析 ─────────────────────────────────────────────────────────────

interface CliOptions {
  industry: string;
  scenarios: string;
  output: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const args = argv.slice(2); // skip node + script path
  const opts: Partial<CliOptions> = { dryRun: false };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--industry":
        opts.industry = args[++i];
        break;
      case "--scenarios":
        opts.scenarios = args[++i];
        break;
      case "--output":
        opts.output = args[++i];
        break;
      case "--dry-run":
        opts.dryRun = true;
        break;
      default:
        if (arg.startsWith("--industry=")) {
          opts.industry = arg.slice("--industry=".length);
        } else if (arg.startsWith("--scenarios=")) {
          opts.scenarios = arg.slice("--scenarios=".length);
        } else if (arg.startsWith("--output=")) {
          opts.output = arg.slice("--output=".length);
        } else {
          console.warn(`警告: 不明なオプション: ${arg}`);
        }
    }
  }

  if (!opts.industry) {
    console.error("エラー: --industry が必要です");
    process.exit(1);
  }
  if (!opts.scenarios) {
    opts.scenarios = `${opts.industry} 業務シナリオ`;
  }
  if (!opts.output) {
    console.error("エラー: --output が必要です");
    process.exit(1);
  }

  return opts as CliOptions;
}

// ─── ディレクトリ準備 ─────────────────────────────────────────────────────────

function prepareOutputDirs(outputDir: string, industry: string): void {
  const dirs = [
    outputDir,
    join(outputDir, "process-flows"),
    join(outputDir, "tables"),
    join(outputDir, "extensions", industry),
    join(outputDir, "conventions"),
  ];
  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
  }
}

// ─── ダミーデータ生成 ─────────────────────────────────────────────────────────

/**
 * 業界名から安全な識別子を生成 (半角英数字・ハイフンのみ)
 */
function toSafeId(industry: string): string {
  return industry
    .toLowerCase()
    .replace(/[^\w-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || "industry";
}

/**
 * 最小限の valid な ProcessFlow を生成する。
 * - 1 action、validation step + return step のみ
 * - 拡張定義の field-type を 1 つ使用
 *
 * 注意 (Phase 4-1b): 本 ISSUE では AI 推論なし。業界名から機械的にフィールドを生成する。
 */
function generateDummyFlow(opts: {
  id: string;
  industry: string;
  safeId: string;
  scenarios: string;
  tableId: string;
  tableName: string;
}): unknown {
  const { id, industry, safeId, scenarios, tableId, tableName } = opts;
  const now = new Date().toISOString();
  const idField = `${safeId}Id`;
  const colName = `${safeId}_id`;

  return {
    id,
    name: `${industry}登録`,
    type: "screen",
    description: `${scenarios} — ${industry} 登録画面の処理フロー定義 (生成: generate-dogfood)`,
    mode: "upstream",
    maturity: "provisional",
    actions: [
      {
        id: `act-${safeId}-001`,
        name: "登録ボタン",
        trigger: "submit",
        maturity: "provisional",
        httpRoute: {
          method: "POST",
          path: `/api/${safeId}/register`,
          auth: "session",
        },
        responses: [
          {
            id: "200-success",
            status: 200,
            bodySchema: {
              schema: {
                type: "object",
                required: [idField],
                properties: {
                  [idField]: { type: "integer" },
                },
              },
            },
            description: "登録成功",
          },
          {
            id: "400-validation",
            status: 400,
            bodySchema: { typeRef: "ApiError" },
            description: "入力不正",
          },
        ],
        inputs: [
          {
            name: "name",
            label: "名称",
            type: "string",
            required: true,
          },
        ],
        outputs: [
          {
            name: idField,
            label: `${industry}ID`,
            type: "integer",
          },
        ],
        steps: [
          {
            id: `step-${safeId}-001`,
            type: "validation",
            maturity: "provisional",
            description: "入力値チェック",
            conditions: "名称の必須チェック",
            rules: [
              {
                field: "name",
                type: "required",
                message: "@conv.msg.required",
              },
            ],
            inlineBranch: {
              ok: "次のステップへ続行",
              ng: "400 VALIDATION で return",
              ngResponseRef: "400-validation",
            },
          },
          {
            id: `step-${safeId}-002`,
            type: "dbAccess",
            maturity: "provisional",
            description: `${industry}情報登録`,
            tableName,
            tableId,
            operation: "INSERT",
            sql: `INSERT INTO ${tableName} (name) VALUES (@name) RETURNING id`,
            outputBinding: idField,
          },
          {
            id: `step-${safeId}-003`,
            type: "return",
            maturity: "provisional",
            description: "登録成功レスポンス",
            responseRef: "200-success",
          },
        ],
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 最小限の valid なテーブル定義を生成する。
 */
function generateDummyTable(opts: {
  id: string;
  industry: string;
  safeId: string;
}): unknown {
  const { id, industry, safeId } = opts;
  const tableName = `${safeId}_items`;
  const now = new Date().toISOString();

  return {
    id,
    name: tableName,
    logicalName: `${industry}マスタ`,
    description: `${industry} の基本情報を管理する (generate-dogfood 生成)`,
    category: "マスタ",
    columns: [
      {
        id: "col-001",
        name: "id",
        logicalName: "ID",
        dataType: "INTEGER",
        notNull: true,
        primaryKey: true,
        unique: false,
        autoIncrement: true,
      },
      {
        id: "col-002",
        name: "name",
        logicalName: "名称",
        dataType: "VARCHAR",
        length: 200,
        notNull: true,
        primaryKey: false,
        unique: false,
      },
      {
        id: "col-003",
        name: "created_at",
        logicalName: "作成日時",
        dataType: "TIMESTAMP",
        notNull: true,
        primaryKey: false,
        unique: false,
        defaultValue: "CURRENT_TIMESTAMP",
      },
      {
        id: "col-004",
        name: "updated_at",
        logicalName: "更新日時",
        dataType: "TIMESTAMP",
        notNull: true,
        primaryKey: false,
        unique: false,
        defaultValue: "CURRENT_TIMESTAMP",
      },
    ],
    indexes: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 業界固有の field-types 拡張定義を生成する。
 * (Phase 4-1b で AI 推論に置き換え予定)
 */
function generateDummyFieldTypes(opts: {
  industry: string;
  safeId: string;
}): unknown {
  const { industry, safeId } = opts;
  return {
    namespace: safeId,
    fieldTypes: [
      {
        kind: `${safeId}Id`,
        label: `${industry} ID`,
      },
      {
        kind: `${safeId}Name`,
        label: `${industry}名`,
      },
    ],
  };
}

/**
 * 規約カタログのコピー + 業界固有の limit を 1 つ追加して出力する。
 */
function generateDummyConventions(opts: {
  industry: string;
  safeId: string;
  sourceConventionsFile?: string;
}): unknown {
  const { industry, safeId, sourceConventionsFile } = opts;

  // 既存 conventions-catalog.json があればベースとして使う
  if (sourceConventionsFile && existsSync(sourceConventionsFile)) {
    try {
      const base = JSON.parse(readFileSync(sourceConventionsFile, "utf-8")) as Record<string, unknown>;
      // 業界固有の limit を追加
      const limits = (base.limit ?? {}) as Record<string, unknown>;
      limits[`${safeId}NameMax`] = {
        value: 200,
        unit: "char",
        description: `${industry}名最大長`,
      };
      base.limit = limits;
      base.updatedAt = new Date().toISOString();
      return base;
    } catch {
      // フォールバック: 最小限の conventions を生成
    }
  }

  // 最小限の conventions catalog
  return {
    version: "1.0.0",
    description: `${industry} 業務規約カタログ (generate-dogfood 生成)`,
    updatedAt: new Date().toISOString(),
    msg: {
      required: {
        template: "{label}は必須入力です",
        params: ["label"],
        description: "非空必須エラーの既定メッセージ",
      },
    },
    limit: {
      [`${safeId}NameMax`]: {
        value: 200,
        unit: "char",
        description: `${industry}名最大長`,
      },
    },
  };
}

// ─── ファイル書き込み ─────────────────────────────────────────────────────────

function writeJson(filePath: string, data: unknown, dryRun: boolean): void {
  const content = JSON.stringify(data, null, 2);
  if (dryRun) {
    console.log(`  [dry-run] 書き込みスキップ: ${filePath}`);
    console.log(`            ${content.split("\n")[0]}...`);
  } else {
    writeFileSync(filePath, content, "utf-8");
    console.log(`  ✅ 書き込み: ${filePath}`);
  }
}

// ─── validate:dogfood 統合 ────────────────────────────────────────────────────

function runValidateDogfood(designerDir: string): void {
  console.log();
  console.log("🔍 validate:dogfood を実行中...");

  const isWin = process.platform === "win32";
  const result = spawnSync(
    isWin ? "npm.cmd" : "npm",
    ["run", "validate:dogfood"],
    {
      cwd: designerDir,
      stdio: "inherit",
      shell: false,
    },
  );

  console.log();
  if (result.status === 0) {
    console.log("✅ 生成サンプルは validate:dogfood 全 pass");
  } else {
    console.log("⚠️  生成サンプルで validation エラーがあります。改善ループに進んでください");
    process.exit(1);
  }
}

// ─── エントリーポイント ───────────────────────────────────────────────────────

export function generate(opts: CliOptions): {
  flowId: string;
  tableId: string;
  flowPath: string;
  tablePath: string;
  extensionPath: string;
  conventionsPath: string;
} {
  const { industry, scenarios, output, dryRun } = opts;
  const safeId = toSafeId(industry);
  const outputDir = resolve(output);

  console.log("🚀 generate-dogfood 開始");
  console.log(`  industry : ${industry}`);
  console.log(`  scenarios: ${scenarios}`);
  console.log(`  output   : ${outputDir}`);
  console.log(`  dry-run  : ${dryRun}`);
  console.log();

  // 1. ディレクトリ準備
  if (!dryRun) {
    prepareOutputDirs(outputDir, safeId);
    console.log("📁 出力ディレクトリを作成しました");
  } else {
    console.log("[dry-run] ディレクトリ作成をスキップ");
  }
  console.log();

  // 2. テーブル生成
  const tableId = randomUUID();
  const tableName = `${safeId}_items`;
  const tablePath = join(outputDir, "tables", `${tableId}.json`);
  const tableData = generateDummyTable({ id: tableId, industry, safeId });

  console.log("📊 テーブル定義を生成:");
  writeJson(tablePath, tableData, dryRun);

  // 3. フロー生成
  const flowId = randomUUID();
  const flowPath = join(outputDir, "process-flows", `${flowId}.json`);
  const flowData = generateDummyFlow({
    id: flowId,
    industry,
    safeId,
    scenarios,
    tableId,
    tableName,
  });

  console.log("📋 処理フローを生成:");
  writeJson(flowPath, flowData, dryRun);

  // 4. 拡張定義生成
  const extensionPath = join(outputDir, "extensions", safeId, "field-types.json");
  const extensionData = generateDummyFieldTypes({ industry, safeId });

  console.log("🔌 拡張定義を生成:");
  if (!dryRun) {
    mkdirSync(dirname(extensionPath), { recursive: true });
  }
  writeJson(extensionPath, extensionData, dryRun);

  // 5. 規約カタログ生成
  // docs/sample-project/conventions/conventions-catalog.json があればベースとして使う
  const designerDir = resolve(__dirname, "..");
  const sampleConventionsFile = resolve(
    designerDir,
    "../docs/sample-project/conventions/conventions-catalog.json",
  );
  const conventionsPath = join(outputDir, "conventions", "conventions-catalog.json");
  const conventionsData = generateDummyConventions({
    industry,
    safeId,
    sourceConventionsFile: sampleConventionsFile,
  });

  console.log("📜 規約カタログを生成:");
  writeJson(conventionsPath, conventionsData, dryRun);

  console.log();
  console.log("✅ generate-dogfood 完了");
  console.log(`  フロー  : ${flowPath}`);
  console.log(`  テーブル: ${tablePath}`);
  console.log(`  拡張定義: ${extensionPath}`);
  console.log(`  規約    : ${conventionsPath}`);

  return { flowId, tableId, flowPath, tablePath, extensionPath, conventionsPath };
}

// ─── CLI モード ───────────────────────────────────────────────────────────────

const opts = parseArgs(process.argv);
const result = generate(opts);

// dry-run でなければ validate:dogfood を実行
if (!opts.dryRun) {
  // validate:dogfood は docs/sample-project/ を見る。
  // --output docs/sample-project/ 専用 (本格対応は別 ISSUE)
  const designerDir = resolve(__dirname, "..");
  runValidateDogfood(designerDir);
} else {
  console.log();
  console.log("ℹ️  --dry-run モード: validate:dogfood はスキップしました");
  console.log("   生成予定ファイル:");
  console.log(`     ${result.flowPath}`);
  console.log(`     ${result.tablePath}`);
  console.log(`     ${result.extensionPath}`);
  console.log(`     ${result.conventionsPath}`);
}
