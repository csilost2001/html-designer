# JSON Schema v1 (凍結) — html-designer

**ステータス**: **凍結** (修正不可)
**凍結日**: 2026-04-27 (#519)

本ディレクトリは v1 schema の**バックアップ**であり、修正対象ではない。新規開発は `../v2/` を使用する。

## ファイル

| ファイル | 対象 | TS 型 (v1 当時の対応) |
|----------|------|-------|
| `process-flow.schema.json` | ProcessFlow (処理フロー定義) | `ProcessFlow` @ `designer/src/types/action.ts` |
| `conventions.schema.json` | 横断規約カタログ (msg / regex / limit) | `ConventionsCatalog` @ `designer/src/schemas/conventionsValidator.ts` |
| `extensions-steps.schema.json` | カスタムステップ拡張定義 | `StepDef` @ `designer/src/schemas/loadExtensions.ts` |
| `extensions-field-types.schema.json` | FieldType 拡張定義 | `FieldTypeDef` @ 同上 |
| `extensions-triggers.schema.json` | ActionTrigger 拡張定義 | `TriggerDef` @ 同上 |
| `extensions-db-operations.schema.json` | DbOperation 拡張定義 | `DbOperationDef` @ 同上 |
| `extensions-response-types.schema.json` | レスポンス型拡張定義 | `ResponseTypeDef` @ 同上 |

## 既知の課題 (v1 では修正しない、v2 で対応済み)

`docs/spec/schema-design-principles.md` (PR #518) §10 で記録された課題:

- **B-1 Must-fix**: WorkflowStep / TransactionScopeStep の variant から `sla` 列挙抜け (`process-flow.schema.json:1789-1797`, `:1963-1970`)
- **B-2 Should-fix**: ProcessFlow root に `$schema` optional 不許可
- **B-3 Should-fix**: `unevaluatedProperties: false` 未採用、StepBaseProps 二重管理
- **B-4 Should-fix**: extensions schema に version metadata なし
- **B-5 Nit**: 一部 prop に description 欠落
- **B-6 Nit**: WorkflowQuorum.type が inline enum (named type 化されていない)

これらの修正は v2 で取り込まれている。v1 は履歴保存目的でそのまま残す。

## v1 を参照する案件 (将来)

将来的に `data/project.json` の `schemaVersion: "v1"` を宣言した案件は本ディレクトリの schema を validation に使用する想定。**現状そのような案件は存在しない**。

## $id

各 schema の `$id` は v1 当時のまま (`.../schemas/v1/<name>.schema.json` ではなく `.../schemas/<name>.schema.json`)。これは v1 凍結の一部として変更しない。

外部参照する場合は schema 内の `$id` 値ではなく、本リポジトリの `schemas/v1/<name>.schema.json` を直接 fetch すること。

## 関連

- v2 (再設計版): [`../v2/`](../v2/)
- v2 再設計案: [`../../docs/spec/schema-v2-design.md`](../../docs/spec/schema-v2-design.md) (#519)
- バージョン管理ポリシー: [`../README.md`](../README.md)
- 設計原則 v1: [`../../docs/spec/schema-design-principles.md`](../../docs/spec/schema-design-principles.md) (PR #518)
- 過去監査: [`../../docs/spec/schema-audit-2026-04-27.md`](../../docs/spec/schema-audit-2026-04-27.md)
