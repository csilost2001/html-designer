# Process Flow — Transaction Scope (`TransactionScopeStep`)

ISSUE: #415 / 親 #396 (Power Platform Changeset / EF Core TransactionScope 由来)

複数 DB 操作を atomic な TX 単位でラップする meta-step。「注文登録 + 在庫減算」のように、一連の DB 書き込みを「全部成功するか、何も無かったかにする」のを宣言的に表現する。

## §1 動機

業務システムでは「複数の DB 操作を 1 TX でまとめる」が頻出。例:

- 注文登録: `orders` INSERT + `order_items` INSERT + `inventory` UPDATE
- 残高振替: `accounts` UPDATE × 2 (引落+入金)
- ユーザー削除: 関連テーブル群の cascade UPDATE

既存 `StepBase.txBoundary` は `{role: "begin"|"member"|"end", txId}` の平坦モデルで、同一 `txId` を持つ step 群が単一 TX を構成する。これは下位互換のため残すが、**範囲が構造ではなく ID 一致で表現される**ため、以下の問題がある:

- step を移動・複製した時に `txId` の整合性が崩れやすい
- `begin` から `end` までの範囲が一目で読みづらい
- ネストが表現できない

`TransactionScopeStep` は **TX の範囲を構造的にネストして表現**する。範囲は `steps[]` 配列で明示。AI / 実装側はこれを 1 まとまりで TX として扱う。

## §2 スキーマ

```jsonc
{
  "id": "tx-001",
  "type": "transactionScope",
  "description": "注文登録 + 在庫減算",
  "isolationLevel": "READ_COMMITTED",      // optional・既定 "READ_COMMITTED"
  "propagation": "REQUIRED",                // optional・既定 "REQUIRED"
  "timeoutMs": 5000,                        // optional
  "rollbackOn": ["VALIDATION", "STOCK_SHORTAGE"],  // optional
  "steps": [ /* TX 内で実行する step 列 */ ],
  "onCommit": [ /* commit 後の追加処理、optional */ ],
  "onRollback": [ /* rollback 後の補償処理、optional */ ]
}
```

`steps[]` 内には任意の Step を再帰的に置ける (LoopStep / BranchStep / 別の TransactionScopeStep もネスト可)。

### §2.1 `isolationLevel`

| 値 | 意味 |
|---|---|
| `READ_COMMITTED` (既定) | commit 済データのみ可視。phantom read / non-repeatable read を許容 |
| `REPEATABLE_READ` | 同一 TX 内で同じ行を再読すると常に同じ結果 (phantom は許容) |
| `SERIALIZABLE` | 直列実行と等価。phantom read も防止 (実装で blocking / abort のいずれか) |

選定指針: 業務系 DB 書込は通常 `READ_COMMITTED` で十分。在庫引当・残高振替など **「同じ行を読んで条件付き書込」** をする TX は `REPEATABLE_READ` 以上 (または `affectedRowsCheck` による楽観ロックで補完) を推奨。

### §2.2 `propagation`

Spring `@Transactional` / EF Core `TransactionScopeOption` 由来。既存 TX が呼び出し側にある場合の挙動を制御:

| 値 | 既存 TX が無い場合 | 既存 TX がある場合 |
|---|---|---|
| `REQUIRED` (既定) | 新規 TX 開始 | 既存 TX に参加 (内側の rollback は外側にも波及) |
| `REQUIRES_NEW` | 新規 TX 開始 | 既存 TX を一時停止し、新規 TX を独立に開始/commit (内側の結果は外側に影響しない) |
| `NESTED` | 新規 TX 開始 | 既存 TX 内で savepoint を作る (内側だけ部分 rollback 可能) |

選定指針: 大半は `REQUIRED`。**監査ログ・通知記録など「呼び元 TX とは独立に必ず残したい」処理**は `REQUIRES_NEW`。**try-catch で部分 rollback したい**場合は `NESTED`。

### §2.3 `timeoutMs`

TX 全体のタイムアウト (ms)。経過後はランタイムが TX を rollback する。未指定はランタイム既定 (DB / フレームワークが決める)。

### §2.4 `rollbackOn`

rollback を引き起こす `errorCode` の配列。`ProcessFlow.errorCatalog` のキー参照。

- 列挙されたコードが TX 内で throw された場合のみ rollback
- 未指定時は **「すべての例外で rollback」** がランタイム既定 (Spring の `RuntimeException` 既定挙動と同じ)
- `affectedRowsCheck.errorCode` (例: `STOCK_SHORTAGE`) を含めると、影響行数違反でも rollback できる

例:

```jsonc
"rollbackOn": ["STOCK_SHORTAGE"]
```

→ `affectedRowsCheck.onViolation: "throw"` で `errorCode: "STOCK_SHORTAGE"` が投げられた時に TX 全体が rollback。それ以外の例外は実装側の例外伝播ルールに委ねる。

### §2.5 `steps[]`

TX 内で実行する step 列。順序通りに実行され、TX が始まってから commit / rollback の判定までを含む。

- 任意の Step type を置ける (DbAccessStep / LoopStep / BranchStep / TransactionScopeStep ネスト可)
- `ExternalSystemStep` を入れた場合の意味論は **実装依存** (DB TX に外部 HTTP は本質的に巻き込めない)。Saga 的に補償をかけるか、TX 外に出すのが基本

### §2.6 `onCommit[]`

TX が commit 成功した**後**に実行する step 列。任意。例:

- 通知メール送信 (`ExternalSystemStep` with `fireAndForget: true`)
- キャッシュ無効化
- 監査ログ (`AuditStep`)

`onCommit` の step は **TX の外** で実行されるため、ここでの失敗は元の TX を巻き戻さない (best-effort)。

### §2.7 `onRollback[]`

TX が rollback された**後**に実行する step 列。任意・補償処理 (Saga compensation) として使う:

- Stripe `authorize` の `cancel` (DB rollback で予約取消したので決済も取消)
- 運用通知 (Slack 等)
- ログ記録 (`LogStep`)

`onRollback` の step は **TX の外** で実行されるため、ここでの失敗は元の rollback を撤回しない。

## §3 既存 `StepBase.txBoundary` との関係

両者は **共存** する。役割は明確に分かれる:

| | `StepBase.txBoundary` | `TransactionScopeStep` |
|---|---|---|
| モデル | 平坦 (`{role, txId}` で同一 `txId` の step 群が 1 TX) | 構造的 (`steps[]` 配列で範囲を表現) |
| 表現 | 単独ステップが TX 境界の一部であることを宣言 | 複数ステップを 1 TX としてくくる meta-step |
| ネスト | 不可 (txId 重複を禁止しない実装依存) | 可 (ネストは `propagation` で制御) |
| `onCommit`/`onRollback` | 持たない | 持つ |
| 移動・複製耐性 | 弱 (txId の同期が手動) | 強 (構造ごと移動) |
| 既存サンプルでの位置 | `cccccccc-0005` の `step-or2-007 ~ 009` (begin/member/end で `tx-order-main` を構成) | 同じファイルの `act-orderreg-003` (新規追加・参考実装) |

### §3.1 移行ガイダンス

新規データは **`TransactionScopeStep` を優先** する。既存の平坦 `txBoundary` は当面残し、リファクタリング時に置き換える運用とする。

平坦 → 構造化の機械変換は 1:1 でないことに注意:

- 平坦の `begin/member/end` は range が連続でない (途中に TX 外 step が挟まる) ことを許容
- `TransactionScopeStep.steps[]` は連続範囲のみ。挟まる TX 外処理は前後に出す必要あり

### §3.2 同一 step 内での併用は禁止

`TransactionScopeStep` 自身に `txBoundary` を付けたデータ (例: `transactionScope` の親 step が begin で、子の step が member) は **意味曖昧** のため使ってはいけない。`TransactionScopeStep` を使うなら、その内部 step には `txBoundary` を付けない (実装側は付いていても無視する)。

## §4 ランタイム規約

[`process-flow-runtime-conventions.md`](process-flow-runtime-conventions.md) を補足する形で、TX スコープに関するランタイム挙動:

1. **commit タイミング**: `steps[]` の最後の step が成功で抜けた時点で commit。途中の throw は (rollbackOn にマッチすれば) rollback
2. **`onCommit` / `onRollback` の独立性**: これらは TX の外で実行され、自身の失敗は元の TX 結果を覆さない
3. **ネスト時の `REQUIRES_NEW`**: 親 TX が動いている時に `REQUIRES_NEW` の TransactionScopeStep に入ると、親 TX が一時停止して内側 TX が独立 commit/rollback する。内側 commit 後に親 TX が rollback しても、内側の commit は取り消されない
4. **ネスト時の `NESTED`**: savepoint を使う。内側 rollback は親 TX の savepoint 復元、親 rollback は savepoint も含めて全 rollback
5. **`tryCatch` Branch との組合せ**: TransactionScopeStep の外側で `kind: "tryCatch"` Branch を置けば、TX rollback で throw されたエラーを捕捉できる

## §5 サンプル

`docs/sample-project/process-flows/cccccccc-0005-...json` の `actions[1]` (`act-orderreg-003`) を参照。**注文登録 + 在庫減算** を `TransactionScopeStep` 1 つでくくった参考実装が含まれる。同ファイル `actions[0]` (`act-orderreg-002`) の平坦 `txBoundary` 版と比較して読むこと。

## §6 UI

`designer/src/components/process-flow/TransactionScopeStepPanel.tsx` で編集:

- `isolationLevel` / `propagation` / `timeoutMs`: dropdown / number input
- `rollbackOn`: `errorCatalog` のキーを multi-select (チェックボックス)
- `steps[]`: 子 StepCard の InlineStepList で再帰編集
- `onCommit[]` / `onRollback[]`: 折りたたみで InlineStepList

## §7 関連参照

- 親 ISSUE: #396 (処理フロー仕様拡張計画メタ)
- 関連: `affectedRowsCheck` (`schemas/process-flow.schema.json` `DbAccessStep`)
- 関連: `BranchConditionVariant.kind = "tryCatch"` (TX rollback エラー捕捉)
- 関連: `compensatesFor` (Saga 補償の手動マーキング)
- 業界フレームワーク: Power Platform Dataverse "Changeset", EF Core `TransactionScope`, Spring `@Transactional`
