# Criterion — 成功判定条件仕様 (#427 P3-2)

`Criterion` は ExternalSystemStep の `successCriteria` フィールドで使う条件式型です。Arazzo 1.0 仕様の `successCriteria` に対応し、外部 API 呼び出しの成否をプログラム的に判定します。

## 型定義

```ts
type CriterionType = "simple" | "regex" | "jsonpath" | "xpath";

interface StructuredCriterion {
  type: CriterionType;
  expression: string;    // 評価式
  context?: string;      // 評価対象 (jsonpath / xpath で必須)
}

type Criterion = string | StructuredCriterion;
```

後方互換性のため、既存の `string` 形式も引き続き valid です。

## CriterionType 一覧

| type       | expression 例                        | context 例          | 説明 |
|------------|--------------------------------------|---------------------|------|
| `simple`   | `@statusCode == 200`                 | `@statusCode`       | 単純比較式。ランタイムが変数を展開して評価 |
| `regex`    | `^pi_`                               | `@responseBody.id`  | 正規表現マッチ。context に評価対象文字列を指定 |
| `jsonpath` | `$.status`                           | `@responseBody`     | JSONPath 評価。context に JSON オブジェクトを指定 |
| `xpath`    | `//result/status/text() = 'success'` | `@responseBody`     | XPath 評価。context に XML 文字列を指定 |

## 利用場所

`ExternalSystemStep.successCriteria?: Criterion[]`

すべての条件が true の場合に「成功」と見なします (AND 結合)。

```json
{
  "type": "externalSystem",
  "id": "step-call-api",
  "description": "外部 API を呼び出す",
  "systemRef": "stripe",
  "systemName": "Stripe",
  "successCriteria": [
    { "type": "simple",   "expression": "@statusCode == 200", "context": "@statusCode" },
    { "type": "jsonpath", "expression": "$.status",           "context": "@responseBody" },
    { "type": "regex",    "expression": "^pi_",               "context": "@responseBody.id" }
  ]
}
```

## Arazzo Export との連携

`designer__export_arazzo` MCP ツールは `successCriteria` を Arazzo 1.0 ワークフローの同名フィールドにそのままマッピングします。`successCriteria` が未設定の場合はそのステップの `successCriteria` フィールドを省略します。

## 設計判断

- `string` 形式との union にすることで既存フロー定義を破壊せず移行可能 (旧データは再検証不要)
- `context` を optional にすることで `simple` 型が `context` を省略できる (短縮記法)
- AND 結合のみサポート — OR は複数 Branch による表現を推奨
