# data/extensions

処理フローのプラグイン拡張定義を置く実行時ディレクトリです。

`data/` 配下ですが、本ディレクトリは仕様上の一次データとして Git 追跡対象です。各ファイルは `namespace` を必須で持ち、空文字列の場合は名前空間なしとして扱います。

| ファイル | 用途 |
|---|---|
| `steps.json` | カスタムステップ型 |
| `field-types.json` | FieldType 拡張 |
| `triggers.json` | ActionTrigger 拡張 |
| `db-operations.json` | DbOperation 拡張 |
| `response-types.json` | レスポンス型定義 |
