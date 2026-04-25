# Process Flow Workflow Step

`WorkflowStep` は承認、レビュー、確認、協議など、人の判断を含む業務ワークフローを表す。
一次成果物は `schemas/process-flow.schema.json` であり、本仕様と TypeScript 型は同じ構造を保つ。

## フィールド

| field | required | type | description |
|---|---:|---|---|
| `type` | yes | `"workflow"` | StepType 識別子 |
| `pattern` | yes | `WorkflowPattern` | 標準 11 パターンのいずれか |
| `approvers` | yes | `WorkflowApprover[]` | RBAC role key と表示名、順序 |
| `quorum` | no | `{ type, n? }` | 承認成立条件。`n` は `type: "n-of-m"` の場合のみ必須 |
| `onApproved` | no | `Step[]` | 承認成立時に実行するサブステップ |
| `onRejected` | no | `Step[]` | 却下、拒否、差戻し時に実行するサブステップ |
| `onTimeout` | no | `Step[]` | 期限切れ時に実行するサブステップ |
| `deadlineExpression` | no | string | 期限式 |
| `escalateAfter` | conditional | string | エスカレーションまでの期間式。`approval-escalation` では必須 |
| `escalateTo` | conditional | `{ role?, userExpression? }` | エスカレーション先。`approval-escalation` では必須 |

`escalateTo.role` は A-2 RBAC catalog の role key を参照する。`escalateTo.userExpression` は実行時の担当者を解決する式を保持する。

## WorkflowPattern

標準パターンは次の 11 種とする。値は JSON / TypeScript とも kebab-case で固定する。

| value | name | required fields | optional fields |
|---|---|---|---|
| `approval-sequential` | 順次承認 | `pattern`, `approvers` | `quorum`, `onApproved`, `onRejected`, `onTimeout`, `deadlineExpression`, `escalateAfter`, `escalateTo` |
| `approval-parallel` | 並列承認 | `pattern`, `approvers` | `quorum`, `onApproved`, `onRejected`, `onTimeout`, `deadlineExpression` |
| `approval-veto` | 拒否権付き承認 | `pattern`, `approvers` | `quorum`, `onApproved`, `onRejected`, `onTimeout`, `deadlineExpression` |
| `approval-quorum` | 定足数承認 | `pattern`, `approvers`, `quorum` | `onApproved`, `onRejected`, `onTimeout`, `deadlineExpression` |
| `approval-escalation` | エスカレーション承認 | `pattern`, `approvers`, `escalateAfter`, `escalateTo` | `quorum`, `onApproved`, `onRejected`, `onTimeout`, `deadlineExpression` |
| `review` | レビュー | `pattern`, `approvers` | `quorum`, `onApproved`, `onRejected`, `deadlineExpression` |
| `sign-off` | サインオフ | `pattern`, `approvers` | `onApproved`, `onRejected`, `deadlineExpression` |
| `acknowledge` | 確認 | `pattern`, `approvers` | `onApproved`, `onTimeout`, `deadlineExpression` |
| `branch-merge` | 分岐マージ | `pattern`, `approvers` | `quorum`, `onApproved`, `onRejected`, `deadlineExpression` |
| `discussion` | 協議 | `pattern`, `approvers` | `quorum`, `onApproved`, `onRejected`, `onTimeout`, `deadlineExpression` |
| `ad-hoc` | アドホック | `pattern`, `approvers`, `description` | `quorum`, `onApproved`, `onRejected`, `onTimeout`, `deadlineExpression`, `escalateAfter`, `escalateTo` |

## quorum

```json
{
  "type": "all | any | majority | n-of-m",
  "n": 2
}
```

`type` の意味:

- `all`: 全員の承認で成立
- `any`: いずれか 1 名の承認で成立
- `majority`: 過半数で成立
- `n-of-m`: `approvers` のうち `n` 名の承認で成立

`n` は `type === "n-of-m"` の場合のみ必須。

## escalateTo

```json
{
  "role": "financeManager",
  "userExpression": "@managerOf(@employeeId)"
}
```

`role` と `userExpression` はどちらか一方だけでもよい。静的な RBAC role へ送る場合は `role`、申請内容から実行時に担当者を決める場合は `userExpression` を使う。

## Examples

### approval-sequential

```json
{
  "id": "step-manager-approval",
  "type": "workflow",
  "description": "直属上長と部門長による順次承認",
  "pattern": "approval-sequential",
  "approvers": [
    { "role": "manager", "label": "直属上長", "order": 1 },
    { "role": "departmentHead", "label": "部門長", "order": 2 }
  ],
  "quorum": { "type": "all" },
  "deadlineExpression": "@submittedAt + duration('P2D')",
  "onApproved": [
    {
      "id": "step-approved",
      "type": "dbAccess",
      "description": "承認済みに更新",
      "tableName": "expense_requests",
      "operation": "UPDATE"
    }
  ],
  "onRejected": [
    {
      "id": "step-rejected",
      "type": "dbAccess",
      "description": "却下に更新",
      "tableName": "expense_requests",
      "operation": "UPDATE"
    }
  ]
}
```

### approval-escalation

```json
{
  "id": "step-escalated-approval",
  "type": "workflow",
  "description": "期限切れ時に上位ロールへエスカレーションする承認",
  "pattern": "approval-escalation",
  "approvers": [
    { "role": "financeManager", "label": "経理責任者", "order": 1 }
  ],
  "quorum": { "type": "any" },
  "deadlineExpression": "@submittedAt + duration('P3D')",
  "escalateAfter": "duration('P1D')",
  "escalateTo": { "role": "cfo" },
  "onTimeout": [
    {
      "id": "step-timeout-log",
      "type": "log",
      "description": "期限切れを記録",
      "level": "warn",
      "message": "approval timeout"
    }
  ]
}
```
