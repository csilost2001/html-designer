# Schema 設計思想ドキュメント

**Issue**: #514  
**策定日**: 2026-04-27  
**ステータス**: 初版 (Phase B-2 成果物)  
**前提ドキュメント**: [`schema-governance.md`](schema-governance.md) — ガバナンスルール (AI 向け変更禁止規定)

---

本ドキュメントは、`schemas/process-flow.schema.json` を中心とするグローバル定義スキーマの**設計思想・命名規約・構造ルール・判断基準**を明文化する。

設計者 (フレームワーク製作者) が schema を拡張・変更するとき、また AI が拡張機構 (プラグイン) や業務 JSON を記述するとき、本ドキュメントを参照することで、既存の設計哲学と整合した判断を下せる。

---

## 目次

1. [概要 (Overview)](#1-概要-overview)
2. [命名規約 (Naming Conventions)](#2-命名規約-naming-conventions)
3. [構造ルール (Structural Rules)](#3-構造ルール-structural-rules)
4. [フォーマット規約 (Format Conventions)](#4-フォーマット規約-format-conventions)
5. [コア構造 (Core Structures)](#5-コア構造-core-structures)
6. [拡張判断ガイドライン (Extension Decision Guide)](#6-拡張判断ガイドライン-extension-decision-guide)
7. [後方互換性ルール (Backward Compatibility)](#7-後方互換性ルール-backward-compatibility)
8. [テスト規約 (Testing Conventions)](#8-テスト規約-testing-conventions)
9. [文書化ルール (Documentation Conventions)](#9-文書化ルール-documentation-conventions)
- [付録 A: 各設計画面でのコード補完設計](#付録-a-各設計画面でのコード補完設計)
- [付録 B: 用語集 (Glossary)](#付録-b-用語集-glossary)
- [付録 C: 関連ドキュメント](#付録-c-関連ドキュメント)

---

## 1. 概要 (Overview)

### 1.1 このフレームワークの一次成果物は JSON Schema

本フレームワークの**一次成果物は業務 JSON である**。画面デザイン・テーブル定義・処理フロー定義をいずれも JSON で記述し、AI エージェントがそれを読み取って実装コードを生成する。

従来の業務システム設計では、設計者が画面定義書・テーブル設計書・処理フロー図を「人間向けドキュメント」として作成し、実装者がそれを読んで解釈した。本フレームワークは逆転させる:

- **設計者** → JSON Schema に準拠した業務 JSON を記述
- **AI エージェント** → JSON を機械可読で読み取り、実装コードを生成
- **人間エンジニア** → AI の出力をレビューし、必要に応じて修正

この前提から、次の設計原則が導かれる:

1. **形式情報のみで業務理解が完結する** — `description` の地の文に頼らず、型・フィールド構造・enum 値のみから AI が実装を生成できること
2. **曖昧さを構造で排除する** — 「IN または OUT」「nullable または not-null」を文章ではなく JSON 構造で表現
3. **拡張可能だが統一性を保つ** — 業界固有概念はプラグインで、汎用概念はグローバル schema で

### 1.2 コア schema vs 拡張機構の役割分担

| 層 | ファイル位置 | 責任者 | 何を置くか |
|---|---|---|---|
| **グローバル schema** | `schemas/*.json` | フレームワーク製作者 (設計者) のみ | どの業務プロジェクトでも合理的に必要な型・構造・enum |
| **拡張定義** | `data/extensions/<namespace>/*.json` | 業務開発者 (AI 含む) | プロジェクト固有・業界固有の型・ステップ・操作 |
| **業務規約カタログ** | `docs/sample-project/conventions/` | 業務開発者 | 命名・採番・バリデーションの業務規約値 |
| **業務データ JSON** | `data/process-flows/` など | 業務開発者 | 実業務の処理フロー・テーブル定義・画面項目定義 |

**核心原則**: グローバル schema は本フレームワークの統一性・互換性の根幹。各業務開発者が勝手に拡張すると、フレームワーク価値が失墜する。詳細は [`schema-governance.md`](schema-governance.md) を参照。

### 1.3 本ドキュメントと governance の関係

- **`schema-governance.md`** — 誰が何を変更できるかのルール (AI 向け禁止事項、変更プロセス)
- **本ドキュメント (schema-design-principles.md)** — なぜその構造になっているかの設計思想 (設計者向けガイド)
- **`schema-audit-2026-04-27.md`** — 過去変更の履歴監査レポート (102 コミット精査)

3 ドキュメントを合わせて「schema 変更プロセスの三本柱」を構成する。

---

## 2. 命名規約 (Naming Conventions)

### 2.1 フィールド命名の基本

**camelCase** を使用する。PascalCase は型名 (`$defs` 内の型定義名) に使用し、インスタンスフィールドには使わない。

```json
// OK
{ "systemName": "Stripe", "httpCall": { "method": "POST" }, "outputBinding": "result" }

// NG (snake_case / PascalCase をフィールドに使わない)
{ "system_name": "Stripe", "HttpCall": { "method": "POST" }, "OutputBinding": "result" }
```

**型名 (schema の `$defs` キー)** は PascalCase:
```json
"$defs": {
  "ProcessFlowType": { ... },
  "StepBaseProps": { ... },
  "ExternalSystemStep": { ... }
}
```

### 2.2 enum 値の慣習

enum 値の形式はドメイン性質によって使い分ける:

| 種類 | 形式 | 例 | 理由 |
|---|---|---|---|
| **type 系** (概念の種類) | camelCase / kebab-case | `"screen"` / `"batch"` / `"approval-sequential"` | 自然言語に近いキー的な値 |
| **verb 系** (操作の種類) | UPPER_SNAKE | `"SELECT"` / `"INSERT"` / `"MERGE"` | SQL 慣習・大文字で視認性 |
| **role 系** (役割) | kebab-case または lowercase | `"begin"` / `"member"` / `"end"` | ステート機械的な有限集合 |
| **status 系** (状態) | lowercase 単語 | `"draft"` / `"committed"` / `"proposed"` | 状態遷移の直感的表現 |
| **kind 系** (動作種別) | PascalCase | `"Error"` / `"Msg"` / `"Noaccept"` | GeneXus 由来の固有名詞的性質 |
| **HTTP メソッド** | UPPER | `"GET"` / `"POST"` / `"PUT"` | RFC 7231 準拠 |

**禁止**: 同一 enum 内での混在。一度決めた形式は揃える。

### 2.3 参照フィールド命名 (`xxxRef` パターン)

別の定義を参照するフィールドには `Ref` サフィックスを付ける。この命名により「ここはキー参照である」「ここには参照先の定義が展開されない」ことが自明になる。

| フィールド名 | 参照先 |
|---|---|
| `systemRef` | `ProcessFlow.externalSystemCatalog` のキー |
| `eventRef` | `ProcessFlow.eventsCatalog` のキー |
| `responseRef` | `ActionDefinition.responses[].id` |
| `domainRef` | `ProcessFlow.domainsCatalog` のキー |
| `typeRef` | extensions の responseTypes キー |
| `operationRef` | OpenAPI operation への JSON Pointer |
| `requestBodyRef` | OpenAPI requestBody スキーマへの JSON Pointer |

**`patternRef`**: `ValidationRule.pattern` の規約参照バリアント (`@conv.regex.*` 参照で正規表現リテラルをハードコードしない)。

**`minRef` / `maxRef`**: `ValidationRule` の数値制限を `@conv.limit.*` 参照で指定するバリアント (数値リテラルのハードコード回避)。

参照形式の一般則: `xxxRef` フィールドは **文字列型**。参照先のオブジェクト全体を埋め込む場合は `xxxRef` ではなく `xxx` (例: `auth: ExternalAuth` は埋め込み)。

### 2.4 カタログ系フィールド命名 (`xxxCatalog` パターン)

ProcessFlow レベルに置く辞書形式 (キー → 定義) のフィールドには `Catalog` サフィックスを付ける。

| フィールド名 | 型 | 内容 |
|---|---|---|
| `errorCatalog` | `Record<string, ErrorCatalogEntry>` | errorCode → HTTP ステータス・メッセージ・responseRef |
| `externalSystemCatalog` | `Record<string, ExternalSystemCatalogEntry>` | systemId → 接続情報・認証・タイムアウト |
| `secretsCatalog` | `Record<string, SecretRef>` | secretId → 取得元・ローテーション設定 |
| `envVarsCatalog` | `Record<string, EnvVarEntry>` | 環境変数キー → 型・環境別値 |
| `domainsCatalog` | `Record<string, DomainDef>` | ドメイン名 → 型・制約・UI ヒント |
| `functionsCatalog` | `Record<string, FunctionDef>` | 関数名 → シグネチャ・説明・例 |
| `eventsCatalog` | `Record<string, EventDef>` | トピック名 → ペイロード定義 |

**設計原則**: カタログは「同じ値が複数箇所に散在する」問題を解消するための DRY 化機構。同一 errorCode が `affectedRowsCheck`・`BranchCondition`・`responses` に重複して現れる場合、`errorCatalog` に一元化する。

### 2.5 変数参照プレフィックス

式文字列の中でのプレフィックス規約:

| プレフィックス | 種類 | 例 |
|---|---|---|
| `@` | 変数参照 (outputBinding 名 / inputs 名 / ambientVariables 名) | `@customerId`, `@order.totalAmount`, `@items[0].qty` |
| `@inputs.` | ActionDefinition.inputs フィールドへの全体参照 (推奨スタイル) | `@inputs.items`, `@inputs.userId` |
| `@conv.` | 業務規約カタログ (`conventions-catalog.json`) への参照 | `@conv.regex.phone-jp`, `@conv.limit.quantityMax` |
| `@fn.` | functionsCatalog への関数呼び出し参照 | `@fn.formatCurrency(@subtotal, 'JPY')` |
| `@env.` | envVarsCatalog への参照 | `@env.MAX_RETRY_COUNT` |
| `$` | Arazzo Runtime Expression (外部 API response 参照 等) | `$response.body`, `$statusCode` |

`@` と `$` は**役割が異なる**:
- `@` — フロー内部の変数参照 (outputBinding で定義した変数・アクション inputs)
- `$` — Arazzo 互換の実行時参照 (外部 API のレスポンス・ステータスコード)

---

## 3. 構造ルール (Structural Rules)

### 3.1 フィールド追加判断基準

新しいフィールドをグローバル schema に追加するかどうかの判断フロー:

```
業務記述に新しい概念が出現
        │
        ▼
【拡張機構で代替できるか?】
 ① 拡張 fieldType / trigger / db-operation / step で表現できる
        │ YES → data/extensions/<namespace>/*.json に追加 (グローバル変更不要)
        │ NO  ↓
【既存スキーマフィールドで代替できるか?】
 ② type: "other" + outputSchema + description で意図を伝えられる
 ③ @conv.* 参照で業務規約カタログに逃がせる
 ④ description / note フィールドで人間向けに補足できる
        │ YES → 代替表現で完成 (グローバル変更不要)
        │ NO  ↓
【本当に汎用的に必要か?】
 「このフィールドはどの業務プロジェクトでも合理的に必要になるか?」
        │ NO  → プラグインに留める (グローバル schema に入れない)
        │ YES ↓
作業停止 → 別 ISSUE 起票 (improve(schema): ...) → 設計者レビュー待ち
(詳細は schema-governance.md §3 を参照)
```

**具体的な「グローバルに入る」基準の例**:
- `"file"` FieldType — バッチ処理はどの業種でも必要 ✓
- `"auto"` ActionTrigger — スケジュール自動実行はどの業種でも必要 ✓
- `"MERGE"` / `"LOCK"` DbOperation — PostgreSQL 標準操作 ✓
- GM50 固有の `"TBL"` 型 — 特定フレームワーク固有 → プラグインへ ✗

### 3.2 `oneOf` / `anyOf` / `allOf` の使い分け

#### `oneOf` — 完全に排他的な分岐

フィールドがとり得る値が「どれか 1 つだけ」の場合。Step の型分岐が典型例。

```json
"Step": {
  "oneOf": [
    { "$ref": "#/$defs/ValidationStep" },
    { "$ref": "#/$defs/DbAccessStep" },
    { "$ref": "#/$defs/BranchStep" },
    ...
  ]
}
```

`"type"` フィールドによる `const` 制約で discriminator として機能する。ValidationError 時に「どの候補に近いか」が明確になる。

`FieldType` でも使用: `string` primitive か `{kind: "array"}` か `{kind: "object"}` かは完全に排他。

`BranchCondition` / `OutputBinding` / `BodySchemaRef` でも使用: 旧形式 (string) と新形式 (object) の union を `oneOf` で表現。

#### `anyOf` — 複数同時許容

現状、本スキーマでは `anyOf` を直接使用していない。`oneOf` + optional fields で表現するのが基本方針。

#### `allOf` — 共通部分 + 個別部分の合成

Step variant の定義で常套手段として使用。全 Step に共通の `StepBaseProps` と、各 Step 固有のフィールドを合成する:

```json
"ValidationStep": {
  "allOf": [
    { "$ref": "#/$defs/StepBaseProps" },    // 共通フィールド (id, description, runIf, ...)
    {
      "type": "object",
      "required": ["id", "type", "description", "conditions"],
      "additionalProperties": false,
      "properties": {
        // StepBaseProps のフィールドを true (許可) として列挙
        "id": true, "description": true, ...
        // ValidationStep 固有フィールド
        "type": { "const": "validation" },
        "conditions": { "type": "string" },
        "rules": { ... }
      }
    }
  ]
}
```

**この allOf パターンの設計意図**:
- `StepBaseProps` に共通フィールドを 1 箇所で定義し、全 Step variant で共有
- `additionalProperties: false` を variant 側に置くことで、各 variant に許可されないフィールドをスキーマレベルで弾く
- `id: true` のような `true` による許可リストは「このフィールドは StepBaseProps 側で定義済み」を示す

### 3.3 必須 / 任意 / 条件付き必須の方針

#### 必須 (`required` 配列に含める)

**業務理解に絶対不可欠なフィールドのみ**を必須にする。

| フィールド | 理由 |
|---|---|
| `id` | 他のフィールドからの参照に使う。必須でないと参照先が解決できない |
| `name` / `description` | AI が業務意図を読み取る最重要情報。欠落は業務理解不能 |
| `type` | Step variant の discriminator。必須でないと oneOf のどれに当たるか判定不能 |
| `trigger` (ActionDefinition) | いつ実行されるかが不明な action は業務定義として不完全 |
| `status` (DecisionRecord) | ADR の状態 (提案/採択/廃止) が不明では設計判断の追跡が不能 |

#### 任意 (required に含めない)

- **補助情報**: `note` / `notes` / `label` / `description` (既に別フィールドで意図が伝わる場合)
- **最適化情報**: `cache` / `lineage` / `sla` — あれば有用だが、なくても動作定義として完全
- **業務詳細**: `httpRoute` / `responses` / `auth` — type=`"screen"` には不要だが、type=`"system"` では有用
- **後方互換フィールド**: `protocol` (DEPRECATED, `httpCall` に移行推奨)

#### 条件付き必須 (JSON Schema `if/then` で表現)

特定の field 値に応じて他フィールドが必須になるケース:

```json
"Sla": {
  "if": {
    "properties": { "onTimeout": { "enum": ["throw", "compensate"] } },
    "required": ["onTimeout"]
  },
  "then": { "required": ["errorCode"] }
}
```

`onTimeout: "throw"` / `"compensate"` の場合、`errorCode` なしでは例外のキャッチが不能なため必須。`onTimeout: "log"` / `"continue"` なら不要。

他の条件付き必須の例:
- `BranchStep.branches[]` で `kind: "tryCatch"` → `tryScope` を強く推奨 (現状 soft)
- `ExternalSystemStep` で `operationRef` 指定時 → `systemRef` が参照整合性の観点で実質必須

---

### 3.4 `additionalProperties: false` の方針

**すべての `$defs` エントリに `additionalProperties: false` を設定する**。

これにより:
- タイポのフィールド名が黙って無視されるのを防ぐ
- AI が「このフィールドを追加していいか」を schema validation で即座に確認できる
- 将来の schema 拡張で意図しないフィールドが通り抜けるのを防ぐ

例外として `additionalProperties: true` または省略を使うのは以下の場合のみ:
- `TestPrecondition.kind: "sessionContext"` の `context` — 業務文脈依存の任意構造
- `AffectedRowsCheck` の参照先など、事前に形状が定まらない構造

---

## 4. フォーマット規約 (Format Conventions)

### 4.1 ID 形式 (UUID v4)

ProcessFlow / ActionDefinition / Step / TestScenario 等の `id` フィールドはすべて **UUID v4 形式** を想定する。

```
"id": "cccccccc-0001-0000-0000-000000000001"   // サンプルプロジェクト規約: cccccccc プレフィックス
"id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"  // 実プロジェクト: ランダム UUID v4
```

スキーマ上は `"type": "string"` のみ (format 指定なし) だが、運用上は UUID を期待する。

**サンプルプロジェクトの命名規約**:
- ProcessFlow: `cccccccc-<NNNN>-...` 形式で連番管理
- Table: `tttttttt-...`
- Screen: `ssssssss-...`

### 4.2 参照形式 (@記法 / $記法)

式フィールド (文字列型で評価される) での参照形式:

**`@` 記法 (フロー内部変数参照)**:

```
@identifier           # outputBinding で定義した変数名
@inputs.fieldName     # ActionDefinition.inputs のフィールド名 (推奨スタイル)
@conv.regex.phone-jp  # 業務規約カタログへの参照
@conv.limit.max       # 数値制限の規約参照
@conv.msg.required    # エラーメッセージの規約参照
@fn.formatCurrency    # functionsCatalog への関数参照
@env.MAX_RETRY        # envVarsCatalog への参照
@secret.stripeKey     # secretsCatalog への参照 (将来)
```

**`$` 記法 (Arazzo Runtime Expression、外部 API レスポンス参照)**:

`ExternalSystemStep.successCriteria` / `StructuredCriterion.expression` で使用。

```
$statusCode           # HTTP ステータスコード
$response.body        # レスポンス body 全体
$response.body#/id    # レスポンス body の JSON Pointer
```

`@` と `$` は**共存可能**だが、スコープが異なる:
- `@` → フロー変数 (outputBinding が生成する)
- `$` → Arazzo Runtime Expression (HTTP 実行コンテキストから生成)

### 4.3 SQL 規約

`DbAccessStep.sql` で記述する SQL の制約:

**使用可能な方言**: PostgreSQL (ANSI SQL + PostgreSQL 拡張の基本セット)

**式補間**: `@variable` 記法 → prepared statement パラメータバインドに変換 (静的文字列置換ではない)

```sql
-- OK: prepared statement バインド
UPDATE inventory SET stock = stock - @item.quantity WHERE id = @item.id

-- OK: IN 句の配列展開
SELECT * FROM orders WHERE id IN (@orderIds)

-- OK: PostgreSQL 標準操作
INSERT INTO orders (...) RETURNING id, created_at
```

**禁止事項**:
- ストアドプロシージャ呼び出し (`CALL ...`) — 処理はフロー JSON で表現
- `EXECUTE` / 動的 SQL — インジェクションリスクがあり、フロー定義として不透明
- PostgreSQL 固有拡張のうち非標準なもの — node-sql-parser 互換を維持

**`bulkValues` との組み合わせ**:

```json
{
  "type": "dbAccess",
  "tableName": "order_items",
  "operation": "INSERT",
  "bulkValues": "@orderItemValues",
  "sql": "INSERT INTO order_items (order_id, item_id, qty) SELECT ... FROM (VALUES @orderItemValues) AS v(order_id, item_id, qty)"
}
```

`bulkValues` と `sql` の整合性はバリデータではなく実装側の責務。

### 4.4 式言語規約 (js-subset)

`runIf` / `expression` / `condition` / `bodyExpression` 等、式が現れるフィールドの言語仕様:

**許容構文**: `js-subset` (JavaScript のサブセット、BNF は [`process-flow-expression-language.md`](process-flow-expression-language.md) 参照)

**主要制約**:
- `@` プレフィックスで変数参照
- 算術 `+ - * / %`、比較 `== != < <= > >=`、論理 `&& || !`
- 配列メソッド `.filter()` `.map()` `.find()` `.some()` `.every()` + アロー関数 (単純 body のみ)
- `Math.floor/ceil/round/abs/min/max` のみ許容

**禁止**: 代入 `=`、`var/let/const`、`new`、`this`、テンプレートリテラル、三項演算子、非同期

**Convention over Configuration の原則**: スキーマ上は `string` のまま、実装者は js-subset として評価する。言語の宣言フィールド (`expressionLang`) は今のところ不要 (1 種類のみ)。

---

## 5. コア構造 (Core Structures)

### 5.1 ProcessFlow 全体構造

最上位オブジェクトのフィールドを責務別に分類する:

**識別・メタデータ**:
- `id`, `name`, `createdAt`, `updatedAt` — 必須
- `type` (ProcessFlowType) — 実行コンテキストを決定 (後述 §5.1.1)
- `description` — 必須。AI の最初の読解ポイント
- `maturity` — 成熟度 3 値 (`draft` / `provisional` / `committed`)
- `mode` — 上流 / 下流モード (`upstream` / `downstream`)
- `apiVersion` — API バージョン識別子

**運用・非機能**:
- `sla` — タイムアウト・P95 レイテンシ目標
- `health` / `readiness` — ヘルスチェック・レディネスチェック
- `resources` — CPU / Memory / DB 接続数の見積

**カタログ群** (§2.4 参照):
- `errorCatalog`, `externalSystemCatalog`, `secretsCatalog`
- `envVarsCatalog`, `domainsCatalog`, `functionsCatalog`, `eventsCatalog`
- `ambientVariables`, `ambientOverrides`

**業務本体**:
- `actions` — 必須。1〜複数の ActionDefinition の配列

**補助・管理**:
- `markers` — 人間 ↔ AI 間のコミュニケーション (マーカー)
- `testScenarios` — Given-When-Then テストシナリオ
- `glossary` — ビジネス用語集
- `decisions` — ADR / 設計判断ログ

#### 5.1.1 ProcessFlowType と用途

| type 値 | 意味 | 典型的なトリガー |
|---|---|---|
| `"screen"` | 画面操作に紐付く処理 (フォーム submit, ボタン click 等) | `ActionTrigger.click/submit/change/load/select` |
| `"system"` | システム間 API (同期 REST 等) | `ActionTrigger.auto` |
| `"batch"` | バッチ処理 (一括 CSV 取込・一括更新等) | `ActionTrigger.auto` |
| `"scheduled"` | 定時実行ジョブ | `ActionTrigger.timer` |
| `"common"` | 複数フローから参照される共通処理 | `CommonProcessStep.refId` から呼ばれる |
| `"other"` | 上記に当たらないフロー | 任意 |

`type` によって一部フィールドの意味が変わる:
- `type: "screen"` → `screenId` フィールドが有効 (どの画面に紐付くか)
- `type: "batch"` / `"scheduled"` → `httpRoute` は通常不要

### 5.2 ActionDefinition 構造

ProcessFlow は 1〜複数の `ActionDefinition` を持つ。各 action は「1 つのユーザー操作 / システムイベント」に対応する。

**必須フィールド**: `id`, `name`, `trigger`, `steps`

**HTTP 契約** (type=`"system"` / `"screen"` で REST API を提供する場合):
- `httpRoute` — METHOD + path + auth 要件
- `responses[]` — 返し得る HTTP レスポンス一覧 (id, status, bodySchema, when)

**入出力**:
- `inputs` — `string` (旧形式) または `StructuredField[]` (新形式)
- `outputs` — 同上

`StructuredField` の `type` は `FieldType` (§5.3 で詳述)。

### 5.3 Step.oneOf バリアント体系

全 Step は `Step.oneOf` のいずれかに属する。`type` フィールドを discriminator として使う。

#### 制御フロー系

| type | 責務 | 主要フィールド |
|---|---|---|
| `"branch"` | 条件分岐 (`if/else if/else`) | `branches[]`, `elseBranch`, `tryScope` |
| `"loop"` | ループ (count / condition / collection) | `countExpression`, `conditionExpression`, `collectionSource`, `collectionItemName` |
| `"loopBreak"` | ループ中断 | (StepBase のみ) |
| `"loopContinue"` | ループ次反復へスキップ | (StepBase のみ) |
| `"jump"` | 別ステップへジャンプ | `targetStepId` |

#### データ操作系

| type | 責務 | 主要フィールド |
|---|---|---|
| `"validation"` | バリデーション | `conditions`, `rules[]`, `inlineBranch` |
| `"dbAccess"` | DB CRUD | `tableName`, `operation`, `sql`, `affectedRowsCheck`, `bulkValues`, `cache`, `lineage` |
| `"compute"` | 計算式・変数代入 | `expression`, `outputBinding` |
| `"return"` | HTTP レスポンス返却 | `responseRef`, `bodyExpression` |

#### 連携系

| type | 責務 | 主要フィールド |
|---|---|---|
| `"externalSystem"` | 外部 API 呼び出し | `systemName`, `systemRef`, `httpCall`, `outcomes`, `successCriteria` |
| `"commonProcess"` | 共通処理呼び出し | `refId`, `argumentMapping` |
| `"eventPublish"` | イベント発行 | `topic`, `eventRef`, `payload` |
| `"eventSubscribe"` | イベント購読 | `topic`, `eventRef`, `filter` |
| `"workflow"` | ワークフロー (承認等) | `pattern`, `subject`, `assignees` |

#### 画面系 (type=`"screen"` フローで使用)

| type | 責務 | 主要フィールド |
|---|---|---|
| `"screenTransition"` | 画面遷移 | `targetScreenId`, `targetScreenName` |
| `"displayUpdate"` | 画面表示更新 | `target`, `operation` |
| `"closing"` | 画面閉幕 (ダイアログ等) | (StepBase のみ) |

#### 運用系

| type | 責務 | 主要フィールド |
|---|---|---|
| `"log"` | ログ出力 | `level`, `message` |
| `"audit"` | 監査ログ | `action`, `result` |
| `"cdc"` | CDC (変更データキャプチャ) | `tableName`, `operation`, `trigger` |
| `"transactionScope"` | TX スコープ (複数 DB 操作を 1 TX) | `steps[]`, `onError` |
| `"other"` | 上記に当たらないステップ | `description` 必須。拡張 step は `namespace:StepName` 形式で |

#### `OtherStep` の拡張ポイント

`type: "other"` は 2 つの使い方がある:

1. **旧形式 (後方互換)**: `type: "other"` のまま `description` に意図を書く
2. **新形式 (名前空間修飾)**: `type: "namespace:StepName"` 形式 (例: `"securities:TradeMatchStep"`)

```json
// 推奨: namespace:StepName 形式
{ "id": "step-01", "type": "securities:TradeMatchStep", "description": "約定マッチング" }

// 後方互換: type: "other"
{ "id": "step-01", "type": "other", "description": "securities:TradeMatchStep — 約定マッチング" }
```

`OtherStep.outputSchema` で出力の JSON Schema を宣言できる (AI が返値の型を理解するため)。

### 5.4 StepBase (全 Step 共通フィールド)

`StepBaseProps` ($defs 定義) が全 Step variant に `allOf` でマージされる共通フィールド群:

| フィールド | 型 | 意味 |
|---|---|---|
| `id` | string | ステップ識別子。branch condition の `stepRef` / `compensatesFor` 等から参照される |
| `description` | string | ステップの業務的意味。AI が最優先で読む |
| `note` | string | 旧形式補足 (notes[] への移行推奨) |
| `notes[]` | StepNote[] | 前提条件・TODO・疑問・延期事項をタグ付きで記録 |
| `maturity` | Maturity | ステップ単位の成熟度 (フロー全体の maturity と独立) |
| `runIf` | string (js-subset 真偽式) | 条件実行ガード。false なら skip |
| `sla` | Sla | ステップ単位のタイムアウト設定 |
| `outputBinding` | OutputBinding | ステップの出力を格納する変数名 |
| `txBoundary` | TxBoundary | TX 境界宣言 (`begin/member/end` + `txId`) |
| `transactional` | boolean | 簡易トランザクションフラグ |
| `compensatesFor` | string | Saga 補償: このステップが補償する対象ステップの id |
| `externalChain` | ExternalChain | 外部呼び出しの chain グループ (`authorize/capture/cancel`) |
| `subSteps` | Step[] | このステップ内にネストした補助ステップ |
| `requiredPermissions` | string[] | このステップ実行に必要な権限リスト |

### 5.5 カタログ系の詳細と役割

#### errorCatalog

エラーコードを ProcessFlow 全体で一元管理する。散在する `errorCode: "STOCK_SHORTAGE"` を 1 箇所で定義。

```json
"errorCatalog": {
  "STOCK_SHORTAGE": {
    "httpStatus": 409,
    "defaultMessage": "在庫不足",
    "responseRef": "409-stock-shortage",
    "description": "affectedRowsCheck で rowCount=0 時"
  }
}
```

参照箇所: `affectedRowsCheck.errorCode`, `BranchConditionVariant.errorCode`, `Sla.errorCode`

#### externalSystemCatalog

同一外部システムへの接続設定を DRY 化。baseUrl / auth / timeoutMs / retryPolicy / headers を 1 箇所に。

```json
"externalSystemCatalog": {
  "stripe": {
    "name": "Stripe Japan",
    "baseUrl": "https://api.stripe.com",
    "auth": { "kind": "bearer", "tokenRef": "ENV:STRIPE_SECRET_KEY" },
    "timeoutMs": 10000,
    "retryPolicy": { "maxAttempts": 3, "backoff": "exponential", "initialDelayMs": 500 }
  }
}
```

参照方法: `ExternalSystemStep.systemRef: "stripe"`。step 側で同フィールドを指定すると catalog を上書き。

#### domainsCatalog

型・バリデーション制約・UI ヒントをドメイン名で DRY 化。複数フィールドで同一制約を使い回す。

```json
"domainsCatalog": {
  "Quantity": {
    "type": "number",
    "constraints": [
      { "field": "quantity", "type": "range", "minRef": "@conv.limit.quantityMin", "maxRef": "@conv.limit.quantityMax", "kind": "Error" }
    ],
    "uiHint": "number"
  }
}
```

参照方法: `StructuredField.domainRef: "Quantity"`

#### ambientVariables

ミドルウェア由来の自動注入変数を宣言する。`@requestId` / `@traceId` / `@fieldErrors` 等。

宣言することで: 未定義変数参照の将来的なバリデータ検査が可能になる。

### 5.6 拡張ポイントの構造

グローバル schema 変更なしに拡張できる箇所:

| 拡張種別 | ファイル | 拡張できる内容 |
|---|---|---|
| カスタムステップ型 | `data/extensions/steps.json` | `type: "namespace:StepName"` で参照できる step 定義 |
| FieldType 拡張 | `data/extensions/field-types.json` | `{ kind: "orderId" }` 等の業界固有型 |
| ActionTrigger 拡張 | `data/extensions/triggers.json` | 新しいトリガー種別 |
| DbOperation 拡張 | `data/extensions/db-operations.json` | カスタム DB 操作 |
| レスポンス型定義 | `data/extensions/response-types.json` | `BodySchemaRef.typeRef` 解決先の型定義 |

**競合時の挙動**:
- enum 拡張 (field-types / triggers / db-operations) → **追加のみ**。グローバル値の削除・置換は不可
- カスタムステップ型 (steps) → 同名ならプラグイン側が上書き
- レスポンス型 (response-types) → キー単位でプラグイン側が上書き

---

## 6. 拡張判断ガイドライン (Extension Decision Guide)

### 6.1 詳細フローチャート

新概念が出てきたときの判断フローを詳述する。

**Stage 1: 拡張機構での代替**

```
新 step type が必要?
  → data/extensions/steps.json に { namespace: "myns", steps: [{ type: "myns:MyStep", ... }] }
  → ProcessFlow JSON で type: "myns:MyStep" として参照

新 FieldType が必要?
  → data/extensions/field-types.json に { kind: "orderId", label: "注文ID", baseType: "string" }
  → StructuredField.type: { kind: "orderId" } で参照

新 ActionTrigger が必要?
  → data/extensions/triggers.json に追加
  → ActionDefinition.trigger で参照
```

**Stage 2: 既存表現での代替**

```
step の詳細な動作を記述したい
  → description / note フィールドに人間向けで記述 (AI が読む)
  → 実装に直結する情報は structuredField として inputs/outputs に宣言

外部 API のレスポンス型を表現したい
  → ExternalSystemCatalogEntry.responseSchema にインライン JSON Schema
  → または HttpResponseSpec.bodySchema: { schema: {...} } でインライン指定
  → または bodySchema: { typeRef: "MyResponseType" } + response-types 拡張

業務規約値をハードコードしたくない
  → @conv.regex.* / @conv.limit.* / @conv.msg.* 参照
  → docs/sample-project/conventions/conventions-catalog.json に追加
```

**Stage 3: 本当に必要か確認**

「このフィールドは本当にグローバルに必要か」を自問する:
- 既存の複数業種サンプル (金融 / 製造 / 物流 / 小売 / 証券) で同様の要求はあるか?
- 拡張機構で表現できない技術的な理由が明確にあるか?
- 既存フィールドの組み合わせ・描写では不足するか?

全て YES なら ISSUE 起票へ。

### 6.2 拡張機構で代替できる具体例

**例1: 証券業界固有のステップ**

```json
// data/extensions/steps.json (プラグイン)
{
  "namespace": "securities",
  "steps": [
    {
      "type": "securities:TradeMatchStep",
      "label": "約定マッチング",
      "description": "売買注文の条件マッチングを行うステップ",
      "outputSchema": {
        "type": "object",
        "properties": {
          "matchedTrades": { "type": "array" },
          "unmatched": { "type": "array" }
        }
      }
    }
  ]
}

// ProcessFlow JSON での使用
{ "id": "step-match", "type": "securities:TradeMatchStep", "description": "当日約定マッチング処理", "outputBinding": "matchResult" }
```

**例2: 業界固有のフィールド型**

```json
// data/extensions/field-types.json
{
  "namespace": "gm50",
  "fieldTypes": [
    { "kind": "TBL", "label": "GM50 テーブル型", "baseType": "object" },
    { "kind": "ZIP", "label": "ZIP ファイル", "baseType": "string" }
  ]
}

// StructuredField での使用
{ "name": "masterTable", "type": { "kind": "TBL" } }
```

### 6.3 グローバル改修が必要な具体例

以下は拡張機構では代替できず、グローバル schema の変更が必要だった事例:

**`"file"` FieldType の追加 (#443)**:
- バッチ処理の CSV / ZIP / TSV ファイル入力を表現
- 複数業種 (製造・物流・金融) で共通に必要
- 拡張機構で `{ kind: "csv" }` を追加しても、`format` の意味論 (ファイル形式の宣言) がグローバルに統一されない
- → グローバル schema に `{ kind: "file", format?: string }` として追加

**`"MERGE"` / `"LOCK"` DbOperation の追加 (#443)**:
- PostgreSQL 標準 upsert (INSERT ON CONFLICT) / SELECT FOR UPDATE
- どの業種でも合理的に必要
- → グローバル schema の `DbOperation` enum に追加

**`ElseBranch` の独立型化 (#253)**:
- `BranchStep.elseBranch` の型を `Branch` (condition 必須) から `ElseBranch` (condition 任意) に変更
- else 分岐に condition は本質的に不要であるという意味的修正
- → 既存 Step 構造の変更のため拡張機構では対応不可

### 6.4 過去事例の判定 (#508 / #469 から学ぶ)

**PR #508 (retail ラウンド 3)**: 6 フィールド追加 → 技術的には妥当 (全て後方互換 optional)、プロセス的には不適切 (事前 ISSUE 化なし)。結果: 容認 (schema-audit で記録)。

**教訓 A**: 「技術的に正しい」≠「プロセス的に正しい」。テスト pass だけで schema 変更を含む PR をマージしない。

**PR #469 (金融シナリオ)**: `OtherStep.outputSchema` / `ExternalSystemStep.outcomes` の追加 → Codex の副次変更。PR description で申告済みのため黙って入れたわけではないが、事前 ISSUE 化なし。

**教訓 B**: AI による schema 変更は発見が遅れる。PR レビューで schema 変更を必ずチェックする (`gh pr diff --name-only | grep schemas/`)。

**教訓 C**: Dog-food (サンプル実装) フェーズで拡張要求が頻出する。この段階での要求は全て「一旦 ISSUE 化 → 設計者レビュー → 専用 PR」のプロセスに乗せる。

---

## 7. 後方互換性ルール (Backward Compatibility)

### 7.1 新規フィールドは optional 必須

グローバル schema に新しいフィールドを追加する場合、**必ず optional** にする。`required` 配列に追加してはならない (既存 JSON が validate エラーになる)。

```json
// OK: optional フィールドの追加
"properties": {
  "newField": { "type": "string", "description": "新機能 (#NNN)" }
}
// required 配列には追加しない

// NG: required に追加 (既存 JSON が壊れる)
"required": ["id", "name", "type", "description", "actions", "createdAt", "updatedAt", "newField"]
```

### 7.2 既存フィールドの型変更禁止

既存フィールドの `type` を変更してはならない。型変更は**破壊的変更** (既存 JSON が validate エラー)。

**許容される変更**:
- `"type": "string"` → `"oneOf": [{ "type": "string" }, { "type": "object", ... }]` (旧形式を包含した union 化)
- `"type": "number"` → `"type": "number", "minimum": 0` (制約の追加・強化)

**禁止される変更**:
- `"type": "string"` → `"type": "number"` (型変更)
- `"type": "string"` → `"type": "object"` (型変更、union 化ならOK)
- `"required": ["x", "y"]` → `"required": ["x", "y", "z"]` (必須フィールドの追加)

**Deprecation cycle の例外**:

`protocol` フィールドのように deprecated にする場合:
1. `"deprecated": true` と description に `"DEPRECATED (#261): httpCall への移行推奨"` を追加
2. 新しいフィールド (`httpCall`) を optional で追加
3. 既存値は引き続き valid のまま (削除しない)
4. バリデータが deprecated フィールドの使用を警告 (エラーにしない)

### 7.3 enum 値追加は additive、削除禁止

enum に値を**追加**するのは後方互換。既存 JSON への影響なし。

enum から値を**削除**するのは破壊的変更。削除した値を使用している既存 JSON が validate エラーになる。

```json
// OK: enum 値の追加 (additive)
"DbOperation": { "enum": ["SELECT", "INSERT", "UPDATE", "DELETE", "MERGE", "LOCK"] }
// 旧: ["SELECT", "INSERT", "UPDATE", "DELETE"] に MERGE, LOCK を追加

// NG: enum 値の削除 (破壊的)
"ProcessFlowType": { "enum": ["screen", "batch", "system"] }
// 旧: ["screen", "batch", "scheduled", "system", "common", "other"] から削除
```

**実質的に廃止された enum 値**: 削除ではなく `description` に `"DEPRECATED: 新しい値 'xxx' を使用"` と記載。

### 7.4 Regression テスト

schema 変更後、**既存全サンプルが引き続き valid であること**をテストで確認する:

```bash
cd designer && npx vitest run src/schemas/process-flow.schema.test.ts
```

このテストは `docs/sample-project/process-flows/*.json` の全ファイルをスキーマで検証する。新しい schema 変更で既存サンプルが invalid になったら、サンプルを修正するか schema 設計を見直す。

---

## 8. テスト規約 (Testing Conventions)

### 8.1 schema 変更時の testCase 追加必須

グローバル schema に変更を加えた場合、**必ず** `designer/src/schemas/` の対応テストファイルに testCase を追加する。

**追加すべき testCase の種類**:

| 種類 | 内容 | 理由 |
|---|---|---|
| valid (positive) | 新しいフィールドを含む最小 valid JSON | 追加したフィールドが schema で正しく受容されること |
| valid (fullset) | 新しいフィールドを複数フラグ組み合わせた JSON | オプション組み合わせのエッジケース |
| invalid (negative) | 新しいフィールドに不正値を入れた JSON | type 違反・必須フィールド欠落が正しく reject されること |
| invalid (old-form) | 削除/変更した構造の旧形式 JSON | regression: 意図的に invalid であることを確認 |

### 8.2 バリデータ群との整合性

スキーマバリデーションの外に、以下のバリデータが存在する。schema 変更時はこれらとの整合性も確認する:

| バリデータ | ファイル | 何を検証するか |
|---|---|---|
| `sqlColumnValidator` | `designer/src/schemas/sqlColumnValidator.ts` | `DbAccessStep.sql` の基本的な SQL 構文 |
| `conventionsValidator` | `designer/src/schemas/conventionsValidator.ts` | `@conv.*` 参照の存在確認 |
| `referentialIntegrity` | `designer/src/schemas/referentialIntegrity.ts` | `systemRef` / `eventRef` / `responseRef` / `typeRef` の参照先存在確認 |
| `identifierScope` | (将来実装予定) | `@variable` 参照がスコープ内で定義されているか |

新しい `xxxRef` フィールドを追加した場合、`referentialIntegrity` の確認対象に加える必要があるかを検討する。

### 8.3 既存サンプルの regression テスト

`designer/src/schemas/process-flow.schema.test.ts` は `docs/sample-project/process-flows/*.json` の全件を validate する。

schema 変更の PR で**このテストが通ること**を必須条件とする。通らない場合:
1. schema の設計を見直す (既存サンプルを壊す変更は原則 NG)
2. または既存サンプルを修正して一緒に PR に含める (サンプルの修正が valid である場合)

### 8.4 テスト実行コマンド

```bash
# schema テストのみ
cd designer && npx vitest run src/schemas/process-flow.schema.test.ts

# 全 vitest
cd designer && npx vitest run

# build チェック (TypeScript 型整合)
cd designer && npm run build
```

---

## 9. 文書化ルール (Documentation Conventions)

### 9.1 schema 変更時の更新箇所チェックリスト

グローバル schema を変更した PR では、以下を**全て**更新する:

- [ ] `schemas/process-flow.schema.json` — スキーマ本体
- [ ] `schemas/README.md` — スキーマの変更サマリ
- [ ] 関連する `docs/spec/process-flow-*.md` — 対応する仕様書節
- [ ] `docs/spec/README.md` — 仕様書一覧に変更の概要を反映 (必要に応じて)
- [ ] SKILL の関連ルール — `/create-flow` / `/review-flow` 等に影響する変更の場合
- [ ] `docs/spec/schema-audit-2026-04-27.md` (または後継の監査ドキュメント) — 変更履歴の記録

**「仕様書と実装が drift する」を防ぐ原則**: コードコメントやイシューに詳細を書かない。必ず仕様書 (`docs/spec/`) に書く。

### 9.2 仕様書の構造スタイル

本プロジェクトの `docs/spec/` ドキュメントは以下のスタイルに従う:

**ヘッダー部**:
```markdown
# タイトル

Issue: #NNN (親: #MMM)
策定日: YYYY-MM-DD
ステータス: **初版** / v1.0 (凍結 YYYY-MM-DD)

本ドキュメントは...
```

**仕様記述**:
- `ts` コードブロックでインターフェース定義 → JSON の型を TypeScript 表現で示す
- `json` コードブロックで具体例 → 実際に valid な JSON を示す
- 表 (Markdown table) で比較・使い分け整理

**変更履歴**:
```markdown
## 変更履歴

- YYYY-MM-DD: 初版。...
- YYYY-MM-DD: v1.1 更新。§N を更新 (#NNN)
```

### 9.3 PR 正式プロセスの参考例 (#492)

PR #492 は schema 変更の正式プロセスの模範例:
1. 事前 ISSUE (#492) で変更内容を提案
2. 専用ブランチで: schema 改修 + 関連 spec 文書の更新 + SKILL ルール更新 + testCase 追加
3. `/review-pr` による独立レビュー
4. Must-fix 解決後にマージ

新しい schema 変更 PR は #492 のプロセスに倣う。

### 9.4 ISSUE 起票フォーマット (schema 変更提案)

AI が schema 変更が必要と判断した場合の ISSUE タイトル・本文フォーマット:

```
タイトル: improve(schema): <フィールド名> 追加検討 — <一行経緯>

本文:
## 追加したい変更
- フィールド / 構造: xxx
- 型: string | number | ...

## なぜ拡張機構では表現できないか
- (具体的な理由)

## 既存スキーマ表現での代替案 (試行結果)
- type: "other" + description → AI が理解できない (根拠: ...)
- @conv.xxx 参照 → カタログに入れるには汎用性が必要

## 影響範囲
- 既存サンプルへの影響: なし / あり (詳細...)
- 後方互換性: optional フィールドのため維持
- 関連 SKILL ルール: `/create-flow` Rule N

## 緊急度
- 今開発中のサンプルで表現できない場合: 代替表現で暫定完成
- 優先度: low / medium / high
```

---

## 付録 A: 各設計画面でのコード補完設計

本フレームワークの JSON Schema は、デザイナー UI でのコード補完の基盤としても機能する。以下は各設計画面での補完設計思想。

### A.1 処理フローエディター (ProcessFlowEditor)

処理フロー JSON の各フィールドでの補完:

**step 追加時の型補完**:
- `type` フィールドに対して `StepType` enum の全値を候補表示
- 型選択後、`required` フィールド (`conditions`, `tableName+operation`, etc.) を自動的にテンプレート挿入
- 拡張 step type (`namespace:StepName`) も `data/extensions/steps.json` から動的に補完

**変数参照補完 (`@` 記法)**:
- `runIf` / `expression` / `condition` / `bodyExpression` / `sql` / `argumentMapping` 値側などで `@` 入力時に補完ポップアップ
- 候補: そのステップより前に定義された `outputBinding` 名 + `ActionDefinition.inputs[].name` + `ambientVariables[].name`
- `@conv.` で補完する際は `docs/sample-project/conventions/conventions-catalog.json` または `data/conventions/catalog.json` のエントリを候補表示

**カタログ参照補完**:
- `systemRef` → `externalSystemCatalog` のキー候補
- `eventRef` → `eventsCatalog` のキー候補
- `domainRef` → `domainsCatalog` のキー候補
- `errorCode` → `errorCatalog` のキー候補
- `responseRef` → `ActionDefinition.responses[].id` の候補

**型別フォールバック**:
- `FieldType` の `kind` フィールドに対して `oneOf` の全候補 + 拡張 field-types 候補
- `DbOperation` に対して enum 値 + 拡張 db-operations 候補

### A.2 テーブル定義エディター (TableEditor)

テーブルスキーマ定義での補完:

**カラム型の補完**:
- `dataType` に対して `FieldType` enum の基本型 + 業種固有型を候補表示
- 選択した型に応じて推奨バリデーションルールをテンプレート提示

**FK / 主キー / Index の補完**:
- `references` で他テーブルの主キーを候補表示 (project.json に登録済みのテーブル一覧から)

### A.3 画面項目定義 (ScreenItems)

画面フォームのバリデーションルール定義での補完:

**正規表現参照補完**:
- `ValidationRule.patternRef` で `@conv.regex.*` の候補を表示
- `pattern` リテラル入力時も `@conv.regex.xxx` として参照可能な場合は提案

**型と検証ルールの整合補完**:
- `StructuredField.type: "number"` の場合、適切なバリデーション (`range`) を提案
- `type: "string"` の場合は `regex` / `maxLength` を提案

**domainRef の補完**:
- `domainsCatalog` に定義されたドメイン名を候補表示
- 選択すると型・制約・uiHint が自動適用される予告コメント付き

### A.4 拡張定義エディター (ExtensionsPanel)

`data/extensions/*.json` 編集での補完:

**namespace の候補**:
- 既存の `data/extensions/` ファイル内の `namespace` 値から提案 (一貫性維持)

**step type の形式チェック**:
- カスタムステップの `type` が `namespace:StepName` 形式 (pattern: `^[a-z][a-z0-9_-]*:[A-Z][A-Za-z0-9]*$`) に合致するかリアルタイム検証

**グローバル schema との競合ガード**:
- `field-types.json` の `kind` 値がグローバル `FieldType` の既存 enum 値と衝突しないかチェック (競合は禁止)
- `triggers.json` の値が `ActionTrigger` 既存 enum と衝突しないかチェック

**outputSchema の補完**:
- カスタムステップの `outputSchema` に対して JSON Schema draft 2020-12 のキーワードを補完

### A.5 一覧系画面 (ProcessFlowList, TableList 等)

一覧系 UI での検索・フィルタとの関係:

一覧画面は `docs/spec/list-common.md` の共通基盤 (`DataList`, `useListFilter`, `useListSort`) に基づく。schema とのインタフェースは以下:
- `maturity` フィールドによるフィルタリング (draft / provisional / committed)
- `ProcessFlowType` による種別フィルタ (screen / batch / scheduled 等)
- `updatedAt` によるソート

これらのフィルタキーは `FieldType` ではなく ProcessFlow スキーマの top-level フィールドから生成される。

---

## 付録 B: 用語集 (Glossary)

| 用語 | 定義 |
|---|---|
| **グローバル schema** | `schemas/*.json` に置かれる、本フレームワーク全体で共有されるスキーマ定義。フレームワーク製作者のみが変更権限を持つ |
| **拡張機構 (プラグイン)** | `data/extensions/<namespace>/*.json` に置く、プロジェクト固有の型・ステップ・操作の追加定義 |
| **バリアント** | `oneOf` で定義される排他的な型の選択肢の 1 つ。例: `ValidationStep` は `Step` の 1 バリアント |
| **カタログ** | ProcessFlow レベルに置く辞書形式フィールド (`xxxCatalog`)。参照 ID → 定義の対応を 1 箇所に集約する DRY 機構 |
| **namespace** | 拡張定義を識別するプレフィックス文字列。`securities:TradeMatchStep` の `securities` 部分。衝突防止のための命名空間 |
| **discriminator** | `oneOf` の中でどのバリアントかを決定するフィールド。本スキーマでは `type` フィールドが常に discriminator として機能する |
| **後方互換変更** | 既存 JSON が引き続き valid であるような schema 変更 (optional フィールドの追加、enum 値の追加など) |
| **破壊的変更** | 既存 JSON が schema validate エラーになるような schema 変更 (必須フィールドの追加、型変更、enum 値の削除など) |
| **StepBase** | 全 Step バリアントに共通するフィールドの集合。`$defs.StepBaseProps` で定義され、各 Step variant が `allOf` でマージする |
| **Ambient 変数** | ミドルウェア / フレームワークが自動注入する変数 (`@requestId`, `@traceId`, `@fieldErrors` 等)。`ambientVariables` で宣言する |
| **js-subset** | 本フレームワークの式言語。JavaScript の安全なサブセットで、`@` プレフィックス変数参照・算術・比較・配列メソッドを許容する |
| **Arazzo Runtime Expression** | `$statusCode` / `$response.body` 等の `$` プレフィックス参照。Arazzo 1.0 互換の外部 API レスポンス参照形式 |
| **testCase** | `process-flow.schema.test.ts` 内の valid / invalid を判定する 1 テストケース。schema 変更時に追加が必須 |
| **DRY 化** | Don't Repeat Yourself。カタログ系フィールドや拡張機構の主目的で、同じ定義が複数箇所に散在するのを防ぐ |
| **Deprecation cycle** | 既存フィールドを削除するための移行プロセス。`deprecated: true` マーク + 代替フィールド追加 → 将来バージョンで削除 |

---

## 付録 C: 関連ドキュメント

### ガバナンス・監査

| ドキュメント | 内容 |
|---|---|
| [`schema-governance.md`](schema-governance.md) | **最重要**: AI による schema 変更禁止ガバナンス。変更権限・手順・検出仕組み・過去事例 |
| [`schema-audit-2026-04-27.md`](schema-audit-2026-04-27.md) | 過去 102 コミットの監査レポート (Phase B-1)。(A) 正当 88% / (B) 不規則 2-3% / (C) 不適切 0% |

### 仕様書群

| ドキュメント | 内容 |
|---|---|
| [`process-flow-maturity.md`](process-flow-maturity.md) | 成熟度 3 値・付箋 (notes) ・上流/下流モード (Phase 1 基盤) |
| [`process-flow-variables.md`](process-flow-variables.md) | 変数・入出力 (StructuredField)・outputBinding (Phase 1 基盤) |
| [`process-flow-extensions.md`](process-flow-extensions.md) | Phase B 全 15 種の拡張フィールド包括リファレンス |
| [`process-flow-expression-language.md`](process-flow-expression-language.md) | 式言語 BNF (js-subset)。runIf / expression / condition 等の評価規則 |
| [`process-flow-runtime-conventions.md`](process-flow-runtime-conventions.md) | SQL 補間・HTTP body 直列化・TX×Saga 連鎖等の実行時規約 |
| [`process-flow-external-system.md`](process-flow-external-system.md) | ExternalSystemStep の OpenAPI 参照・operationRef |
| [`process-flow-testing.md`](process-flow-testing.md) | Given-When-Then テストシナリオ (testScenarios) |
| [`process-flow-workflow.md`](process-flow-workflow.md) | WorkflowStep・承認ワークフロー 11 パターン |
| [`process-flow-transaction.md`](process-flow-transaction.md) | TransactionScopeStep と txBoundary の関係 |
| [`process-flow-secrets.md`](process-flow-secrets.md) | secretsCatalog・秘匿値管理 |
| [`process-flow-env-vars.md`](process-flow-env-vars.md) | envVarsCatalog・環境別設定値 |
| [`process-flow-sla.md`](process-flow-sla.md) | SLA / タイムアウト宣言 |
| [`process-flow-criterion.md`](process-flow-criterion.md) | Criterion (Arazzo 互換成功判定条件) |
| [`plugin-system.md`](plugin-system.md) | プラグインシステム全体仕様・拡張ファイル構造 |
| [`list-common.md`](list-common.md) | 一覧系 UI 共通基盤 (DataList 等) |

### 一次成果物

| ファイル | 内容 |
|---|---|
| [`schemas/process-flow.schema.json`](../../schemas/process-flow.schema.json) | JSON Schema 2020-12。本ドキュメントの機械可読版 |
| [`schemas/README.md`](../../schemas/README.md) | スキーマファイル一覧と更新履歴 |
| [`designer/src/types/action.ts`](../../designer/src/types/action.ts) | TypeScript 型定義 (schema の派生物) |

---

## 変更履歴

- 2026-04-27: 初版。Phase B-2 として #514 で策定。#511 schema ガバナンス導入後の設計思想文書化。
