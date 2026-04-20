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

### 8.1 推奨: ActionGroup.ambientVariables で明示

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

## 9. 適用チェックリスト (実装者向け)

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
