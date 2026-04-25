# PR レビュー運用ガイド (人間向け)

本プロジェクトで PR を作成してマージするまでの流れを、**人間 (あなた) の視点**でまとめたドキュメント。

AI エージェント (Claude Code) 向けの規則・手順書は別途以下にある:

- [`.github/pull_request_template.md`](../.github/pull_request_template.md) — 実装 Claude が PR 本文を埋める時のテンプレ
- [`.claude/skills/review-pr/SKILL.md`](../.claude/skills/review-pr/SKILL.md) — PR レビュー Claude への手順書 (`/review-pr <N>` で起動)
- [`.claude/skills/review-issue/SKILL.md`](../.claude/skills/review-issue/SKILL.md) — ISSUE 完了監査 Claude への手順書 (`/review-issue <N>` で起動)
- [`CLAUDE.md`](../CLAUDE.md) の「PR 作成・レビューの規約」節 — 全 Claude セッションに効く規則

---

## このワークフローの目的

Claude Code で実装した PR には **別セッションの Claude による独立レビュー** を挟む。実装担当と同一セッションでレビューさせると筆者バイアスがかかるため、新しいセッションで「知らない人」として審査させる。

4 層チェック構造:

```
実装 Claude → 機械 CI (テスト/lint) → 独立 AI レビュー → 人間判断 → マージ
```

さらに、**1 ISSUE が複数 PR に分割された場合**は、全 PR マージ後に **ISSUE 単位の実装網羅性レビュー** (`/review-issue`) を重ねる。PR 単位のレビューだけでは「ISSUE で約束した項目が全部揃ったか」は判定できないため。

```
PR 単位: /review-pr <N>     → コード品質・spec 準拠・バグ
ISSUE 単位: /review-issue <N> → 実装計画の網羅性 (全 PR マージ後)
```

## なぜローカル運用か (コスト)

- **ローカル Claude Code (Max プラン) で完結** → 追加課金なし
- GitHub Actions で Claude API を呼ぶ方式だと毎 PR で数十〜百数十円。採用しない
- 機械 CI (Vitest / Playwright / lint) は従来通り GitHub Actions で動く

---

## 基本フロー (6 ステップ)

### Step 1: 実装 & PR 作成 — **実装セッション**

Claude Code (実装用ウィンドウ) に指示:

```
#<N> 対応して
```

Claude Code が:
- ブランチ作成 → 実装 → テスト実行
- `gh pr create` で PR 作成 (テンプレが自動展開)
- テンプレの**全項目**を記入。特に「仕様逐条突合 (自己申告)」は各条項を `file:line` で個別列挙

### Step 2: 独立レビュー — **あなた (別セッションを起動)**

1. **新しい Claude Code ウィンドウを開く** (既存セッションは使わない — これが独立性の担保)
2. `/clear` (念のため空の状態に)
3. `/review-pr <PR番号>` と入力

レビュー Claude が自動で:
- PR 差分 / 関連 spec / issue コメントを読む
- spec 逐条突合 + 系統的抜け漏れ + テスト偽陽性 + コード品質 をチェック
- 結果を `tmp/review-cache/review-pr-<N>.md` に書き出し
- `gh pr comment` で PR にコメント投稿 (投稿前に権限確認が入る)

### Step 3: 判定の読み方 — **あなた**

レビュー結果の最後に**総合評価**が付く:

| 評価 | 意味 | 次の動き |
|---|---|---|
| **マージ可** | Must-fix 0 / Should-fix 0 | Step 6 (マージ) へ |
| **修正後マージ** (Must-fix 0 / Should-fix あり) | バグはないが改善提案あり | どこまで対応するかあなたが判断 |
| **修正後マージ** (Must-fix あり) | バグまたは仕様未達がある | Step 4 (修正指示) へ |
| **大幅修正必要** | 設計レベルの指摘 | **Claude に任せず人間で再議論** |

### Step 4: 対応指示 (必要な場合) — **あなた → 実装セッション**

**対応範囲を明示**するのがコツ。指示例:

```
PR #<N> のレビューコメントを読み、Must-fix のみ対応して
```

```
PR #<N> の Should-fix の「<項目名>」だけ対応して
```

```
PR #<N> のレビューコメントを読み、Must-fix と Should-fix に対応して
```

Nit まで全部直すと scope が膨張するので、**Nit は基本見送り**。気になったものだけ選ぶ。

**実装セッションが閉じていたら** → 新セッションで `/clear` 後に同じ指示で OK。

### Step 5: 再レビュー (Must-fix を修正した場合) — **あなた**

Step 2 と同じ: 新ウィンドウ → `/clear` → `/review-pr <N>`

新しいコメントが追加され、PR に**レビュー履歴が蓄積**される。

### Step 6: マージ — **あなた**

最終判断はあなたが握る:

- **UI 影響あり** (PR 本文のチェックボックスで確認): 自分でローカル起動して触って確認 → `gh pr merge` or GitHub UI
- **UI 影響なし**: Claude に「PR #<N> をマージして」と依頼 or 自分で

### Step 7: ISSUE 完了監査 (分割 PR の場合のみ) — **あなた**

1 ISSUE を複数 PR に分割したケースは、**全 PR マージ後**に ISSUE 単位の網羅性レビューを行う:

1. 新しい Claude Code ウィンドウで `/clear`
2. `/review-issue <ISSUE 番号>` を実行

レビュー Claude が:
- ISSUE 本文・全コメントから実装計画項目を列挙
- 紐づく PR 一覧を抽出 (全マージ済みを確認)
- 各項目が現在の main のコードに**本当に実装されているか**を file:line で突合
- 結果を `tmp/review-cache/review-issue-<N>.md` に書き出し、`gh issue comment` で ISSUE に投稿

**判定**:

| 評価 | 意味 | 次の動き |
|---|---|---|
| **完了** | 全項目実装済み | ISSUE クローズ可 |
| **部分完了** | 実装漏れあり | 追加 PR で不足分を実装 → 再度 Step 7 |
| **未完了** | 紐づく PR に未マージあり | マージ完了後に再実行 |

**このステップを使うべきケース**: 1 ISSUE = 1 PR の場合は `/review-pr` で完結するので不要。複数 PR に分割した場合のみ実行。

---

## ループを止める目安

| 周回 | 意味 |
|---|---|
| **1 周で Must-fix 0** | 理想。即マージ |
| **2 周必要** | 典型。Should-fix を対応してから再レビュー (PR #149 がこのパターンだった) |
| **3 周目で新 Must-fix** | 危険信号。**設計を再考する必要**。Claude に任せず人間で判断 |

「完全合格」を追いかけない。AI レビューは毎回観点が微妙にずれるため、永遠に終わらない。**止める判断は人間が握る**。

---

## このワークフローを使わない場合

以下は AI レビューをスキップして OK:

- typo 修正 / docs のみの変更
- dependency bump
- 小規模バグ修正 (1 ファイル以内、影響範囲が明らか)

**必ず使うべきケース**:

- 大規模実装 (複数ファイル / 複数機能)
- spec 絡み (`docs/spec/` を参照する修正)
- **UI 影響あり** — AI が chrome-devtools MCP / Playwright で smoke test し、独立レビューも実施

---

## 実装セッションに何を伝えるか、判定別まとめ

| レビュー結果 | 実装セッションへの扱い |
|---|---|
| マージ可 | **何も伝えない** (学ぶべきことがないのでトークン無駄) |
| 修正後マージ (Should-fix のみ) | 対応する項目を**選んで**指示 |
| 修正後マージ (Must-fix あり) | レビュー全文を読ませて Must-fix 対応 |
| 大幅修正必要 | Claude に投げる前に**人間で設計再議論** |

---

## 落とし穴 / 注意点

- **同一セッションで `/review-pr` を起動しない**。筆者バイアスが残る。必ず新ウィンドウ + `/clear`
- **PR テンプレの空項目を削除しない**。「N/A」と明記する (レビュアーが「書き忘れ」と「該当なし」を区別できるように)
- **自己申告の `file:line` を信じ切らない**。レビュアーは実コードに当てて都度検証する
- **UI 影響あり PR は AI が chrome-devtools MCP / Playwright で smoke test を実施**。auto テスト pass + smoke test pass + 独立レビュー pass で AI がマージ実行 (PR 単位/機能単位のユーザー目視確認は不要、最終リリース時のみ)
- **レビュー結果の Nit を全部直させない**。scope が膨張して元の issue 解決から逸れる

---

## 関連ファイル早見表

| ファイル | 役割 | 誰が読む |
|---|---|---|
| `.github/pull_request_template.md` | PR 作成時の briefing | 実装 Claude |
| `.claude/skills/review-pr/SKILL.md` | PR レビュー手順書 | レビュー Claude |
| `.claude/skills/review-issue/SKILL.md` | ISSUE 完了監査手順書 | レビュー Claude |
| `CLAUDE.md` の「PR 作成・レビューの規約」 | 全体ルール | 全 Claude セッション |
| `tmp/review-cache/` | レビュー結果の一時保存 (gitignored) | 人間 / Claude |
| **このファイル (`docs/pr-review-workflow.md`)** | 運用手引き | **あなた (人間)** |

---

## 変更履歴

- 2026-04-19: 初版。PR #148 / #149 の運用検証を経て策定
- 2026-04-22: `/review-issue` 追加 (1 ISSUE 複数 PR 分割時の網羅性監査)。レビュー出力先を `tmp/review-cache/` に移設
