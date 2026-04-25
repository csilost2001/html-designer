# 処理フロー 実行時規約 (ランタイム挙動)

Issue: #261 v1.5
策定日: 2026-04-20
ステータス: **初版**

本ドキュメントは、処理フロー JSON Schema 上に現れるが「**スキーマ制約としては表現しない / できないが、実装者が従うべき規約**」を集約する。再ドッグフード 4.85/5 で「schema だけでは決定できない」と指摘された項目が対象。

関連仕様:
- [process-flow-extensions.md](process-flow-extensions.md) — 構造化フィールド定義
- [process-flow-expression-language.md](process-flow-expression-language.md) — 式言語 BNF
- [process-flow-variables.md](process-flow-variables.md) — 変数・outputBinding
- [process-flow-maturity.md](process-flow-maturity.md) — 成熟度・モード

## 1. SQL 内の式補間 (`DbAccessStep.sql`)

### 1.1 原則: prepared statement ベース

`sql` 内に現れる `@expression` は**静的文字列置換ではなく、prepared statement のパラメータバインディング**に変換する。

### 1.2 変換規則

1. `@identifier` および `@identifier.path` (プロパティアクセス) は順に `$1, $2, ...` (PostgreSQL) / `?, ?, ...` (MySQL) に置換
2. 展開時の値は **js-subset 式評価結果** (§process-flow-expression-language.md)
3. `?.` オプショナルチェイン結果が undefined の場合は `NULL` バインド
4. 関数呼出・算術演算子を含む式 (`@a + @b`, `Math.floor(@x)` 等) は **SQL 側で実行せず、JS で事前評価してから**バインド

例:

```sql
-- ソース
INSERT INTO orders (customer_id, total, payment_id)
VALUES (@customerId, @subtotal + @taxAmount, @paymentAuth?.id)

-- PostgreSQL prepared statement
INSERT INTO orders (customer_id, total, payment_id) VALUES ($1, $2, $3)
-- パラメータ: [customerId, (subtotal + taxAmount), paymentAuth?.id ?? null]
```

### 1.3 SQL キーワード vs 式

`CURRENT_TIMESTAMP` / `COALESCE(...)` / `NULL` / 列名 (`orders.status`) は **SQL 字句としてそのまま使用**。`@` プレフィックスがないものは全て SQL 字句。

### 1.4 in-clause の展開

`WHERE id IN (@ids)` のような配列展開は、`@ids` の要素数に応じて `$N, $N+1, ...` を展開:

```sql
-- ソース
WHERE id IN (@ids)  -- @ids = [10, 20, 30]

-- 展開後
WHERE id IN ($1, $2, $3)
-- パラメータ: [10, 20, 30]
```

## 2. HTTP body の直列化 (`ExternalSystemStep.httpCall.body`)

### 2.1 既定: `application/json`

`httpCall.body` は js-subset の object literal 式。既定で **JSON 直列化**される。Content-Type ヘッダは externalSystemCatalog.headers / step.headers で上書き可。

```json
// 既定
"httpCall": { "method": "POST", "path": "/v1/foo", "body": "{ name: @user.name, age: @user.age }" }
// → application/json として送信: {"name": "...", "age": 25}
```

### 2.2 `application/x-www-form-urlencoded` (Stripe 等)

外部 API が form-urlencoded を要求する場合 (Stripe、レガシー OAuth 等)、**externalSystemCatalog または step.headers で明示**:

```json
"stripe": {
  "name": "Stripe Japan",
  "headers": {
    "Stripe-Version": "2024-06-20",
    "Content-Type": "application/x-www-form-urlencoded"
  }
}
```

このとき body object literal は form-encoded 規則で serialize (ネスト object は `parent[child]` 記法、配列は `parent[]`):

```
body: { amount: 100, metadata: { customer_id: 42 }, items: [1, 2] }
→ amount=100&metadata[customer_id]=42&items[]=1&items[]=2
```

### 2.3 undefined / null の扱い

値が undefined (例: `@optionalField` が未設定) のフィールドは **body から除外**。null は **明示的に null/空文字として送信** (API 仕様に従う)。

### 2.4 query の serialize

`httpCall.query` は常に URL クエリ文字列。値は js-subset 式として評価、`URLSearchParams` 相当で encode。

## 3. トランザクション × 例外 × Saga 補償の連鎖

### 3.1 `txBoundary.role: "begin"` → `"end"` の範囲

`role: "begin"` ステップから `role: "end"` ステップまで (同一 `txId`) が **1 つの DB トランザクション**。`"member"` は中間、個別に `txBoundary` を書かなくても begin〜end 間にある全 step は TX に属する。

### 3.2 throw → ROLLBACK の自動発火

TX 範囲内 (begin〜end の間) で以下が起きた場合、**TX は自動 ROLLBACK**:

- `DbAccessStep.affectedRowsCheck.onViolation: "throw"` が発火
- `ExternalSystemStep.outcomes.failure.action: "abort"` (compensate は個別補償なので ROLLBACK とは独立)
- いずれかの step で JavaScript エラー (ValidationError 等) が throw される

### 3.3 ROLLBACK 後の `tryCatch` 捕捉

自動 ROLLBACK された throw は、`txBoundary.role: "end"` より **後ろにある** `BranchStep` の `branches[].condition: { kind: "tryCatch", errorCode: "..." }` で捕捉される。

`errorCode` のマッチング:
- `affectedRowsCheck.errorCode` の値と `BranchConditionVariant.errorCode` が等しければマッチ
- 通常 Error の場合は `errorCatalog` のキーにマッチさせる規約 (implicit)

### 3.4 捕捉後の補償 (Saga compensate)

tryCatch ブランチ内に置いた `compensatesFor: "step-xxx"` 付きの ExternalSystemStep が、**既に成功していた外部呼出の取消**を実行する。

## 4. `fireAndForget: true` の意味論

### 4.1 同期レスポンス待たない

`fireAndForget: true` の ExternalSystemStep は、**HTTP レスポンスを待たずに次の step へ進む**。typical 実装:

```js
// 擬似コード
const promise = httpClient.post(path, body);
// await しない
promise.catch((err) => { /* outcomes.failure の sideEffects を実行 */ });
```

### 4.2 outcomes の評価

`outcomes.success` は評価しない (そもそも成功を待たないため)。`outcomes.failure` / `outcomes.timeout` は **バックグラウンドで発生した場合のみ** sideEffects を実行 (例: Sentry に記録)。

### 4.3 タイムアウト

`timeoutMs` は fireAndForget でも有効。**バックグラウンドの Promise がこの時間を超えたら reject 扱い**して failure sideEffects を走らせる。

## 5. `externalChain.phase` の順序規約

`phase: "authorize" → "capture" → "cancel"` の順序は **スキーマでは強制しない**。以下は **規約として守る**:

1. 同一 `chainId` の step のうち、`authorize` が時系列上最初
2. `capture` は `authorize` の成功後のみ実行可能 (runIf で `@paymentAuth != null` 等で守る)
3. `cancel` は `authorize` の実施後 (capture 前でも後でも可)
4. `authorize` 未実施の状態で `capture` / `cancel` を実行してはならない

実装側は `externalChain` を**ログ相関 (observability)** + **Saga 補償のリソース突合**に使う。動作保証は step の配置と runIf で書き手が担保する。

## 6. `sideEffects` 内 DB アクセスの TX 境界

`ExternalCallOutcomeSpec.sideEffects` 内に置かれた `DbAccessStep` は、**sideEffects 発火時点で外側の TX は既に commit / rollback 済**という前提。

- **autocommit モード**で個別に実行 (新しい TX を開かない)
- 失敗しても外側のメインフローには影響しない (sideEffects は best-effort)
- retry は想定しない (retry したい場合は普通の step として配置)

例 (0005 の capture 失敗時):

```
step-or2-011 (capture) が失敗
→ outcomes.failure.sideEffects で
  - "UPDATE orders SET status='payment_failed'" (autocommit)
  - Sentry 記録
  - Slack 通知
```

この UPDATE は外側 TX (tx-order-main) とは別に実行される。

## 7. `HttpResponseSpec.when` の意味

`when: "@paymentAuth.status == 'failed'"` は **documentation 兼評価式**:

- **primary**: 人間と AI 向けの「どういう条件でこのレスポンスが返るか」の説明
- **secondary**: 参照整合性バリデータが `when` 内の `@identifier` が定義済みかを検査可能 (将来拡張)
- **実行時は使わない**: 実際の分岐は step-level の ReturnStep / inlineBranch で行う

## 8. `action.httpRoute.auth` の認証スキーム

`auth: "required" | "optional" | "none"` は **認証の有無**を示すフラグ。具体的な認証スキーム (Bearer / Session cookie / Basic / API key 等) は:

### 8.1 推奨: ProcessFlow.ambientVariables で明示

```json
"ambientVariables": [
  { "name": "userId", "type": "number", "required": true,
    "description": "Bearer token から middleware が解決して注入" }
]
```

### 8.2 externalSystemCatalog とは別扱い

`externalSystemCatalog` は **outbound** (自アプリ → 外部 API) の認証。`httpRoute.auth` は **inbound** (クライアント → 自アプリ)。混同しないこと。

### 8.3 スキーム固有の仕様は product-scope へ

プロジェクト全体で採用している認証方式 (Bearer JWT / Session / OAuth2 等) は `docs/conventions/product-scope.md` に宣言。処理フロー個別のスキーマではなく**プロダクト横断規約**として管理。

### 8.5 secretsCatalog と tokenRef の連携 (#261 v1.6)

ExternalAuth.tokenRef は以下 3 形式を受け付ける:

1. **`@secret.<key>`** (推奨): ProcessFlow.secretsCatalog 参照。参照整合性バリデータが未登録エラーを検出
2. **`ENV:<envName>`** (後方互換): 環境変数名直書き
3. **`SECRET:<path>`** (後方互換): 外部 secret store パス直書き

新規データは \`@secret.*\` を使い、catalog 側で source (env/vault/file) と name を管理する。catalog は値そのものを持たず、**メタデータのみ**。

```json
"secretsCatalog": {
  "stripeApiKey": {
    "source": "env",
    "name": "STRIPE_SECRET_KEY",
    "description": "Stripe API 認証",
    "rotationDays": 90
  }
}
```

実装時は source 毎に:
- `env` → `process.env[secretRef.name]`
- `vault` → HashiCorp Vault / AWS Secrets Manager / GCP Secret Manager の API
- `file` → ファイルから読込 (開発時のみ)

### 8.4 inbound auth 具体スキーム決定フロー

実装者が `httpRoute.auth: "required"` を見たとき、以下の順で具体スキームを決定する:

```
httpRoute.auth == "required" ?
  ├─ yes → ambientVariables に "userId" / "accountId" 等の identity 変数があるか?
  │   ├─ yes → scheme は Bearer JWT (token から middleware が userId を解決して @userId に注入)
  │   └─ no → docs/conventions/product-scope.md §6 の既定 scheme (例: Session cookie) を採用
  └─ no → スキーム解決不要 (auth: "none" / "optional")
```

0005 の例: `httpRoute.auth: "required"` + ambientVariables に `sessionId` があるが `userId` なし → product-scope §6 の規定 (Session cookie + httpOnly) を採用。

## 9. Ambient Context — 規約カタログ defaults と ambientOverrides (#369)

### 9.1 Ambient Context の定義

**Ambient Context** とは、ProcessFlow が明示的に inputs で受け取るのではなく、「プロジェクト全体に共通する前提」として暗黙に利用する環境情報のこと。代表例:

| Ambient 項目 | 参照パス | 既定値 (プロジェクト既定) |
|---|---|---|
| タイムゾーン | `@conv.scope.timezone` | `Asia/Tokyo` (JST) |
| 通貨 | `@conv.currency.jpy` | JPY (subunit=0, roundingMode=floor) |
| 消費税方式 | `@conv.tax.standard` | 外税 10%, 切り捨て |
| 認証スキーム | `@conv.auth.default` | session-cookie + httpOnly |
| DB 規約 | `@conv.db.default` | PostgreSQL 14+, snake_case |

### 9.2 規約カタログが project-wide defaults を担う

`data/conventions/catalog.json` の各エントリに `"default": true` を付与したものが、**全 ProcessFlow の共通 ambient default** となる。

- `"default": true` が付いていないエントリは「オプション定義」(比較対象・将来用) として存在可
- 1 カテゴリ内に複数 `"default": true` がある場合の動作は未定義 (バリデータが将来検出予定)
- AI 実装者は `data/conventions/catalog.json` を「実装の前提条件」として最初に読む
- **対象カテゴリ**: `scope` / `currency` / `tax` / `auth` / `db` の 5 カテゴリのみ。`msg` / `regex` / `limit` / `numbering` / `tx` / `externalOutcomeDefaults` はルックアップテーブルまたは複数方針の共存で「単一 default」の概念が適用されないため対象外
- **注意 — キー名と `default` プロパティ名の重複**: `auth.default`・`db.default` 等、エントリのキー名が `"default"` の場合、新プロパティ `"default": true` を追加すると同名が 2 か所現れる。これは **JSON 構造上は問題ない** (キー名 `"default"` は object のキー、`"default": true` は そのオブジェクト内のプロパティ) が、視覚的に分かりにくい。既存キー名は互換性のため変更せず、コメントが必要な場合は `description` フィールドで補足する

```json
// data/conventions/catalog.json の例
{
  "currency": {
    "jpy": { "code": "JPY", "subunit": 0, "roundingMode": "floor", "default": true },
    "usd": { "code": "USD", "subunit": 2, "roundingMode": "round" }
  }
}
```

### 9.3 ProcessFlow.ambientOverrides — フロー単位の例外指定

大多数のフローは規約カタログの defaults をそのまま使う。**特定フローだけ例外** (外貨精算・UTC バッチ等) の場合にのみ、`ambientOverrides` フィールドで上書きする。

```json
// data/process-flows/xxx.json (override が必要な場合のみ記述)
{
  "id": "...",
  "ambientOverrides": {
    "currency": "@conv.currency.usd",
    "scope.timezone": "UTC"
  },
  "actions": [...]
}
```

**ルール:**

1. `ambientOverrides` が無い ProcessFlow は、規約カタログの `default: true` エントリを全項目で継承
2. `ambientOverrides` で指定したキー (例: `"currency"`) だけ override、残りは defaults 継続
3. 値は `@conv.*` 形式の参照文字列 (カタログ内のキーパスを指す) または直接値 (例: `"UTC"`)
4. `@conv.*` 参照の場合、AI 実装者は参照先カタログエントリの全フィールドを引いて利用する
5. 稀用途: 通常は `ambientOverrides` なしで設計し、必要が生じた時点で追加する

### 9.4 AI 実装者が設計書を読む順序

処理フロー実装時は以下の順で読む:

```
1. data/conventions/catalog.json          — project-wide defaults (通貨・TZ・税率・認証・DB 規約等)
2. 対象 ProcessFlow の ambientOverrides    — 当該フローの特例 (無い場合は 1. の defaults をそのまま適用)
3. 処理フロー本体 (actions / steps)        — 具体ロジック
4. テーブル定義 (DDL)                       — 採番ロジック等のインフラ層
5. 画面項目定義                             — 入出力の UI 制約
```

### 9.5 ambientOverrides と ambientVariables の違い

| フィールド | 目的 | 例 |
|---|---|---|
| `ambientVariables` | ミドルウェア由来の **変数宣言** (`@requestId` 等が存在することを明示) | `[{ "name": "userId", "type": "number" }]` |
| `ambientOverrides` | 規約カタログ defaults への **例外指定** (フロー単位で通貨・TZ 等を変える) | `{ "currency": "@conv.currency.usd" }` |

両者は別物。`ambientVariables` はリクエストスコープの変数、`ambientOverrides` はプロジェクト規約に対するフロー固有の例外。

## 10. `compensatesFor` の配置規約

### 10.1 通常は tryCatch ブランチ配下

`StepBase.compensatesFor: string` (補償対象の step ID) を持つ step は、**通常 `BranchStep.branches[].condition: { kind: "tryCatch" }` の steps 配下**に置く。メインフロー側 (成功経路) に置かない理由: 成功経路では補償する必要がない。

### 10.2 runIf で補償対象の成功を確認

補償が意味を持つのは「対象 step が成功した後にエラーが起きた」場合のみ。対象 step の outputBinding を `runIf` で確認する:

```json
{
  "id": "step-stripe-cancel",
  "type": "externalSystem",
  "runIf": "@paymentAuth != null",
  "compensatesFor": "step-stripe-authorize",
  ...
}
```

`@paymentAuth` は authorize 成功時のみ set される → `null` 判定で「既に authorize 済なら cancel」を守る。

### 10.3 参照整合性 (現状の検査範囲)

- `compensatesFor` の値は action 内の既存 step ID であるべき (将来の参照整合性バリデータで検査予定、#261 残)
- 現状は書き手規約

## 11. ログ / 監査ステップの規約

### 11.1 `LogStep` は運用観測用

`type: "log"` はデバッグ・運用観測のためのアプリケーションログを表す。`message` と `structuredData` の値は式として評価してよい。実装は `level` をロガーの重要度に対応させ、`category` が指定されている場合はログルーティング・logger 名・タグ等に利用する。

`LogStep` は業務監査の証跡ではない。誰が何を実行したかをコンプライアンス目的で残す場合は `AuditStep` を使う。

### 11.2 `AuditStep` は actor / timestamp を自動付与

`type: "audit"` は「誰が・いつ・何に対して・何をして・結果どうなったか」の監査証跡を表す。フロー定義には `actor` と `timestamp` を書かない。実装はセッションコンテキストまたは認証ミドルウェアから現在ユーザーを取得し、`@conv.auth.currentUser` 相当の ambient context として自動注入する。時刻は監査ログを書き込むサーバ側で生成し、クライアント入力値を信用しない。

`result` が未指定の場合、実装はステップ実行結果から自動判定する。例外が発生した場合は `failure`、正常完了した場合は `success` として記録する。明示指定がある場合はその値を優先する。

### 11.3 sensitive マスキング

`AuditStep.sensitive: true` の場合、実装は対象値の本体を監査ログに保存しない。`resource.type` / `resource.id` / `action` / `reason` の参照キーやフィールド名は残してよいが、パスワード・トークン・個人番号・秘密値などの値本体は `***` などの固定マスクに置換する。

マスキングは監査ログ出力直前の最後の防御線として行う。上流の `LogStep.structuredData` や例外メッセージにも機微値が混入しないよう、実装は同じマスキングルールを共有することが望ましい。

## RBAC (役割・権限)

`role` と `permission` は横断規約カタログの第一級カテゴリとして扱う。参照は `@conv.role.<key>` / `@conv.permission.<key>` の形式で書く。権限キーは `order.approve` のようにドメインと操作を dot でつないだ名前を推奨する。

Runtime は Action 起動前に actor が持つ role から permission を展開し、`ActionDefinition.requiredPermissions` の全要素を actor の permission 集合が包含するか検証する。欠けている permission があれば処理本体へ入らず、403 相当の outcome を返す。

role の `inherits` は depth-first で展開する。親 role の `inherits` を先にたどり、得られた permission は重複を除去して集合として扱う。循環参照は conventions validator のエラーであり、runtime は循環した catalog を前提にしない。

Step-level の `requiredPermissions` は Action-level と AND 条件で評価する。つまり Action 起動時に Action-level 権限を満たしたうえで、該当 step の実行直前に Step-level 権限もすべて満たしている必要がある。Step-level 権限が欠ける場合も 403 相当の outcome とし、当該 step 以降の副作用を実行しない。

## 12. 適用チェックリスト (実装者向け)

処理フロー JSON から Node.js/Express 実装を起こすとき、以下を本仕様に沿って決定する:

- [ ] `sql` 内 `@x` → prepared statement `$N` 変換 (§1)
- [ ] `httpCall.body` → JSON or form-urlencoded を Content-Type で判定 (§2)
- [ ] `txBoundary.begin` 〜 `end` を Knex/pg の `tx.run()` / `BEGIN`/`COMMIT` に対応 (§3)
- [ ] throw された errorCode を BranchConditionVariant.tryCatch で捕捉、Saga 補償の compensatesFor を走らせる (§3.4)
- [ ] `fireAndForget: true` なら await せず、エラーは background で outcomes.failure.sideEffects (§4)
- [ ] externalChain.phase は observability のみ (§5)
- [ ] sideEffects 内の dbAccess は autocommit (§6)
- [ ] `responses[].when` は documentation (§7)
- [ ] `httpRoute.auth` のスキーム具体化は ambient 変数 + product-scope (§8)
- [ ] ambient 前提 (TZ / 通貨 / 税率) は `data/conventions/catalog.json` の `default: true` エントリから取得 (§9.2)
- [ ] フロー固有の ambient 例外は `ambientOverrides` を確認し、未記載なら catalog defaults をそのまま適用 (§9.3)
