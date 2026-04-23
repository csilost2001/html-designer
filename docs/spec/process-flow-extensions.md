# 処理フロースキーマ拡張 (Phase B 包括リファレンス)

Issue: #182 (親: #151, #152)
策定日: 2026-04-20
ステータス: **初版** (ドッグフード 9 連続で 5.0/5 到達後に策定)

本ドキュメントは、`docs/spec/process-flow-maturity.md` / `process-flow-variables.md` の Phase 1 ベースライン以降に追加されたスキーマ拡張を網羅する**リファレンス**。個別設計思想は各 PR (#155〜#181) に記載。

**UI 対応**: 各機能の実際の UI は [`docs/ui-screenshots/`](../ui-screenshots/README.md) を参照。

**一次成果物 (機械可読)**: [`schemas/process-flow.schema.json`](../../schemas/process-flow.schema.json) — 外部 AI / CI からも参照可能な JSON Schema 2020-12。本ドキュメントの各節と 1:1 対応。

## 位置づけ

- **Phase 1 (基盤)**: `process-flow-maturity.md` / `process-flow-variables.md` に記載。maturity / notes / mode / StructuredField / outputBinding / argumentMapping の基盤
- **Phase B (本書)**: Phase 1 のドッグフード (#151 (B)) で発覚した「説明文 (description) 依存の業務概念」を構造化した 15 種のフィールド拡張
- **結果**: 別 AI セッションによる実装依頼で**自信度 5.0/5 / 地の文依存ゼロ / スキーマ確定可能** に到達 (#151 詳細)

## 1. HTTP 契約 (action レベル)

### 1.1 `action.httpRoute`

HTTP ハンドラ型 action の**ルート**を型付きで指定。自由記述だった「POST /api/customers」等を構造化。

```ts
interface HttpRoute {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;                    // "/api/customers" or "/api/customers/:id"
  auth?: "required" | "optional" | "none";  // 既定 "required"
}
```

PR: #161

### 1.2 `action.responses[]`

action が返し得る **HTTP レスポンス一覧**を列挙。成功・各エラーをまとめて表現。

```ts
type BodySchemaRef =
  | string                        // 旧: 自由記述 ("ApiError" / "{code, detail}")
  | { typeRef: string }           // 新: 型カタログ名参照 (#253 v1.2)
  | { schema: object };           // 新: インライン JSON Schema (#253 v1.2)

interface HttpResponseSpec {
  id?: string;                     // ReturnStep.responseRef が参照する ID
  status: number;                  // 201, 400, 409, ...
  contentType?: string;            // 既定 "application/json"
  bodySchema?: BodySchemaRef;      // 3 形式の union
  description?: string;
  when?: string;                   // 発生条件 (自由記述)
}
```

**bodySchema の使い分け**:
- `string`: 既存データ互換、または人間向け説明としてのみ
- `{ typeRef: "CustomerResponse" }`: 共有される型を参照 (複数の response / action で同じ形式を使う場合)
- `{ schema: {...} }`: その response 固有の ad hoc な形式 (JSON Schema draft 2020-12)

PR: #161 (初版) / #179 (`id` フィールド追加) / #260 (BodySchemaRef union 化 #253)

### 1.3 典型例

```json
"httpRoute": { "method": "POST", "path": "/api/orders", "auth": "required" },
"responses": [
  { "id": "201-success", "status": 201, "bodySchema": "{orderId, orderNumber}" },
  { "id": "409-stock-shortage", "status": 409, "bodySchema": "ApiError", "when": "@shortageList.length > 0" }
]
```

UI: ![HTTP 契約パネル](../ui-screenshots/03-action-editor.png)

## 2. ステップの実行制御

### 2.1 `StepBase.runIf`

ステップの**条件実行ガード**。式が偽の場合 skip。

```ts
runIf?: string;   // 自由記述の真偽式 or @conv.* 参照
```

用例: `"runIf": "@paymentMethod == 'credit_card'"`

PR: #179

UI: ![runIf / outputBinding / 代入方式](../ui-screenshots/04-step-expanded.png)

### 2.2 トランザクション境界 (`StepBase.txBoundary` / `transactional`)

同一 `txId` を持つステップ群が単一 TX 内で実行される想定。

```ts
interface TxBoundary {
  role: "begin" | "member" | "end";
  txId: string;                    // アクション内一意
}
// または簡易フラグ
transactional?: boolean;
```

PR: #163

### 2.3 Saga 補償 (`StepBase.compensatesFor`)

補償ステップから補償対象ステップへの**逆参照**。

```ts
compensatesFor?: string;   // ステップ ID
```

用例: Stripe cancel ステップが authorize ステップを指す

PR: #163

UI: ![詳細メタ情報パネル (TX境界 / Saga / 外部chain)](../ui-screenshots/07-notes-and-advanced-meta.png)

### 2.4 外部呼出チェーン (`StepBase.externalChain`)

同一外部リソースを扱う複数ステップを束ねる。

```ts
interface ExternalChain {
  chainId: string;
  phase: "authorize" | "capture" | "cancel" | "other";
}
```

用例: Stripe PaymentIntent の 3 フェーズを `chainId: "stripe-pi-order"` で統一

PR: #163

## 3. 外部連携の outcome

### 3.1 `ExternalSystemStep.outcomes`

success / failure / timeout の 3 outcome に対するハンドリングを構造化。

```ts
type ExternalCallOutcome = "success" | "failure" | "timeout";

interface ExternalCallOutcomeSpec {
  action: "continue" | "abort" | "compensate";
  description?: string;
  jumpTo?: string;
  sideEffects?: Step[];            // action 実行前に走る副作用ステップ列
  sameAs?: ExternalCallOutcome;    // 他 outcome 定義の流用
}

outcomes?: Partial<Record<ExternalCallOutcome, ExternalCallOutcomeSpec>>;
```

PR: #159 (初版) / #173 (sideEffects / sameAs 追加)

### 3.0 HTTP 呼出の構造化 (`httpCall` / `systemRef`, #261 v1.3)

```ts
interface ExternalHttpCall {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;                       // 式補間可: "/v1/payment_intents/@paymentAuth.id/cancel"
  query?: Record<string, string>;     // 値は式可
  body?: string;                      // JSON literal 式
}

// ExternalSystemStep に追加
systemRef?: string;                  // ActionGroup.externalSystemCatalog のキー
httpCall?: ExternalHttpCall;         // 旧 protocol の後継
protocol?: string;                   // DEPRECATED: httpCall への移行推奨
```

### 3.0c typeCatalog (ActionGroup レベル, #261 v1.3)

`HttpResponseSpec.bodySchema: { typeRef: string }` の解決先カタログ。同じ型 (`ApiError` 等) を複数 response で使い回すための DRY 化。

```ts
interface TypeCatalogEntry {
  description?: string;
  schema: object;                    // JSON Schema draft 2020-12
}

// ActionGroup に追加
typeCatalog?: Record<string, TypeCatalogEntry>;
```

用例:

```json
"typeCatalog": {
  "ApiError": {
    "description": "共通エラーレスポンス",
    "schema": {
      "type": "object",
      "required": ["code", "message"],
      "properties": {
        "code": { "type": "string" },
        "message": { "type": "string" },
        "fieldErrors": { "type": "object", "additionalProperties": { "type": "string" } }
      }
    }
  }
}
```

response 側:

```json
"responses": [
  { "id": "400-validation", "status": 400, "bodySchema": { "typeRef": "ApiError" } }
]
```

参照整合性バリデータが `typeRef → typeCatalog` 存在検査を行う (typeCatalog 未定義時は後方互換で skip)。

### 3.0b externalSystemCatalog (ActionGroup レベル, #261 v1.3)

同じ外部システム (Stripe, SendGrid 等) を使う複数ステップで **auth / baseUrl / timeoutMs / retryPolicy / headers** を 1 箇所に集約。drift 防止と DRY 化。

```ts
interface ExternalSystemCatalogEntry {
  name: string;                         // 表示名
  baseUrl?: string;                     // "https://api.stripe.com"
  auth?: ExternalAuth;                  // 既定認証 (step 側 override 可)
  timeoutMs?: number;
  retryPolicy?: RetryPolicy;
  headers?: Record<string, string>;
  description?: string;
}

// ActionGroup に追加
externalSystemCatalog?: Record<string, ExternalSystemCatalogEntry>;
```

用例:

```json
"externalSystemCatalog": {
  "stripe": {
    "name": "Stripe Japan",
    "baseUrl": "https://api.stripe.com",
    "auth": { "kind": "bearer", "tokenRef": "ENV:STRIPE_SECRET_KEY" },
    "timeoutMs": 10000,
    "retryPolicy": { "maxAttempts": 3, "backoff": "exponential", "initialDelayMs": 500 },
    "headers": { "Stripe-Version": "2024-06-20" }
  }
}
```

step 側:

```json
{
  "type": "externalSystem",
  "systemName": "Stripe Japan",
  "systemRef": "stripe",
  "httpCall": {
    "method": "POST",
    "path": "/v1/payment_intents",
    "body": "{ amount: @order.totalAmount, currency: 'jpy' }"
  },
  "idempotencyKey": "auth-@order.id"
}
```

step 側の auth/timeoutMs 等を指定した場合は catalog を上書き。

### 3.1b 認証・冪等性・カスタムヘッダ (#253 v1.2)

```ts
type ExternalAuthKind = "bearer" | "basic" | "apiKey" | "oauth2" | "none";

interface ExternalAuth {
  kind: ExternalAuthKind;
  tokenRef?: string;       // "ENV:STRIPE_SECRET_KEY" / "SECRET:stripe/api-key" 等の規約参照
  headerName?: string;     // apiKey 時のヘッダ名 (既定 "Authorization")
}

// ExternalSystemStep に追加
auth?: ExternalAuth;
idempotencyKey?: string;                // 式 (例: "order-@registeredOrder.id")
headers?: Record<string, string>;       // 任意の追加ヘッダ (値は式可)
```

**tokenRef の規約** (2026-04-20 時点):
- `"ENV:<var_name>"` — 環境変数参照 (例: `"ENV:STRIPE_SECRET_KEY"`)
- `"SECRET:<path>"` — 将来の secrets 管理機能への参照 (現状は運用規約)

### 3.2 `timeoutMs` / `retryPolicy` / `fireAndForget`

```ts
interface RetryPolicy {
  maxAttempts: number;
  backoff?: "fixed" | "exponential";
  initialDelayMs?: number;
}

timeoutMs?: number;                // 既定: product-scope §11 で 10000
retryPolicy?: RetryPolicy;         // 既定: なし
fireAndForget?: boolean;           // true なら同期レスポンス待たず即続行
```

PR: #159

### 3.3 典型例 (capture 失敗時の sideEffects)

```json
"outcomes": {
  "success": { "action": "continue" },
  "failure": {
    "action": "continue",
    "sideEffects": [
      { "type": "dbAccess", "operation": "UPDATE", "sql": "UPDATE orders SET status='payment_failed' WHERE id = @registeredOrder.id" },
      { "type": "other", "description": "Sentry error 記録" }
    ]
  },
  "timeout": { "action": "continue", "sameAs": "failure" }
}
```

UI: ![外部 outcomes エディタ (success/failure/timeout + sideEffects)](../ui-screenshots/08-external-outcomes.png)

## 4. DB 操作の拡張

### 4.1 `DbAccessStep.sql`

完全な SQL 文を指定 (JOIN / RETURNING / サブクエリ等)。

```ts
sql?: string;       // 指定時は fields / operation より優先
```

PR: #171

UI: ![DB 操作ステップ — 完全 SQL / 対象フィールド](../ui-screenshots/05-step-card-detail.png)

### 4.2 `DbAccessStep.affectedRowsCheck`

条件付き UPDATE / DELETE の影響行数チェック。rowCount 違反時の挙動を構造化。

```ts
type AffectedRowsOperator = ">" | ">=" | "=" | "<" | "<=";

interface AffectedRowsCheck {
  operator: AffectedRowsOperator;
  expected: number;
  onViolation: "throw" | "abort" | "log" | "continue";
  errorCode?: string;
  description?: string;
}
```

用例 (在庫引当):

```json
{
  "operation": "UPDATE",
  "sql": "UPDATE inventory SET stock = stock - @eitem.quantity WHERE item_id = @eitem.itemId AND stock >= @eitem.quantity",
  "affectedRowsCheck": {
    "operator": ">", "expected": 0,
    "onViolation": "throw", "errorCode": "STOCK_SHORTAGE"
  }
}
```

PR: #165

### 4.3 `DbAccessStep.bulkValues` (#253)

一括 INSERT 時に `VALUES` 句へ展開する配列変数を構造化宣言するフィールド。`sql` に `@arrayVar` を埋め込むだけでは「これが bulk insert である」という意図が機械可読でないため追加。

```ts
interface DbAccessStep extends StepBase {
  // ... 既存フィールド省略 ...
  bulkValues?: string;  // 例: "@poItemValues"
}
```

**用法**: `bulkValues` に配列変数の参照を設定し、`sql` 内で同じ変数を `VALUES @poItemValues` のように展開する。両フィールドの整合は実装側の責務。

```json
{
  "type": "dbAccess",
  "tableName": "purchase_order_items",
  "operation": "INSERT",
  "bulkValues": "@poItemValues",
  "sql": "INSERT INTO purchase_order_items (...) SELECT ... FROM (VALUES @poItemValues) AS v(...)"
}
```

PR: #368 (#253)

## 5. バリデーションの構造化

### 5.1 `ValidationStep.rules[]`

`conditions: string` の自由記述と併用可能な**構造化ルール配列**。

```ts
type ValidationRuleType =
  | "required" | "regex" | "maxLength" | "minLength"
  | "range" | "enum" | "custom";

interface ValidationRule {
  field: string;
  type: ValidationRuleType;
  pattern?: string;                // regex 用
  length?: number;                 // maxLength/minLength 用
  min?: number;                    // range 用: 数値リテラル
  max?: number;                    // range 用: 数値リテラル
  minRef?: string;                 // range 用: @conv.limit.* 参照 (min の代替, #253)
  maxRef?: string;                 // range 用: @conv.limit.* 参照 (max の代替, #253)
  values?: string[];               // enum 用
  condition?: string;              // custom 用
  message?: string;                // @conv.msg.* 参照も可
}
```

PR: #167

UI: ![構造化 ValidationRule + A:OK/B:NG 分岐 + responseRef/bodyExpression](../ui-screenshots/09-validation-rules.png)

### 5.2 `inlineBranch.ngResponseRef` / `ngBodyExpression`

バリデーション NG 時の HTTP レスポンス返却を構造化。

```ts
inlineBranch?: {
  ok: string;
  ng: string;
  ngJumpTo?: string;
  ngResponseRef?: string;           // action.responses[].id 参照
  ngBodyExpression?: string;        // 返却 body 式
};
```

PR: #181

## 6. 新ステップ型

### 6.1 `ComputeStep` (`type: "compute"`)

計算式 / 変数代入を構造化。税額計算や累積処理に使う。

```ts
interface ComputeStep extends StepBase {
  type: "compute";
  expression: string;               // 代入式、outputBinding で結果変数名を指定
}
```

用例: `{ "type": "compute", "expression": "Math.floor(@subtotal * 0.10)", "outputBinding": "taxAmount" }`

PR: #175

UI: ![compute ステップ — expression 欄](../ui-screenshots/10-compute-step.png)

### 6.2 `ReturnStep` (`type: "return"`)

HTTP レスポンス返却を構造化。action.responses[] と突合する。

```ts
interface ReturnStep extends StepBase {
  type: "return";
  responseRef?: string;             // action.responses[].id 参照
  bodyExpression?: string;          // 返却 body 式
}
```

用例: `{ "type": "return", "responseRef": "409-stock-shortage", "bodyExpression": "{ code: 'STOCK_SHORTAGE', detail: @shortageList }" }`

PR: #179

## 7. 分岐条件の型付き variant

### 7.1 `BranchCondition` union

旧 `condition: string` を `string | BranchConditionVariant` に拡張。

```ts
type BranchConditionVariant =
  | { kind: "tryCatch"; errorCode: string; description?: string }
  // v1.3 で追加:
  | { kind: "affectedRowsZero"; stepRef?: string; description?: string }
  | { kind: "externalOutcome"; stepRef?: string; outcome: "success"|"failure"|"timeout"; description?: string };

type BranchCondition = string | BranchConditionVariant;
```

用例:

```json
// Saga catch
"condition": { "kind": "tryCatch", "errorCode": "STOCK_SHORTAGE" }

// 在庫 UPDATE で rowCount が期待未満
"condition": { "kind": "affectedRowsZero", "stepRef": "step-inventory-update" }

// 外部 API の失敗分岐
"condition": { "kind": "externalOutcome", "outcome": "failure" }
```

PR: #177 / #265 (#261 v1.3)

### 7.2 `BranchStep.tryScope` (#253)

`kind: "tryCatch"` の Branch を持つ `BranchStep` で、**どのステップが try 範囲に含まれるか**を明示するフィールド。これまでは読者がフロー図から類推するしかなかった。

```ts
interface BranchStep extends StepBase {
  branches: Branch[];
  elseBranch?: ElseBranch;
  tryScope?: string[];  // try 範囲のステップ ID 一覧
}
```

**用法**: tryCatch 分岐を持つ BranchStep に `tryScope` を設定する。ステップ ID の配列で宣言し、catch 側 Branch の `condition.kind == "tryCatch"` と対応する。

```json
{
  "type": "branch",
  "tryScope": ["step-db-insert", "step-inventory-update"],
  "branches": [
    { "condition": { "kind": "tryCatch", "errorCode": "DEADLOCK" }, "steps": [...] }
  ]
}
```

PR: #368 (#253)

### 7.3 `ElseBranch` (#253 v1.1)

`BranchStep.elseBranch` の型を `Branch` から `ElseBranch` に変更。else 分岐は本質的に condition 不要なため、`condition` を optional にした。旧データ (`condition: ""` 等の空文字列埋め) は後方互換で accept。

```ts
interface ElseBranch {
  id: string;
  code: string;
  label?: string;
  condition?: BranchCondition;  // 後方互換用のみ
  steps: Step[];
}
```

## 8. 変数の構造化 (outputBinding 拡張)

### 8.1 `OutputBinding` union

旧 `outputBinding: string` を `string | OutputBindingObject` に拡張。

```ts
type OutputBindingOperation = "assign" | "accumulate" | "push";

interface OutputBindingObject {
  name: string;
  operation?: OutputBindingOperation;   // 既定 "assign"
}

type OutputBinding = string | OutputBindingObject;
```

用例:
- `"authResult"` (string = assign 既定)
- `{ "name": "subtotal", "operation": "accumulate", "initialValue": "0" }` (ループ内累積、初期値明示)
- `{ "name": "enrichedItems", "operation": "push", "initialValue": "[]" }` (配列追加、初期値明示)

**initialValue (#253 v1.2)**: `accumulate` / `push` 時の初期値を式で明示。未指定時の既定は `accumulate` → `"0"`、`push` → `"[]"`。実装側は変数スコープ開始時 (アクション先頭、またはループ入口) で初期化する。

ヘルパー: `designer/src/utils/outputBinding.ts` の `getBindingName` / `getBindingOperation`

PR: #169 / #255 (#253 v1.2)

## 8.5 エラーカタログ (ActionGroup.errorCatalog, #253 v1.2)

同一 `errorCode` が `affectedRowsCheck.errorCode` / `BranchConditionVariant.errorCode` / `responses[].description` の複数箇所に散在する問題を解決するため、ActionGroup 単位で 1 箇所に集約する。

```ts
interface ErrorCatalogEntry {
  httpStatus?: number;          // 例: 409
  defaultMessage?: string;      // @conv.msg.* 参照も可
  responseRef?: string;         // action.responses[].id への参照
  description?: string;
}

// ActionGroup に追加
errorCatalog?: Record<string, ErrorCatalogEntry>;
```

用例:

```json
"errorCatalog": {
  "STOCK_SHORTAGE": {
    "httpStatus": 409,
    "defaultMessage": "在庫不足",
    "responseRef": "409-stock-shortage",
    "description": "引当 UPDATE で rowCount=0"
  },
  "VALIDATION": { "httpStatus": 400, "responseRef": "400-validation" },
  "PAYMENT_FAILED": { "httpStatus": 402, "responseRef": "402-payment-failed" }
}
```

実装時は: `affectedRowsCheck.errorCode == "STOCK_SHORTAGE"` → `errorCatalog.STOCK_SHORTAGE` を引いて httpStatus / responseRef / defaultMessage を 1 箇所で解決。

## 8.6 `StructuredField.format` と `ValidationRule.minRef/maxRef` (#253 v1.3)

文字列型フィールドの採番形式・フォーマットパターンを `description` の地の文でなく**構造化フィールド**として宣言する。

```ts
interface StructuredField {
  name: string;
  label?: string;
  type: FieldType;
  required?: boolean;
  description?: string;
  format?: string;          // 採番形式 / フォーマットパターン (#253)
  defaultValue?: string;
  screenItemRef?: { screenId: string; itemId: string };
}
```

**`format` の値の形式**:

| 値の形式 | 意味 | 例 |
|---|---|---|
| `@conv.numbering.*` | 採番規約への参照 | `"@conv.numbering.orderNumber"` → `ORD-YYYY-NNNN` |
| 正規表現文字列 | 書式パターン (検証用) | `"^[A-Z]{3}-\\d{4}$"` |
| 任意の記述文字列 | 人間可読ヒント | `"YYYY-MM-DD"` |

**適用対象**: `type: "string"` のフィールド。数値・配列・オブジェクト型フィールドへの設定は無意味 (無視される)。

**`description` との関係**: `format` と `description` は併記可。`format` が機械可読な構造化情報、`description` が人間向け補足 (例: `"ORD-YYYY-NNNN 形式"`) を担う。

用例:

```json
{ "name": "poNumber", "type": "string", "format": "@conv.numbering.orderNumber", "description": "ORD-YYYY-NNNN 形式 (PG sequence + trigger)" }
```

PR: #367 (#253 v1.3)

**`ValidationRule.minRef` / `maxRef`**:

`range` バリデーションで `@conv.limit.*` 参照を指定できるバリアント。`max: 9999` のような数値リテラルハードコードを避ける。

- `min` + `maxRef` の**混在は有効** (一方を数値、他方を参照にできる)
- `max` と `maxRef` を**同時指定した場合は `maxRef` が優先** (規約参照が意図的な値を上書きする)
- `minRef` も同様

用例:

```json
{ "field": "items[*].quantity", "type": "range", "min": 1, "maxRef": "@conv.limit.quantityMax", "message": "@conv.msg.outOfRange" }
```

## 9. 後方互換性

すべての拡張は **Optional** かつ **Union 型** (string | structured) のいずれかで、既存データは破壊されない。`migrateActionGroup` が読み込み時に:

- 旧 `note: string` → `notes[{type:"assumption"}]`
- 旧 `condition: string` → そのまま (union 型)
- 旧 `inputs/outputs: string` → そのまま (union 型)
- 旧 `outputBinding: string` → そのまま (union 型)
- `maturity` 未指定 → `"draft"` 付与
- `mode` 未指定 → `"upstream"` 付与

テスト: 既存 347 ユニットテストはすべてパス (破壊的変更なし)。

## 10. ドッグフード検証の根拠

本スキーマは以下のドッグフード履歴で**説明文ゼロ依存・自信度 5.0/5・スキーマ確定可能 (YES)** を達成:

- `data/actions/cccccccc-0019-*.json` で別 AI セッションに実装依頼 → 地の文を無視して機能的に完全な実装生成可能と判定
- 詳細履歴: #151 最終コメント

## 11. 関連

- `docs/spec/process-flow-maturity.md` — Phase 1 (成熟度・付箋・モード)
- `docs/spec/process-flow-variables.md` — Phase 1 (入出力・変数基盤)
- `docs/conventions/validation-rules.md` / `product-scope.md` — 横断規約 (placeholder)
- `designer/src/types/action.ts` — 型定義の正 (実装とドキュメントの整合性はこちらが優先)

## 12. 変更履歴

- 2026-04-20: 初版。#155〜#181 の全 PR をカバー。
- 2026-04-24: `StructuredField.format`, `ValidationRule.minRef/maxRef` 追加 (#367 / #253 v1.3)。§5.1・§8.6 を更新。
- 2026-04-24: `DbAccessStep.bulkValues`, `BranchStep.tryScope` 追加 (#368 / #253)。§4.3・§7.2 を新設。
