# ProcessFlow SLA / Timeout 仕様

## 目的

処理フロー定義に、性能・待ち時間・タイムアウト時の扱いを宣言するための `sla` を追加する。AI 実装者はこの情報を使い、タイムアウト設定、監視、ログ、補償処理、エラー応答を生成する。

## 対象レベル

`sla` は次の 3 レベルで指定できる。

| レベル | 対象 | 用途 |
|---|---|---|
| ProcessFlow | フロー全体 | 画面操作やバッチ全体の上限時間、全体監視 |
| ActionDefinition | アクション単位 | submit / click / timer など 1 アクション内の上限時間 |
| StepBase | 任意ステップ | 外部 API、DB、計算、ログなど個別処理の上限時間 |

より内側のレベルが指定されている場合は、実装時に内側の宣言を優先する。例: `StepBase.sla.timeoutMs` は `ActionDefinition.sla.timeoutMs` より具体的な制約として扱う。

## Sla

```ts
interface Sla {
  timeoutMs?: number;
  onTimeout?: "throw" | "continue" | "compensate" | "log";
  errorCode?: string;
  warningThresholdMs?: number;
}
```

### timeoutMs

タイムアウトまでのミリ秒。ProcessFlow / ActionDefinition / StepBase のいずれでも同じ意味で、対象スコープの最大実行時間を示す。

### onTimeout

タイムアウト時の挙動。

| 値 | 意味 |
|---|---|
| `throw` | エラーとして扱い、通常のエラー処理へ進める |
| `continue` | タイムアウトを記録し、次の処理へ継続する |
| `compensate` | 補償処理や Saga の戻し処理へ進める |
| `log` | タイムアウトをログ・監視に残すが、業務フローは止めない |

### errorCode

`errorCatalog` のキーと連携するエラーコード。`onTimeout: "throw"` または `compensate` の場合、HTTP レスポンスや業務エラーへの変換に利用する。

### warningThresholdMs

タイムアウトより手前で警告を出す閾値。例: `timeoutMs: 2000`, `warningThresholdMs: 1500` の場合、1.5 秒を超えた処理を遅延警告として監視できる。

## 後方互換

既存の `ExternalSystemStep.timeoutMs` は deprecated として残す。新規定義では `StepBase.sla.timeoutMs` を使用する。

外部システムステップで両方が指定された場合、`sla.timeoutMs` を優先する。旧データの読み込み・検証互換を維持するため、スキーマ上は `ExternalSystemStep.timeoutMs` も引き続き受け付ける。
