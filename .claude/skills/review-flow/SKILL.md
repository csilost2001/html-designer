---
name: review-flow
description: ProcessFlow JSON の実行セマンティクスを専門レビュー (変数ライフサイクル / TX スコープ / runIf 連鎖 / 補償整合 / event 双方向 / 画面項目連携)。Step 0.5 で 6 バリデータを機械実行 (#599 / #621)、Step 1 で 10 観点を AI レビュー。設計フェーズから使える
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

## Step 0.5: 機械的バリデータ実行 (#599 / #621)

Step 1 の AI 目視レビューに入る前に、実装済みの 6 バリデータ (`checkReferentialIntegrity` / `checkIdentifierScopes` / `checkSqlColumns` / `checkConventionReferences` / `checkScreenItemFlowConsistency` / `checkScreenItemFieldTypeConsistency`) を CLI 経由で実行して、機械的に検出可能な参照整合・識別子スコープ・SQL カラム・@conv.* 参照・画面項目イベント連携・画面項目値レベル整合の問題を先に拾う。

### 実行コマンド

対象フローのパス (Step 0 で resolve した絶対 / 相対パス) を `--flow` で渡す:

```bash
cd designer
npm run validate:dogfood -- --flow <対象フローのパス>
```

`--all` モードや、Step 0 で複数件 resolve した場合は、`--flow` 引数を省略することでサンプル全件を一括検証できる:

```bash
cd designer
npm run validate:dogfood
```

### 何が動くか (7 バリデータ)

| # | バリデータ | 検出内容 | 入力 |
|---|---|---|---|
| 1 | referentialIntegrity | responseRef / errorCode / systemRef / compensatesFor 等の不整合 | 常時動作 |
| 2 | identifierScope | 識別子スコープ違反 (root レベル `@var` 未宣言) | 常時動作 |
| 3 | sqlColumnValidator | SQL 内で参照したカラムがテーブル定義に存在しない | `docs/sample-project/tables/` 経由で自動ロード |
| 4 | conventionsValidator | `@conv.*` 参照が catalog 未登録 | `docs/sample-project/conventions/conventions-catalog.json` を自動ロード |
| 5 | screenItemFlowValidator | 画面項目イベント ↔ 処理フロー連携 (handlerFlowId 実在 / argumentMapping 整合 / primaryInvoker 双方向 / events[].id ユニーク) | 各プロジェクトの `screens/` を per-project でロード (project-level 検査、#619/#621) |
| 6 | screenItemFieldTypeValidator | 画面項目 ↔ フロー 値レベル整合 | 画面項目定義ファイル + 処理フロー JSON |
| 7 | sqlOrderValidator | DB 制約 × 操作順序 (NOT NULL × INSERT / FK × INSERT 順序) | テーブル定義 (v3 形式) を自動ロード (#632) |

### 結果の取り扱い

- バリデータが検出した issue は **Step 1 のレビュー入力**として活用 (重複説明はしない)
- 結果は Step 2 の「10 観点別カバレッジ」表に **「validator 検出済」** カラムとして記録
- Must-fix 候補: `UNKNOWN_RESPONSE_REF` / `UNKNOWN_ERROR_CODE` / `UNKNOWN_IDENTIFIER` / `UNKNOWN_COLUMN` / `UNKNOWN_CONV_*` / `UNKNOWN_HANDLER_FLOW` / `MISSING_REQUIRED_ARGUMENT` / `EXTRA_ARGUMENT` / `PRIMARY_INVOKER_MISMATCH` / `DUPLICATE_EVENT_ID` / `NULL_NOT_ALLOWED_AT_INSERT` / `FK_REFERENCE_NOT_INSERTED` 等
- Should-fix 候補 (warning): `INCONSISTENT_ARGUMENT_CONTRACT` (1 フローを呼ぶ複数イベント間で argumentMapping キー集合が異なる)
- 終了コード 1 (1 件以上 fail) でも Step 1 を中止せず実施する (実行セマンティクス観点が AI 目視のみで残るため)

### 観点 ⇄ バリデータ対応表 (担当領域)

| 観点 | バリデータでカバー | AI 目視のみ |
|---|---|---|
| 1. 変数ライフサイクル | identifierScope (root 識別子の未宣言) / sqlOrderValidator (INSERT 時点の未バインド変数) | TX 順序 / property path / 前方参照は AI |
| 2. TX スコープ整合 | (なし) | AI |
| 3. runIf 連鎖の網羅性 | (なし) | AI |
| 4. branch / elseBranch 到達性 | (なし) | AI |
| 5. compensatesFor 健全性 | referentialIntegrity (compensatesFor 対象の実在チェック) | 補償内容の妥当性は AI |
| 6. eventsCatalog ⇄ eventPublish | (なし、referentialIntegrity 対象外) | AI |
| 7. 外部呼び出しと TX 位置 | referentialIntegrity (systemRef 実在) | TX 内外の位置関係は AI |
| 8. rollbackOn 発火可能性 | referentialIntegrity (UNKNOWN_ERROR_CODE) | TX inner からの実発火可能性は AI |
| 9. 画面項目イベント連携整合 | screenItemFlowValidator (handlerFlowId / argumentMapping / primaryInvoker / events[].id ユニーク) | 業務文脈での argumentMapping 値の妥当性 (UI 入力 → フロー入力の意味的整合) は AI |
| 10. 画面項目値レベル整合 | screenItemFieldTypeValidator (options 包含 / domainKey / 型 / pattern / range / length) | 業務文脈の妥当性 (選択肢命名の業務適切性 / domain 設計妥当性) は AI |
| 11. DB 制約 × INSERT 順序 (#632) | sqlOrderValidator (NULL_NOT_ALLOWED_AT_INSERT / FK_REFERENCE_NOT_INSERTED) | 複雑な条件分岐での可能性の有無は AI |

監査根拠: `docs/spec/dogfood-2026-04-29-phase2-validator-audit.md` §3 / §4 + Phase 3 子 1 #619 (PR #626)。

### 終了コードの扱い

- **exit 0**: 6 バリデータ全 pass → Step 1 へ進む
- **exit 1**: 1 件以上の validator issue 検出 → Step 1 を中止せず、issue 内容を Step 2 のカバレッジ表に「validator 検出済」として記録して進む (実行セマンティクス観点が AI 目視のみで残るため)
- **exit 2**: 引数異常 / ファイル不在 / JSON parse 失敗 → エラーメッセージを報告し AI 目視のみで Step 1 に進む

### バリデータが動かない場合

- `--flow <path>` のファイルが存在しない / JSON parse 失敗 (= exit 2) → エラーメッセージを報告し Step 1 に進む (AI 目視のみで継続)
- `npm run validate:dogfood` 自体が失敗 (依存解決等) → 同上、Step 1 に進む
- バリデータ未呼び出しは **Step 2 の「validator 検出済」欄を「未実行」と明記** (隠さない)

## Step 1: 検証項目 (10 観点)

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

### 9. 画面項目イベント連携整合性 (Screen-Item Event Integration)

UI 起点フロー (`type: "screen"` / `mode: "upstream"`) について、画面項目側との接続点を検証。**機械検出の大半は Step 0.5 の `screenItemFlowValidator` でカバー** されるため、AI 目視は **「validator では届かない業務文脈の妥当性」** に絞る。

- **`meta.primaryInvoker` の業務妥当性**: 双方向参照は validator が確認するが、宣言された ScreenItem.events[] が**業務上の主要起動元**として妥当か (例: 「保存」フローの primaryInvoker が「ヘルプリンク」になっていないか)
- **argumentMapping の意味的整合**: validator はキー集合のみを見る。`argumentMapping.amount` に画面側 `@self.priceJpy` を渡しているが、フロー側 `inputs.amount` のドメイン (例: 通貨単位) と一致するかは AI 判断
- **必須/任意の意図整合**: `inputs[].required: true` だが画面側で空文字を渡しうる UI なら、フロー側の入力検証 step (`type: "validate"`) が catch しているか
- **複数イベント呼び出しの設計妥当性**: 同フローを複数イベントから呼ぶ場合、引数の差分が**業務上意図的**か (validator は warning を出すだけで、合理性は AI 判断)
- **画面起点でないフローでの primaryInvoker 設定**: `type: "system"` / `type: "batch"` / `mode: "downstream"` で `meta.primaryInvoker` を設定しているのは設計ミス候補
- **該当なし条件**: `type: "system"` / `type: "batch"` フローで `meta.primaryInvoker` 未設定 + 同プロジェクト内のどの ScreenItem.events[] からも呼ばれていない場合 (validator も起動しない)

報告形式:
```
@<flowId> primaryInvoker: <screenId>.<itemId>.<eventId>
  validator 検出: <validator が出した issue 一覧>
  業務妥当性: ✓ OK / ⚠ 業務文脈で argumentMapping が型整合しない / ❌ primaryInvoker が業務上の主要起動元と異なる
```

#### 観点 10: 画面項目値レベル整合 (#631 / #627、Phase 3 evolved)

UI 起点フロー (`type: "screen"` / `mode: "upstream"`) について、画面項目側との **値レベル** での整合を検証。**機械検出の大半は Step 0.5 の `screenItemFieldTypeValidator` でカバー** されるため、AI 目視は **「validator では届かない業務文脈の妥当性」** に絞る:

- 画面 selectbox / radio の `options[].value` 自体は flow domain enum と一致していても、**選択肢命名が業務として適切か** (例: `label` vs `value` の表示ラベル整合)
- domainKey 設計の業務妥当性 (例: `BenefitType` を多業務で再利用するか専用に閉じるか)
- pattern / range / length の業務上の正当性 (validator は 一致 / 不一致のみ検出、業務として妥当な範囲かは AI 判断)

#### 観点 14: 画面項目 refKey 横断整合 (#651、Phase 4 子 3)

このフローに紐付く画面項目の `refKey` 設定と `conventions.fieldKeys` 宣言の整合性を確認する。**機械検出は Step 0.5 の `screenItemRefKeyValidator` でカバー** されるため、AI 目視は **「validator では届かない業務文脈の妥当性」** に絞る:

- 同一 `refKey` の画面項目間で **UI 制約の業務上の差異が正当か** (例: 振込実行は required=true、履歴照会は required=false — 画面 role の違いとして正当)
- `conventions.fieldKeys` の `displayName` / `description` が業務の実態を正確に表しているか
- 未来の画面追加で再利用されるべき共通フィールドに `refKey` が付与されているか (付与漏れは warning 受容可だが将来の整合性リスク)
- `refKey` は `UNDECLARED_REF_KEY` / `INCONSISTENT_TYPE_BY_REF_KEY` は Must-fix 相当 (validator が検出)、それ以外の warning 観点 (INCONSISTENT_FORMAT / VALIDATION / HANDLER_FLOW / ORPHAN / DECLARED_TYPE_MISMATCH) は business context で判断

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

### 10 観点別カバレッジ

`validator 検出済` 欄には Step 0.5 で動作したバリデータの issue 件数を、`AI 目視` 欄には Step 1 で AI が検出した件数 (validator 重複は除外) を記入する。

| 観点 | validator 検出済 | AI 目視 (M / S / N) | 状態 |
|---|---|---|---|
| 1. 変数ライフサイクル | identifierScope: N 件 | M:0 / S:0 / N:0 | ✓ 問題なし / ❌ Must-fix あり |
| 2. TransactionScope 内外整合 | (validator 対象外) | ... | ... |
| 3. runIf 連鎖の網羅性 | (validator 対象外) | ... | ... |
| 4. branch 到達性 | (validator 対象外) | ... | ... |
| 5. compensatesFor | referentialIntegrity: N 件 | ... | ... |
| 6. eventsCatalog ⇄ eventPublish | (validator 対象外) | ... | ... |
| 7. 外部呼び出しと TX | referentialIntegrity (systemRef): N 件 | ... | ... |
| 8. rollbackOn 発火可能性 | referentialIntegrity (UNKNOWN_ERROR_CODE): N 件 | ... | ... |
| 9. 画面項目イベント連携整合性 | screenItemFlowValidator: N 件 (UNKNOWN_HANDLER_FLOW / MISSING_REQUIRED_ARGUMENT / EXTRA_ARGUMENT / PRIMARY_INVOKER_MISMATCH / DUPLICATE_EVENT_ID / INCONSISTENT_ARGUMENT_CONTRACT 内訳) | 業務妥当性 (型整合 / 主要起動元妥当性) は AI | ... |
| 10. 画面項目値レベル整合 | screenItemFieldTypeValidator: N 件 (OPTIONS_NOT_SUBSET_OF_ENUM / DOMAIN_KEY_MISMATCH / TYPE_MISMATCH / PATTERN_DIVERGENCE / RANGE_DIVERGENCE / LENGTH_DIVERGENCE 内訳) | 業務妥当性 (選択肢命名 / domain 設計) は AI | ... |
| 14. 画面項目 refKey 横断整合 | screenItemRefKeyValidator: N 件 (UNDECLARED_REF_KEY / INCONSISTENT_TYPE_BY_REF_KEY / INCONSISTENT_FORMAT_BY_REF_KEY / INCONSISTENT_VALIDATION_BY_REF_KEY / INCONSISTENT_HANDLER_FLOW_BY_REF_KEY / ORPHAN_FIELD_KEY / DECLARED_TYPE_MISMATCH 内訳) | 業務文脈での warning 判断は AI | ... |

Step 0.5 をスキップした場合は `validator 検出済` 列を全行 `未実行` と記載する。

---

### 変数ライフサイクル詳細 (参考)

| 変数 | 設定 step | 参照 step | 状態 |
|---|---|---|---|
| @inputs.foo | inputs | step-01, step-05 | ✓ |
| @bar | step-02 outputBinding | step-04, step-06 | ✓ |
| @baz | step-08 outputBinding | step-05 | ❌ 前方参照 |

---

### 検証方法

- Step 0.5: `npm run validate:dogfood -- --flow <パス>` で 6 バリデータ実行
- 対象ファイル全文読み込み: <パス>
- 10 観点を順に手動で grep + ライフサイクル追跡 (validator 検出済の問題は重複説明しない)
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
- **検証は read-only** (フロー JSON の Read + schema/spec の Read + Step 0.5 の `npm run validate:dogfood --flow` 実行のみ)
- **Step 0.5 は必ず試行する** (失敗時は「未実行」と明記して Step 1 に進める)
- **10 観点すべて実施**。「省略」は禁止。該当ゼロ件でもその旨明記
- **JSON Schema 検証は対象外** (vitest や ajv にやらせる責務)。あくまで実行時セマンティクスを見る
- **MCP `designer-mcp` が起動していなくても動く** (引数なし時のみ MCP 利用、明示指定時は不要)

## 注意事項

- 「Must-fix vs Should-fix」基準: 確実に実行時バグ → Must-fix。条件次第でバグる/品質劣化 → Should-fix
- 同種の問題が複数 step に跨る場合は **代表 1 件 + 同種の他箇所列挙** で報告 (重複指摘で報告が膨れない)
- フローが大きい (200 行超) 場合も 10 観点全部を必ず実施。観点ごとにセクション分けて読む
- **`/issues` オーケストレーターから Skill ツール経由で呼ばれた場合**: 結果は標準出力に出す (Opus が読み取る)。ユーザー報告の役割は呼び出し元
