# JSON Schema v3 — Opus 設計版

| 項目 | 値 |
|---|---|
| ステータス | 起草中 (#521) |
| 起草 | 設計者 (Opus) — Sonnet/Codex 委譲なし、全 schema を Opus 自身が一から書いた |
| 起草日 | 2026-04-27 |
| 設計記録 | [`../../docs/spec/schema-v3-design.md`](../../docs/spec/schema-v3-design.md) |

v1 (機械変換前) / v2 (機械変換版) を base にせず、業務概念から一から再設計した版。

## ファイル構成 (13 ファイル、約 3280 行)

### 共通基盤

| ファイル | 行数 | 役割 |
|---|---|---|
| `common.v3.schema.json` | 464 | 全 schema が `$ref` で参照する共通 `$defs` (Uuid / LocalId / Identifier / PhysicalName / Timestamp / SemVer / EntityMeta / Authoring / FieldType / StructuredField / Marker / DecisionRecord / GlossaryEntry / Note / 各種 Ref / ExtensionRoot 等 30+ 定義) |

### プロジェクト・entity 定義

| ファイル | 行数 | 役割 |
|---|---|---|
| `project.v3.schema.json` | 162 | プロジェクト root (data/project.json)。entities 配下に各 entity への参照、authoring (markers / decisions / glossary) |
| `screen.v3.schema.json` | 80 | Screen (画面) entity。業務情報のみ (path / kind / hasDesign / items)、UI 座標は分離 |
| `screen-layout.v3.schema.json` | 46 | 画面フロー UI 座標 (Designer 専用、業務実装には不要) |
| `screen-item.v3.schema.json` | 117 | ScreenItem (画面項目)。id は Identifier (camelCase 強制)、ValueSource discriminated union |
| `table.v3.schema.json` | 233 | Table (DB テーブル)。physicalName と name (表示名) を分離、Constraint discriminated union (unique/check/foreignKey)、FK は ConstraintDefinition のみ (TableColumn.foreignKey は廃止) |
| `er-layout.v3.schema.json` | 51 | ER 図 UI 座標 + 論理リレーション |
| `sequence.v3.schema.json` | 47 | Sequence (DB シーケンス) |
| `view.v3.schema.json` | 51 | View (DB ビュー) |
| `custom-block.v3.schema.json` | 25 | カスタムブロック集合 (id は Uuid 強制、v1 timestamp 形式廃止) |
| `process-flow.v3.schema.json` | 1439 | ProcessFlow (処理フロー)。**root を meta / context / body / authoring の 4 セクション化**、catalogs を context.catalogs.<kind> に階層化、22 種 Step variant + ExtensionStep |
| `conventions.v3.schema.json` | 298 | 横断規約 catalog (msg / regex / limit / scope / currency / tax / auth / role / permission / db / numbering / tx / externalOutcomeDefaults + extensionCategories) |
| `extensions.v3.schema.json` | 267 | **統合拡張定義** — 1 namespace = 1 ファイルで全種類 (fieldTypes / dataTypes / screenKinds / actionTriggers / dbOperations / stepKinds / responseTypes / valueSourceKinds / columnTemplates / constraintPatterns / conventionCategories) を集約 |

## v3 で導入した主要設計

### 1. 共通 entity meta mix-in

`common.v3#/$defs/EntityMeta` を全 top-level entity が `allOf` でマージ:

```jsonc
"id": Uuid, "name": DisplayName, "description"?: Description,
"version"?: SemVer, "maturity"?: Maturity,
"createdAt": Timestamp, "updatedAt": Timestamp
```

### 2. 参照規範を 4 パターンに統一

- **Pattern A**: `<entity>Id: Uuid` — top-level entity 単独参照
- **Pattern B**: `<entity>Ref: { ... }` — 複合参照 (ScreenItemRef / TableColumnRef / ActionRef / StepRef / ResponseRef)
- **Pattern C**: catalog key `string` — 同 entity 内 catalog のキー
- **Pattern D**: 式言語 `@conv.* @secret.* @env.* @fn.* @<var> $...`

**廃止 anti-pattern**: 物理名で entity 指定、id+name 重複

### 3. FieldType を common.v3 に集約

ProcessFlow / ScreenItem / DomainCatalog で同一の FieldType を `$ref` 参照。業界拡張は `kind: "extension"` + `extensionRef: "namespace:typeName"` で統一表現。

### 4. ProcessFlow root を 4 セクション化

```
meta:      identity + 運用設定 (id / name / kind / sla / mode / 等)
context:   実行に必要な参照 (catalogs.<kind> / ambientVariables / health / 等)
body:      実行ロジック (actions[])
authoring: 設計用 (markers / testScenarios / decisions / glossary、実行不要)
```

### 5. catalog 階層化

旧 root 並列 9 catalog を `context.catalogs.{errors / externalSystems / secrets / envVars / domains / functions / events}` に階層化。新 catalog 追加時に root を肥大化させない。

### 6. Marker / DecisionRecord / GlossaryEntry / Note を共通化

`common.v3#/$defs/Marker / DecisionRecord / GlossaryEntry / Note` を全領域 (Screen / Table / ScreenItem / ProcessFlow / Project) の authoring セクションで使用可。

### 7. 拡張機構を 1 ファイル統合

旧 v2 では 10 個の extensions schema → v3 では `extensions.v3.schema.json` 1 ファイル。`data/extensions/<namespace>.v3.json` 1 つで全種類の拡張を完結。

### 8. discriminator を `kind` で全領域統一

Step.kind / FieldType.kind / Constraint.kind / BranchCondition.kind / ValueSource.kind / TestPrecondition.kind / TestAssertion.kind 全部 `kind`。

### 9. unevaluatedProperties: false

全 step variant + 主要 entity に適用。base + variant 合成型のドリフトを構造的に防止。

### 10. enum 命名規範を文書化

| ドメイン | 命名 | 例 |
|---|---|---|
| SQL keyword | UPPER | DataType / DbOperation / TriggerEvent |
| HTTP | UPPER | HttpMethod |
| TX/EE | UPPER_SNAKE | TransactionIsolationLevel |
| ベンダ | lowercase | SqlDialect / IndexMethod |
| Workflow | kebab-case | WorkflowPattern |
| ER モデリング | kebab-case | ErCardinality |
| **その他 (新規 enum / discriminator)** | **lowerCamelCase** | StepKind / Constraint.kind / WorkflowQuorum.type |

### 11. 業務識別子規範 (3 種)

- **Identifier** (camelCase): 業務識別子 — ScreenItem.id, StructuredField.name, 拡張 kind
- **PhysicalName** (snake_case): DB 物理名 — TableDefinition.physicalName, TableColumn.physicalName
- **DisplayName** (自由 string): 表示名 — Screen.name, Table.name, ScreenItem.label

`name = 表示名 / physicalName = システム識別子` を全領域で一貫。

## v3 で廃止したもの (v1/v2 から)

| 旧 | v3 |
|---|---|
| string union (ActionFields / OutputBinding 等 6 箇所) | structured 必須 (string 短縮形廃止) |
| 旧 `note: string` | `notes: Note[]` のみ |
| `FieldType.custom` (deprecated) | 削除 |
| `ExternalSystemStep.protocol` (deprecated) | 削除 (httpCall + operationRef のみ) |
| `TableColumn.foreignKey` (inline FK) | ConstraintDefinition に集約 |
| `ConstraintDefinition.referencedTable` (物理名) | `referencedTableId: Uuid` |
| `tableId + tableName` 併記 | tableId のみ |
| `targetScreenId + targetScreenName` 併記 | targetScreenId のみ |
| ProcessFlow root 30+ 並列プロパティ | meta / context / body / authoring 4 セクション化 |
| 10 個の extensions schema | extensions.v3.schema.json 1 ファイル統合 |
| ScreenNode の position / size / thumbnail (UI 座標) | screen-layout.v3.schema.json に分離 |
| `FkAction` の `NO ACTION` (スペース含み) | `noAction` (lowerCamelCase) |
| `ValidationRuleKind` の PascalCase (`Error` 等) | lowerCamelCase (`error` 等) |
| `WorkflowQuorum.type` の `n-of-m` | `nOfM` |
| `CustomBlock.id` の timestamp 形式 | Uuid 強制 |
| `StepBaseProps` の二重列挙 | `unevaluatedProperties: false` で構造的解消 |

## 関連

- 設計記録: [`../../docs/spec/schema-v3-design.md`](../../docs/spec/schema-v3-design.md)
- v2 (機械変換版): [`../v2/`](../v2/) (PR #520 マージ済)
- v1 (旧版): [`../v1/`](../v1/) (凍結バックアップ)
- バージョン管理ポリシー: [`../README.md`](../README.md)
- 設計原則: [`../../docs/spec/schema-design-principles.md`](../../docs/spec/schema-design-principles.md) (PR #518)
- ガバナンス: [`../../docs/spec/schema-governance.md`](../../docs/spec/schema-governance.md) §7 例外規定 (設計者明示指示) で進行
