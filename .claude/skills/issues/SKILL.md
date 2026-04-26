---
name: issues
description: ISSUE を 12 ルール Opus オーケストレーターワークフローで完遂する (ISSUE 読み取り→設計→実装→レビュー→マージ)
argument-hint: <ISSUE番号>
disable-model-invocation: true
---

<!--
  使い方:
    `/issues 431` のように ISSUE 番号を指定して呼び出す。
    Opus がオーケストレーターとして以下の全工程を自律完遂する:
      ISSUE 読み取り → 統合 PR 判定 → 設計 → worktree 作成 →
      Codex/Sonnet 実装委譲 → Sonnet 独立レビュー → 修正 → squash マージ

  前提:
    - gh CLI がパスに通っていること
    - designer-mcp が起動していること (MCP ツールが必要な ISSUE の場合)
    - `disable-model-invocation: true`: ユーザーが明示的に `/issues <N>` と打った時のみ起動

  運用原則 (feedback_orchestration_workflow.md より):
    - Opus = オーケストレーター専任。実装コードは 1 行も書かない
    - 実装は worktree + Codex 優先 (失敗時 Sonnet フォールバック)
    - レビューは review-pr-sonnet サブエージェント
    - ユーザー介入なし。build/test/review/merge まで AI が完遂
-->

ISSUE #$ARGUMENTS を 12 ルール Opus オーケストレーターワークフローで解決します。

## Step 0: ISSUE を読む

`gh issue view $ARGUMENTS` で本文・コメント・ラベル・担当者・マイルストーンを全取得する。

## Step 1: 統合 PR 判定

ISSUE 本文に `## 🔗 統合 PR 情報` セクションがあるか確認:

### 統合 PR あり

セクション記載の統合ブランチ名を読む。

- ブランチが未作成 → `git worktree add C:/tmp/wt-$ARGUMENTS -b <統合ブランチ名> origin/main`
- ブランチが既存 → `git worktree add C:/tmp/wt-$ARGUMENTS <統合ブランチ名>` で checkout
- 自分の担当 ISSUE 分のコミットをそのブランチに積む (ISSUE 単位でコミットを分ける)
- **他の統合対象 ISSUE が全て完了するまで PR を作らない** (draft も不可)
- 最後の ISSUE 完了時だけ PR を作成し、description に `Closes #A\nCloses #B\n...` を記載

### 統合 PR なし → 関連 ISSUE 検索 (必須)

着手前に以下で関連 open ISSUE を洗い出す:

```bash
gh issue list --state open --search "<本 ISSUE のキーワード>"
```

本 ISSUE が触りそうなファイル・モジュール・UI 画面名をキーワードに使う。

- 関連発見 → **着手前に統合提案をユーザーへ**。承認後、全 ISSUE 本文に `## 🔗 統合 PR 情報` を prepend
- 関連なし → 通常の 1 ISSUE = 1 PR フロー (以降の Step へ)

## Step 2: 設計を ISSUE に先書き (Rule 5)

実装手順・変更ファイル・影響範囲を組み立て、**実装開始前に** `gh issue comment $ARGUMENTS --body "..."` で ISSUE に追記する。

この comment が:
- Codex/Sonnet への briefing
- 後のレビュー基準

## Step 3: ブランチと worktree を作る

```bash
git worktree add C:/tmp/wt-$ARGUMENTS -b feat/issue-$ARGUMENTS-<slug> origin/main
```

slug は ISSUE タイトルから英小文字ケバブケースで生成。

## Step 4: 実装を委譲 (Rule 6)

### 第一手: Codex

```
Agent(subagent_type="codex:codex-rescue", prompt="--fresh\n\n<briefing>")
```

briefing には以下を含める:
- ISSUE 番号・タイトル・本文
- Step 2 で書いた設計手順
- 作業ディレクトリ: `C:/tmp/wt-$ARGUMENTS`
- PR 作成まで完了すること

### Codex が「プラン制限」エラー → 即 Sonnet フォールバック

```
Agent(subagent_type="general-purpose", model="sonnet", prompt="...")
```

同じ briefing を渡す。

**⚠️ 確認なしで最初から Sonnet を使うのは禁止 (Rule 6 違反)**

## Step 5: 逸脱確認 (Rule 7)

`gh pr diff <PR番号> --name-only` と PR diff を読み、Step 2 の設計との乖離を確認:

- ファイル名・API・型レベルの乖離に注目
- 逸脱あり → `gh issue comment $ARGUMENTS --body "逸脱内容..."` に記録し、Codex/Sonnet に修正指示 → Step 5 に戻る (Rule 8)
- 逸脱なし → Step 5.5 へ

## Step 5.5: ProcessFlow 実行セマンティクス検証 (条件付き)

PR diff の **`docs/sample-project/process-flows/*.json` または `data/process-flows/*.json`** に変更があれば、`/review-flow` を呼んで実行可能性を専門レビュー:

```
Skill(skill="review-flow", args="<flowId or path>")
```

または対象が複数なら:

```
Skill(skill="review-flow", args="--all")
```

**目的**: JSON Schema valid だが実行時にバグる問題 (変数前方参照・TX スコープ違反・runIf 抜け・branch dead-end 等) を **PR レビュー前** に潰す。これにより Step 6 の往復が激減する。

- Must-fix あり → Codex に修正指示 (Step 4 と同様 `--fresh`) → Step 5 に戻る
- Must-fix なし → Step 6 へ

**ProcessFlow JSON 変更がない PR ではこの Step を完全スキップ**。

## Step 6: 独立レビュー (Rule 9)

```
Agent(subagent_type="review-pr-sonnet", prompt="PR #<PR番号> をレビューしてください")
```

- Sonnet で実行、クリーンコンテキスト
- 結果は **PR コメント + ISSUE コメント** の両方に投稿される
- ProcessFlow 実行セマンティクスは Step 5.5 で済んでいるので **重複検証しない**

## Step 7: 残件対応 (Rule 10/11/12)

`gh issue view $ARGUMENTS --comments` でレビュー結果を読む。

### Must-fix / スコープ内 Should-fix が 0 件

→ Step 8 (マージ) へ

### スコープ外指摘あり

→ 別 ISSUE を起票し、元 PR 本文に `スコープ外指摘は #<新ISSUE> に分離` を明示 → Step 8 へ

### スコープ内 Must-fix / Should-fix あり

1. Codex (or Sonnet) に修正指示 (Step 4 と同様に `--fresh`)
2. Step 6 に戻る (再レビュー)

## Step 8: squash マージ (Rule 10)

```bash
gh pr merge <PR番号> --squash --auto
```

PR タイトルに ISSUE 番号が含まれていることを確認してからマージ。

## Step 9: 完了報告

マージ完了後にユーザーへ短く報告:

- マージした PR 番号・URL
- クローズした ISSUE 番号
- 次に着手できる候補があれば提示

---

## 制約 (必守)

- **Opus は実装コードを書かない** — Codex/Sonnet サブエージェントが担当
- **ユーザーへの確認は不要** — build/test/review/merge 全て AI が完遂
- **Codex 呼び出しは常に `--fresh` 固定** — resume 選択プロンプトでブロックしない
- **全レビュー結果は ISSUE に記録** — Opus は PR を直接見に行かず ISSUE を読む
- **ブロック ISSUE**: 人間介入が必要とわかった場合 → スキップして次へ、ユーザーへ通知のみ
