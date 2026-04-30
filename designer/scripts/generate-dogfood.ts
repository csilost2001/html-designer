#!/usr/bin/env node
/**
 * 設計データ投入スクリプト基盤 (#501 / #504)
 *
 * 業務概要から全仕様書 (ProcessFlow / テーブル / 拡張定義 / 規約) を生成するための
 * フレームワーク基盤。
 *
 * 使用法:
 *   cd designer && npm run generate:dogfood -- \
 *     --industry <業界名> \
 *     --scenarios <シナリオ概要> \
 *     --output <出力ディレクトリ> \
 *     [--mode dummy|ai] \
 *     [--dry-run]
 *
 * モード:
 *   dummy (デフォルト): 機械的なダミーデータを生成し、validate:dogfood を実行
 *   ai               : <output>/_briefing.md を生成し、AI Orchestrator への作業依頼を出力
 *
 * 終了コード:
 *   0: 生成成功 (dummy モード時は validate:dogfood も pass)
 *   1: エラーあり
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve, join, dirname, relative as pathRelative } from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  defaultRepoRoot,
  discoverProjects,
  findProjectById,
  type SampleProjectInfo,
} from "./sample-projects.js";

// ─── CLI 引数解析 ─────────────────────────────────────────────────────────────

type GenerateMode = "dummy" | "ai";

interface CliOptions {
  industry: string;
  scenarios: string;
  /** 出力先ディレクトリ。--project 指定時は省略可 (該当プロジェクトの projectDir を使う) */
  output: string;
  dryRun: boolean;
  mode: GenerateMode;
  /**
   * 既存サンプルプロジェクト ID (例: finance / retail / v1)。
   * 指定すると output 未指定でもプロジェクトディレクトリへ追記書き込みする per-project mode に切り替わる。
   * extension namespace も projectId に揃える。
   */
  projectId?: string;
  /** parseArgs() 内で --project 解決時に発見した SampleProjectInfo (resolveOutputLayout への引き回し用) */
  _resolvedProject?: SampleProjectInfo | null;
}

function parseArgs(argv: string[]): CliOptions {
  const args = argv.slice(2); // skip node + script path
  const opts: Partial<CliOptions> = { dryRun: false, mode: "dummy" };

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
      case "--project":
        opts.projectId = args[++i];
        break;
      case "--dry-run":
        opts.dryRun = true;
        break;
      case "--mode":
        {
          const modeVal = args[++i];
          if (modeVal !== "dummy" && modeVal !== "ai") {
            console.error(`エラー: --mode は dummy または ai を指定してください (指定値: ${modeVal})`);
            process.exit(1);
          }
          opts.mode = modeVal;
        }
        break;
      default:
        if (arg.startsWith("--industry=")) {
          opts.industry = arg.slice("--industry=".length);
        } else if (arg.startsWith("--scenarios=")) {
          opts.scenarios = arg.slice("--scenarios=".length);
        } else if (arg.startsWith("--output=")) {
          opts.output = arg.slice("--output=".length);
        } else if (arg.startsWith("--project=")) {
          opts.projectId = arg.slice("--project=".length);
        } else if (arg.startsWith("--mode=")) {
          const modeVal = arg.slice("--mode=".length);
          if (modeVal !== "dummy" && modeVal !== "ai") {
            console.error(`エラー: --mode は dummy または ai を指定してください (指定値: ${modeVal})`);
            process.exit(1);
          }
          opts.mode = modeVal;
        } else {
          console.warn(`警告: 不明なオプション: ${arg}`);
        }
    }
  }

  // --project 指定時: projectId を解決し、industry / output 未指定なら projectId から推論
  if (opts.projectId) {
    const project = findProjectById(opts.projectId);
    opts._resolvedProject = project;
    if (!project) {
      const available = discoverProjects()
        .map((p) => p.projectId)
        .join(", ");
      console.error(`エラー: --project ${opts.projectId} に該当するサンプルプロジェクトが見つかりません`);
      console.error(`  利用可能: ${available}`);
      process.exit(1);
    }
    if (!opts.output) {
      opts.output = project.projectDir;
    }
    if (!opts.industry) {
      opts.industry = opts.projectId;
    }
  }

  if (!opts.industry) {
    console.error("エラー: --industry が必要です (または --project を指定してください)");
    process.exit(1);
  }
  if (!opts.scenarios) {
    opts.scenarios = `${opts.industry} 業務シナリオ`;
  }
  if (!opts.output) {
    console.error("エラー: --output が必要です (または --project を指定してください)");
    process.exit(1);
  }

  return opts as CliOptions;
}

// ─── ディレクトリ準備 ─────────────────────────────────────────────────────────

interface OutputLayout {
  /** 既存サンプルプロジェクト情報 (新規 ad-hoc 出力時は null) */
  project: SampleProjectInfo | null;
  /** 出力ルート (project.projectDir または ad-hoc の output) */
  outputDir: string;
  /** flows 出力先ディレクトリ */
  flowsDir: string;
  /** tables 出力先ディレクトリ */
  tablesDir: string;
  /** extensions namespace ディレクトリ。v3 は <projectDir>/extensions、v1 / ad-hoc は <outputDir>/extensions/<safeId> */
  extensionsDir: string;
  /** extensions namespace ファイル名 (v3 のみ <ns>.v3.json、v1 / ad-hoc は field-types.json) */
  extensionsFileName: string;
  /** conventions catalog ファイルの絶対パス。v3 は conventions-catalog.v3.json、v1 / ad-hoc は conventions/conventions-catalog.json */
  conventionsCatalogFile: string;
}

/**
 * --project 指定時は既存サンプル構造に揃えた path を返す (per-project mode)。
 * 未指定時は ad-hoc 出力 (新規 outputDir 直下に v1 互換 flat 構造) を返す。
 */
function resolveOutputLayout(opts: CliOptions, safeId: string): OutputLayout {
  const outputDir = resolve(opts.output);

  if (opts.projectId) {
    const project = opts._resolvedProject;
    if (!project) {
      throw new Error(`--project ${opts.projectId} に該当するサンプルプロジェクトが見つかりません`);
    }
    if (project.variant === "v3") {
      return {
        project,
        outputDir: project.projectDir,
        flowsDir: project.flowsDir,
        tablesDir: project.tablesDir,
        extensionsDir: project.extensionsDir,
        extensionsFileName: `${safeId}.v3.json`,
        conventionsCatalogFile: project.conventionsCatalogFile,
      };
    }
    // v1
    return {
      project,
      outputDir: project.projectDir,
      flowsDir: project.flowsDir,
      tablesDir: project.tablesDir,
      extensionsDir: join(project.extensionsDir, safeId),
      extensionsFileName: "field-types.json",
      conventionsCatalogFile: project.conventionsCatalogFile,
    };
  }

  // ad-hoc 出力 (v1 互換 flat 構造)
  return {
    project: null,
    outputDir,
    flowsDir: join(outputDir, "process-flows"),
    tablesDir: join(outputDir, "tables"),
    extensionsDir: join(outputDir, "extensions", safeId),
    extensionsFileName: "field-types.json",
    conventionsCatalogFile: join(outputDir, "conventions", "conventions-catalog.json"),
  };
}

function prepareOutputDirs(layout: OutputLayout): void {
  const dirs = [
    layout.outputDir,
    layout.flowsDir,
    layout.tablesDir,
    layout.extensionsDir,
    dirname(layout.conventionsCatalogFile),
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

// ─── AI モード: briefing.md 生成 ─────────────────────────────────────────────

/**
 * シナリオ文字列をリストに分解する。
 * カンマ・読点・改行で分割し、空文字を除去する。
 */
function parseScenarios(scenarios: string): string[] {
  return scenarios
    .split(/[,、\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * AI Orchestrator 向け briefing.md を生成する (#504)。
 *
 * briefing には以下を含める:
 *  - 業界 namespace
 *  - シナリオ分解結果
 *  - 4 種仕様書の生成指示
 *  - /create-flow の 14 ルール全列挙
 *  - validate:dogfood 検証手順
 *  - 既知制約 (#499 / #492 由来)
 */
function generateBriefingContent(opts: {
  industry: string;
  safeId: string;
  scenarios: string;
  outputDir: string;
  layout: OutputLayout;
}): string {
  const { industry, safeId, scenarios, outputDir, layout } = opts;
  const scenarioList = parseScenarios(scenarios);
  const scenarioBullets = scenarioList
    .map((s, i) => `${i + 1}. ${s}`)
    .join("\n");

  // briefing 内のリソース path 表記は per-project layout に従う
  const variant = layout.project?.variant ?? "ad-hoc";
  const flowsRel = relativeFromOutput(outputDir, layout.flowsDir);
  const tablesRel = relativeFromOutput(outputDir, layout.tablesDir);
  const extensionsFileRel = relativeFromOutput(outputDir, join(layout.extensionsDir, layout.extensionsFileName));
  const conventionsRel = relativeFromOutput(outputDir, layout.conventionsCatalogFile);
  const fallbackConventionsSource = findFallbackConventionsSource();
  const fallbackConventionsLabel = fallbackConventionsSource
    ? relativeFromRepoRoot(fallbackConventionsSource)
    : "(既存サンプルなし)";

  return `# 設計データ投入 briefing — ${industry}

生成日時: ${new Date().toISOString()}
生成元スクリプト: \`designer/scripts/generate-dogfood.ts --mode ai\`

---

## 業界 namespace

\`${safeId}\` (業界: \`${industry}\`、レイアウト: \`${variant}\`)

## 業務概要 (シナリオ群)

以下のシナリオから業務フロー・テーブル・拡張定義・規約を生成してください:

${scenarioBullets}

---

## 生成すべき仕様書

作業ディレクトリ: \`${outputDir}/\`

### 1. 拡張定義 (\`${extensionsFileRel}\`)

業界固有の拡張定義を作成:
- field-types: 業界固有の型 (例: \`${safeId}Id\` / \`${safeId}Name\` など)
- triggers: 業界固有トリガー (該当あれば)
- db-operations: 業界固有 DB 操作 (該当あれば)
- steps: 業界固有メタステップ (該当あれば)

ファイル形式 (v1): \`{ namespace: "${safeId}", fieldTypes/triggers/dbOperations/steps: [...] }\` を種別ごとに別ファイルで出力
ファイル形式 (v3): \`{ namespace: "${safeId}", fieldTypes/actionTriggers/dbOperations/stepKinds: [...] }\` を 1 ファイルに統合

### 2. テーブル定義 (\`${tablesRel}/<uuid>.json\`) × N テーブル

シナリオ群から推論されるエンティティを正規化したテーブル定義。
各テーブルに以下を含める:
- \`id\`, \`name\` (snake_case), \`logicalName\` (日本語), \`description\`, \`category\`
- \`columns[]\`: id / name / logicalName / dataType / notNull / primaryKey / unique / (autoIncrement)
- \`indexes[]\`

### 3. conventions 拡張 (\`${conventionsRel}\`)

既存 catalog (\`${fallbackConventionsLabel}\`) をベースに
業界固有 \`@conv.limit.*\` / \`@conv.numbering.*\` 等を追加した版を出力。

### 4. 処理フロー (\`${flowsRel}/<uuid>.json\`) × ${scenarioList.length} シナリオ

各シナリオに対して 1 フロー生成:

${scenarioList.map((s, i) => `- シナリオ ${i + 1}: ${s}`).join("\n")}

**\`/create-flow\` の 14 ルール self-check を遵守すること (Rule 1〜14 全列挙)**:

| Rule | 観点 |
|------|------|
| 1 | 変数ライフサイクル — 全 \`@varName\` は実行順で先に設定済み。TX 内から TX 外変数の前方参照禁止。\`@input.x\` は誤り (\`@inputs.x\` が正) |
| 2 | TransactionScope 内外整合 — TX 内 step は TX 開始前変数のみ参照。外部呼び出し step は TX 内に入れない |
| 3 | runIf 連鎖の網羅性 — 冪等 UPSERT 後の全 step に同条件 runIf。no-op パスに対応する return step |
| 4 | branch / elseBranch 到達性 — 全 branch/elseBranch が return か後続 step に到達。branch 内 return 後の fallthrough 禁止 |
| 5 | compensatesFor 参照健全性 — \`compensatesFor: "step-X"\` の step-X が同 action 内に実在 |
| 6 | eventsCatalog ⇄ eventPublish 双方向整合 — 宣言した全イベントに対応 eventPublish step が存在 |
| 7 | 外部呼び出しと TX 位置関係 — externalSystem step は TX inner にいない。TX 外なら補償処理を明記 |
| 8 | rollbackOn 発火可能性 — TX inner step から実際に発生しうるエラーコードのみ列挙。死コード rollbackOn 禁止 |
| 9 | SQL SELECT カラム整合 — 後続 step で \`@bind.column\` 参照するカラムが SELECT 句に含まれているか |
| 10 | \`@conv.*\` 参照の catalog 整合 — 参照する全 \`@conv.*\` キーが catalog に存在するか |
| 11 | TX 内 branch return 後の制御 — TX inner で branch を使い return する場合、後続 inner step に fallthrough しないか |
| 12 | \`affectedRowsCheck.operator\` は \`=\` のみ (\`==\` / \`!=\` は schema 違反) |
| 13 | \`affectedRowsCheck.expected\` は integer リテラル必須 (\`@var\` 参照不可) |
| 14 | \`OtherStep.outputSchema\` 形式 — \`{field: "string"}\` 形式のみ受容 (複雑 JSON Schema 不可) |

各フローは \`docs/legacy-sample-project/process-flows/cccccccc-0007-*.json\` (5/5 達成サンプル) の構造を参考に生成。

---

## AI Orchestrator への作業依頼

このディレクトリ (\`${outputDir}/\`) を作業対象として、上記 4 種類の仕様書を生成してください。

### 推奨手順

1. 出力ルート \`${outputDir}/\` のディレクトリ骨格は本スクリプトで作成済 (extensions / process-flows / tables / conventions)
2. Sonnet/Opus サブエージェントを Spawn し、1 シナリオずつ並列実装可能
3. 各サブエージェントは \`/create-flow\` SKILL の 14 ルールを遵守
4. 生成物が \`docs/sample-project/\` (v1) または \`docs/sample-project-v3/<projectId>/\` (v3) 配下にあれば、そのまま \`validate:dogfood\` の per-project スキャン対象となる (#615 / #617)
5. 検出された問題を 3 分類別 (フレームワーク / 拡張定義 / サンプル設計) に集計

### 検証コマンド

\`\`\`bash
cd designer
npm run validate:dogfood
\`\`\`

> 注意: validate:dogfood は \`docs/sample-project/\` (v1) と \`docs/sample-project-v3/<projectId>/\` (v3) を per-project スキャンする (#615)。
> 出力先が上記サンプルルート配下なら自動検出される。それ以外のディレクトリへ生成した場合はサンプルルート配下に移動してから再実行してください。

---

## 既知制約 (#499 / #492 由来)

### SQL 制約 (#499 / Phase 2-1c で実証済)

- SQL は \`node-sql-parser\` 互換 (PostgreSQL 拡張は使えない):
  - \`||\` 文字列結合 → \`CONCAT(...)\` に置換
  - \`MERGE INTO\` → \`INSERT ... ON CONFLICT DO UPDATE\` に置換
  - \`FOR UPDATE\` 句は使わない
  - \`VALUES @paramArray\` のパラメータ化 VALUES は使わない

### 拡張 step 参照形式 (#492 / PR #494 で schema 改修済)

- 拡張 step の \`type\` は \`<namespace>:<StepName>\` 形式が schema valid
  - 例: \`"type": "${safeId}:SomeStep"\`
  - 後方互換: \`"type": "other"\` + \`outputSchema\` 形式も引き続き valid

### typeRef 制約

- 全 \`typeRef\` は \`extensions/response-types.json\` に定義必須

---

## 参考資料

- 既存 5/5 達成サンプル: \`docs/legacy-sample-project/process-flows/cccccccc-0007-*.json\`
- /create-flow SKILL: \`.claude/skills/create-flow/SKILL.md\`
- spec: \`docs/spec/process-flow-*.md\`
- 既存 conventions テンプレート: \`${fallbackConventionsLabel}\`
- 既存サンプル一覧 (v1 / v3 全件): \`docs/sample-project/\` および \`docs/sample-project-v3/<projectId>/\`
`;
}

// ─── ユーティリティ (briefing template 用) ───────────────────────────────────

/**
 * outputDir 起点で targetPath を相対化。Windows path 区切りも正規化する。
 */
function relativeFromOutput(outputDir: string, targetPath: string): string {
  const rel = pathRelative(outputDir, targetPath);
  return rel.replace(/\\/g, "/") || ".";
}

function relativeFromRepoRoot(targetPath: string): string {
  const rel = pathRelative(defaultRepoRoot(), targetPath);
  return rel.replace(/\\/g, "/") || ".";
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

// ─── エントリーポイント (dummy モード) ───────────────────────────────────────

export function generate(opts: CliOptions): {
  flowId: string;
  tableId: string;
  flowPath: string;
  tablePath: string;
  extensionPath: string;
  conventionsPath: string;
} {
  const { industry, scenarios, dryRun } = opts;
  const safeId = toSafeId(industry);
  const layout = resolveOutputLayout(opts, safeId);

  console.log("🚀 generate-dogfood 開始 (dummy モード)");
  console.log(`  industry : ${industry}`);
  console.log(`  scenarios: ${scenarios}`);
  console.log(`  output   : ${layout.outputDir}`);
  if (layout.project) {
    console.log(`  project  : ${layout.project.projectId} (${layout.project.variant})`);
  }
  console.log(`  dry-run  : ${dryRun}`);
  console.log();

  // 1. ディレクトリ準備
  if (!dryRun) {
    prepareOutputDirs(layout);
    console.log("📁 出力ディレクトリを作成しました");
  } else {
    console.log("[dry-run] ディレクトリ作成をスキップ");
  }
  console.log();

  // 2. テーブル生成
  const tableId = randomUUID();
  const tableName = `${safeId}_items`;
  const tablePath = join(layout.tablesDir, `${tableId}.json`);
  const tableData = generateDummyTable({ id: tableId, industry, safeId });

  console.log("📊 テーブル定義を生成:");
  writeJson(tablePath, tableData, dryRun);

  // 3. フロー生成
  const flowId = randomUUID();
  const flowPath = join(layout.flowsDir, `${flowId}.json`);
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
  const extensionPath = join(layout.extensionsDir, layout.extensionsFileName);
  const extensionData = generateDummyFieldTypes({ industry, safeId });

  console.log("🔌 拡張定義を生成:");
  if (!dryRun) {
    mkdirSync(dirname(extensionPath), { recursive: true });
  }
  writeJson(extensionPath, extensionData, dryRun);

  // 5. 規約カタログ生成
  // 既存 catalog があればベースに業界固有 limit を追記、無ければ最小骨格を生成
  const conventionsPath = layout.conventionsCatalogFile;
  const conventionsData = generateDummyConventions({
    industry,
    safeId,
    sourceConventionsFile: existsSync(conventionsPath) ? conventionsPath : findFallbackConventionsSource(),
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

/**
 * 既存サンプルから convention catalog のテンプレートを探す。
 * v1 → v3 の優先順で最初に見つかった catalog を返す。無ければ undefined。
 */
function findFallbackConventionsSource(): string | undefined {
  const projects = discoverProjects();
  for (const variant of ["v1", "v3"] as const) {
    for (const p of projects) {
      if (p.variant !== variant) continue;
      if (existsSync(p.conventionsCatalogFile)) return p.conventionsCatalogFile;
    }
  }
  return undefined;
}

// ─── エントリーポイント (AI モード) ──────────────────────────────────────────

export interface GenerateAiResult {
  briefingPath: string;
  outputDir: string;
}

/**
 * AI モード: ディレクトリ骨格 + _briefing.md を生成し、
 * AI Orchestrator (Claude Code) が後続の仕様書生成を継続できる briefing を出力する。
 *
 * 実際の AI 委譲は本スクリプト外で行う設計 (Claude Code Sonnet/Opus サブエージェント spawn 想定)。
 * Anthropic API 直接呼び出しは Phase 4-1c 別 ISSUE で対応。
 */
export function generateAi(opts: CliOptions): GenerateAiResult {
  const { industry, scenarios, dryRun } = opts;
  const safeId = toSafeId(industry);
  const layout = resolveOutputLayout(opts, safeId);
  const outputDir = layout.outputDir;

  console.log("🚀 generate-dogfood 開始 (AI モード)");
  console.log(`  industry : ${industry}`);
  console.log(`  scenarios: ${scenarios}`);
  console.log(`  output   : ${outputDir}`);
  if (layout.project) {
    console.log(`  project  : ${layout.project.projectId} (${layout.project.variant})`);
  }
  console.log(`  dry-run  : ${dryRun}`);
  console.log();

  const briefingPath = join(outputDir, "_briefing.md");

  if (dryRun) {
    console.log("[dry-run] ディレクトリ作成をスキップ");
    console.log(`[dry-run] 書き込みスキップ: ${briefingPath}`);
    console.log();
    console.log("ℹ️  --dry-run モード: 実際の生成はスキップしました");
    console.log("   生成予定ファイル:");
    console.log(`     ${briefingPath}`);
    console.log("   生成予定ディレクトリ:");
    console.log(`     ${layout.flowsDir}/`);
    console.log(`     ${layout.tablesDir}/`);
    console.log(`     ${layout.extensionsDir}/`);
    console.log(`     ${dirname(layout.conventionsCatalogFile)}/`);
    return { briefingPath, outputDir };
  }

  // 1. ディレクトリ骨格作成
  prepareOutputDirs(layout);
  console.log("📁 出力ディレクトリを作成しました");
  console.log();

  // 2. briefing.md 生成
  const content = generateBriefingContent({ industry, safeId, scenarios, outputDir, layout });
  writeFileSync(briefingPath, content, "utf-8");
  console.log(`📝 briefing を生成: ${briefingPath}`);
  console.log();

  // 3. 次の手順をターミナルに表示
  console.log("✅ generate-dogfood 完了 (AI モード)");
  console.log();
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🤖 次の手順: AI Orchestrator (Claude Code) で仕様書生成を継続してください");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log();
  console.log(`  briefing ファイル: ${briefingPath}`);
  console.log();
  console.log("  💡 推奨手順:");
  console.log("     1. 別セッションで Claude Code を起動 (claude コマンド)");
  console.log(`     2. _briefing.md を読み込む: Read ${briefingPath}`);
  console.log("     3. briefing の指示に従って ProcessFlow / テーブル / 拡張定義 / 規約を生成");
  console.log("     4. 生成物が docs/sample-project/ または docs/sample-project-v3/<projectId>/ 配下なら、validate:dogfood で per-project 検証可能 (#615 / #617)");
  console.log();
  console.log("  ℹ️  AI モードでは validate:dogfood は実行しません (生成物がまだないため)");

  return { briefingPath, outputDir };
}

// ─── CLI モード ───────────────────────────────────────────────────────────────

const opts = parseArgs(process.argv);

if (opts.mode === "ai") {
  // AI モード: briefing 生成のみ、validate:dogfood は実行しない
  generateAi(opts);
} else {
  // dummy モード (#501 既存ロジック)
  const result = generate(opts);

  // dry-run でなければ validate:dogfood を実行
  if (!opts.dryRun) {
    // validate:dogfood は docs/sample-project/ (v1) と docs/sample-project-v3/<projectId>/ (v3)
    // を per-project スキャンする (#615 / #617)。
    // 生成先がいずれかの配下なら自動検出される。それ以外なら検証はスキップして警告のみ表示。
    const designerDir = resolve(__dirname, "..");
    const repoRoot = resolve(designerDir, "..");
    const isUnderSampleRoot =
      result.flowPath.startsWith(resolve(repoRoot, "docs/sample-project")) ||
      result.flowPath.startsWith(resolve(repoRoot, "docs/sample-project-v3"));
    if (isUnderSampleRoot) {
      runValidateDogfood(designerDir);
    } else {
      console.log();
      console.log("ℹ️  生成先がサンプルルート (docs/sample-project / docs/sample-project-v3) 配下ではないため、");
      console.log("   validate:dogfood は実行しませんでした。生成物をサンプルルート配下に移動して再実行してください。");
    }
  } else {
    console.log();
    console.log("ℹ️  --dry-run モード: validate:dogfood はスキップしました");
    console.log("   生成予定ファイル:");
    console.log(`     ${result.flowPath}`);
    console.log(`     ${result.tablePath}`);
    console.log(`     ${result.extensionPath}`);
    console.log(`     ${result.conventionsPath}`);
  }
}
