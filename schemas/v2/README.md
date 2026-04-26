# JSON Schema v2 — html-designer

**ステータス**: 起草中 (#519)
**起草日**: 2026-04-27

本ディレクトリは v1 から再設計された v2 schema を保持する。

## ファイル一覧

### 共通基盤

| ファイル | 対象 |
|----------|------|
| `common.v2.schema.json` | 全 v2 schema が共通参照する `$defs` (Uuid / LocalId / Timestamp / SemVer / 等) |

### 既存領域 (v1 から移行 + 再設計)

| ファイル | 対象 |
|----------|------|
| `process-flow.v2.schema.json` | ProcessFlow (処理フロー定義) |
| `conventions.v2.schema.json` | 横断規約カタログ |
| `extensions-process-flow-step.v2.schema.json` | カスタムステップ拡張定義 (旧 extensions-steps) |
| `extensions-field-type.v2.schema.json` | FieldType 拡張定義 |
| `extensions-trigger.v2.schema.json` | ActionTrigger 拡張定義 |
| `extensions-db-operation.v2.schema.json` | DbOperation 拡張定義 |
| `extensions-response-type.v2.schema.json` | レスポンス型拡張定義 |

### 新規領域 (v2 で新設)

| ファイル | 対象 | データ JSON |
|----------|------|------|
| `screen.v2.schema.json` | 画面ノード / 画面グループ / 画面遷移 | `data/screens/*.json` のメタ部分 (GrapesJS 生データは外部リファレンス扱い) |
| `table.v2.schema.json` | テーブル定義 (カラム / 制約 / インデックス / DEFAULT / トリガー) | `data/tables/*.json` |
| `screen-item.v2.schema.json` | 画面項目定義 (フォーム要素のバリデーション・ラベル・表示制御) | `data/screen-items/*.json` |
| `project.v2.schema.json` | プロジェクト全体メタ | `data/project.json` |
| `er-layout.v2.schema.json` | ER 図レイアウト | `data/er-layout.json` |
| `custom-block.v2.schema.json` | カスタムブロック | `data/custom-blocks.json` |
| `sequence.v2.schema.json` | シーケンス定義 | `data/sequences/*.json` |
| `view.v2.schema.json` | ビュー定義 | (将来 `data/views/*.json`) |

### 新規拡張機構

| ファイル | 対象 |
|----------|------|
| `extensions-table.v2.schema.json` | テーブル拡張 (業界固有のカラム雛形 / 制約パターン) |
| `extensions-screen-item.v2.schema.json` | 画面項目拡張 (業界固有のフォームフィールド型) |
| `extensions-screen-type.v2.schema.json` | 画面種別拡張 (業界固有の screen type) |
| `extensions-convention.v2.schema.json` | 規約拡張 (業界固有の業務規約カテゴリ) |
| `extensions-data-type.v2.schema.json` | DB データ型拡張 (業界固有の DB 型) |

## v1 からの主要変更点

詳細は [`../../docs/spec/schema-v2-design.md`](../../docs/spec/schema-v2-design.md) 参照。要点のみ:

### 構造変更

- **discriminator を `kind` で統一**: Step の `type` プロパティを `kind` に rename
- **`unevaluatedProperties: false`** で StepBaseProps 二重管理を解消
- **共通基盤 (`common.v2.schema.json`)** を全 schema が `$ref` で参照
- **全 schema root に `$schema` optional 許可** (IDE IntelliSense)
- **全 enum を named type 化** (`$defs/<EnumName>`)

### 後方互換性放棄 (既存サンプルしか無い前提)

- string union 廃止 (ActionFields / BodySchemaRef / Criterion / OutputBinding / BranchCondition / ValidationInlineBranch.ok/ng)
- 旧 `note: string` 削除 (`notes: StepNote[]` のみ)
- deprecated field 削除 (`FieldType.custom`, `ExternalSystemStep.protocol`)
- `FkAction` のスペース削除 (`NO ACTION` → `noAction`)
- `ValidationRuleKind` を lowerCamelCase 化 (`Error` → `error`)
- ScreenItem.id を camelCase 強制 (`user_id` → `userId`)
- CustomBlock.id を UUID 化 (timestamp 形式廃止)

### 拡張機構の全領域展開

- v1 では ProcessFlow にのみ拡張機構があった (5 種)
- v2 では全領域 (table / screen-item / screen-type / convention / data-type) に拡張機構を新設
- 各 extensions schema root に `version` / `requiresCoreSchema` / `deprecated` / `description` を追加 (`common.v2.schema.json#/$defs/ExtensionRootProps`)

## バージョニング

`$id` はバージョン込みで宣言: `https://raw.githubusercontent.com/csilost2001/html-designer/main/schemas/v2/<name>.v2.schema.json`

## 関連

- v1: [`../v1/`](../v1/) (凍結バックアップ)
- バージョン管理ポリシー: [`../README.md`](../README.md)
- v2 再設計案: [`../../docs/spec/schema-v2-design.md`](../../docs/spec/schema-v2-design.md) (#519)
- 設計原則: [`../../docs/spec/schema-design-principles.md`](../../docs/spec/schema-design-principles.md)
