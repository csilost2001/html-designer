# Schema v2 再設計案 (ユーザー承認チェックポイント)

| 項目 | 値 |
|---|---|
| ISSUE | #519 |
| 関連 | #517 (PR #518 マージ済 — 設計原則 v1) / #511 (ガバナンス) |
| 起草 | 設計者 (Opus) |
| 起草日 | 2026-04-27 |
| ステータス | **方針提示** — ユーザー承認後に Phase 4 (実装) へ進む |

ユーザー指示 (要点):
- **修正ではなく、まっさらから書き直す**
- 制限を設けず、より良くするために
- 根本的に変えることで良くなるならやる
- **既存データはサンプル 4 件のみ → 大変更可能 (後方互換放棄 OK)**
- 対象は ProcessFlow に限らず**全 schema** (画面 / テーブル / 画面項目 / 規約 / プロジェクト全体)
- 横断的な共通ルール / 参照方法 / コード補完 / 拡張性を最適化

---

## §0 エグゼクティブサマリ (5 行)

1. **既存全 schema を `schemas/v1/` に退避してバックアップ、v2 を `schemas/v2/` に新設**
2. **ProcessFlow / Conventions / Extensions のみだった JSON Schema を、画面 / テーブル / 画面項目 / プロジェクト等の**全 9 領域に拡張**
3. **共通基盤 (`common.v2.schema.json`)** を切り出し、ID / Timestamp / Version 等の共通定義を全 schema が参照
4. **後方互換性を放棄** — string union / inline enum / 重複定義 / discriminator 揺れを全部解消
5. **拡張機構を全領域に展開** — テーブル拡張 / 画面項目拡張 / 規約拡張も namespace 単位で

---

## §1 現状分析 (Phase 1-2 の発見)

### 1.1 JSON Schema のカバレッジ不均衡

| 領域 | 現状 JSON Schema | TS 型 | データ JSON |
|---|---|---|---|
| ProcessFlow | ✅ `schemas/process-flow.schema.json` | `action.ts` | `data/process-flows/*.json` |
| Conventions | ✅ `schemas/conventions.schema.json` | `conventions.ts` | `data/conventions/catalog.json` |
| Extensions | ✅ `schemas/extensions-*.schema.json` (5 ファイル) | `loadExtensions.ts` | `data/extensions/*.json` |
| **Screen (画面 / 画面フロー)** | ❌ なし | `flow.ts` | `data/screens/*.json` (GrapesJS) / `data/project.json` |
| **Table (テーブル定義)** | ❌ なし | `table.ts` | `data/tables/*.json` |
| **ScreenItem (画面項目)** | ❌ なし | `screenItem.ts` | `data/screen-items/*.json` |
| **Project (プロジェクト)** | ❌ なし | `flow.ts` の `FlowProject` | `data/project.json` |
| **ErLayout (ER 図レイアウト)** | ❌ なし | `table.ts` の `ErLayout` | `data/er-layout.json` |
| **CustomBlock (カスタムブロック)** | ❌ なし | (型定義不在?) | `data/custom-blocks.json` |
| **Sequence (シーケンス)** | ❌ なし | `sequence.ts` | `data/sequences/*.json` |
| **View (ビュー)** | ❌ なし | `view.ts` | (実データなし、型のみ) |

→ **「JSON Schema が一次成果物」の原則と矛盾**。AI が JSON を読むには現状 TS 型しかない領域が多い。

### 1.2 命名の混在 (横断観察)

#### enum 値の命名 (混在しすぎ)

| enum | 命名 | 例 |
|---|---|---|
| `DataType` | UPPER | `VARCHAR`, `INTEGER`, `BOOLEAN` |
| `SqlDialect` | lowercase | `mysql`, `postgresql` |
| `ScreenType` | lowercase 1 語 | `login`, `dashboard`, `list` |
| `TransitionTrigger` | lowercase 1 語 | `click`, `submit`, `auto` |
| `WorkflowPattern` | kebab-case | `approval-sequential`, `sign-off`, `ad-hoc` |
| `StepType` | lowerCamelCase | `validation`, `dbAccess`, `transactionScope` |
| `DbOperation` | UPPER | `SELECT`, `INSERT`, `UPDATE` |
| `IndexMethod` | lowercase | `btree`, `hash`, `gin` |
| `ConstraintDefinition.kind` | lowerCamelCase | `unique`, `check`, `foreignKey` |
| `DefaultKind` | lowerCamelCase | `literal`, `function`, `sequence`, `conventionRef` |
| **`FkAction`** | **UPPER + スペース** | `CASCADE`, `NO ACTION`, `SET NULL` ← スペース含み |
| `TriggerTiming` / `TriggerEvent` | UPPER | `BEFORE`, `AFTER`, `INSERT`, `UPDATE` |
| `ErCardinality` | kebab | `one-to-many`, `one-to-one`, `many-to-many` |
| `ValueSource.kind` | lowerCamelCase | `flowVariable`, `tableColumn`, `viewColumn`, `expression` |
| `DecisionRecord.status` | lowerCamelCase | `proposed`, `accepted`, `deprecated`, `superseded` |
| `ValidationRuleKind` | PascalCase | `Error`, `Msg`, `Noaccept`, `Default` ← GeneXus 由来 |

#### ID 形式の混在

| 対象 | 形式 | 例 |
|---|---|---|
| Screen.id / Table.id / ProcessFlow.id / View.id / Sequence.id | UUID v4 風 | `gggggggg-0003-4000-8000-...` |
| TableColumn.id | kebab+number | `col-u01`, `col-u02` |
| IndexDefinition.id | kebab+number | `idx-u01`, `idx-u02` |
| Step.id | kebab+number/階層 | `step-01`, `step-13b-a-01` |
| Branch.id | kebab+code | `br-03-a`, `br-13b-else` |
| Action.id | kebab+number | `act-001` |
| ResponseSpec.id | `<status>-<slug>` | `201-created`, `400-validation` |
| TestScenario.id | kebab description | `happy-path-order-confirm` |
| DecisionRecord.id | `ADR-NNN` | `ADR-001` |
| **ScreenItem.id** | **snake_case (実データ) ⇄ camelCase (TS doc)** | `user_id` (実) / `userName` (推奨) |
| CustomBlock.id | `custom-block-<timestamp>` | `custom-block-1776079074303` |

→ **規範はあるがバラバラ**、明文化されていない部分も。

### 1.3 拡張機構の偏在

| 領域 | 拡張機構 |
|---|---|
| ProcessFlow | ✅ あり (5 種: steps / field-types / db-operations / triggers / response-types) |
| Conventions | ❌ なし (catalog 自体が拡張ではなく業務開発者が直接書く) |
| Table | ❌ なし (DataType / IndexMethod 等は固定 enum) |
| ScreenItem | ❌ なし (FieldType を借用) |
| Screen | ❌ なし (ScreenType / TransitionTrigger は固定 enum) |
| 他 | ❌ なし |

→ 業界別 (retail / finance / manufacturing) に拡張できるのは ProcessFlow だけ。

### 1.4 参照パターンの分散

| 参照種別 | 形式 | 場所 |
|---|---|---|
| Object 参照 (id + path) | `{ screenId, itemId }` | `screenItemRef` |
| Object 参照 (table + col) | `{ tableId, columnName, noConstraint? }` | `TableColumn.foreignKey` |
| String 参照 (key 直接) | string | `domainRef`, `eventRef`, `responseRef` |
| Discriminated union 参照 | `{ kind, ... }` | `ScreenItem.valueFrom` (4 variants) |
| ID 直接 | string | `ProcessFlowMeta.screenId`, `ConstraintDefinition.referencedTable` |
| 式言語内参照 | `@<prefix>.<key>` | `@conv.*`, `@secret.*`, `@env.*`, `@fn.*`, `@<var>` |
| Arazzo 互換 | `$<path>` | `$statusCode`, `$response.body` (Criterion 内のみ) |

→ 統一原則がない。新規参照を追加するときの判断が場当たり的になる。

### 1.5 共通フィールドの揺れ

- `createdAt` / `updatedAt`: ほぼ全 entity に存在 (Table / Screen / ProcessFlow / ScreenGroup / Sequence / View / TestScenario / Marker)
- `description`: 散在、必須/optional 揺れ
- `name` / `logicalName` / `label`: Table は `logicalName`、ScreenItem は `label`、Screen は `name` ← 用途違いを命名で区別しているが規範化されていない
- `version`: ScreenItemsFile / ConventionsCatalog / ViewsFile にあるが ProcessFlow / Table にはない

### 1.6 メタ情報の重複定義 (TS 型)

- `TableMeta` が `flow.ts` と `table.ts` で **2 箇所重複定義** (内容ほぼ同じ)
- ProcessFlowMeta は flow.ts のみ

---

## §2 設計方針 (横断ルール)

### 2.1 全領域に JSON Schema を作る

「JSON Schema が一次成果物」の原則を**全領域に拡大**:

```
schemas/v2/
├── common.v2.schema.json              ← 共通基盤 ($defs: Id / Timestamp / Version 等)
├── process-flow.v2.schema.json
├── conventions.v2.schema.json
├── extensions-*.v2.schema.json        ← 領域別の拡張定義 (新規含む)
├── screen.v2.schema.json              ← 新規 (data/screens/*.json — GrapesJS 形式は触らず参考レベル)
├── table.v2.schema.json               ← 新規
├── screen-item.v2.schema.json         ← 新規
├── project.v2.schema.json             ← 新規
├── er-layout.v2.schema.json           ← 新規
├── custom-block.v2.schema.json        ← 新規
├── sequence.v2.schema.json            ← 新規
└── view.v2.schema.json                ← 新規
```

### 2.2 共通基盤 (`common.v2.schema.json`) を切り出す

すべての schema が参照する `$defs` を共通基盤に集約:

| $defs 名 | 用途 | 例 |
|---|---|---|
| `Uuid` | UUID v4 + pattern 強制 | `gggggggg-0003-4000-8000-...` |
| `LocalId` | kebab + number 階層 ID | `step-13b-a-01`, `col-u01`, `idx-u01` |
| `BusinessIdentifier` | 業務識別子 (camelCase) | `userName`, `cartId` |
| `DbColumnName` | DB カラム名 (snake_case) | `login_id`, `password_hash` |
| `Timestamp` | ISO 8601 + `format: date-time` | `2026-04-27T00:00:00.000Z` |
| `SemVer` | SemVer pattern | `1.0.0` |
| `Description` | 説明文 (string、改行可) | |
| `MaturityLevel` | `draft` / `provisional` / `committed` | (#517 §1.5) |
| `MetaTimestamps` | `{ createdAt: Timestamp, updatedAt: Timestamp }` | mix-in 用 |
| `MetaIdentity` | `{ id: Uuid, name, description? }` | mix-in 用 |
| `Reference` | object 参照 base (`{ <entity>Id: Uuid, ... }`) | screenItemRef 等 |
| `ExpressionString` | 式言語 string (描述、検証は spec 文書に委ねる) | `@conv.tax.standard.rate` |
| `NamespaceId` | namespace pattern (`^[a-z][a-z0-9-]*$`) | `retail`, `finance` |

### 2.3 命名統一規範

#### フィールド名 (property name)

→ **lowerCamelCase 完全統一** (例外なし)

#### enum 値 (JSON literal value)

→ **ドメイン慣習を尊重**するが、新規 enum は **lowerCamelCase デフォルト**:

| 既存・新規共通ルール |
|---|
| **DB / SQL 慣習**: UPPER 維持 (`SELECT`, `VARCHAR`, `INTEGER`) — 業界慣習 |
| **HTTP method**: UPPER 維持 (`GET`, `POST`) |
| **Step kind / 実行可能 entity**: lowerCamelCase (`validation`, `dbAccess`) |
| **値オブジェクト discriminator**: lowerCamelCase (`flowVariable`, `unique`) |
| **その他新規**: lowerCamelCase デフォルト |
| **kebab-case の WorkflowPattern (`approval-sequential`)**: 維持 (Workflow 業界慣習) |
| **PascalCase の `ValidationRuleKind` (`Error`, `Msg`)**: **lowerCamelCase に変更** (`error`, `msg`) ← GeneXus 互換は捨てる |
| **`NO ACTION` (FkAction)**: スペース含みは禁止 → `noAction` に変更 |

#### ID 形式統一 (1 表で規範化)

| 対象 | 形式 | 規則 |
|---|---|---|
| **Top-level entity** (Screen / Table / ProcessFlow / View / Sequence / CustomBlock 等) | UUID v4 | `Uuid` $defs |
| **Nested 構造** (Step / Branch / Action / Index / Constraint / Trigger / Column 等) | `<prefix>-<NN>` | `LocalId` $defs |
| **Action ID** | `act-NN` | (現状通り) |
| **Step ID** | `step-NN` または `step-NN-NN` (階層) | (現状通り) |
| **Column ID** | `col-<table_prefix><NN>` | (現状通り `col-u01` 等) |
| **Index ID** | `idx-<table_prefix><NN>` | (現状通り) |
| **Branch ID** | `br-<step_NN>-<code>` | (現状通り) |
| **Marker ID** | UUID v4 | (現状通り) |
| **Decision ID** | `ADR-NNN` | (現状通り) |
| **TestScenario ID** | kebab description | (現状通り) |
| **CustomBlock ID** | UUID v4 ← `custom-block-<timestamp>` から変更 | (現状の timestamp 形式は廃止) |
| **Response.id** | `<status>-<slug>` | (現状通り) |
| **業務識別子** (ScreenItem.id, StructuredField.name など) | **camelCase 統一** | `userName`, `cartId` |
| **DB column 物理名** (TableColumn.name) | **snake_case 統一** | `login_id`, `password_hash` |

→ **既存の `user_id` / `password` (snake_case in screen-items) を camelCase に修正** (sample 全件書き換え)

### 2.4 参照パターン統一規範

3 種に統一:

#### A. **ID 単独参照** (`<entity>Id: Uuid`)

そのフィールド名で参照先が一意に分かる場合。

```json
{ "screenId": "aaaaaaaa-...", "tableId": "bbbbbbbb-...", "processFlowId": "cccccccc-..." }
```

#### B. **複合参照** (`<entity>Ref: { ... }`)

複数キーが必要な場合 (entity 内のサブ要素を指す)。

```json
{ "screenItemRef": { "screenId": "aaa-...", "itemId": "userName" } }
{ "columnRef": { "tableId": "bbb-...", "columnId": "col-u01" } }
```

#### C. **式言語内参照** (`@<prefix>.<key>`)

実行時評価される参照。

```
@conv.tax.standard.rate
@env.STRIPE_API_BASE
@secret.stripeApiKey
@fn.calcTax(...)
@<localVar>
```

(`$<path>` 記法は Criterion 内のみ、Arazzo 互換のため維持)

### 2.5 拡張機構を全領域に展開

各領域に対応する extensions schema を新設:

```
schemas/v2/
├── extensions-process-flow-step.v2.schema.json
├── extensions-field-type.v2.schema.json
├── extensions-db-operation.v2.schema.json
├── extensions-trigger.v2.schema.json
├── extensions-response-type.v2.schema.json
├── extensions-table.v2.schema.json          ← 新規 (DB 操作 / カラム雛形 / 制約パターン)
├── extensions-screen-item.v2.schema.json    ← 新規 (業界固有のフォームフィールド型)
├── extensions-screen-type.v2.schema.json    ← 新規 (業界固有の画面種別)
├── extensions-convention.v2.schema.json     ← 新規 (業界固有の業務規約カテゴリ)
└── extensions-data-type.v2.schema.json      ← 新規 (業界固有の DB データ型)
```

すべての extension schema root に共通フィールド:

```jsonc
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": ".../schemas/v2/extensions-<name>.v2.schema.json",
  "type": "object",
  "required": ["namespace", "<本体>"],
  "additionalProperties": false,
  "properties": {
    "$schema": { "type": "string" },
    "namespace": { "$ref": "common.v2.schema.json#/$defs/NamespaceId" },
    "version": { "$ref": "common.v2.schema.json#/$defs/SemVer" },
    "requiresCoreSchema": { "type": "string" },
    "deprecated": { "type": "boolean" },
    "description": { "$ref": "common.v2.schema.json#/$defs/Description" },
    "<本体>": { ... }
  }
}
```

### 2.6 コード補完最適化

- **全 schema root に `$schema` optional** 許可 (#517 §5.1 規範を全領域へ)
- **enum を全部 named type 化** (`$defs/<EnumName>` で名前付け)
- **description を全 prop に必須** (生成 TS 型の JSDoc 元 / IDE hover 表示)
- **discriminator は `kind` で統一** ← 大変更
  - 現状: Step は `type`、他 ($defs union variant) は `kind`
  - v2: **すべて `kind`** に統一 (Step の `type` プロパティを `kind` に rename)
  - 理由: `type` は他文脈 (HealthCheck.type / DataType / HttpMethod 等) でも汎用属性名として使われ、衝突を生む
- **`unevaluatedProperties: false`** で StepBaseProps 二重管理解消 (#517 §3.4)

### 2.7 後方互換性は放棄

ユーザー指示「既存データはサンプル 4 件のみ → 大変更可能」を踏まえ:

- **string union を全廃** (`ActionFields = string | StructuredField[]` → `StructuredField[]` のみ)
- **旧 `note: string` を削除** (`notes: StepNote[]` のみ)
- **deprecated field を削除** (`FieldType.custom`, `ExternalSystemStep.protocol`)
- **`type` → `kind`** 大規模 rename (Step を含む)
- **migration スクリプト** で sample 4 件 + extensions/conventions を v2 化

### 2.8 大変更ポイントの一覧

| 変更 | 影響範囲 | 互換性 |
|---|---|---|
| 全領域に JSON Schema 新設 | 9 新規 schema ファイル | additive (TS 型は維持) |
| `common.v2.schema.json` 新設 | 全 schema が `$ref` で参照 | 新規構造 |
| Step.`type` → `kind` rename | 全 ProcessFlow JSON 4 件 | **破壊的** |
| string union 廃止 (ActionFields / BodySchemaRef / Criterion / OutputBinding / BranchCondition / ValidationInlineBranch) | 6 箇所 | **破壊的** |
| `note: string` 削除 | sample 全件 | **破壊的** |
| deprecated field 削除 | (現状未使用と思われる) | **破壊的** |
| ScreenItem.id を camelCase 統一 (snake_case → camelCase) | sample 全件 | **破壊的** |
| `FkAction` のスペースを削除 (`NO ACTION` → `noAction`) | テーブル sample | **破壊的** |
| `ValidationRuleKind` を lowerCamelCase 化 (`Error` → `error`) | ProcessFlow sample | **破壊的** |
| CustomBlock.id を UUID 化 | custom-blocks.json | **破壊的** |
| 全領域に拡張機構を新設 | extensions/*.v2.schema.json 5 新規 | additive |
| `unevaluatedProperties: false` 移行 | 全 step variant | additive (構造改善) |
| 全 root に `$schema` optional 許可 | 全 schema root | additive |
| TableMeta 重複定義の解消 | TS 型のみ (schema には影響なし) | additive |

破壊的変更の総数: **9 件**。すべて sample 4 件 + 既存 data の migration で対応。

---

## §3 採用しない選択肢 (棄却理由付き)

### A. 「fully UUID」案 (全 ID を UUID v4 に統一)

棄却。理由:
- Step.id を `step-13b-a-01` から UUID にすると、ProcessFlow 設計時の認知負荷が大きすぎる
- レビュー時に「step-13b-a-01 → step-13b-a-02 に jump」が読めなくなる
- Top-level vs nested で形式を分ける現状方針が合理的

### B. 「全 enum を lowerCamelCase 統一」案

棄却。理由:
- `select` / `varchar` / `get` (lowercase) は SQL / HTTP の業界慣習に違反、業務開発者の認知負荷大
- 既存ツール (DB クライアント / OpenAPI Generator) との連携で UPPER が必要

### C. 「`catalogs` root object に階層化」案

棄却。理由:
- root に並列で書く方が JSON 編集時の認知負荷が低い
- 既存 sample が並列、Codex 提案 §4-A でも棄却済み

### D. 「Step を `CoreStep` / `ExtensionStep` / `NonReturnStep` の 3 階層に分ける」案

棄却。理由:
- 現状の `Step` / `NonReturnStep` で機能十分
- 階層化は読み手に追加の概念を強いる

### E. 「式言語を `{ lang, src }` object 化」案

棄却。理由:
- `process-flow-expression-language.md:13-20` で既に YAGNI 棄却済
- ユーザー指示「制限を設けず」でも、convention で 1 言語固定の方が業務開発者にとって認知負荷が低い

---

## §4 実装ロードマップ (Phase 4 でやること)

### Step 4-1: 共通基盤と退避 (1 PR、bootstrapping)

```
- schemas/v1/ ディレクトリ作成
- 既存 schemas/*.json 7 ファイルを v1/ に丸ごと移動
- schemas/v2/ ディレクトリ作成
- schemas/v2/common.v2.schema.json 新設 (共通 $defs)
- schemas/README.md 更新 (バージョン管理ポリシー)
- vitest を v2 path に向ける (現状の test を一時 skip)
```

### Step 4-2: 既存 3 領域の v2 化 (ProcessFlow / Conventions / Extensions)

```
- schemas/v2/process-flow.v2.schema.json 新設 (大変更含む)
  - type → kind rename
  - string union 廃止
  - unevaluatedProperties: false 化
  - $schema optional 許可
  - description 追加
  - common.v2.schema.json への $ref 化
- schemas/v2/conventions.v2.schema.json 新設
- schemas/v2/extensions-*.v2.schema.json 5 ファイル新設
  - version metadata 追加
- migration スクリプトで sample 4 件を v2 化
- vitest 復活、全件 pass
```

### Step 4-3: 新規 6 領域の schema 新設

```
- schemas/v2/screen.v2.schema.json (画面ノード / グループ / エッジ)
- schemas/v2/table.v2.schema.json (テーブル定義)
- schemas/v2/screen-item.v2.schema.json (画面項目)
- schemas/v2/project.v2.schema.json (プロジェクト root)
- schemas/v2/er-layout.v2.schema.json
- schemas/v2/custom-block.v2.schema.json
- schemas/v2/sequence.v2.schema.json
- schemas/v2/view.v2.schema.json
- 各 schema 用の vitest テスト追加
- 既存 data/ サンプルを v2 化 (camelCase 化等)
```

### Step 4-4: 拡張機構の全領域展開

```
- schemas/v2/extensions-table.v2.schema.json 新設
- schemas/v2/extensions-screen-item.v2.schema.json 新設
- schemas/v2/extensions-screen-type.v2.schema.json 新設
- schemas/v2/extensions-convention.v2.schema.json 新設
- schemas/v2/extensions-data-type.v2.schema.json 新設
```

### Step 4-5: TS 型の v2 同期

```
- TableMeta 重複定義解消 (1 箇所に集約)
- TS 型を v2 schema に合わせて全面更新
- 派生 validator (referentialIntegrity / sqlColumnValidator / conventionsValidator / loadExtensions) を v2 化
- 全 vitest pass
```

### Step 4-6: spec 文書の v2 反映

```
- docs/spec/schema-design-principles.md (v1) を schema-design-principles.v2.md に更新
- 各 process-flow-*.md の参照行番号を v2 に合わせる
- README.md 更新
```

### 統合 PR 戦略

このスコープは大きい (推定 4000+ 行の schema 変更 + sample 移行 + TS 型同期 + spec 更新)。**1 PR で完結** が望ましい (途中状態でマージできない、Step 4-1 だけマージしても vitest が通らない)。

ブランチ名: `feat/issue-519-schema-v2-redesign` (既存 worktree)

---

## §5 質問・要決定事項 (ユーザー判断ポイント)

実装前に以下を確認したいです:

### Q1: discriminator の統一 (Step の `type` → `kind` rename)

これが最も大きな破壊的変更。実態として:
- `step.type: "validation"` → `step.kind: "validation"` に変わる
- step variant 22 個全部、sample 4 件、TS 型、UI 全部に波及

**(a)** 統一する (推奨、横断的整合性) / **(b)** Step の `type` だけ例外として維持

### Q2: 既存 ScreenItem.id の snake_case → camelCase 強制移行

実データに `user_id` / `password` がある。v2 で `userId` / `password` に変える?

→ TS 型コメントは元から camelCase 推奨。実データの sample 移行で対応可。

**(a)** camelCase 強制 (推奨、業務識別子は JS 識別子と同じ規範) / **(b)** snake_case と camelCase 両方許可

### Q3: 拡張機構の全領域展開はどこまで本気で実装する?

TableExt / ScreenItemExt / ScreenTypeExt / ConventionExt / DataTypeExt の 5 新規拡張領域を Phase 4 で全部実装する? それともインフラ (schema ファイル + loader 拡張) だけ作って、実際の業界別拡張定義 (`docs/sample-project/extensions/retail/table.json` 等) は別 ISSUE で?

→ 私の推奨: **インフラだけ Phase 4、実定義は別 ISSUE** (Phase 4 を肥大化させない)

### Q4: `ValidationRuleKind` を `Error`/`Msg` から `error`/`msg` に変える

GeneXus 由来の PascalCase を捨てて lowerCamelCase 統一する?

**(a)** 統一 (推奨、横断的整合性) / **(b)** GeneXus 互換維持

### Q5: 1 PR で完結か段階分けか

Step 4-1 〜 4-6 を 1 PR でやると差分が巨大 (推定 5000+ 行)。

**(a)** 1 PR (推奨、途中状態でマージできない / 整合性確保) / **(b)** ブランチを共有して複数 PR (各 Step を順次マージ、ただし途中で vitest が通らない期間がある)

### Q6: GrapesJS 形式 (`data/screens/*.json`) の schema 化

GrapesJS が独自に決めている dataSources / pages / frames 構造を JSON Schema 化する?

**(a)** 完全 schema 化 (実態と GrapesJS 仕様の差異を吸収する手間がある) / **(b)** 参考レベル (`screen.v2.schema.json` には ScreenNode / ScreenGroup / ScreenEdge のみ含め、GrapesJS 生データは external リファレンスに留める) ← 推奨

---

## §6 上記 Q1-Q6 のすべてを「私の推奨案 (デフォルト)」で進めることを承認しますか?

承認パターン:

- **「OK / 進めて」** → 上記推奨案 (Q1-a, Q2-a, Q3 別 ISSUE 化, Q4-a, Q5-a, Q6-b) で Phase 4 着手
- **「Q<N> は (b) で」** → 該当だけ変更して残り推奨案で着手
- **「全体方針見直し」** → 本ドキュメントを修正してから再承認

---

## §7 関連

- ISSUE #519 (本作業)
- 設計原則 v1: `docs/spec/schema-design-principles.md` (PR #518 マージ済)
- Codex セカンドオピニオン: `docs/spec/schema-redesign-proposal-codex-2026-04-27.md`
- ガバナンス: `docs/spec/schema-governance.md` (#511) — 本作業は §7 例外規定 (設計者明示指示) で進める
