---
marp: true
theme: harmony-pitch
paginate: true
header: '{{HEADER_TEXT}}'
footer: '{{FOOTER_TEXT}}'
size: 16:9
---

<!-- _class: lead -->
<!-- _paginate: false -->

# WEB システム開発における<br>AI エージェント活用

## 現状の課題と導入のベストプラクティス

{{PRESENTER_NAME}}
2026 年 5 月 19 日

<span class="pill">Draft 20260519</span>

---

# 本資料の構成

<div class="cols">
<div>

**第 1 部 — 現状認識**
1. なぜ今この話か (WEB 開発の文脈)
2. 現状の WEB 開発環境
3. 属人化と環境問題

**第 2 部 — AI 時代の土台**
4. AI エージェントに必要な 4 条件
5. 設計書の機械可読化 (Excel → JSON)
6. 仕様駆動の運用ループ

</div>
<div>

**第 3 部 — 導入の実践**
7. AI エージェント導入のベストプラクティス
8. 複数 AI ツールの併用
9. GitHub / DevContainer は課題解決手段

**第 4 部 — リスクとまとめ**
10. リスクとセキュリティ (AI 時代の論点)
11. 期待効果と次のステップ

</div>
</div>

<!--
speaker notes:
- 約 25-30 分。WEB システム開発に絞った内容
- GitHub / DevContainer の詳細は別資料で扱うため本資料では軽く触れる
- 主眼は「AI エージェント時代に向けた WEB 開発基盤の準備」
-->

---

<!-- _class: chapter -->

# <span data-eyebrow="Part 01">なぜ今この話か</span>

---

<h1 data-eyebrow="01 / Background">業界の潮目が変わった — WEB 開発の文脈で</h1>

- 2025-2026 年で **AI コーディングツールが「補完」から「タスク遂行 (エージェント)」へ質的変化**
- WEB 開発は変化サイクルが特に早い領域 (フロント / バック / DB / インフラ all stack)
- 競合・ベンダーは GitHub + AI エージェント + コンテナ開発が標準化
- 一方、社内は SVN / ホスト Eclipse / Oracle VM / Excel 管理が継続
- 本資料は **「AI を WEB 開発に活かすために、まず土台を整える」** 観点で技術選択肢を整理

<div class="honest-note">
費用・契約条件は管轄外のため、本資料では公開情報調査ベースの客観情報として扱う。最終判断には担当部門による確認が必要。
</div>

---

<!-- _class: chapter -->

# <span data-eyebrow="Part 02">現状の WEB 開発環境</span>

---

<h1 data-eyebrow="02 / Current">現状の WEB 開発環境</h1>

<img src="images/gpt-20260518-current-fragmented.png" class="visual-full" alt="現状の開発環境は人間中心の形式に分断されている図">

<div class="caption-note">
対象: SVN / Eclipse / Oracle VM / Excel 仕様書 / Excel 障害管理 / Excel WBS。個別最適ではなく、AI 時代の WEB 開発基盤として一体で見直す。
</div>

---

<h1 data-eyebrow="02 / Current">属人化のコスト — WEB 開発で特に顕在化する問題</h1>

<div class="cols">
<div>

### 開発者体験
- 新人オンボード: 環境構築だけで数営業日を要することがある
- 障害対応: 過去の類似事例は Excel ファイル横断検索でしか辿れない
- レビュー: SVN diff の交換のみ、議論が残らない
- **ホスト直接開発のため Node / JDK / DB クライアントのバージョンが案件間で衝突**、個人差も生じる

</div>
<div>

### AI 活用の前提条件 (満たせていない)
- コードを AI に読ませる経路が無い
- 設計書 (Excel) を AI に読ませても情報が落ちる
- タスク (Excel) を AI に渡せない
- 環境 (VM) を AI が再現できない

</div>
</div>

<blockquote>
共通の根: ツールが <em>人間しか扱えない形式</em> で情報を持っている。<br>
<small>WEB 開発は frontend / backend / DB / インフラの多層構造で、属人化の影響が累積しやすい。</small>
</blockquote>

---

<!-- _class: chapter -->

# <span data-eyebrow="Part 03">AI 時代の土台</span>

---

<h1 data-eyebrow="03 / Foundations">AI エージェントに必要な 4 条件</h1>

<img src="images/draft-20260518-four-foundations.svg" class="visual-full" alt="AIエージェント時代に必要な4つの土台">

---

<h1 data-eyebrow="03 / Foundations">なぜ Excel 設計書では AI が動けないか</h1>

<img src="images/gpt-20260518-excel-to-schema.png" class="visual-full" alt="Excel設計書からJSON Schemaベース設計書への転換">

<div class="caption-note">
Excel 納品を否定するのではなく、社内原本を JSON / Markdown / Schema に寄せ、必要に応じて Excel を機械生成する考え方 [^1]。
</div>

---

<h1 data-eyebrow="03 / Foundations">設計書フォーマットの三段階 — AI 観点での比較</h1>

| 観点 | Excel | Markdown | **JSON + Schema** |
|------|---|---|---|
| AI の理解度 | × バイナリ、書式情報が落ちる | ○ テキスト | **◎ 型・構造が明示** |
| AI 判断のブレ | — | △ 自由記述ゆえブレる | **○ Schema で制約** |
| 機械検証 / 漏れ発見 | × | × | **◎ AJV 等で構造検証** |
| diff | × | ○ | **◎ 構造化** |
| 人間可読性 (HTML 化後) | △ | ○ MD 構文範囲 | **◎ 任意の複雑表示** |

<blockquote>
<strong>JSON 原本 + HTML 変換</strong> が AI 理解度・人間可読性ともに最良。<br>
<small>役割分担: 構造化データは JSON、説明文は Markdown、レビューは HTML、納品は Excel (機械変換)。</small>
</blockquote>

---

<h1 data-eyebrow="04 / The loop">仕様駆動の運用ループ — 通常開発も障害対応も同じ</h1>

<img src="images/gpt-20260518-ai-loop.png" class="visual-loop" alt="IssueからAI、PR、レビュー、知識化へ回る開発ループ">

<div class="loop-summary">
両者は <strong>同じプリミティブ (Issue / AI / PR / レビュー)</strong> で回る。<br>
すべての作業履歴が GitHub に集約され、AI も人間も後から経緯を辿れる。
</div>

---

<!-- _class: chapter -->

# <span data-eyebrow="Part 05">AI エージェント導入の実践</span>

---

<h1 data-eyebrow="05 / Practices">AI エージェント導入時のベストプラクティス</h1>

<div class="decision-frame">
  <div class="decision-card">
    <h3>① 環境を隔離する</h3>
    <p>AI が壊しても安全な実行環境 (DevContainer / コンテナ) を必ず用意。ホスト直接実行は禁止。プロンプトインジェクション対策の前提でもある。</p>
  </div>
  <div class="decision-card">
    <h3>② 仕様を機械可読にする</h3>
    <p>Excel ベタ書き → JSON / Markdown / Schema へ段階移行。AI への入力品質が生産性の上限を決める (Garbage In, Garbage Out)。</p>
  </div>
  <div class="decision-card">
    <h3>③ 履歴を Git に集約する</h3>
    <p>Issue (作業指示) / PR (成果物) / レビューコメント (追加指示) すべてが GitHub に残り、AI と人間が同じ履歴を辿れる。</p>
  </div>
</div>

<div class="decision-frame">
  <div class="decision-card">
    <h3>④ 複数 AI を併用する</h3>
    <p>ベンダーロックイン回避、業務継続性確保 (1 社の incident で停止しない)、役割分担 (設計 / 実装 / レビュー)。</p>
  </div>
  <div class="decision-card">
    <h3>⑤ 人間レビューを残す</h3>
    <p>AI 一次レビュー + 人間最終判断。AI cross-check で人間 1 人より網羅的に検出可能だが、品質責任の所在は人間が保持。</p>
  </div>
  <div class="decision-card">
    <h3>⑥ 詳しい人を 1 人入れる</h3>
    <p>プロジェクトに AI エージェント運用経験者が 1 人いるかで立ち上がりに顕著な差。全員未経験は試行錯誤期間が長期化。</p>
  </div>
</div>

---

<h1 data-eyebrow="05 / Practices">複数 AI ツールの併用 — なぜ「1 つに賭けない」か</h1>

<div class="cols">
<div>

### ① 業務継続性
- **Claude API は 4-5 月で 5 件以上の incident** [^8]
- **一度落ちるとその日コーディングが停止**することも
- 複数併用で 1 社停止しても作業継続可

### ② 役割分担 (一例)
- 設計: Claude / 実装: Codex / レビュー: 別モデルで cross-check [^9]
- VS Code が公式 multi-agent 機能提供 (2026-02) [^10]

</div>
<div>

### ③ スキル・設定の標準化
- MCP / Skills / Hooks / CLAUDE.md / AGENTS.md など、**プロジェクト固有設定をエージェント間で共有**可
- ベンダーロックインの回避

### 業界 3 社が「相互運用」に動いた
- OpenAI: Codex を Claude Code 用プラグインで提供 (2026-03) [^11]
- GitHub: Copilot が AGENTS.md / CLAUDE.md / Skills を読み込み対応 (進行中) [^12]
- Microsoft: VS Code Agents App で 3 ツール並列実行可能 [^10]

</div>
</div>

---

<h1 data-eyebrow="05 / Practices">GitHub / DevContainer — AI 時代の課題を解決する基盤</h1>

<div class="cols">
<div>

### GitHub が解決する課題
- **AI への作業指示 IF**: Issue が AI に渡せる指示書になる
- **AI の成果物 IF**: PR が AI の出力単位になる
- **knowledge base**: 過去 Issue / PR を AI が cross-search 可能
- **trace 性**: 議論・判断・実装がすべて履歴として残る

→ Excel + SVN では不可能な構造的優位

</div>
<div>

### DevContainer が解決する課題
- **AI が壊しても安全**: 隔離環境、ホスト無影響
- **再現性**: Dockerfile で全員同じ環境、個人差ゼロ
- **案件並行**: Node / JDK / DB バージョンが案件ごとに完全独立
- **新人即戦力**: pull するだけで開発開始

→ ホスト直接開発の限界を AI 時代に合わせて解消

</div>
</div>

<div class="caption-note">
※ 各ツールの詳細セットアップ手順・コスト試算は別資料で扱う。本資料では <strong>「AI 活用の課題を解決する基盤」</strong> としての位置づけのみ確認。
</div>

---

<!-- _class: chapter -->

# <span data-eyebrow="Part 06">リスクとまとめ</span>

---

<h1 data-eyebrow="06 / Risks">AI 時代の新規論点 — リスクと対策</h1>

<div class="cols">
<div>

### プロンプトインジェクション
- 外部入力 (Issue / 設計書 / 顧客テキスト) に悪意ある指示が混入
- AI がそれを実行してしまうリスク
- 機密情報の漏洩、意図しないコード変更
- **対策**: 入力の信頼性管理、AI 権限の最小化

</div>
<div>

### 隔離環境の必要性
- AI が壊しても安全な実行環境が前提
- **DevContainer / コンテナでの隔離は必須**
- ホスト直接実行は避ける
- 機密リポジトリへのアクセス権も最小化

</div>
</div>

<div class="risk">
<strong>AI 時代特有のセキュリティリスクは従来の常識では対応不能。</strong>
<small>プロンプトインジェクション対策と隔離環境の整備は、AI エージェント導入の前提条件。</small>
</div>

<div class="caption-note">
WEB 開発は外部入力 (顧客 / API / ユーザー) を扱う領域が広く、プロンプトインジェクションの影響面が他領域より大きい点に留意。
</div>

---

<h1 data-eyebrow="07 / Summary">期待効果と次のステップ</h1>

<div class="cols">
<div>

### 期待効果 (他社事例ベース)
- **テスト工数約 40% 削減**: 富士通 / Autify Nexus 事例 [^3]
- **障害対応**: 経緯が辿れ、再発防止が機能する
- **レビュー品質**: AI 一次 + 人間最終で網羅性向上
- **オンボード**: 環境構築・障害調査の負担減
- **属人化リスク**: 環境・知見が repository に集約

</div>
<div>

### 次のステップ (推奨)
1. **隔離環境の検証**: 1 案件で DevContainer 試行
2. **AI ツールの試用**: 複数同時、小タスクで効果測定
3. **Issue / PR 運用**: 新規案件から GitHub に集約
4. **仕様の機械可読化**: 既存 Excel → MD / JSON へ漸進
5. **詳しい人材の確保 / 育成**: 1 人で立ち上がりが大きく変わる

</div>
</div>

<div class="honest-note compact">
数値は他社事例や一般的な相場感に基づく。実際の効果は社内環境・案件特性で変動。記述時点: 2026 年 5 月 19 日、Draft 20260519。
</div>

---

<!-- _class: chapter -->

# <span data-eyebrow="Appendix">参考・出典</span>

---

<h1 data-eyebrow="References">参考・出典</h1>

<div style="font-size: 14px; line-height: 1.55;">

1. [^1]: Excel 仕様書からの脱却 — https://note.com/yoken_taro/n/n0ba15bad70f5
2. [^3]: 富士通「生成 AI for Software Engineering #3」 — https://blog.fltech.dev/entry/2025/10/29/testspecgen-ja
3. [^8]: Anthropic Status Page — https://status.anthropic.com/
4. [^9]: Addy Osmani「Code Agent Orchestra」 — https://addyosmani.com/blog/code-agent-orchestra/
5. [^10]: VS Code「Multi-Agent Development」(2026-02-05) — https://code.visualstudio.com/blogs/2026/02/05/multi-agent-development
6. [^11]: OpenAI Developer Community「Codex Plugin for Claude Code」(2026-03-30) — https://community.openai.com/t/introducing-codex-plugin-for-claude-code/1378186
7. [^12]: GitHub Copilot の AGENTS.md / CLAUDE.md / Skills 対応 — https://github.com/features/copilot/agents

</div>

<div class="footnote">
記述時点: 2026 年 5 月。AI ツール仕様は更新頻繁、利用時は各公式 docs で再確認のこと。
</div>
