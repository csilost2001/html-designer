# 式言語 — 横断参照規約 (`@*`)

| 項目 | 値 |
|---|---|
| 関連 ISSUE | #414 (envVarsCatalog 追加に伴う `@env.*` / `@secret.*` 規約整理) |
| 親仕様 | [`docs/spec/process-flow-expression-language.md`](../spec/process-flow-expression-language.md) (式 BNF / js-subset) |
| スコープ | 横断規約 (ProcessFlow / 画面項目 / バリデーション・規約カタログで共通) |

## 1. 位置づけ

ProcessFlow / 画面項目 / 規約カタログ等で共通に使う `@<prefix>.<key>` 形式の参照記法を**一箇所で正規化**する。各 spec はここを引用する。

式の構文 (演算子 / 関数呼出 / オブジェクトリテラル等) は親仕様 [`process-flow-expression-language.md`](../spec/process-flow-expression-language.md) を参照。本文書は `@*` の名前解決規約のみを扱う。

## 2. プレフィックス一覧

| プレフィックス | 解決先 | 例 | 関連仕様 |
|---|---|---|---|
| `@<varName>` | ローカル変数 (action.inputs / outputBinding / ambientVariables) | `@orderId`, `@requestId`, `@items` | [`process-flow-variables.md`](../spec/process-flow-variables.md) |
| `@conv.<category>.<key>` | 規約カタログ (`data/conventions/catalog.json`) | `@conv.currency.jpy`, `@conv.numbering.orderNumber`, `@conv.msg.outOfRange` | `schemas/conventions.schema.json` |
| `@env.<KEY>` | 環境変数カタログ (`ProcessFlow.envVarsCatalog`) | `@env.STRIPE_API_BASE`, `@env.MAX_RETRY_ATTEMPTS`, `@env.FEATURE_FLAG_NEW_PRICING` | [`process-flow-env-vars.md`](../spec/process-flow-env-vars.md) |
| `@secret.<KEY>` | Secrets カタログ (`ProcessFlow.secretsCatalog`) | `@secret.stripeApiKey`, `@secret.sendgridApiKey` | [`process-flow-secrets.md`](../spec/process-flow-secrets.md) |

未定義のプレフィックスは識別子スコープ・参照整合性バリデータが警告を発する。

## 3. 名前解決優先順位

同一識別子が複数プレフィックスで解釈可能な場合の優先順位:

1. **ローカル変数** (`@varName`) — action.inputs / outputBinding / ambientVariables
2. **規約カタログ** (`@conv.*`) — `category.key` 階層構造
3. **環境変数** (`@env.<KEY>`) — `envVarsCatalog`
4. **Secrets** (`@secret.<KEY>`) — `secretsCatalog`

プレフィックス (`conv`, `env`, `secret`) が明示されていれば曖昧性は無い。プレフィックス無しの `@<name>` は常にローカル変数として解決される。

## 4. `@env.<KEY>` の規約

### 4.1 解決元

`ProcessFlow.envVarsCatalog[KEY]` に登録されたエントリ。詳細は [`process-flow-env-vars.md`](../spec/process-flow-env-vars.md)。

### 4.2 解決順序

```
1. envVarsCatalog[KEY].values[現在環境] (dev/staging/prod 等)
2. envVarsCatalog[KEY].default
3. 未定義 → エラー (実装は起動時 fast-fail 推奨)
```

### 4.3 型保証

`envVarsCatalog[KEY].type` で宣言した型 (`string` / `number` / `boolean`) で実装側が parse する。式中での暗黙型変換は許容しない (例: `@env.MAX_RETRY_ATTEMPTS` が type=number なら number として扱う)。

### 4.4 使用可能フィールド

| 場所 | 例 |
|---|---|
| `runIf` | `"@env.FEATURE_FLAG_NEW_PRICING"` |
| `expression` (ComputeStep) | `"@env.MAX_RETRY_ATTEMPTS * 2"` |
| `bodyExpression` | `"{ flag: @env.FEATURE_FLAG_NEW_PRICING }"` |
| `httpCall.path` / `body` / `query.value` | `"@env.STRIPE_API_BASE/payment_intents"` |
| `idempotencyKey` | — |
| `headers` の値 | — |
| `argumentMapping` の値 | — |
| `condition` (Branch) | `"@env.FEATURE_FLAG_NEW_PRICING == true"` |

## 5. `@secret.<KEY>` の規約

### 5.1 解決元

`ProcessFlow.secretsCatalog[KEY]` に登録されたエントリ。詳細は [`process-flow-secrets.md`](../spec/process-flow-secrets.md)。

### 5.2 解決順序

```
1. secretsCatalog[KEY].values[現在環境] (参照式 vault://... / env://... を解析して実値取得)
2. secretsCatalog[KEY].source + name (旧フォーマット fallback)
3. 未定義 → エラー (実装は起動時 fast-fail 推奨)
```

### 5.3 使用可能フィールド

| 場所 | 例 |
|---|---|
| `ExternalAuth.tokenRef` | `"@secret.stripeApiKey"` |
| `httpCall.headers` の値 | `"X-API-Key": "@secret.thirdPartyKey"` |
| DB 接続文字列 (将来) | — |

ログ出力 / 画面表示等の**ユーザー可視出力に @secret を使うことは禁止**。実装側はログ書込時にマスク必須。

### 5.4 ログマスク

`@secret.*` を式中で使った step は、ログ出力時に値そのものを出さず key 名のみログする (例: `secretsRefs: ["stripeApiKey"]`)。`AuditStep.sensitive: true` と同等の扱い。

## 6. 後方互換

旧記法 (#261 以前) は引き続き valid:

| 旧記法 | 新記法 (推奨) |
|---|---|
| `"ENV:STRIPE_SECRET_KEY"` (`tokenRef`) | `"@secret.stripeApiKey"` (catalog 経由) |
| `"SECRET:stripe/api-key"` (`tokenRef`) | `"@secret.stripeApiKey"` (catalog 経由) |
| (ハードコード値) | `"@env.STRIPE_API_BASE"` (catalog 経由) |

新規データは catalog 経由 (`@env.*` / `@secret.*`) を使う。
