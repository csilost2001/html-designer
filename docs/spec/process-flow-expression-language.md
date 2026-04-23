# 処理フロー式言語 (runIf / expression / bodyExpression / condition)

Issue: #253 (部分対応)
策定日: 2026-04-20
ステータス: **初版** (convention として宣言、将来的に設定化の余地あり)

## 1. 目的

処理フロー内の式 (expression / runIf / bodyExpression / condition / countExpression / conditionExpression / collectionSource / ValidationRule.condition / ExternalCallOutcomeSpec.jumpTo 等) は現状すべて **文字列**。`Math.floor(@subtotal * 0.10)` のような JS 風の式や `@flag == true` のような真偽式が混在しているが、**どの構文が許容されるか** がスキーマから読み取れず、AI 実装者が判断に迷っていた (#253 ドッグフード評価 4/5 の主因の一つ)。

本ドキュメントで処理フロー式言語の **仕様 (BNF) と既定規約** を定義し、スキーマ上は従来通り文字列のままとする。

## 2. 設計判断: convention over configuration

**採用案**: ActionGroup 全体に 1 言語を convention として採用。現時点では `js-subset` (下記 §3 で定義) 1 種のみ。

**不採用案**: `expression: { lang: "js-subset", src: "..." }` のラッパー。理由:
- 現時点で 1 言語しか使わないため、ラッパーは純粋な冗長化
- 既存データ全件の migration が必要
- 将来 2 言語以上混在する必要が出てきたら、その時点で `expressionLang: "js-subset" | "custom-dsl"` を ActionGroup に追加すれば済む (YAGNI)

## 3. `js-subset` 許容構文 (BNF)

```ebnf
expression      = conditionalExpr
                | assignExpr

conditionalExpr = logicalOr
logicalOr       = logicalAnd ('||' logicalAnd)*
logicalAnd      = equality ('&&' equality)*
equality        = relation (('==' | '!=') relation)*
relation        = additive (('<' | '<=' | '>' | '>=') additive)*
additive        = multiplicative (('+' | '-') multiplicative)*
multiplicative  = unary (('*' | '/' | '%') unary)*
unary           = ('!' | '-') unary
                | postfix
postfix         = primary postfixOp*
postfixOp       = '.' IDENTIFIER                   (* プロパティ参照 *)
                | '?.' IDENTIFIER                  (* optional chain *)
                | '[' expression ']'               (* インデックス *)
                | '(' argList? ')'                 (* 関数呼出 *)

primary         = '@' IDENTIFIER                   (* 変数参照 *)
                | NUMBER | STRING | 'true' | 'false' | 'null'
                | '(' expression ')'
                | arrayLiteral
                | objectLiteral
                | 'Math' '.' IDENTIFIER            (* Math 組込 (下記 §4) *)

arrayLiteral    = '[' (expression (',' expression)*)? ']'
objectLiteral   = '{' (objectEntry (',' objectEntry)*)? '}'
objectEntry     = (IDENTIFIER | STRING) ':' expression
                | IDENTIFIER                       (* shorthand *)

argList         = expression (',' expression)*
```

### 3.1 リテラル

- **数値**: `42`, `0.5`, `100_000` (underscore separator 可), 10 進のみ (16 進・8 進は不可)
- **文字列**: `'...'` または `"..."`。エスケープは `\n \t \' \" \\` のみ
- **真偽値**: `true` / `false`
- **null**: `null` (undefined は不使用、常に null)

### 3.2 変数参照

- `@identifier` が変数参照の基本形。`@` はこのフロー言語固有のマーカー
- ドット/ブラケット記法でネストアクセス: `@customer.address.postalCode` / `@items[0].quantity`
- Optional chain: `@paymentAuth?.id` — undefined プロパティへのアクセス時に null を返す

### 3.3 比較・論理

- 等値: `==` / `!=` (JS `===` / `!==` 相当、型強制なし)
- 大小: `<` `<=` `>` `>=`
- 論理: `&&` `||` (短絡評価)
- 否定: `!`

### 3.4 算術

- `+` `-` `*` `/` `%`
- `+` は文字列結合も兼ねる (JS 準拠)

## 4. 組込関数・オブジェクト

### 4.1 `Math.*` (部分)

実装側で JavaScript `Math` が提供する関数のうち、以下のみを使用可能:

| 関数 | 用途 | 例 |
|------|------|-----|
| `Math.floor(x)` | 切り捨て | `Math.floor(@subtotal * 0.10)` |
| `Math.ceil(x)` | 切り上げ | `Math.ceil(@duration / 60)` |
| `Math.round(x)` | 四捨五入 | `Math.round(@rate * 100) / 100` |
| `Math.abs(x)` | 絶対値 | `Math.abs(@diff)` |
| `Math.min(a, b, ...)` | 最小 | `Math.min(@requested, @stock)` |
| `Math.max(a, b, ...)` | 最大 | `Math.max(0, @balance)` |

それ以外 (`Math.random`, `Math.pow`, `Math.sqrt`, 三角関数等) は **使用禁止**。処理フローは決定的であるべき (random は非決定、pow/sqrt は金額計算で不適切な丸めを招く)。

### 4.2 配列メソッド (関数呼出的に使用)

| 記法 | 用途 | 例 |
|------|------|-----|
| `.length` | 要素数 (プロパティ、関数でない) | `@items.length` |
| `.every(fn)` | 全要素真? | `@items.every(i => i.quantity >= 1)` |
| `.some(fn)` | 1 つでも真? | `@items.some(i => i.quantity > 100)` |
| `.filter(fn)` | 絞込 | `@items.filter(i => i.stock == 0)` |
| `.map(fn)` | 変換 | `@items.map(i => i.itemId)` |
| `.find(fn)` | 最初の要素 | `@items.find(i => i.id == @targetId)` |
| `.includes(v)` | 含む? | `@validStatuses.includes(@status)` |

### 4.3 アロー関数 (配列メソッドの引数のみ)

```
(param) => expression       // 単項
(a, b) => expression        // 多項
```

**制限**: body は単一 expression のみ。`{ ... return ... }` ブロック形式・複数文は禁止。

## 5. 許容されない構文

- `===` / `!==` (型強制なしなので `==` で十分)
- `=` / `+=` / `-=` 等の代入 (状態変更は `outputBinding` 経由で行う)
- `++` / `--`
- `function` キーワード (アロー関数のみ許容)
- `var` / `let` / `const` (局所変数は作らない)
- `new`, `this`
- `Math` 以外のグローバル (`Date`, `JSON`, `Object`, `Array`, `Promise` 等)
- 正規表現リテラル `/.../` — 正規表現は `ValidationRule.pattern: string` で渡す
- テンプレート文字列 `` `${...}` ``
- 分割代入 `{a, b} = expr`
- spread `...arr`
- 三項演算子 `? :` — 条件は `inlineBranch` / `branch` / `runIf` / outcomes で表現
- 非同期関数 `async` / `await`

## 6. 式が現れるフィールド一覧

スキーマ (`schemas/process-flow.schema.json`) 上では単なる `string` だが、評価時は本 §3〜§5 のルールに従う。

| フィールド | 型 | 例 |
|------|------|-----|
| `StepBase.runIf` | 真偽式 | `"@paymentMethod == 'credit_card'"` |
| `ComputeStep.expression` | 任意式 | `"Math.floor(@subtotal * 0.10)"` |
| `ReturnStep.bodyExpression` | object literal 式 | `"{ code: 'STOCK_SHORTAGE', detail: @shortageList }"` |
| `ValidationStep.conditions` | 自由記述 (人間向け補足) | — |
| `ValidationRule.condition` | 真偽式 (type=custom 時) | `"@items.length >= 1"` |
| `ValidationRule.pattern` | 正規表現 (type=regex 時) | `"^\\d{3}-\\d{4}$"` |
| `Branch.condition` (string variant) | 真偽式 | `"@duplicateCustomer != null"` |
| `LoopStep.countExpression` | 数値式 | `"@items.length"` |
| `LoopStep.conditionExpression` | 真偽式 | `"@remaining > 0"` |
| `LoopStep.collectionSource` | 配列式 | `"@items"` |
| `OutputBindingObject.initialValue` | JSON 値 または 式文字列 | `0` / `[]` / `"@emptyArr"` |
| `ExternalCallOutcomeSpec.jumpTo` | ステップ ID 文字列 (式ではない) | `"step-error-handler"` |
| `CommonProcessStep.argumentMapping[k]` | 任意式 | `"@customerId"` |
| `ExternalSystemStep.protocol` (#261) | 自由記述。URL 中の `@path` 式補間を許容 (例: `"HTTPS POST /v1/payment_intents/@paymentAuth.id/cancel"`) | URL 構造化は v1.3-b 以降の `httpCall` フィールドで予定 |
| `ExternalSystemStep.idempotencyKey` (#253 v1.2) | 任意式 (下記 §8 参照) | `"order-@registeredOrder.id"` |
| `ExternalSystemStep.headers[k]` (#253 v1.2) | 任意式 (値のみ。キーは静的文字列) | `"@traceId"` / `"2024-06-20"` |

## 6.5 Ambient 変数 (#261 v1.4)

`@requestId` / `@traceId` / `@fieldErrors` 等、**ミドルウェア・フレームワーク由来の自動注入変数**は `ActionGroup.ambientVariables?: StructuredField[]` で宣言する。

```json
"ambientVariables": [
  { "name": "requestId", "type": "string", "required": true,
    "description": "リクエスト単位の一意 ID。ミドルウェアが注入" },
  { "name": "traceId",   "type": "string" },
  { "name": "fieldErrors", "type": { "kind": "custom", "label": "Record<string, string>" },
    "description": "ValidationStep.rules[] の結果。既定変数名 (ValidationStep.fieldErrorsVar で上書き可)" }
]
```

`@` 参照時、**inputs / outputBinding / ループ変数 / ambientVariables のいずれにも無い変数は未定義エラー**扱い (将来の型推論バリデータで検査)。現状は運用規約として扱う。

### 6.5a `ValidationStep.fieldErrorsVar` (#261 v1.4)

`ValidationStep.rules[]` の評価結果を格納する変数名を明示するフィールド。既定 `"fieldErrors"`。`inlineBranch.ngBodyExpression` 等で `@fieldErrors` として参照する。

型は `Record<fieldName, errorMessage>`。`ambientVariables` で明示宣言すれば式参照との整合性が取れる。

## 7. runIf 連鎖規則 (#261)

`runIf` はステップ実行の条件ガード。ネスト構造での評価規則を以下に規定する。

### 7.1 short-circuit

親ステップの `runIf` が false の場合、**その子ステップ (subSteps / branch 内 / loop 内 / outcomes.sideEffects 内) の runIf は一切評価されない**。子ステップの変数参照は未初期化扱い。

### 7.2 branch / loop 内の評価順序

`BranchStep.branches[i].steps[j]` の step.runIf は、

```
effective = branch.condition && step.runIf
```

で評価される。すなわち **branch.condition が false → step.runIf 評価不要**。

`LoopStep.steps[j]` の step.runIf は、**ループ 1 イテレーションごとに評価**される (count/condition/collection いずれでも同じ)。ループ入口で 1 回だけ評価する挙動は非採用。

### 7.3 outcomes.sideEffects

`ExternalCallOutcomeSpec.sideEffects[]` は outcome 条件 (success/failure/timeout) が matched した時のみ実行される。各 sideEffect の `runIf` は outcome matched 後に評価。

### 7.4 短絡と副作用

`runIf` 式内で副作用を起こす関数呼出は禁止 (§5 で変数代入 `=` を禁止済みのため自動的に担保)。短絡評価を前提とした同等書き換え (`@a && @a.b` 等) は安全に動作する。

## 8. idempotencyKey の評価規約 (#261)

`ExternalSystemStep.idempotencyKey` は以下を満たすべし。

### 8.1 retry 間で安定

`retryPolicy.maxAttempts > 1` の場合、同一 step の複数回試行で idempotencyKey は**同じ値**でなければならない。そうでないと外部 API の冪等性保証が機能しない。

→ 実装上は step 入口で 1 回評価し、retry ループ内で再評価しない方針。

### 8.2 TX ROLLBACK 後の retry は別キー

`txBoundary` に含まれる外部呼出が ROLLBACK 後にユーザ操作で再試行された場合、**新しいリクエストとして別キー**を生成するべき。具体的には `idempotencyKey` の式が `@order.id` のような DB 永続値ではなく、`@requestId` のような**リクエスト単位の識別子**を含むのが望ましい。

### 8.3 フォールバック

`idempotencyKey` 未指定時、実装側は:
1. 外部 API が `Idempotency-Key` を必須とする場合 → UUID v4 を自動生成して送信
2. 任意の場合 → ヘッダを送信しない

スキーマでは必須化しない (多くの外部 API は Idempotency-Key をオプション扱い)。

## 9. sideEffects 内で return 禁止 (#261)

`ExternalCallOutcomeSpec.sideEffects` 配列には `ReturnStep` を置けない (JSON Schema レベルで `NonReturnStep` 制約化)。

**理由**: `outcome.action` が `"abort"` (処理中断) の意味と `return` ステップ (HTTP レスポンス返却) の意味が衝突する。

**書き方**:
- レスポンスで返したい場合: outcome.action = "continue" にして、外側のフロー上に ReturnStep を配置
- 処理中断する場合: outcome.action = "abort" のみ。body は `errorCatalog` / middleware で生成

## 7. 参照整合性

- `@identifier` が既存の `inputs[].name` / `outputBinding` / ループ変数 (`LoopStep.collectionItemName`) に存在するかは、**参照整合性バリデータ** (`designer/src/schemas/referentialIntegrity.ts`) の将来拡張で検査予定 (現状は未検査)

## 8. 将来の拡張余地

- `ActionGroup.expressionLang: "js-subset" | "custom-dsl"` を追加して複数言語を併存
- 式のパース結果を AST として `parsedExpression?: AstNode` のように保持 (静的解析可能化)
- `@conv.regex.phone-jp` 等の規約 ID 参照を式内で使えるように拡張
