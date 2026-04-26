# docs/sample-project/extensions

プラグイン拡張定義のサンプル、テンプレートを置くディレクトリです。

実行時にバリデーターが読む場所は `data/extensions/` です。このディレクトリには、仕様確認用や業界別テンプレート用のサンプルを配置します。

## ファイル一覧

| ファイル | 内容 |
|---|---|
| `response-types.json` | レスポンス型サンプル (汎用) |
| `field-types.json` | GM50 想定の FieldType 拡張サンプル |

## field-types.json について

GM50 顧客向けプラグインを想定したサンプル拡張定義です。`csv` / `tsv` / `zip` / `view` の 4 種類を定義しています。

顧客先での適用は、以下のように手動コピーしてください (本リポジトリでは実適用しません):

```bash
cp docs/sample-project/extensions/field-types.json data/extensions/
```

なお、`data/actions/gm50-*.json` 内の `"TBL"` 値をグローバルの `{kind: "tableRow"}` に正規化する作業は、リポジトリ外の作業です (顧客先の実 JSON を直接修正してください)。
