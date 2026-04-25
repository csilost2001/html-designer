# ProcessFlow ExternalSystemStep OpenAPI 参照 (#413)

## 目的

`ExternalSystemStep` は外部 API 呼び出しを表す。AI 実装者が `systemName` や `httpCall.path` から API 仕様を推測しなくて済むよう、`externalSystemCatalog` から OpenAPI 仕様書へリンクし、各 step から OpenAPI operation を直接参照する。

## externalSystemCatalog.openApiSpec

`ProcessFlow.externalSystemCatalog.<systemRef>.openApiSpec` は、その外部システムの OpenAPI 仕様書を指す任意フィールド。

- 型: `string`
- 値: URL またはリポジトリ内の相対 path
- 例: `https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json`

AI 実装時は `systemRef` でカタログ entry を引き、`baseUrl` / `auth` / `headers` と合わせて `openApiSpec` を読む。Stripe や SendGrid のように公開 OpenAPI があるサービスでは、operation、request body、response schema を仕様書から確定できる。

## operationRef と operationId

`ExternalSystemStep` には OpenAPI operation を特定するための任意フィールドを置ける。

- `operationRef`: OpenAPI `$ref` 風の参照。例: `/v1/payment_intents POST`、または full URI fragment
- `operationId`: OpenAPI `operationId`
- `requestBodyRef`: request body schema への JSON Pointer / `$ref`
- `responseRef`: response schema への JSON Pointer / `$ref`

選択ロジック:

1. `operationRef` があれば最優先で使う。
2. `operationRef` がなく `operationId` があれば、OpenAPI 仕様内の `operationId` で検索する。
3. どちらもなければ従来どおり `httpCall.method` / `httpCall.path` から呼び出し先を解釈する。

`operationRef` と `operationId` は併記できる。併記時は `operationRef` を正とし、`operationId` は人間向け・検索補助の別名として扱う。両者が OpenAPI 仕様上で別 operation を指す場合、実装者またはバリデータは警告を出す。

## httpCall との優先順位

`httpCall` は後方互換のため引き続き有効。`operationRef` と `httpCall` は同じ呼び出し先を表し得るため、両方ある場合は `operationRef` を優先する。

推奨:

- 新規データは `operationRef` または `operationId` を追加する。
- 既存の `httpCall` は当面残し、実装環境が OpenAPI 参照を解決できない場合の fallback とする。
- `operationRef` と `httpCall.method/path` が矛盾する場合は警告する。

## 例

Stripe Payment Intent 作成:

```json
{
  "type": "externalSystem",
  "systemName": "Stripe Japan",
  "systemRef": "stripe",
  "operationRef": "/v1/payment_intents POST",
  "operationId": "PostPaymentIntents",
  "requestBodyRef": "#/components/schemas/PaymentIntentCreateParams",
  "responseRef": "#/components/schemas/payment_intent",
  "httpCall": {
    "method": "POST",
    "path": "/v1/payment_intents"
  }
}
```

SendGrid mail send:

```json
{
  "type": "externalSystem",
  "systemName": "SendGrid",
  "systemRef": "sendgrid",
  "operationRef": "/v3/mail/send POST",
  "operationId": "mail.send",
  "httpCall": {
    "method": "POST",
    "path": "/v3/mail/send"
  }
}
```
