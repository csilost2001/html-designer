# JSON Schema v3 — Opus 設計版

| 項目 | 値 |
|---|---|
| ステータス | 起草中 (#521) |
| 起草 | 設計者 (Opus) — Sonnet/Codex 委譲なし、全 schema を Opus 自身が一から書いた。Codex / Opus サブエージェント独立レビュー指摘を反映済み |
| 起草日 | 2026-04-27 |
| 設計記録 | [`../../docs/spec/schema-v3-design.md`](../../docs/spec/schema-v3-design.md) |

v1 (機械変換前) / v2 (機械変換版) を base にせず、業務概念から一から再設計した版。

## ファイル構成 (13 ファイル)

### 共通基盤

| ファイル | 役割 |
|---|---|
| `common.v3.schema.json` | 全 schema が `$ref` で参照する共通 `$defs`。Uuid / UuidLoose / LocalId / Identifier / PhysicalName / EnvVarKey / ErrorCode / EventTopic / Timestamp / SemVer / SemVerRange / Description / DisplayName / Maturity / Mode / ExpressionString / Namespace / EntityMeta / Authoring / Marker / MarkerShape / DecisionRecord / GlossaryEntry / Note / FieldType / StructuredField / 複合参照型 (ScreenItemRef / TableColumnRef / ViewColumnRef / ActionRef / StepRef / ResponseRef) / ExtensionApplied / ExtensionRoot / TestScenario / TestPrecondition / TestInvocation / TestAssertion を集約。Pattern A (top-level entity 単独参照) は素 Uuid を直接 `$ref` する方針のため named Ref 型 (旧 ScreenRef / TableRef 等) は設けない |

### プロジェクト・entity 定義

| ファイル | 役割 |
|---|---|
| `project.v3.schema.json` | プロジェクト root (data/project.json)。schemaVersion / meta / extensionsApplied (ExtensionApplied[]) / entities / authoring |
| `screen.v3.schema.json` | Screen entity。EntityMeta + 業務情報のみ (kind / path / items / auth / permissions / design 参照)、UI 座標は分離。hasDesign は project.v3 の ScreenEntry 側で一覧表示用に保持 (Screen 本体には不在) |
| `screen-layout.v3.schema.json` | 画面フロー UI 座標 (Designer 専用、業務実装には不要)。data/screen-layout.json |
| `screen-item.v3.schema.json` | ScreenItem (画面項目)。id は Identifier (camelCase 強制)、ValueSource discriminated union (組み込み 4 種 + 拡張) |
| `table.v3.schema.json` | Table (DB テーブル)。EntityMeta + physicalName + columns + indexes + constraints (discriminated union: unique/check/foreignKey、FK は ConstraintDefinition に集約) + defaults + triggers |
| `er-layout.v3.schema.json` | ER 図 UI 座標 + 論理リレーション。data/er-layout.json |
| `sequence.v3.schema.json` | Sequence (DB シーケンス)。usedBy は common.v3#/$defs/TableColumnRef に統一 |
| `view.v3.schema.json` | View (DB ビュー) |
| `custom-block.v3.schema.json` | カスタムブロック集合 (id は Uuid 強制、v1 timestamp 形式廃止)。**注意: CustomBlock は EntityMeta を持たない例外** (label ベースの独自構造、業務 entity ではないため) |
| `process-flow.v3.schema.json` | ProcessFlow (処理フロー)。**root を meta / context / actions / authoring の 4 並列に再編** (旧 v2 の root 並列肥大化を解消、ただし `body` セクションを設けず actions を root 直接持ちにすることで認知負荷を最小化)。catalogs を context.catalogs.<kind> に階層化、22 種 Step variant (組み込み 21 + ExtensionStep) |
| `conventions.v3.schema.json` | 横断規約 catalog (i18n / msg / regex / limit / scope / currency / tax / auth / role / permission / db / numbering / tx / externalOutcomeDefaults + extensionCategories) |
| `extensions.v3.schema.json` | **統合拡張定義** — 1 namespace = 1 ファイルで全種類 (fieldTypes / dataTypes / screenKinds / processFlowKinds / actionTriggers / dbOperations / stepKinds / responseTypes / valueSourceKinds / columnTemplates / constraintPatterns / conventionCategories) を集約 |

## v3 で導入した主要設計

### 1. 共通 entity meta mix-in

`common.v3#/$defs/EntityMeta` を**業務 top-level entity** が `allOf` でマージ:

```jsonc
"id": Uuid, "name": DisplayName, "description"?: Description,
"version"?: SemVer, "maturity"?: Maturity,
"createdAt": Timestamp, "updatedAt": Timestamp
```

各 entity 側 `$defs` では variant 固有プロパティのみ宣言する (`id: true` 等の上書きは禁止)。`unevaluatedProperties: false` が allOf 全体を見て評価するため、EntityMeta の Uuid 制約等が効く。

**例外**: `CustomBlock` は `label` ベースの GrapesJS 用構造で業務 entity ではないため EntityMeta を持たない。

### 2. 参照規範を 4 パターンに統一

- **Pattern A**: `<entity>Id: Uuid` — top-level entity 単独参照。`common.v3#/$defs/Uuid` を直接 `$ref` する (named alias は schema レベルでは型区別ができないため設けない、実装言語側で **branded type** を定義することを推奨)
- **Pattern B**: `<entity>Ref: { ... }` — 複合参照 (ScreenItemRef / TableColumnRef / ViewColumnRef / ActionRef / StepRef / ResponseRef)
- **Pattern C**: catalog key `string` — 同 entity 内 catalog のキー (各 catalog に `propertyNames` 制約で命名規範を schema 上強制)
- **Pattern D**: 式言語 `@conv.* @secret.* @env.* @fn.* @<var> $...`

### 実装言語側の branded type 推奨例 (TypeScript)

```ts
type Brand<K, T> = K & { readonly __brand: T };
type ScreenId = Brand<string, 'ScreenId'>;
type TableId = Brand<string, 'TableId'>;
type ProcessFlowId = Brand<string, 'ProcessFlowId'>;
```

これにより `tableId: ScreenId` のような誤代入をコンパイル時に検出できる。schema レベルの Uuid では型区別できないため、本対応は実装言語側の責務とする。

**廃止 anti-pattern**: 物理名で entity 指定 (`referencedTable: "users"` 等) / id+name 重複併記 (`tableId + tableName` 等) / `eventRef + topic` の二重持ち

### 3. FieldType を common.v3 に集約

ProcessFlow / ScreenItem / DomainCatalog で同一の FieldType を `$ref` 参照。プリミティブ 7 種 + 構造体 (array/object) + 参照型 (tableRow/tableList/screenInput/domain) + file + 拡張 (`kind: "extension"` + `extensionRef: "namespace:typeName"`)。

### 4. ProcessFlow root を 4 並列セクションに再編

```
meta:      identity + 運用設定 (id / name / kind / sla / mode / 等)
context:   実行に必要な参照 (catalogs.<kind> / ambientVariables / ambientOverrides / health / readiness / resources)
actions:   実行ロジック本体 (ActionDefinition[])
authoring: 設計用 (markers / testScenarios / decisions / glossary / notes、実行不要)
```

旧 v2 の root 30+ 並列を 4 並列に整理。`actions` は root 直接持ち (`body` ラッパーは廃止、認知負荷低減)。

### 5. catalog 階層化 + propertyNames 制約

旧 root 並列 catalog を `context.catalogs.{errors / externalSystems / secrets / envVars / domains / functions / events}` に階層化。各 catalog は `propertyNames` で命名規範を schema 上強制 (errors→ErrorCode / externalSystems→Identifier / domains→PascalCase 等)。

### 6. Marker / DecisionRecord / GlossaryEntry / Note / TestScenario を共通化

`common.v3#/$defs/Marker / DecisionRecord / GlossaryEntry / Note / TestScenario / TestPrecondition / TestInvocation / TestAssertion` を全領域 (Screen / Table / ScreenItem / ProcessFlow / Project) の authoring セクションで使用可。`Authoring` $defs にまとめて参照する形式。

`Marker.kind` には `validator` を追加 (validator 由来の警告 marker と人間 marker を kind で区別、validator marker は `validatorCode` / `validatorPath` を必須化)。

### 7. 拡張機構を 1 ファイル統合 + 分割運用許容

旧 v2 では 10 個の extensions schema → v3 では `extensions.v3.schema.json` 1 ファイル。

**運用は 2 通り両対応**:
- `data/extensions/<namespace>.v3.json` 1 ファイル (シンプル運用)
- `data/extensions/<namespace>/*.v3.json` 複数ファイル分割 (大規模 namespace 用)

loader が glob で読み込み、同 namespace の複数ファイルをマージする。

### 8. discriminator を `kind` で全領域統一

Step.kind / FieldType.kind / Constraint.kind / BranchCondition.kind / ValueSource.kind / TestPrecondition.kind / TestAssertion.kind / Marker.kind / CdcDestination.kind 全部 `kind`。

### 9. unevaluatedProperties: false

全 step variant + 主要 entity に適用。base + variant 合成型のドリフトを構造的に防止。EntityMeta の Uuid / Timestamp 等の制約が allOf 経由で効く。

### 10. enum 命名規範を文書化

| ドメイン | 命名 | 例 |
|---|---|---|
| SQL keyword | UPPER | DataType / DbOperation / TriggerEvent / TriggerTiming |
| HTTP | UPPER | HttpMethod |
| TX/EE | UPPER_SNAKE | TransactionIsolationLevel / TransactionPropagation |
| ベンダ慣習 (DB ツール) | lowercase | SqlDialect / IndexMethod |
| Workflow / BPM 業界 | kebab-case | WorkflowPattern |
| ER モデリング | kebab-case | ErCardinality |
| **その他 (新規 enum / discriminator / valueSource.kind 等)** | **lowerCamelCase** | StepKind / Constraint.kind / WorkflowQuorum.type / ValidationRule.severity |

### 11. 業務識別子規範 (3 種)

- **Identifier** (camelCase): 業務識別子 — ScreenItem.id, StructuredField.name, 拡張 kind, ProcessFlow 変数名
- **PhysicalName** (snake_case): DB 物理名 — TableDefinition.physicalName, TableColumn.physicalName, Sequence.physicalName, View.physicalName
- **DisplayName** (自由 string、文字種制限なし): 表示名 — Screen.name, Table.name, ScreenItem.label

`name = 表示名 / physicalName = システム識別子` を全領域で一貫。

### 12. 拡張バージョニング

`common.v3#/$defs/ExtensionRoot` で `version` (SemVer) / `requiresCoreSchema` (SemVerRange) を必須化。`project.v3#/extensionsApplied` は `ExtensionApplied[]` (`{ namespace, version? }`) で version 制約付き宣言。

## v3 で廃止したもの (v1/v2 から)

| 旧 | v3 |
|---|---|
| string union (ActionFields / BodySchemaRef / Criterion / OutputBinding / BranchCondition / ValidationInlineBranch.ok/ng) | structured 必須 (string 短縮形廃止) |
| 旧 `note: string` | `notes: Note[]` のみ |
| `FieldType.custom` (deprecated) | 削除 |
| `ExternalSystemStep.protocol` (deprecated) | 削除 (httpCall + operationRef のみ) |
| `TableColumn.foreignKey` (inline FK) | ConstraintDefinition に集約 |
| `ConstraintDefinition.referencedTable` (物理名) | `referencedTableId: Uuid` |
| `tableId + tableName` 併記 / `targetScreenId + targetScreenName` 併記 | id のみ |
| `EventPublishStep.eventRef + topic` 二重持ち | topic のみ (二重持ち anti-pattern 解消) |
| ProcessFlow root 30+ 並列プロパティ | meta / context / actions / authoring の 4 並列 |
| 10 個の extensions schema | extensions.v3.schema.json 1 ファイル統合 |
| ScreenNode の position / size / thumbnail (UI 座標) | screen-layout.v3.schema.json に分離 |
| `FkAction` の `NO ACTION` (スペース含み) | `noAction` (lowerCamelCase) |
| `ValidationRuleKind` (`Error` / `Msg` 等 PascalCase) | `ValidationRule.severity` (`error` / `msg` 等 lowerCamelCase、`kind` 多義性回避のためフィールド名も rename) |
| `WorkflowQuorum.type` の `n-of-m` | `nOfM` |
| `CustomBlock.id` の timestamp 形式 | Uuid 強制 |
| `StepBaseProps` の二重列挙 | `unevaluatedProperties: false` で構造的解消 |
| `StepBaseProps.transactional: boolean` 簡易 TX マーク | 削除 (txBoundary に統一、v3 の「短縮形廃止」方針) |
| catalog key の命名規範が description のみ | `propertyNames` で schema 上強制 (errors → ErrorCode / externalSystems → Identifier / etc.) |
| `DataLineage.reads / writes: Uuid[]` | `LineageEntry[]` (`{ tableId, purpose? }`) |
| `CdcStep.destination.target: string` | discriminated union (auditLog / eventStream / table) |
| `ExtensionStep` の任意 top-level 属性 | `config: object` に閉じる + `unevaluatedProperties: false` |
| 拡張 1 ファイル限定 | 単一/複数ファイル両対応 (loader が glob で merge) |
| ProcessFlow 専用 testScenarios | `common.v3#/$defs/TestScenario` で全 entity 共通化 |

## バリデータ実装ヒント (AJV)

JSON Schema 2020-12 を使うため、AJV では `Ajv2020` を使用:

```ts
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import commonV3 from "./schemas/v3/common.v3.schema.json" assert { type: "json" };
import processFlowV3 from "./schemas/v3/process-flow.v3.schema.json" assert { type: "json" };

const ajv = new Ajv2020({ allErrors: true, strict: false, discriminator: true });
addFormats(ajv);
ajv.addSchema(commonV3);  // 他 schema が common を $ref 解決できるよう先に登録
const validate = ajv.compile(processFlowV3);
```

ポイント:
- `discriminator: true` を有効化することで Step.oneOf 22 variant のエラーメッセージが kind discriminator 単位で 1 branch のみ報告される (デフォルトでは 22 branch 全部のエラーが列挙されて読みにくい)
- `addSchema(commonV3)` を先に呼んで cross-file `$ref` を解決可能にする
- 他 schema (extensions / table / screen 等) も同様に addSchema で登録

## ガバナンス

設計者 (ユーザー) 明示指示による §7 例外規定で進行。AI による勝手拡張ではない。

## Namespace 空文字の運用

`Namespace` ($defs) が空文字を許容するのは「グローバル拡張」(loader が `extensionsApplied` の指定なしでも自動的に読み込む共通拡張) を表現するため。実プロジェクトで使う業界別拡張は `retail` / `finance` 等の文字列を必ず指定する。

## 関連

- 設計記録: [`../../docs/spec/schema-v3-design.md`](../../docs/spec/schema-v3-design.md)
- v2 (機械変換版): [`../v2/`](../v2/) (PR #520 マージ済)
- v1 (旧版): [`../v1/`](../v1/) (凍結バックアップ)
- バージョン管理ポリシー: [`../README.md`](../README.md)
- 設計原則: [`../../docs/spec/schema-design-principles.md`](../../docs/spec/schema-design-principles.md) (PR #518)
- ガバナンス: [`../../docs/spec/schema-governance.md`](../../docs/spec/schema-governance.md) §7 例外規定 (設計者明示指示) で進行
