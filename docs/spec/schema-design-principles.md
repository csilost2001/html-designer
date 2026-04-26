# Schema Design Principles — グローバル定義スキーマの設計思想

本ドキュメントは、本フレームワークのグローバル定義スキーマ (`schemas/process-flow.schema.json` / `schemas/extensions-*.schema.json` / `schemas/conventions.schema.json`) を **どう設計するか** の規範を定める。

ガバナンス (誰が変更できるか) は [`schema-governance.md`](./schema-governance.md)、本ドキュメントは **どうあるべきか** の規範を扱う。

両者の関係:

| 観点 | ドキュメント |
|---|---|
| 変更権限 / プロセス / 違反検出 | [schema-governance.md](./schema-governance.md) |
| 命名規約 / 構造ルール / フォーマット / 拡張判断 | 本ドキュメント |

---

## 1. 設計思想の前提

### 1.1 一次成果物としての schema

本フレームワークの**一次成果物は schema 準拠の JSON**。TypeScript 型は schema からの派生物、UI は最後尾の表示層。

- AI (Claude / Codex 等) が処理フロー / テーブル定義 / 画面項目定義を **JSON として読み取り、実装コードを生成する** 前提
- 業務 SE は schema 準拠の構造化情報のみで業務を理解できる必要がある
- 自然言語 (description) は補助、**形式情報が一次** であるべき

この前提は本フレームワーク全体を貫く最重要原則。schema 設計判断はすべて「**形式情報だけで読み取れるか**」を最優先で評価する。

### 1.2 拡張機構とコア schema の役割分担

| 領域 | 配置 | 性質 |
|---|---|---|
| **コア schema** (`schemas/*.json`) | リポジトリ直下 `schemas/` | 業界横断の普遍的な構造。フレームワーク製作者の専権 |
| **拡張定義** (`docs/sample-project/extensions/<namespace>/*.json` / `data/extensions/<namespace>/*.json`) | namespace 単位 | 業界 / プロジェクト固有の語彙。業務開発者が自由に追加可 |

**判断基準**:

- 業界共通で **5 業界以上** で必要になりそう → コア schema 候補
- 特定業界 / 特定プロジェクト固有 → 拡張機構 (namespace)

**例**:

| 要素 | 配置 | 理由 |
|---|---|---|
| `Step.type` の `validation` / `dbAccess` / `branch` | コア | あらゆる業務で共通 |
| 小売業の `cdc` (CDC = Change Data Capture) step | コア | 多業界 (金融/小売/物流) で発生する横断パターン |
| 流通業の `TraceabilityStep` | 拡張 (`logistics` namespace) | 流通固有 |
| 金融の `NETTING` 操作 | 拡張 (`finance` namespace) | 金融固有 |

### 1.3 schema は「業務の正確な記述」のための構造である

schema は **実装の都合** ではなく **業務の正確な記述** に従う。

- 実装言語 (TS / Java / SQL) の都合で field を増やさない
- ランタイム最適化のための field は別レイヤ (実装側) で持つ
- schema は業務 SE が読んで理解できる語彙で構成する

**反例**: `Step.cacheKey` のような実装詳細をコア schema に置かない (拡張 / 実装層の責務)。

---

## 2. 命名規約

### 2.1 識別子命名

| 対象 | 規約 | 例 |
|---|---|---|
| フィールド名 | `camelCase` | `actionId`, `outputBinding`, `errorCode` |
| `$defs` (型名) | `PascalCase` | `ProcessFlow`, `DbAccessStep`, `TestScenario` |
| enum 値 (制御系) | `lowerCamelCase` | `validation`, `dbAccess`, `eventPublish` |
| enum 値 (HTTP method 等の慣用) | `UPPER_CASE` | `GET`, `POST`, `PUT` |
| カタログキー (人間可読 ID) | `lowerCamelCase` または ドメイン慣用 | `formatCurrency`, `EmailAddress`, `ORDER_VALIDATION_FAILED` |

**enum 値の小文字 / 大文字の判断**:

- **制御系 enum** (Step.type, ActionTrigger, OnTimeout, Maturity 等) は **lowerCamelCase 統一** ← 本フレームワーク既定
- **領域慣用 enum** (HttpMethod, ResultStatus 等で大文字が業界標準) は **UPPER_CASE** を許容

例外を作る場合は ADR (decisions) で記録する。

### 2.2 リファレンス命名 (xxxRef)

外部のカタログ / 定義への参照は **`xxxRef` 接尾辞**:

| パターン | 用途 | 参照先 |
|---|---|---|
| `responseRef` | レスポンス型参照 | `ResponseTypeCatalog` |
| `typeRef` | データ型参照 | `field-types` 拡張 |
| `systemRef` | 外部システム参照 | `externalSystemCatalog` |
| `eventRef` | イベント定義参照 | `eventsCatalog` |
| `errorCode` | エラー定義参照 | `errorCatalog` (※ 慣用で `Code` 接尾) |
| `domainRef` | ドメイン参照 | `domainsCatalog` |
| `screenId` | 画面参照 | screen 集合 |

**統一原則**: **参照キーは `xxxRef`、定義の集合は `xxxCatalog` または `xxx`s** という対応を保つ。

### 2.3 カタログ命名 (xxxCatalog)

ProcessFlow ルート直下のカタログ系フィールドは **`xxxCatalog` 接尾辞**:

| カタログ | キー | 値 |
|---|---|---|
| `errorCatalog` | エラーコード文字列 (例: `STOCK_SHORTAGE`) | `ErrorCatalogEntry` |
| `externalSystemCatalog` | システム ID (例: `stripe`) | `ExternalSystemCatalogEntry` |
| `secretsCatalog` | secret 名 | `SecretRef` |
| `envVarsCatalog` | 環境変数キー | `EnvVarEntry` |
| `domainsCatalog` | ドメイン名 (例: `EmailAddress`) | `DomainDef` |
| `functionsCatalog` | 関数名 (例: `formatCurrency`) | `FunctionDef` |
| `eventsCatalog` | トピック名 | `EventDef` |

**例外**: `glossary` / `decisions` / `ambientVariables` / `ambientOverrides` は意味的に「カタログ」とは異なる集合 (用語集 / ADR ログ / 環境変数オーバーライド) なので `xxxCatalog` を強制しない。

### 2.4 配列フィールド命名

- 集合を表す配列は **複数形**: `actions`, `steps`, `branches`, `markers`, `decisions`
- 単一要素の slot や bag は **単数形**: `payload`, `condition`, `output`

### 2.5 ID 名前空間

| 対象 | フィールド名 |
|---|---|
| ProcessFlow | `id` |
| Action (ProcessFlow 内) | `actionId` (子から見たとき) / `id` (自身から) |
| Step | `id` |
| Marker | `id` |
| TestScenario | `id` |
| Screen | `screenId` |

**原則**: その JSON ファイル内で**主体の ID は `id`**、外部から指す参照は **`xxxId`** または **`xxxRef`**。

---

## 3. 構造ルール

### 3.1 フィールド追加判断

新しい業務要素を表現したい時、どこに追加するかの判断:

| 状況 | 追加先 | 権限 |
|---|---|---|
| 業界固有の field type (例: `orderId`) | `extensions/<namespace>/field-types.json` | 業務開発者 |
| 業界固有の DB 操作 (例: `NETTING`) | `extensions/<namespace>/db-operations.json` | 業務開発者 |
| 業界固有の step type (例: `TraceabilityStep`) | `extensions/<namespace>/steps.json` + `OtherStep.type` の `namespace:StepName` 形式 | 業務開発者 |
| 業界固有の trigger (例: `cdc`) | コア enum 拡張 or `extensions/<namespace>/triggers.json` | 業界横断性で判断 |
| **新規メタフィールド** (例: `patternRef`) | コア schema | フレームワーク製作者 |
| **新規 Step バリアント** (新 type) | コア schema (`Step.oneOf` に追加) | フレームワーク製作者 |
| **既存 Step への新規 field** | 業界横断ならコア、特定業界なら拡張パターンを検討 | 内容次第 |

判断フローチャートは [§ 6](#6-拡張判断ガイドライン) を参照。

### 3.2 oneOf / anyOf / allOf の使い分け

#### oneOf — 完全に排他的なバリアント

`Step.oneOf` のように、**1 つの type ごとに完全に異なる必須フィールド集合** を持つ場合:

```jsonc
"Step": {
  "oneOf": [
    { "$ref": "#/$defs/ValidationStep" },
    { "$ref": "#/$defs/DbAccessStep" },
    { "$ref": "#/$defs/BranchStep" },
    // ...
    { "$ref": "#/$defs/OtherStep" }
  ]
}
```

各バリアントは `type` の `const` で識別し、自分専用の必須フィールドを持つ。

#### anyOf — 複数同時許容

複数のスキーマ条件のうち **少なくとも 1 つを満たす** 場合 (排他不要):

- 用途は限定的 (現状 schema にほぼ未使用)
- 「どれか 1 つ」のように見えても排他性が必要なら oneOf を使う

#### allOf — 共通プロパティ継承

全 Step バリアントが共通で持つフィールドは `StepBaseProps` に定義し `allOf` で継承:

```jsonc
"DbAccessStep": {
  "allOf": [
    { "$ref": "#/$defs/StepBaseProps" },
    {
      "type": "object",
      "required": ["id", "type", "description", "operation"],
      // type 固有のフィールド
    }
  ]
}
```

**原則**: 共通フィールドの再記述を避け、`StepBaseProps` を一元化することで保守性を保つ。

### 3.3 必須 / 任意 / 条件付き必須

#### 必須 (`required`)

業務理解に **絶対に欠かせない** フィールド:

- `id` — 常に必須 (識別子)
- `type` — 常に必須 (種別判定)
- `name` — エンドユーザー / 業務 SE 向け表示名
- `description` — 業務意図の説明 (本フレームワーク方針: **description は形式情報の補助、必須化することで業務側の記述漏れを防ぐ**)
- `actions` (ProcessFlow) — 中身が空でもキーは存在
- `createdAt` / `updatedAt` — メタデータ

#### 任意 (`required` に列挙しない)

- 補助情報: `note`, `notes`, `tags`
- リソース指定: `sla`, `resources`, `health`
- カタログ系: `errorCatalog`, `eventsCatalog` 等 (空の場合は省略可)

**原則**: 任意フィールドの**省略時の意味**を必ず spec に明記する (例: "未指定は upstream 相当")。

#### 条件付き必須

特定の type / 状態でのみ必須となる場合は **`if` / `then`** を使う:

```jsonc
"Sla": {
  "if": {
    "properties": { "onTimeout": { "enum": ["throw", "compensate"] } },
    "required": ["onTimeout"]
  },
  "then": { "required": ["errorCode"] }
}
```

**判断基準**:
- 単純な type 分岐 → `oneOf`
- 状態に応じた追加必須 → `if/then`

### 3.4 `additionalProperties` のポリシー

| パターン | 設定 | 用途 |
|---|---|---|
| 構造化 object (Step 等) | `additionalProperties: false` | スキーマ厳格化 (typo 検出) |
| 拡張余地のある map (catalogs 等) | `additionalProperties: { "$ref": "#/$defs/Entry" }` | キーは自由、値は型固定 |
| 自由形式 input/output (TestPrecondition.rows 等) | `additionalProperties: true` | テストデータ等 |

**原則**: 構造化 object は **`additionalProperties: false` 統一**。typo を検出してスキーマの厳格性を保証する。

### 3.5 `$defs` の粒度

- 同じ構造が **2 箇所以上で参照される** なら `$defs` 化 (DRY)
- 1 箇所でしか使わない簡単な inline は inline のまま (可読性優先)
- 命名は **PascalCase + 名詞** (`HealthCheck`, `WorkflowPattern`)

---

## 4. フォーマット規約

### 4.1 ID 形式

#### UUID v4 (基本形式)

`id` フィールドは原則 **UUID v4**:

```
"id": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
```

#### サンプルプロジェクトの ID 順序

`docs/sample-project/` 配下のサンプルでは、**読みやすさ優先で順序付き UUID** を使う:

```
cccccccc-cccc-cccc-cccc-cccccccc0001  // ProcessFlow #1
cccccccc-cccc-cccc-cccc-cccccccc0002  // ProcessFlow #2
dddddddd-dddd-dddd-dddd-dddddddd0001  // Action #1
eeeeeeee-eeee-eeee-eeee-eeeeeeee0001  // Step #1
```

業界別に prefix を変えることで、サンプル間の混在を視認しやすくする (`gggggggg-*` = retail, `ffffffff-*` = finance 等)。

#### 実プロジェクト (`data/`)

実プロジェクトでは **ランダム UUID v4** を使う (ID 衝突防止)。`utils/uuid.ts` の `generateUUID()` で生成する (HTTP 非セキュア環境対応)。

### 4.2 参照式フォーマット

#### `@` 接頭辞 — ランタイム参照

| 構文 | 意味 |
|---|---|
| `@inputs.x` | アクション入力 |
| `@outputs.x` | アクション出力 |
| `@varName` | 同フロー内の outputBinding 結果 |
| `@event.x` | EventSubscribeStep のイベント payload |
| `@requestId`, `@traceId`, `@fieldErrors` | ambient 変数 (ミドルウェア由来) |

#### `@` + 名前空間 — カタログ参照

| 構文 | 参照先 |
|---|---|
| `@conv.<category>.<key>` | 業務規約 (`conventions-catalog.json`) |
| `@secret.<name>` | `secretsCatalog` |
| `@env.<KEY>` | `envVarsCatalog` |
| `@fn.<name>(args)` | `functionsCatalog` |

#### 直接 ID 参照 (`@` なし)

`responseRef`, `typeRef`, `systemRef`, `eventRef` 等の **`xxxRef` フィールドは ID 文字列直接** (`@` を付けない):

```jsonc
{
  "type": "externalSystem",
  "systemRef": "stripe",            // ✓ 直接 ID
  "eventRef": "OrderPlaced"         // ✓ 直接 ID
}
```

**判断基準**:
- ランタイム評価が必要な式 → `@` 接頭辞
- スキーマ定義時に静的解決される ID → 接頭辞なし

### 4.3 SQL 規約

#### 互換性プロファイル

DB 操作の SQL は **node-sql-parser 互換** が必須 (本フレームワークの parse / lint 基盤):

- 標準 SQL を基本に
- PostgreSQL 拡張 / MySQL 方言 / SQL Server 構文は不可

#### 禁止構文と代替

| 禁止 | 代替 |
|---|---|
| `||` (文字列結合) | `CONCAT(...)` |
| `MERGE INTO` | `INSERT ... ON CONFLICT DO UPDATE` |
| `FOR UPDATE` | (同等の lock は実装層で別途宣言) |
| ベンダー拡張 (`RETURNING`, `LIMIT OFFSET` 方言差) | 代替表現を spec に明記 |

詳細は [`process-flow-runtime-conventions.md`](./process-flow-runtime-conventions.md) と SKILL `/create-flow` の Rule を参照。

### 4.4 タイムスタンプ

- フィールド: `createdAt`, `updatedAt`
- 型: `string`, `format: date-time` (ISO 8601 UTC)
- 例: `"2026-04-27T03:21:00Z"`

### 4.5 数値フィールド

- 時間: 単位を必ず suffix で示す (`timeoutMs`, `ttlSeconds`, `warningThresholdMs`)
- 単位の混在は禁止 — ms / seconds / minutes が混じる場合はそれぞれ別フィールド名

---

## 5. 各設計画面でのコード補完設計

designer の各エディタで **JSON Schema 駆動のコード補完** を実現する基盤として、本ドキュメントの規約を遵守する。

### 5.1 ProcessFlowEditor (処理フロー編集)

| 補完場面 | 補完源 |
|---|---|
| `Step.type` 選択時 | `StepType` enum + 拡張 `OtherStep` の `namespace:Name` |
| 各 type 追加時の必須フィールド | `Step.oneOf` の各バリアントの `required` |
| `runIf` / `condition` 内の変数 | `@inputs.*` / 同フロー内 outputBinding / ambient 変数 |
| `@conv.<category>.*` の候補 | `conventions-catalog.json` のカテゴリ別キー一覧 |
| `errorCode` の候補 | `errorCatalog` のキー一覧 |
| `systemRef` の候補 | `externalSystemCatalog` のキー一覧 |

### 5.2 TableEditor (テーブル編集)

| 補完場面 | 補完源 |
|---|---|
| カラム `dataType` | コア型 + `field-types` 拡張 |
| 主キー / FK | 既定義テーブルとカラムの cross-reference |
| Index | カラム名から候補 |

### 5.3 ScreenItems (画面項目定義)

| 補完場面 | 補完源 |
|---|---|
| `pattern` 参照 (`@conv.regex.*`) | `conventions-catalog.json` の regex カテゴリ |
| `dataType` | コア型 + 拡張 + `domainsCatalog` |
| 検証ルール | コア検証規則 + 拡張 |

### 5.4 ExtensionsPanel (拡張定義編集)

| 補完場面 | 補完源 |
|---|---|
| namespace 内の既存定義からの候補提示 | 同 namespace の既存エントリ |
| グローバル schema の制約に基づく入力ガード | `extensions-*.schema.json` |

**設計原則**: コード補完は **schema 自体を読み取って動的に提示** することを基本とし、ハードコードを避ける。schema が一次成果物である以上、エディタの補完も schema に従う。

実装は別 ISSUE (Phase C 以降) で進める。本ドキュメントは設計のみ。

---

## 6. 拡張判断ガイドライン

業務記述で表現したい要素が出てきた時の判断フロー。

```
業務記述したい要素が出た
  ↓
[Q1] 既存 schema フィールドで表現できる?
  ├─ Yes → そのまま使う
  └─ No  ↓
[Q2] 既存 description / outputSchema / note で意図を補足できる?
       (= 形式情報を増やさず、業務側の自然言語で表現)
  ├─ Yes → そのまま使う + description で補足
  └─ No  ↓
[Q3] 拡張機構 (namespace) で表現できる?
       (= field-types / db-operations / steps / triggers / response-types のいずれかを拡張)
  ├─ Yes → extensions/<namespace>/*.json に追加 (業務開発者の権限内)
  └─ No  ↓
[Q4] グローバル schema 改修が必要
  └─ 作業停止 → ISSUE 起票 → 設計者承認待ち → 専用 PR
       (詳細は schema-governance.md § 3)
```

### 6.1 Q1 — 既存フィールドで表現できるか

まず既存 schema を**徹底的に読む**。読まずに「無いから拡張する」は禁止。確認ポイント:

- `Step.oneOf` 全バリアントの fields
- `StepBaseProps` の共通 fields (`runIf`, `outputBinding`, `txBoundary`, `compensatesFor` 等)
- ProcessFlow ルートの catalogs (`errorCatalog`, `eventsCatalog`, `domainsCatalog` 等)

### 6.2 Q2 — description / outputSchema で補足できるか

形式情報を増やすコストは大きい。**自然言語の description で十分なら、そちらを優先する**。

例: 「再実行されると重複する」という業務制約は description に書く。schema field 化 (`idempotent: boolean`) は将来 5 業界以上で再発したら検討。

### 6.3 Q3 — 拡張機構で表現できるか

5 つの拡張軸:

| 拡張先 | 用途 |
|---|---|
| `extensions/<ns>/field-types.json` | 業界固有のデータ型 (例: `orderId`, `swiftCode`) |
| `extensions/<ns>/db-operations.json` | 業界固有の DB 操作 (例: `NETTING`, `MARK_TO_MARKET`) |
| `extensions/<ns>/steps.json` | 業界固有の step type (`OtherStep` の `namespace:Name`) |
| `extensions/<ns>/triggers.json` | 業界固有のトリガー |
| `extensions/<ns>/response-types.json` | 業界固有のレスポンス型 |

これら 5 軸でカバーできない構造的拡張 (新メタフィールド / 新 oneOf バリアント) は Q4 へ。

### 6.4 Q4 — グローバル schema 改修

**作業停止して ISSUE 起票**。判断は設計者 (フレームワーク製作者) に委ねる。手順は [`schema-governance.md`](./schema-governance.md) の **§ 3** 参照。

ISSUE 本文に必ず含める情報:

- 何のフィールド / 構造を追加したいか
- なぜ拡張機構で表現できないか (Q3 で検討した結果)
- 既存表現で代替できないか (Q2 で検討した結果)
- 影響範囲 (既存サンプル / 拡張への影響)
- 後方互換性
- 緊急度 / 代替案

### 6.5 判断の典型例

#### 例 A: 「業務上、SLA を文書化したい」

→ Q1 で `Sla` field 既存 → そのまま使う。

#### 例 B: 「金融固有の照合フェーズ (NETTING) を表現したい」

→ Q1 既存 `Step.type` に該当無し
→ Q2 description で済まない (実装コードの分岐に直結)
→ Q3 `extensions/finance/db-operations.json` に追加可能 → 採用。

#### 例 C: 「全業界で必要そうな ADR (Architecture Decision Record) ログ」

→ Q1 既存にない
→ Q2 description では不足 (構造化したい)
→ Q3 拡張機構ではなく ProcessFlow ルートに置きたい (横断概念)
→ Q4 ISSUE 起票 → 設計者承認 → コア schema に `decisions` field 追加 (PR #423 B-5)。

---

## 7. 後方互換性ルール

### 7.1 新規フィールドは原則 optional

- 既存 JSON が引き続き valid であること
- `required` に追加するのは破壊的変更
- 必須化したい場合は **deprecation サイクル** を経る:
  1. optional として導入 (1 リリース)
  2. spec で「将来必須化」を予告
  3. 全サンプルで使用 (移行期間)
  4. 必須化 (破壊的変更、メジャーバージョン相当)

### 7.2 既存フィールドの型変更は原則禁止

- `string` → `number` のような型変更は破壊的
- 拡張する場合は **新フィールド追加 + 旧フィールド deprecated** で段階移行

### 7.3 enum 値の追加は additive

- 追加: ✓ (既存値が valid なまま)
- 削除: ✗ (既存 JSON が invalid になる)
- リネーム: ✗ (削除 + 追加と等価)

削除が必要な場合は **alias enum** を一定期間維持してから削除。

### 7.4 oneOf バリアントの追加

- 追加: ✓ (新しい type を追加するだけ)
- 既存バリアントの required 拡張: ✗ (破壊的)
- 既存バリアントへの optional 追加: ✓

### 7.5 命名変更

- field 名・$defs 名のリネームは破壊的
- 必要な場合は **alias 期間** を設ける (旧名・新名どちらも valid → 旧名 deprecation 警告 → 旧名削除)
- 大規模リネームは ADR で記録 (例: `ActionGroup` → `ProcessFlow` の事例)

---

## 8. テスト規約

### 8.1 schema 変更には testCase 必須

新規 / 変更 schema には以下を必ず追加:

| 観点 | テスト |
|---|---|
| **正常系** | 新規パターンが valid と判定される (`should pass valid case`) |
| **異常系 (型違反)** | 不正な型が invalid と判定される (`should fail invalid case`) |
| **異常系 (制約違反)** | enum 外 / required 漏れ / pattern 不一致が invalid と判定される |
| **境界** | minimum / maximum / minLength / maxLength の境界値 |
| **後方互換** | 既存 sample が引き続き valid であることを確認 (regression なし) |

### 8.2 テスト配置

- スキーマ単体テスト: `designer/src/schemas/process-flow.schema.test.ts`
- サンプル全件検証: 同テスト内で `docs/sample-project/process-flows/*.json` を全件 validate
- 失敗パターンテスト: 各 schema の `*.negative.test.ts` (例: `process-flow.schema.negative.test.ts`)

### 8.3 拡張定義のテスト

`extensions/<namespace>/*.json` 追加時:

- `extensions-*.schema.json` で valid であること
- 業務サンプル (該当 namespace の処理フロー) で実際に参照され valid であること

### 8.4 dogfood 検証

新規スキーマ要素は **dogfood で検証する** ことを推奨:

- `npm run generate:dogfood --industry X --scenarios "..." --mode ai`
- `npm run validate:dogfood`
- `/review-flow` で実行セマンティクス検証

dogfood の結果を `docs/spec/dogfood-YYYY-MM-DD-*.md` にレポート化。

---

## 9. 文書化ルール

### 9.1 schema 変更時の文書同期

schema 変更 PR には **以下を必ず含める**:

| 対象 | 更新内容 |
|---|---|
| `docs/spec/process-flow-*.md` | 該当節の追記 (新フィールドの意味・使い方・例) |
| `docs/spec/README.md` | 新 spec 文書を追加した場合の目次更新 |
| SKILL (`.claude/skills/create-flow/SKILL.md` 等) | Rule 追加 / 修正 (作成時の self-check 観点) |
| `decisions` (ADR) | 大きな設計判断は ADR エントリ化 |
| testCase | § 8 参照 |

### 9.2 description フィールドの記述

schema 内の `description` は **業務 SE / AI が読んで理解できる** 文を書く:

- ✓ 「キャッシュ有効期間 (秒)。GET 系クエリの再評価間隔」
- ✗ 「TTL」 (略語のみ、文脈不明)

経緯 / ADR 番号は description に含めて良い:

- ✓ 「Ambient 変数カタログ (#261 v1.4)。ミドルウェア由来 (@requestId, @traceId, @fieldErrors 等) を宣言」

### 9.3 spec 文書の構造

`docs/spec/*.md` は以下の構造を推奨:

1. 概要 (1-2 段落)
2. 用語定義
3. 構造ルール (schema との対応)
4. フォーマット例 (具体的 JSON)
5. アンチパターン (やってはいけないこと)
6. 関連 ISSUE / ADR

---

## 10. 例外と判断保留

本ドキュメントの規約に **例外を認める** 場合は以下を明記:

- ADR (`decisions`) に例外理由を記録
- spec 文書に例外箇所を明示
- testCase で例外パターンを正常系として固定

**原則**: 例外は最小限に。3 例以上同じ例外が出るなら、そもそも規約を見直す。

---

## 11. 関連ドキュメント

- [schema-governance.md](./schema-governance.md) — 変更権限 / プロセス / 違反検出
- [schema-audit-2026-04-27.md](./schema-audit-2026-04-27.md) — 過去 schema 変更の監査結果
- [process-flow-criterion.md](./process-flow-criterion.md) — 処理フロー仕様書の総評価基準
- [process-flow-runtime-conventions.md](./process-flow-runtime-conventions.md) — 業務規約 (conventions) 詳細
- [process-flow-extensions.md](./process-flow-extensions.md) — 拡張機構の詳細
- memory: `feedback_schema_governance_strict.md` — AI 永続記憶 (運用ルール)
- memory: `feedback_opus_plan_sonnet_implement.md` — 役割分担 (規範起草は Opus 直接)

---

**本ドキュメントは本フレームワークの設計思想を記述する規範文書**。schema 変更 / 拡張定義追加 / spec 改訂を行う前に必ず参照する。

設計判断の最終承認権限は **フレームワーク製作者 (設計者)** にあり、AI は本ドキュメントの規範に従って提案 / 実装するが、規範自体の改訂は設計者の専権。
