# ProcessFlow WorkflowStep

## 目的

`WorkflowStep` は、承認・差戻し・スキップ・期限後自動承認・エスカレーションなどの業務ワークフローを、ProcessFlow の一級ステップとして宣言するための仕様である。

一次成果物は [`schemas/process-flow.schema.json`](../../schemas/process-flow.schema.json) の `WorkflowStep` 定義であり、本書は各パターンの意味論と実装期待を補足する。

## 共通フィールド

| フィールド | 必須 | 型 | 説明 |
|---|---:|---|---|
| `type` | yes | `"workflow"` | StepType 識別子 |
| `pattern` | yes | `WorkflowPattern` | 標準 11 パターンのいずれか |
| `approvers` | yes | `{ role: string, label?: string, order?: integer }[]` | 承認者ロール。`role` は A-2 RBAC catalog の role key を参照する |
| `quorum` | no | integer | 必要承認数 |
| `onApproved` | no | string | 承認成立時の遷移先 step id |
| `onRejected` | no | string | 却下または差戻し時の遷移先 step id |
| `onTimeout` | no | string | 期限切れ時の遷移先 step id |
| `deadlineExpression` | no | string | 承認期限を表す ConvComp 式 |
| `escalateAfter` | no | string | エスカレーションまでの期間式 |
| `escalateTo` | no | string | エスカレーション先ロール。A-2 RBAC catalog の role key を参照する |

`approvers[].order` は順次承認や段階的な通知順に使う。未指定の場合は配列順を採用する。`quorum` 未指定時の扱いは pattern によって異なるが、UI の新規作成既定値は `1` とする。

## 標準パターン

### sequential / 順次承認

説明: `approvers` を `order` または配列順に処理し、全必要承認が揃ったら `onApproved` へ進む。

必須フィールド: `pattern`, `approvers`

任意フィールド: `quorum`, `onApproved`, `onRejected`, `onTimeout`, `deadlineExpression`, `escalateAfter`, `escalateTo`

```json
{
  "type": "workflow",
  "pattern": "sequential",
  "approvers": [
    { "role": "manager", "label": "直属上長", "order": 1 },
    { "role": "departmentHead", "label": "部門長", "order": 2 }
  ],
  "quorum": 2,
  "onApproved": "step-approved",
  "onRejected": "step-rejected"
}
```

### parallel / 並列承認

説明: 複数の承認者へ同時に依頼し、`quorum` を満たした時点で承認成立とする。

必須フィールド: `pattern`, `approvers`

任意フィールド: `quorum`, `onApproved`, `onRejected`, `onTimeout`, `deadlineExpression`

```json
{
  "type": "workflow",
  "pattern": "parallel",
  "approvers": [
    { "role": "legalReviewer", "label": "法務" },
    { "role": "securityReviewer", "label": "セキュリティ" }
  ],
  "quorum": 2,
  "onApproved": "step-contract-ready"
}
```

### threshold / 定足数承認

説明: 承認候補者のうち一定数以上の承認で成立する。多数決、N-of-M 承認、合議制に使う。

必須フィールド: `pattern`, `approvers`, `quorum`

任意フィールド: `onApproved`, `onRejected`, `onTimeout`, `deadlineExpression`

```json
{
  "type": "workflow",
  "pattern": "threshold",
  "approvers": [
    { "role": "committeeMember", "label": "審査委員" },
    { "role": "financeReviewer", "label": "経理レビュー" },
    { "role": "legalReviewer", "label": "法務レビュー" }
  ],
  "quorum": 2,
  "onApproved": "step-committee-approved"
}
```

### delegated / 代理承認

説明: 本来の承認者が不在または権限委譲した場合に、代理ロールで承認できる。

必須フィールド: `pattern`, `approvers`

任意フィールド: `quorum`, `onApproved`, `onRejected`, `deadlineExpression`, `escalateAfter`, `escalateTo`

```json
{
  "type": "workflow",
  "pattern": "delegated",
  "approvers": [
    { "role": "departmentHead", "label": "部門長", "order": 1 },
    { "role": "actingDepartmentHead", "label": "部門長代理", "order": 2 }
  ],
  "quorum": 1,
  "onApproved": "step-approved"
}
```

### auto-approve / 自動承認

説明: 金額やリスクなどの条件を満たす場合、人手を介さず承認成立として進める。

必須フィールド: `pattern`

任意フィールド: `approvers`, `onApproved`, `onRejected`, `deadlineExpression`

```json
{
  "type": "workflow",
  "pattern": "auto-approve",
  "approvers": [],
  "deadlineExpression": "@submittedAt",
  "onApproved": "step-auto-approved"
}
```

### skip / 承認スキップ

説明: 承認不要条件を満たした場合に承認工程を明示的にスキップする。

必須フィールド: `pattern`

任意フィールド: `approvers`, `onApproved`, `onRejected`

```json
{
  "type": "workflow",
  "pattern": "skip",
  "approvers": [],
  "onApproved": "step-next"
}
```

### request-changes / 差戻し

説明: 承認者が修正依頼を出し、申請者の再提出ステップへ戻す。

必須フィールド: `pattern`, `approvers`

任意フィールド: `onApproved`, `onRejected`, `deadlineExpression`

```json
{
  "type": "workflow",
  "pattern": "request-changes",
  "approvers": [
    { "role": "manager", "label": "直属上長" }
  ],
  "onApproved": "step-approved",
  "onRejected": "step-edit-request"
}
```

### conditional / 条件分岐承認

説明: 金額、部門、リスクなどの条件によって承認者、定足数、後続遷移を変える。詳細条件は `description` や周辺の branch step で補足する。

必須フィールド: `pattern`, `approvers`

任意フィールド: `quorum`, `onApproved`, `onRejected`, `onTimeout`, `deadlineExpression`, `escalateAfter`, `escalateTo`

```json
{
  "type": "workflow",
  "pattern": "conditional",
  "description": "10万円以上は部門長承認、100万円以上は役員承認を追加する",
  "approvers": [
    { "role": "manager", "label": "直属上長", "order": 1 },
    { "role": "departmentHead", "label": "部門長", "order": 2 }
  ],
  "quorum": 1,
  "onApproved": "step-approved"
}
```

### custom-form / カスタムフォーム承認

説明: 承認時に理由、添付、確認項目などの追加入力を求める。フォーム項目は `description` または別途フォーム定義で補足する。

必須フィールド: `pattern`, `approvers`

任意フィールド: `quorum`, `onApproved`, `onRejected`, `deadlineExpression`

```json
{
  "type": "workflow",
  "pattern": "custom-form",
  "description": "承認時に確認コメントと添付証憑の確認結果を入力する",
  "approvers": [
    { "role": "financeReviewer", "label": "経理担当" }
  ],
  "quorum": 1,
  "onApproved": "step-proof-checked"
}
```

### timed-auto-approve / 期限後自動承認

説明: 期限までに却下や差戻しがなければ自動承認する。期限切れ後に人手へ回す場合は `escalation` を使う。

必須フィールド: `pattern`, `deadlineExpression`

任意フィールド: `approvers`, `quorum`, `onApproved`, `onRejected`, `onTimeout`

```json
{
  "type": "workflow",
  "pattern": "timed-auto-approve",
  "approvers": [
    { "role": "manager", "label": "直属上長" }
  ],
  "deadlineExpression": "@submittedAt + duration('P3D')",
  "onApproved": "step-approved",
  "onTimeout": "step-approved"
}
```

### escalation / エスカレーション承認

説明: 承認待ちが一定時間を超えた場合、上位ロールへ承認依頼を移すか追加通知する。

必須フィールド: `pattern`, `approvers`, `escalateAfter`, `escalateTo`

任意フィールド: `quorum`, `onApproved`, `onRejected`, `onTimeout`, `deadlineExpression`

```json
{
  "type": "workflow",
  "pattern": "escalation",
  "approvers": [
    { "role": "financeManager", "label": "経理責任者" }
  ],
  "quorum": 1,
  "deadlineExpression": "@submittedAt + duration('P3D')",
  "escalateAfter": "duration('P1D')",
  "escalateTo": "cfo",
  "onApproved": "step-approved",
  "onRejected": "step-rejected",
  "onTimeout": "step-rejected"
}
```
