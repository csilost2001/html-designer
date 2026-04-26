---
name: review-flow
description: ProcessFlow JSON の実行セマンティクスを専門レビュー (変数ライフサイクル / TX スコープ / runIf 連鎖 / 補償整合 / event 双方向)。設計フェーズから使える
argument-hint: <flowId | path | --all | (空 = MCP アクティブタブ)>
disable-model-invocation: true
---

<!--
  使い方:
    - `/review-flow dddddddd-0001-4000-8000-dddddddddddd` — UUID 指定
    - `/review-flow dddddddd-0001` — prefix 指定 (glob で resolve)
    - `/review-flow path/to/flow.json` — ファイルパス直接
    - `/review-flow` — 引数なし: MCP アクティブタブを取得
    - `/review-flow --all` — 全件並列レビュー

  目的:
    一般 PR レビュー (`/review-pr`) では追わない **ProcessFlow JSON の実行セマンティクス** を専門に検証する。
    JSON Schema valid だが実行時にバグるタイプの問題 (変数前方参照・TX 内外の不整合・runIf 抜け・branch dead-end・
    死コード rollbackOn・event の片側登録) を体系的に検出する。

  発動制御:
    - `disable-model-invocation: true`: ユーザーが明示的に `/review-flow [args]` と打った時のみ起動
    - 自動起動はしない (誤起動防止)。Opus オーケストレーター (`/issues`) からは Skill ツール経由で明示的に呼ぶ

  PR / git 非依存:
    - 設計フェーズ (まだコミットしていないフロー) でも使える
    - 結果は標準出力に出す (PR コメント投稿は行わない)。`/issues` から呼ばれた場合は Opus 側が結果を集約
-->

ProcessFlow `$ARGUMENTS` の **実行セマンティクス**を専門レビューします。

## 役割と前提

- **あなたは ProcessFlow 実行可能性レビュアー専任**。spec 準拠やコード品質一般は対象外 (それは `/review-pr` 担当)
- 検証対象は **「JSON Schema valid だが実行時にバグる」** タイプの問題
- 実装コミットは作らない。レビュー報告のみ
- PR / git 状態に依存しない (設計フェーズから使える)

## Step 0: 引数解決

`$ARGUMENTS` を以下の優先順で解決:

1. **`--all`** → `docs/sample-project/process-flows/*.json` + `data/process-flows/*.json` (存在すれば) を全件並列レビュー
2. **ファイルパス (`/` か `\` を含む / `.json` で終わる)** → そのまま読む
3. **UUID 形式 (8-4-4-12 hex)** → 以下の優先順でファイルを探す:
   - `data/process-flows/<id>.json`
   - `docs/sample-project/process-flows/<id>.json`
   - `docs/sample-project/process-flows/<id>*.json` (glob)
4. **prefix (例: `dddddddd-0001`)** → glob で resolve、複数マッチなら全件レビュー
5. **空 (引数なし)** → designer-mcp の `list_tabs` を呼びアクティブな ProcessFlowEditor のフロー ID を取得 → 1 で resolve

resolve 結果を最初に明示:

```
対象フロー: <絶対パス>
ID: <id>
name: <name>
maturity: <maturity>
```

複数件なら一覧表示してから順次処理。

## Step 1: 検証項目 (8 観点)

各観点を **必ず実施**。「該当なし」の場合もその旨を明記する。

### 1. 変数ライフサイクル (Variable Lifecycle)

すべての `@varName` 参照を抽出し、**実行順**に追跡:

- 定義源: `inputs[].name` / `outputs[].name` / `outputBinding` / `ambientVariables[].name` / `domainsCatalog` (型定義のみで実体ではないので除外) / 各 step の `outputBinding`
- 参照箇所: `condition` / `expression` / `bodyExpression` / `sql` / `httpCall.body` / `payload` / `runIf` 等

**検出対象**:
- **前方参照バグ** (今回 PR #460 Must-fix #1 のパターン): step-N が step-M (M > N) で設定される変数を参照している
- **未定義参照**: 一度も設定されない `@var` を参照
- **誤字**: `@input.x` (s 抜け、正しくは `@inputs.x`) 等の typo

報告形式:
```
@<varName>:
  set at: step-X (line Y) [outputBinding | inputs | ambientVariables]
  used at: step-A (line B) <expression>, step-C (line D) ...
  status: ✓ OK / ❌ 前方参照 (set at step-X but used at step-Y where Y < X) / ❌ 未定義
```

### 2. TransactionScope 内外整合 (TX Scope Integrity)

`type: "transactionScope"` の step を全列挙し、各 TX について:

- **inner steps が参照する変数は TX 開始前に設定済みか**
- **inner steps が outputBinding する変数を TX 外で参照する場合、TX commit 前提で安全か** (RETURNING 系は OK だが、TX rollback 時に未定義になる可能性を考慮)
- **inner steps に external system call が含まれていないか** (anti-pattern: TX 中の外部待機が DB 接続を長時間占有)
- **`rollbackOn` のエラーコードが inner steps から実際に発生しうるか** (TX 外 step のエラーで指定すると死コード)
- **`onRollback` の補償 step が inner で書き込んだテーブルを正しく扱っているか**

### 3. runIf 連鎖の網羅性 (runIf Coverage)

冪等 UPSERT (`UPSERT_IDEMPOTENT` operation 使用) の後続 step 群について:

- **UPSERT no-op 時にスキップすべき step すべてに同条件 runIf が付いているか**
- **no-op パスに対応する return step が存在するか** (二項分岐: 通常パス return + no-op パス return)
- **runIf 条件式が UPSERT の outputBinding 結果と整合しているか** (例: `@upsertedTrade.trade_id != null` か `IS NOT NULL` か。式言語の整合)

### 4. branch / elseBranch のパス到達性 (Branch Reachability)

各 `type: "branch"` step について:

- **全 branch + elseBranch が return か後続 step に到達するか** (dead end 検出)
- **共通の return がある場合、両 branch で同じレスポンスが返ってよいか** (誤って早期 return 漏れ)
- **`condition` 式が変数ライフサイクル上有効か** (ライフサイクル分析と連動)

### 5. compensatesFor の参照健全性 (Compensation Integrity)

`compensatesFor: "step-X"` を持つ step すべてについて:

- **対象 step ID が同じ action 内 (または TransactionScope 内) に実在するか**
- **補償 step が補償対象の書き込みを正しく打ち消すか** (例: INSERT に対して REJECTED UPDATE は OK、DELETE はやり過ぎ)

### 6. eventsCatalog ⇄ eventPublish の双方向整合 (Event Symmetry)

- **eventsCatalog で宣言された全イベントについて、いずれかの action で `eventPublish` step が存在するか**
- **`eventPublish.topic` (or `eventRef`) で参照する topic が eventsCatalog に登録されているか**
- **`payload` が catalog の payload schema と整合しているか** (フィールド名・必須項目)

### 7. 外部呼び出しと TX の位置関係 (External Call Placement)

`type: "externalSystem"` step すべてについて:

- **TransactionScope の inner にいないか** (anti-pattern)
- **TX 外なら、`outcomes.failure: "compensate"` 等の補償処理が正しく書かれているか**
- **`fireAndForget: true` の場合、`outcomes.failure: "continue"` になっているか** (発火しっぱなしと整合)

### 8. rollbackOn の発火可能性 (rollbackOn Liveness)

TransactionScope の `rollbackOn: [...]` で指定したエラーコードについて:

- **TX inner steps から実際にこのエラーコードが発生しうるか** (例: TX 外 step が返すエラーを rollbackOn に書いても死コード)
- **対応する `errorCatalog` エントリが存在するか**

## Step 2: 報告フォーマット

結果を **標準出力** に Markdown で出す (PR コメント投稿はしない、設計フェーズで使えるため)。

```markdown
## /review-flow 結果 — <YYYY-MM-DD HH:MM>

**対象**: <絶対パス>
**ID**: <id>
**name**: <name>
**maturity**: <maturity>

---

### 総合判定

**Must-fix: N 件 / Should-fix: M 件 / Nit: K 件**

---

### Must-fix (実行時バグ確実)

#### 1. <観点名>: <一行要約>

- 場所: `<file>:<line>` step-X (`type: <type>`)
- 詳細: ...
- 推奨修正: ...

### Should-fix (実行時の品質劣化リスク)

...

### Nit (任意改善)

...

---

### 8 観点別カバレッジ

| 観点 | 検出件数 | 状態 |
|---|---|---|
| 1. 変数ライフサイクル | M:0 / S:0 / N:0 | ✓ 問題なし / ❌ Must-fix あり |
| 2. TransactionScope 内外整合 | ... | ... |
| 3. runIf 連鎖の網羅性 | ... | ... |
| 4. branch 到達性 | ... | ... |
| 5. compensatesFor | ... | ... |
| 6. eventsCatalog ⇄ eventPublish | ... | ... |
| 7. 外部呼び出しと TX | ... | ... |
| 8. rollbackOn 発火可能性 | ... | ... |

---

### 変数ライフサイクル詳細 (参考)

| 変数 | 設定 step | 参照 step | 状態 |
|---|---|---|---|
| @inputs.foo | inputs | step-01, step-05 | ✓ |
| @bar | step-02 outputBinding | step-04, step-06 | ✓ |
| @baz | step-08 outputBinding | step-05 | ❌ 前方参照 |

---

### 検証方法

- 対象ファイル全文読み込み: <パス>
- 8 観点を順に手動で grep + ライフサイクル追跡
- 必要に応じて `schemas/process-flow.schema.json` の TransactionScopeStep 定義も参照
```

## Step 3: 完了報告

ユーザーに短く 1-3 行で:

- 対象フロー (id / name)
- Must-fix / Should-fix / Nit の件数
- 詳細結果は標準出力済 (再表示はしない)

`--all` の場合: 全件サマリ表 (フロー ID × Must-fix 件数) を最後に追加。

## 制約 (必守)

- **マージしない / push しない / PR コメントしない** (設計フェーズでも使える skill のため)
- **対象 JSON ファイルを書き換えない** (レビュー専任、修正は別ワークフロー)
- **検証は read-only** (フロー JSON の Read + schema/spec の Read のみ)
- **8 観点すべて実施**。「省略」は禁止。該当ゼロ件でもその旨明記
- **JSON Schema 検証は対象外** (vitest や ajv にやらせる責務)。あくまで実行時セマンティクスを見る
- **MCP `designer-mcp` が起動していなくても動く** (引数なし時のみ MCP 利用、明示指定時は不要)

## 注意事項

- 「Must-fix vs Should-fix」基準: 確実に実行時バグ → Must-fix。条件次第でバグる/品質劣化 → Should-fix
- 同種の問題が複数 step に跨る場合は **代表 1 件 + 同種の他箇所列挙** で報告 (重複指摘で報告が膨れない)
- フローが大きい (200 行超) 場合も 8 観点全部を必ず実施。観点ごとにセクション分けて読む
- **`/issues` オーケストレーターから Skill ツール経由で呼ばれた場合**: 結果は標準出力に出す (Opus が読み取る)。ユーザー報告の役割は呼び出し元
