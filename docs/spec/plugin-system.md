# プラグインシステム仕様

処理フロースキーマをソース変更なしに拡張するための仕組み。業務アプリ開発者がプロジェクト固有の型・ステップ・操作を追加できる。

**関連 ISSUE**: #390 (GM50 バッチ対応、本仕様の最初のユーザー)

---

## 設計原則

### グローバルスキーマ vs プラグイン の判断基準

| 区分 | 基準 | 例 |
|---|---|---|
| **グローバル** | どの業務プロジェクトでも合理的に必要になる | `"file"` FieldType、`"auto"` トリガー、`MERGE` DB 操作 |
| **プラグイン** | 特定プロジェクト・業界・業態に固有 | GM50 の `"csv"` / `"ZIP"` / `"TBL"` 型 |

**原則**: グローバルに入れるべきものはグローバルに。プラグインはソースを触らずに拡張できる手段であり、グローバル定義の代替ではない。

### アーキテクチャ

```
グローバルスキーマ (schemas/process-flow.schema.json)
  └─ 全プロジェクト共通の型・enum・ステップ定義

プラグイン (data/extensions/*.json)
  └─ プロジェクト固有の追加定義
  └─ グローバルと重複した場合はプラグインが上書き (意図的な上書きとして扱う)

バリデーター
  └─ 検証のたびに extensions/ を動的読み込み → グローバルとマージして検証
```

---

## ファイル構成

```
data/extensions/
  steps.json          カスタムステップ型 (処理フローエディターのカード)
  field-types.json    FieldType 拡張 (入出力フィールドの型)
  triggers.json       ActionTrigger 拡張 (アクションの起動条件)
  db-operations.json  DbOperation 拡張 (DB 操作の種別)
  response-types.json レスポンス型定義 (typeCatalog の後継)
```

- 拡張種別ごとにファイルを分ける (異なる概念を同一ファイルに混在させない)
- バリデーターはディレクトリ内の全ファイルを読み込んでマージする
- ファイルが存在しない場合はその種別の拡張なしとして扱う (エラーにしない)

### 将来の拡張

- 外部パス設定: `project.json` に `extensionsPath` を追加し、`data/extensions/` 以外の場所を指定できるようにする (複数業務プロジェクトの並行管理に対応)
- 複数プロジェクト対応: 外部パス指定により、各業務プロジェクトのリポジトリ内に拡張定義を置ける

---

## 名前空間

プラグイン定義の各エントリには名前空間プレフィックスを付けられる。

```json
// steps.json
{
  "namespace": "gm50",
  "steps": {
    "BatchStep": { ... }
  }
}
// → "gm50:BatchStep" として登録される
```

```json
// namespace が空の場合
{
  "namespace": "",
  "steps": {
    "BatchStep": { ... }
  }
}
// → "BatchStep" としてそのまま登録
```

**競合ルール**: 同一キーが複数のファイルで定義された場合、後から読み込まれたものが上書きする (ファイル名のアルファベット順)。名前空間を使うことで意図しない競合を避けることを推奨する。

---

## 各ファイルの仕様

### steps.json — カスタムステップ型

```json
{
  "namespace": "gm50",
  "steps": {
    "BatchProcessStep": {
      "label": "バッチ処理",
      "icon": "bi-gear",
      "description": "大量データの一括処理ステップ",
      "schema": {
        "type": "object",
        "required": ["batchId"],
        "properties": {
          "batchId": {
            "type": "string",
            "description": "バッチ定義 ID"
          },
          "chunkSize": {
            "type": "number",
            "description": "1 回の処理件数"
          }
        }
      }
    }
  }
}
```

- `label`: 処理フローエディターのカードパレットに表示される名称
- `icon`: Bootstrap Icons のクラス名
- `schema`: JSON Schema draft 2020-12 で記述。UI フォームはこの schema から動的生成される

**UI への反映**: 定義されたカスタムステップはカードパレットの「カスタム」セクションに表示され、D&D でフローに追加できる。

### field-types.json — FieldType 拡張

```json
{
  "namespace": "gm50",
  "fieldTypes": [
    {
      "kind": "view",
      "label": "ビュー"
    },
    {
      "kind": "tbl",
      "label": "テーブル参照 (旧TBL形式)"
    }
  ]
}
```

> **注意**: `{kind: "file"}` はグローバルスキーマ (#443) で追加済みのため、プラグインで定義する必要はない。

- `kind`: FieldType の `kind` 値として登録される
- `formatOptions`: 省略可。`format` サブフィールドの選択肢として UI に表示

### triggers.json — ActionTrigger 拡張

```json
{
  "namespace": "gm50",
  "triggers": [
    {
      "value": "webhook",
      "label": "Webhook"
    },
    {
      "value": "mq",
      "label": "メッセージキュー"
    }
  ]
}
```

> **注意**: `"auto"` はグローバルスキーマ (#443) で追加済みのため、プラグインで定義する必要はない。

### db-operations.json — DbOperation 拡張

```json
{
  "namespace": "gm50",
  "dbOperations": [
    { "value": "TRUNCATE", "label": "TRUNCATE" }
  ]
}
```

### response-types.json — レスポンス型定義 (typeCatalog 後継)

```json
{
  "namespace": "",
  "responseTypes": {
    "ApiError": {
      "description": "API エラーレスポンス",
      "schema": {
        "type": "object",
        "properties": {
          "code": { "type": "string" },
          "message": { "type": "string" }
        }
      }
    }
  }
}
```

`HttpResponseSpec.bodySchema = { "typeRef": "ApiError" }` の解決先。`typeCatalog` (ProcessFlow 内部) を廃止しこちらに移行する。

---

## バリデーター設計

- 処理フロー JSON の検証のたびに `data/extensions/` を読み込む (再起動不要)
- 読み込み順: ファイル名アルファベット順
- マージ戦略: 後から読み込んだエントリが同一キーを上書き
- グローバルスキーマの enum にプラグインの値を追加した合成スキーマで検証する
- extensions/ が存在しない・空の場合はグローバルスキーマのみで検証

---

## MCP ツール設計

AI がプラグインを操作するための専用ツール。拡張種別ごとに分ける (誤操作防止)。

| ツール名 | 操作 |
|---|---|
| `add_step_extension` | カスタムステップを追加・更新 |
| `add_field_type_extension` | FieldType を追加 |
| `add_trigger_extension` | ActionTrigger を追加 |
| `add_db_operation_extension` | DbOperation を追加 |
| `add_response_type_extension` | レスポンス型を追加 (旧 add_catalog_entry の後継) |
| `remove_extension` | 任意の拡張エントリを削除 |
| `list_extensions` | 現在の全拡張一覧を取得 |

既存の `add_catalog_entry` / `remove_catalog_entry` は `add_response_type_extension` に置き換える。

---

## UI 設計

### 拡張管理パネル

処理フローエディターまたは設定画面に「拡張管理」パネルを追加。

- 拡張種別ごとにタブ表示 (ステップ / フィールド型 / トリガー / DB 操作 / レスポンス型)
- 各エントリの追加・編集・削除が可能
- 編集後は即時反映 (バリデーター動的読み込みのため再起動不要)

### カスタムステップの編集フォーム

カスタムステップをフロー上に配置した後の編集 UI:

- `steps.json` に定義された `schema` から **動的にフォームを生成**する
- JSON Schema の各プロパティを入力フィールドに自動変換
  - `type: "string"` → テキスト入力
  - `type: "number"` → 数値入力
  - `type: "boolean"` → チェックボックス
  - `enum` → セレクトボックス
  - `type: "object"` / `type: "array"` → ネストしたフォーム
- **汎用 JSON テキストエリアは不可** (業務設計者が使えないため)

### カードパレット

標準ステップのカードに加え、「カスタム」セクションを設けてプラグイン定義のカードを表示。`label` と `icon` を使って表示。

---

## typeCatalog 移行

現在 ProcessFlow JSON 内部にある `typeCatalog` フィールドは本仕様の `response-types.json` に移行する。

**移行手順** (プラグインシステム実装時に同時実施):
1. 既存の `typeCatalog` エントリを `data/extensions/response-types.json` に移動
2. ProcessFlow JSON から `typeCatalog` フィールドを削除
3. `TypeCatalogPanel` UI コンポーネントを拡張管理パネルの「レスポンス型」タブに統合
4. MCP ツール `add_catalog_entry` / `remove_catalog_entry` を廃止し `add_response_type_extension` に置換

---

## AI 向けガイド (操作規約)

AI が処理フロー設計中にプラグインを操作する際の判断規約。

### 拡張を追加する前に確認すること

1. **グローバルスキーマに既に存在しないか** — まず `list_extensions` とスキーマ定義を確認する
2. **グローバルに入れるべきものではないか** — 「どの業務プロジェクトでも必要か」を問う。そうなら実装者に報告してグローバル追加を提案する
3. **既存の拡張と名前が衝突しないか** — `list_extensions` で確認する。衝突する場合は名前空間を使う

### カスタムステップを追加する際の schema の書き方

- フィールドには必ず `description` を付ける (AI 実装者が読む)
- `required` を明示する
- `additionalProperties: false` を推奨 (意図しないフィールドの混入防止)

### やってはいけないこと

- グローバルスキーマで既にカバーされている概念をプラグインに重複定義する
- `namespace` を省略する (空文字列でも明示する)
- schema のない step を定義する

---

## #390 との関係

#390 (GM50 バッチ処理フロー対応) は本プラグインシステムの最初のユーザー。

**グローバルスキーマに追加 (本仕様とは別 ISSUE で先行実装)**:
- `FieldType`: `{kind: "file"}` を追加
- `ActionTrigger`: `"auto"` を追加
- `DbOperation`: `"MERGE"`, `"LOCK"` を追加
- `ValidationInlineBranch.ok/ng`: `string | Step[]` に拡張
- `CommonProcessStep.returnMapping`: プロパティ追加

**GM50 プラグインとして定義 (#390 本体で実装)**:
- `field-types.json`: `"csv"`, `"tsv"`, `"zip"`, `"view"` 等の GM50 固有型
- `"TBL"` → グローバルの `{kind: "tableRow"}` に正規化

プラグインシステムインフラ完成後、#390 は「GM50 用拡張定義ファイルを作成する」チケットとして実行する。
