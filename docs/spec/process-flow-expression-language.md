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
| `OutputBindingObject.initialValue` | 任意式 | `"0"` / `"[]"` |
| `ExternalCallOutcomeSpec.jumpTo` | ステップ ID 文字列 (式ではない) | `"step-error-handler"` |
| `CommonProcessStep.argumentMapping[k]` | 任意式 | `"@customerId"` |

## 7. 参照整合性

- `@identifier` が既存の `inputs[].name` / `outputBinding` / ループ変数 (`LoopStep.collectionItemName`) に存在するかは、**参照整合性バリデータ** (`designer/src/schemas/referentialIntegrity.ts`) の将来拡張で検査予定 (現状は未検査)

## 8. 将来の拡張余地

- `ActionGroup.expressionLang: "js-subset" | "custom-dsl"` を追加して複数言語を併存
- 式のパース結果を AST として `parsedExpression?: AstNode` のように保持 (静的解析可能化)
- `@conv.regex.phone-jp` 等の規約 ID 参照を式内で使えるように拡張
