---
name: generate-tests
description: project.techStack に基づき ProcessFlow JSON → backend integration test (E2E spec) を AI が生成する。P1 は TypeScript NestJS + jest (@nestjs/testing + supertest) をカバー。
argument-hint: <flowId> [出力先ディレクトリ]
disable-model-invocation: true
---

<!--
  使い方:
    /generate-tests 0671b051-4acc-49cf-ba92-9fa29b47f671
    /generate-tests 0671b051-4acc-49cf-ba92-9fa29b47f671 apps/api/test/generated

  目的:
    ProcessFlow JSON を読み取り、spec → test の体系的な変換ルールに従い
    NestJS E2E テストファイル (<flowName>.e2e-spec.ts) を生成する。
    ゴールデン出力 (golden-examples/) を参照してテスト品質を均一化する。

  設計判断 (D-1〜D-7、#870 で確定):
    D-1: 各 it() に "Spec: ProcessFlow <id> <step-id>" コメントでトレース anchor
    D-2: tableId → Prisma model 名の解決は harmony/tables/<id>.json の physicalName を参照
    D-3: txBoundary (begin..end) 含む step 群に故意失敗 TX rollback テストを生成
    D-4: section コメント anchor ベースで spec 由来 section のみ overwrite、人手 assertion section は保護
    D-5: runIf 条件分岐は true / false 両方のテストを生成
    D-6: test runner は NestJS jest (@nestjs/testing + supertest) で確定 (P1 スコープ)
    D-7: SQLite では --runInBand 必須、Postgres/MySQL なら並列可

  カバーするスコープ (P1):
    - techStack.backend.framework = "nestjs" のみ (それ以外は中止)
    - ProcessFlow inputs / validation / httpRoute / outputs / responses から test 生成
    - DB 副作用 (dbAccess INSERT/UPDATE/DELETE) の Prisma SELECT 検証
    - loop collectionSource の配列 N 件 assertion
    - txBoundary 故意失敗テスト (TX 未実装の場合は文書化テストとして生成)
    - runIf 分岐の両側テスト
    - affectedRowsCheck.onViolation=throw の 0 行誘起テスト
    - context.catalogs.errors → httpStatus assertion

  P1 スコープ外 (別 ISSUE で逐次拡張):
    - Spring Boot / Python FastAPI / Go Gin 等の他 techStack
    - Screen → frontend test (E2E Playwright)
    - 認証テンプレート (auth.method=session 等の非 jwt)
    - CI 自動化 (本スキルは AI 対話駆動のため CI に乗せない)
-->

ProcessFlow `$ARGUMENTS` から、NestJS E2E テストコードを生成します。

## Step 0: 引数解析

`$ARGUMENTS` を以下のように解析する。

- 第1引数 `<flowId>` (必須): UUID v4 形式
  - UUID でない場合は「引数エラー: UUID v4 形式で指定してください」と報告して中止
- 第2引数 `<出力先>` (任意): ディレクトリパス (default: `.tmp/generated-tests/<入力UUID8桁>/`)

出力先ディレクトリが存在しない場合はテスト生成前に作成する。

## Step 1: 入力読込

### 1-1. active workspace の harmony.json から techStack を取得

MCP ツール `workspace_status` または `workspace_inspect` で active workspace を特定し、
その `harmony.json` を Read で読む。

**フォールバック**: MCP 未接続の場合は `examples/diary/harmony.json` を読む。

```
harmony.techStack:
  backend.language, backend.framework
  database.type, database.version
  auth.method
```

### 1-2. 入力 UUID が processFlows に存在するか確認

`harmony.json` の `entities.processFlows[].id` を照合する。

- マッチ → ProcessFlow → backend test 生成へ (Step 3)
- マッチしない → 「ProcessFlow ID が見つかりません (harmony.json の entities.processFlows を確認してください)」と報告して中止
- Screen ID にマッチする場合 → 「P1 スコープ外: Screen の frontend test 生成は別スキルで対応予定です (ProcessFlow の flowId を指定してください)」と報告して中止

### 1-3. ProcessFlow JSON を Read で取得

- active workspace: `<workspace>/process-flows/<id>.json`
- フォールバック: `examples/<project-id>/harmony/process-flows/<id>.json`

### 1-4. tableId → physicalName index の構築 (D-2)

ProcessFlow に登場する tableId を収集し、各テーブルの physicalName を解決する。

```
テーブル index 構築手順:
1. ProcessFlow JSON 全体から tableId 値をすべて収集 (steps の lineage.writes / lineage.reads)
2. 各 tableId について harmony/tables/<tableId>.json を Read
3. physicalName を取得して map 化: { "<tableId>": "<physicalName>" }
   例: { "79d2c08c-...": "posts", "d8fc5f8a-...": "photos" }
4. Prisma model 名は physicalName の snake_case → PascalCase 変換
   例: "posts" → Post, "post_tags" → PostTag, "photos" → Photo
```

## Step 2: techStack 制約検証 (P1 スコープチェック)

以下を確認し、対象外の場合は中止する。

```
if techStack.backend.framework !== "nestjs":
  「P1 スコープ外: /generate-tests P1 は NestJS + jest のみサポートします。
   現在の techStack.backend.framework: "<value>"。
   他 techStack は別 ISSUE で対応予定。」と報告して中止

if techStack.backend.language !== "typescript":
  「P1 スコープ外: /generate-tests P1 は TypeScript のみサポートします。
   現在の techStack.backend.language: "<value>"。」と報告して中止
```

## Step 3: ProcessFlow → backend E2E test 生成

ゴールデン出力 (`.claude/skills/generate-tests/golden-examples/posts-create-e2e/`) を参照しながら、以下の変換ルールに従いテストファイルを生成する。

テンプレート規約: `.claude/skills/generate-tests/templates/backend/typescript-nestjs/E2E_SPEC.md` を Read して参照すること。

### 3-1. テストファイルの構造

```typescript
/**
 * E2E テスト: <httpRoute.method> <httpRoute.path> (<action.name>)
 *
 * // Spec anchor header (D-1 / D-4): skill 生成セクションの開始マーカー
 * // ===HARMONY_GENERATED_SECTION_START flowId=<id> actionId=<actionId>===
 *
 * ProcessFlow: <id> (<meta.name>)
 *
 * === spec → test mapping ===
 * (生成ルールのサマリを記述)
 *
 * // ===HARMONY_GENERATED_SECTION_END===
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
const request = require('supertest');  // Spike L-5: require で import
import { AppModule } from '../src/app.module';
import { PrismaClient } from '@prisma/client';
```

### 3-2. describe / beforeAll / afterAll / beforeEach / afterEach の命名

```typescript
describe('<httpRoute.method> <httpRoute.path> (<action.name> E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let accessToken: string;  // httpRoute.auth="required" の場合のみ
  let createdIds: { [table: string]: (number | string)[] } = {};  // cleanup 用

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: false }));
    await app.init();

    // DATABASE_URL 絶対パス対応 (Spike L-6)
    const dbPath = process.env.DATABASE_URL || `file:${require('path').resolve(__dirname, '../prisma/dev.db')}`;
    prisma = new PrismaClient({ datasources: { db: { url: dbPath } } });

    // JWT 取得 (httpRoute.auth="required" の場合)
    accessToken = await loginAsAdmin(app);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    // test data の seed (テスト間の独立性確保)
  });

  afterEach(async () => {
    // 作成データの cleanup (createdIds を走査)
  });

  // テストケース群 ...
});
```

### 3-3. spec → test 変換ルール (コア知識)

各ルールで生成する `it()` には必ず `Spec: ProcessFlow <flowId> <step-id>` コメントを付与すること (D-1)。

#### A. inputs[].required=true → missing field → 400

```
ProcessFlow:
  inputs[].name="<field>", required=true

生成テスト:
  /**
   * Spec: ProcessFlow <flowId> <actionId> step-<N> validation rule
   *   field=<field>, type=required
   */
  it('#N validation: <field> 欠落 → 400', async () => {
    const res = await request(app.getHttpServer())
      .post('<path>')
      .set('Authorization', `Bearer ${accessToken}`)  // auth=required の場合
      .send({ /* <field> を除いた必須フィールドのみ */ });
    expect(res.status).toBe(400);
  });
```

#### B. validation rules[].type ごとの boundary テスト

```
maxLength, length=N:
  → N+1 文字 → 400 (超過)
  → N 文字 → 201 (境界値 OK)

minLength, length=N:
  → N-1 文字 → 400 (不足)
  → N 文字 → 201 (境界値 OK)

enum, values=[...]:
  → enum 外の値 (例: "invalid") → 400

pattern, regexp="...":
  → pattern 違反の値 → 400
  → pattern に合致する値 → 201

range, min=M, max=N:
  → N+1 → 400
  → M-1 → 400
  → M / N → 201 (boundary OK)
```

#### C. outputs[].name → response.body assertion

```
ProcessFlow:
  outputs[].name="<field>", type="integer"

生成テスト (happy path の中に含める):
  expect(res.body).toHaveProperty('<field>');
  expect(typeof res.body.<field>).toBe('number');  // integer → number
```

type ↔ JS/TS assertion 対応:
| ProcessFlow type | assertion |
|---|---|
| integer | `typeof res.body.X === 'number'` |
| string | `typeof res.body.X === 'string'` |
| boolean | `typeof res.body.X === 'boolean'` |
| array | `Array.isArray(res.body.X)` |
| object | `typeof res.body.X === 'object' && res.body.X !== null` |

#### D. responses[].status → status code テスト

各 response に対して status code assertion を生成する。
正常系 (2xx) は happy path it() の中で確認。
エラー系 (4xx/5xx) は専用の it() として生成。

context.catalogs.errors[] の httpStatus を assertion 期待値として使う:
```
errors.VALIDATION_ERROR.httpStatus=400 → expect(res.status).toBe(400)
errors.UNAUTHORIZED.httpStatus=401 → expect(res.status).toBe(401)
```

#### E. httpRoute.auth="required" → JWT なし → 401

```
ProcessFlow:
  httpRoute.auth="required"
  context.catalogs.errors.UNAUTHORIZED.httpStatus=401

生成テスト:
  /**
   * Spec: ProcessFlow <flowId> act-001 httpRoute.auth="required"
   *   context.catalogs.errors.UNAUTHORIZED.httpStatus=401
   */
  it('#N auth: JWT なし → 401', async () => {
    const res = await request(app.getHttpServer())
      .post('<path>')
      .send({ /* 有効なボディ */ });
    expect(res.status).toBe(401);
  });
```

#### F. step.kind=dbAccess (INSERT) → DB 行追加 assertion

```
ProcessFlow:
  step.kind="dbAccess", operation="INSERT"
  lineage.writes[].tableId="<tableId>"

生成テスト:
  /**
   * Spec: ProcessFlow <flowId> <stepId>
   *   kind=dbAccess, operation=INSERT, lineage.writes=[<physicalName>]
   *   affectedRowsCheck: expected=1
   */
  it('#N DB 副作用: <physicalName> テーブルに row が追加される', async () => {
    const res = await request(...).post(...).send({...});
    expect(res.status).toBe(201);
    const id = res.body.<outputId>;
    createdIds['<physicalName>'] = [...(createdIds['<physicalName>'] ?? []), id];

    // Prisma で直接確認
    const row = await prisma.<ModelName>.findUnique({ where: { id } });
    expect(row).not.toBeNull();
    expect(row!.<field>).toBe(<expectedValue>);
  });
```

#### G. step.kind=loop + collectionSource → 配列 N 件 assertion (D-5, Spike L-3)

```
ProcessFlow:
  step.kind="loop", loopKind="collection", collectionSource="@inputs.<field>"
  inner step: dbAccess INSERT <childTable>

生成テスト:
  /**
   * Spec: ProcessFlow <flowId> <loopStepId>
   *   kind=loop, collectionSource=@inputs.<field>
   *   <innerStepId>: dbAccess INSERT <childTable>
   */
  it('#N DB 副作用: <field> N 件指定 → <physicalName> に N 行 + 親 ID 紐付け', async () => {
    const res = await request(...).post(...).send({
      ...,
      <field>: [item1, item2],
    });
    expect(res.status).toBe(201);
    const parentId = res.body.<id>;

    const rows = await prisma.<ChildModel>.findMany({ where: { <parentIdField>: parentId } });
    expect(rows).toHaveLength(2);
    expect(rows[0].<parentIdField>).toBe(parentId);
  });
```

#### H. step.txBoundary (role∈{begin,member,end}, 同一 txId) → 故意失敗テスト (D-3)

```
ProcessFlow:
  step.txBoundary.role="begin", txId="<txId>" から
  step.txBoundary.role="end" まで同一 txId の step 群がある場合

生成テスト:
  /**
   * Spec: ProcessFlow <flowId> <beginStepId>
   *   txBoundary.role="begin", txId="<txId>"
   *   <endStepId>: txBoundary.role="end"
   *
   * TX rollback 検証: 故意に UNIQUE/CHECK 制約違反を誘起して TX 全体が rollback されるか確認。
   * 注: $transaction を使わない実装では rollback が保証されないため「rollback なし」を文書化テストとして生成。
   */
  it('#N TX: <constraint 違反説明> → <expectedStatus> + TX rollback 確認', async () => {
    // TX 失敗を誘起する入力 (UNIQUE 違反等)
    const res = await request(...).post(...).send({ <failurePayload> });
    expect(res.status).toBe(500);  // or 409 depending on error handling

    // TX rollback の検証:
    //   $transaction 実装あり → 親テーブルに row が残らないこと
    //   $transaction 未実装 → 親テーブルに row が残ることを文書化
    const remainingRows = await prisma.<MainModel>.findMany({ where: { <identifierFilter> } });
    if (remainingRows.length > 0) {
      console.warn('[TX 文書化] TX が未実装: <stepId> 失敗後も <physicalName> 行が残存している。');
    }
    // cleanup
  });
```

#### I. affectedRowsCheck.onViolation="throw" → 0 行誘起 → 5xx テスト

```
ProcessFlow:
  step.affectedRowsCheck.operator="=", expected=1, onViolation="throw"

生成テスト:
  /**
   * Spec: ProcessFlow <flowId> <stepId>
   *   affectedRowsCheck: expected=1, onViolation=throw, errorCode=<errorCode>
   */
  it('#N affectedRowsCheck: 0 行 UPDATE → 5xx', async () => {
    // 存在しない ID を指定して affected rows = 0 を誘起
    const res = await request(...).patch('/<path>/999999').send({...});
    expect(res.status).toBeGreaterThanOrEqual(500);
  });
```

#### J. step.runIf → true / false 両分岐のテスト (D-5)

```
ProcessFlow:
  step.runIf="@tag.id == null"  (例: step-05-01)

生成テスト (true 分岐: runIf が truthy のケース):
  /**
   * Spec: ProcessFlow <flowId> <stepId> runIf="@tag.id == null"
   *   runIf=true: tag.id が未指定 → name で既存タグを検索
   */
  it('#N runIf=true: <条件説明> のケース', async () => { ... });

生成テスト (false 分岐: runIf が falsy のケース):
  /**
   * Spec: ProcessFlow <flowId> <stepId> runIf="@tag.id == null"
   *   runIf=false: tag.id が指定済み → name 検索をスキップ
   */
  it('#N runIf=false: <条件説明> のケース', async () => { ... });
```

#### K. step.kind=compute → DB 値で結果を確認

```
ProcessFlow:
  step.kind="compute", expression="@inputs.status == 'published' ? new Date().toISOString() : null"
  outputBinding.name="publishedAt"

生成テスト:
  // status="draft" → publishedAt=null
  // status="published" → publishedAt が non-null かつ現在時刻付近
  (happy path や別 it() で DB を SELECT して confirm)
```

### 3-4. テストケース番号付け規約

- `#1` Happy path (全フィールド指定の正常系 201)
- `#2〜` validation エラー系 (required → maxLength/minLength → enum → pattern → range の順)
- `#N` auth エラー (JWT なし → 401)
- `#N+` DB 副作用確認 (INSERT → loop → TX)
- `#N+` runIf 分岐
- `#N+` compute 結果確認 (publishedAt 等)
- `#N+` その他特殊ケース

## Step 4: テンプレート詳細参照

テスト生成の品質を担保するため以下のテンプレートを Read で参照すること:

```
.claude/skills/generate-tests/templates/
  backend/typescript-nestjs/
    E2E_SPEC.md   — テストファイル全体の構造規約 + コードテンプレート
```

ゴールデン出力も参照:

```
.claude/skills/generate-tests/golden-examples/
  posts-create-e2e/
    posts.create.e2e-spec.ts   — 投稿作成フロー (0671b051) のゴールデン (抽象化済)
    jest-e2e.json              — jest 設定テンプレート
    README.md                  — golden の使い方、人手 section 保護方針
```

## Step 5: spec トレースコメント規約 (D-1 / D-4)

### section anchor (D-4)

ファイル冒頭の doc コメントに以下の anchor を必ず含める:

```
// ===HARMONY_GENERATED_SECTION_START flowId=<flowId> actionId=<actionId>===
// (自動生成セクション: skill 再実行時に flowId / actionId が一致するセクションを overwrite)
// ===HARMONY_GENERATED_SECTION_END===
```

再生成時のルール:
1. 既存ファイルに anchor が存在する場合、`HARMONY_GENERATED_SECTION_START` から `HARMONY_GENERATED_SECTION_END` の間のみ overwrite
2. anchor の外 (人手追記 assertion 等) は保護

### it() コメント規約 (D-1)

各 `it()` の直前に JSDoc コメントとして spec の参照先を明記:

```typescript
/**
 * Spec: ProcessFlow <flowId> <actionId> <stepId>
 *   <spec 要素の説明 (field / rule type / operation 等)>
 */
it('#N <test description>', async () => { ... });
```

## Step 6: tableId → Prisma model 名解決 (D-2)

Step 1-4 で構築した tableId → physicalName map を使い、Prisma model 名を導出する。

```
snake_case → PascalCase 変換ルール:
  "posts"      → Post
  "post_tags"  → PostTag
  "photos"     → Photo
  "users"      → User
  "tags"       → Tag

Prisma client 呼び出し形式:
  prisma.post.findUnique(...)
  prisma.postTag.findMany(...)
  prisma.photo.findMany(...)
```

Prisma client プロパティ名は camelCase (PascalCase の先頭を小文字化):
  `Post` → `prisma.post`
  `PostTag` → `prisma.postTag`

## Step 7: 出力検証

生成したテストファイルを jest で実行して pass を確認する。

### 7-1. jest 実行コマンド

```bash
# SQLite の場合は --runInBand 必須 (D-7)
cd <project_root>/apps/api && npx jest --config test/jest-e2e.json --testPathPattern="<generated-filename>" --runInBand 2>&1 | tail -30
```

### 7-2. pass 確認

- 全テストケース pass → 完了
- fail の場合:
  1. エラーメッセージを確認し原因を特定
  2. 実装 (service / DTO) の不備か、テストの記述誤りかを判断
  3. テスト記述誤りならテストを修正して再実行
  4. 実装の不備なら「実装側の修正が必要: <詳細>」として申し送り

### 7-3. 実行不可の場合

jest 実行環境が整っていない場合 (DB 未起動等) はスキップし、最終レポートに以下を記載:
```
smoke 検証: スキップ (<理由>)
推奨コマンド: cd <project>/apps/api && npx jest --config test/jest-e2e.json --runInBand
```

## 制約 (必守)

- `schemas/*.json` を変更しない (schema ガバナンス #511)
- `data/` ディレクトリを変更しない
- `examples/` 配下の既存ファイルを変更しない
- `frontend/` / `backend/` のソースコードを変更しない
- 生成テストは `.tmp/generated-tests/` または指定した出力先に置く (プロジェクトルート直置き禁止)
- diary `apps/api/` は test ファイル追加 OK、本体実装変更不可
- CI に組み込まない (本スキルは AI 対話駆動、CI 自動化は別 ISSUE)

## 最終レポート

```markdown
## /generate-tests 完了: <processFlow.meta.name>

### 入力
- ProcessFlow ID: <uuid>
- ProcessFlow 名: <name>
- techStack: <backend.language>/<backend.framework>/<database.type>

### 生成ファイル
- `<出力先>/<flowName>.e2e-spec.ts` (N 行, M テストケース)
- `<出力先>/jest-e2e.json` (jest 設定)

### 生成テストケース一覧
| # | description | spec anchor |
|---|---|---|
| 1 | happy path: 全フィールド指定 → 201 | act-001 responses[id="201-created"] |
| 2 | validation: title 欠落 → 400 | act-001 step-01 required |
| ...

### smoke 検証
- jest 実行: ✓ N/N pass / スキップ (<理由>) / ❌ (<エラー詳細>)

### 申し送り (P2 以降)
- TX-1: <TX 実装状況>
- その他
```
