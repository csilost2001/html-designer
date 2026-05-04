# examples/english-learning/ — 英会話学習アプリ サンプル仕様書

`examples/english-learning/` の業務スコープ・データモデル・画面構成・進め方をまとめた spec。Sonnet サブエージェントへの briefing 兼用。

関連: [#680](https://github.com/csilost2001/html-designer/issues/680) (親メタ) / [#787](https://github.com/csilost2001/html-designer/issues/787) (本サンプルメタ) / `examples/english-learning/README.md` (子 2 で作成予定)

## 1. 目的

retail (店舗オペレーション系 B2B) と並列の **B2C コンテンツ + 学習履歴系サンプル**。次の 4 点を本フレームワークでドッグフードする:

1. **外部 AI (LLM / TTS / STT) を ProcessFlow にどう組み込むか** — `stepKind` 拡張 + `outputSchema` パターンの実用例蓄積
2. **設計範囲外の UX (リアルタイム会話 / 録音 / カラオケ字幕 / 単語タップ辞書) を `description` 待避でどこまで表現できるか** — 待避粒度の妥当性検証
3. **拡張パック (動的追加コンテンツ — IT エンジニア / ビジネス 等) を `extensions/<namespace>/` でどう表現するか**
4. **進捗ベース UI (連続学習日数 / CEFR レベル / 習熟度) を ViewDefinition でどう表現するか**

retail で exercise されない領域を補完し、本フレームワークが B2C / 外部 AI 連携系にも対応できることを実証する。

## 2. 業務スコープ

### 2.1 業態

B2C 英会話学習アプリ (中規模、画面 ~11、テーブル ~10、処理フロー ~5、view ~3、sequence ~2)。学習者がストーリー仕立ての会話練習を行い、AI 採点で発音・文法のフィードバックを受け取る。コンテンツは「分野別パック」(汎用 / IT エンジニア / ビジネス / 旅行 等) として動的追加可能。

### 2.2 4 シナリオ + 補助

| シナリオ ID | 概要 | 関連 entity |
|---|---|---|
| **S-1 学習セッション開始** | ストーリー一覧から選択 → セッション作成 → 会話プレイ画面遷移。 | 画面: ストーリー一覧 / 詳細 / 会話プレイ ・ flow: start-session ・ table: stories / scenes / learning_sessions / sequences: session-id |
| **S-2 会話ターン進行** | ユーザー発話 (テキスト or 音声) → LLM 応答生成 → 履歴保存。**外部 LLM 呼び出しを stepKind 拡張で表現**。 | 画面: 会話プレイ ・ flow: progress-turn ・ table: turn_logs ・ extension: `english-learning:llm-dialog` stepKind |
| **S-3 発音採点** | ユーザーが目標セリフを録音送信 → STT + 評価 API → スコア保存 → 画面表示。**外部 STT 呼び出しを stepKind 拡張で表現**。 | 画面: 会話プレイ → セッション結果 ・ flow: evaluate-pronunciation ・ table: pronunciation_scores ・ extension: `english-learning:stt-evaluate` stepKind |
| **S-4 学習履歴閲覧 + 単語復習** | 学習履歴一覧 / 詳細表示、単語帳で習熟度別に復習。タップで辞書詳細。 | 画面: 学習履歴 / 単語帳 / 単語詳細 ・ flow: update-word-progress (common) ・ table: user_word_progress / words |

補助画面: ダッシュボード、コンテンツパック一覧、プロフィール / 設定。

### 2.3 画面一覧 (約 11)

| # | 画面名 | kind | path | 関連シナリオ |
|---|---|---|---|---|
| 1 | ダッシュボード | dashboard | `/` | (root) |
| 2 | ストーリー一覧 | list | `/stories` | S-1 |
| 3 | ストーリー詳細 | detail | `/stories/:storyId` | S-1 |
| 4 | 会話プレイ | english-learning:conversation-player | `/learn/:sessionId` | S-2/S-3 |
| 5 | セッション結果 | complete | `/learn/:sessionId/result` | S-3 |
| 6 | 学習履歴一覧 | list | `/history` | S-4 |
| 7 | 学習履歴詳細 | detail | `/history/:sessionId` | S-4 |
| 8 | 単語帳 | list | `/vocabulary` | S-4 |
| 9 | 単語詳細 | detail | `/vocabulary/:wordId` | S-4 |
| 10 | コンテンツパック一覧 | list | `/packs` | 補助 |
| 11 | プロフィール / 設定 | form | `/profile` | 補助 |

### 2.4 テーブル一覧 (約 10)

| # | physicalName | カテゴリ | 主用途 |
|---|---|---|---|
| 1 | users | マスタ | ユーザー (CEFR レベル / 連続学習日数 / 興味分野) |
| 2 | content_packs | マスタ | コンテンツパック (汎用 / IT / ビジネス 等の分野別、`namespace_ref` で拡張紐付け可能) |
| 3 | stories | マスタ | ストーリー (パック配下、CEFR レベル付き) |
| 4 | scenes | マスタ | シーン (ストーリー配下、順序保持) |
| 5 | dialogue_lines | マスタ | セリフ (英文 + 日本語訳 + IPA + 想定音声 URL) |
| 6 | words | マスタ | 単語 (英 / 品詞 / 訳 / IPA / 例文 / CEFR レベル) |
| 7 | learning_sessions | トランザクション | 学習セッション (`(user_id, story_id, started_at)` で識別) |
| 8 | turn_logs | トランザクション | 会話ターンログ (ユーザー発話 + AI 応答 + 採点結果 JSON) |
| 9 | pronunciation_scores | トランザクション | 発音スコア (セリフ × セッション、score 0-100 + 差分 JSON) |
| 10 | user_word_progress | トランザクション | 単語習熟度 (ユーザー × 単語、`(user_id, word_id)` UNIQUE、status: new/learning/mastered) |

### 2.5 拡張 namespace `english-learning`

`extensions/english-learning.v3.json` 1 ファイルに統合 (retail と同様の v3 canonical combined format)。

**fieldTypes** (画面項目 + テーブル列で利用):

| name | base | 用途 |
|---|---|---|
| `ipa` | string | IPA 発音記号 (regex で IPA Unicode 範囲を制約) |
| `cefrLevel` | string | CEFR レベル (enum: A1/A2/B1/B2/C1/C2) |
| `audioUrl` | string | 音声ファイル URL (TTS 生成 or 既存音源) |
| `pronunciationScore` | number | 発音スコア 0-100 |

**stepKinds** (ProcessFlow ステップ拡張、**本サンプルの肝**):

| name | input | output | 用途 |
|---|---|---|---|
| `english-learning:llm-dialog` | `{ context: TurnContext[], userInput: string }` | `{ aiResponse: string, suggestedFeedback?: string, nextScene?: SceneId }` | LLM への会話リクエスト |
| `english-learning:tts-generate` | `{ text: string, voice?: string }` | `{ audioUrl: string, durationMs: number, wordTimings?: WordTiming[] }` | TTS 音声生成 (wordTimings はカラオケ用、MVP では使わない) |
| `english-learning:stt-evaluate` | `{ audioUrl: string, expectedText: string }` | `{ recognizedText: string, score: number, diff: PhoneDiff[] }` | STT + 発音評価 |

**screen kinds** (画面拡張):

| name | 用途 |
|---|---|
| `english-learning:conversation-player` | 会話プレイ画面 (字幕表示 + 録音ボタン + 履歴ペイン) |

`outputSchema` は `extensions/english-learning.v3.json` 内で JSON Schema として記述し、ProcessFlow 側から参照される。これにより **LLM/TTS/STT 呼び出しが step として統一的に扱える** ことを実証する。

### 2.6 conventions catalog

- `numbering.session-id` — 学習セッション ID 採番
- `numbering.score-id` — 発音スコア ID 採番
- `regex.ipa` — IPA Unicode 範囲正規表現
- `cefr.passing-threshold` — CEFR レベル昇格の発音スコア閾値 (例: 70 点)
- `messages.session-not-found` — セッション未検出メッセージ
- `messages.pronunciation-low` — 発音低評価メッセージ
- `wordProgress.masteryThreshold` — 単語習熟判定回数 (例: 連続 3 回正解で mastered)

## 3. 設計判断

### 3.1 ID 規約 (retail と共通)

- top-level entity (Project / Screen / Table / ProcessFlow / View / Sequence) は **`Uuid` 形式 (RFC 4122 v4)**。
- ネスト LocalId は kebab-case (例: `step-llm-call`, `col-cefr-level`)。
- 業務識別子 (画面項目 ID / 処理フロー変数名) は lowerCamelCase (例: `sessionId`, `pronunciationScore`)。
- DB 物理名は snake_case (例: `learning_sessions`, `user_word_progress`)。

### 3.2 画面 HTML の品質要件

- Bootstrap 5 ベース、**B2C アプリ寄りの清潔感** (retail よりやや親しみのあるトーン、ただし業務見本品質は保つ)
- 4 テーマ (standard / card / compact / dark) で破綻しないこと
- `data-item-id` / `name` 属性は screen-items 定義と一致
- レスポンシブ: スマホ縦長を主用途と想定 (B2C 学習アプリのため)、タブレット / PC でも破綻しない
- アクセシビリティ: 録音ボタン等の重要操作に `aria-label` 必須

### 3.3 description 待避リスト (本サンプルの dogfood 中心)

本フレームワーク schema で表現できない UX を `description` フィールドで記述する。**待避は「機能を実装しない」のではなく「設計書粒度で表現するための MVP 縮退」**。

| 待避項目 | 待避先 | 待避内容 |
|---|---|---|
| TTS 同期カラオケ字幕 | dialogue_lines / 会話プレイ screen の description | 「将来 `english-learning:tts-generate` の `wordTimings` を使い word-level highlight する。MVP は通常字幕のみ」 |
| Web Audio 録音 | 会話プレイ screen の description / 録音ボタン項目の description | 「ブラウザ MediaRecorder API で録音、終了後 audioUrl を `english-learning:stt-evaluate` step に POST」 |
| LLM ストリーム会話 | turn_logs テーブル + S-2 flow の description | 「ターン単位 request/response。実装側で SSE / WebSocket による partial response ストリーム表示を行う想定」 |
| 単語タップ辞書ポップアップ | dialogue_lines.text / 会話プレイ画面項目の description | 「セリフ内の単語をタップすると `/vocabulary/:wordId` を modal で表示。実装側 router で intercept」 |
| 録音波形 visualizer | 録音ボタン項目の description | 「録音中は Web Audio API AudioContext で波形描画 (canvas)」 |
| 発音採点フィードバック UI | pronunciation_scores テーブル + S-3 結果画面の description | 「`diff` フィールド (PhoneDiff[]) は音素単位の正誤判定リスト。実装側で IPA テーブル + 色分け表示」 |
| 連続学習日数バッジ | users テーブル + ダッシュボードの description | 「`streak_days` を毎日リセット判定するバックグラウンド job が必要 (ProcessFlow の scheduled trigger で表現可能だが MVP では描写のみ)」 |

待避内容は子 5 (dogfood) で **粒度妥当性をレビューする**。1 行で済んでいるか / 実装者が再現できる粒度か / 待避内容の重複がないか。

### 3.4 schemas/v3 は変更しない

業務記述で表現できないものは **本 namespace の extension で対処**。schemas/v3 を変更したくなったら作業停止 → 別 ISSUE 起票 → 設計者承認待ち (#511 / AGENTS.md schema governance)。

特に「LLM 応答の outputSchema」「カラオケ用 wordTimings」「PhoneDiff 構造」等は extension の `outputSchema` で記述すれば schema 本体を触らずに済むはず。

### 3.5 外部 AI (LLM/TTS/STT) の ProcessFlow 表現方針

外部 AI 呼び出しは **`stepKind` 拡張で表現** し、実際の API 呼び出し詳細は description で記述する。**`type: "other"` (汎用エスケープ) は使わない** — namespace 拡張で表現できるならそちらを優先することがフレームワーク思想に沿う。

```jsonc
// 例: S-2 progress-turn flow の LLM 呼び出しステップ
{
  "kind": "english-learning:llm-dialog",
  "id": "step-llm-call",
  "input": { "context": "@var.turnContext", "userInput": "@var.userInput" },
  "outputs": { "aiResponse": "@var.aiResponse" },
  "description": "OpenAI GPT-4 / Anthropic Claude 等の LLM API を呼び出す。実装側で provider 選択。temperature 0.7 推奨。"
}
```

これにより:
- ProcessFlow viewer 上で LLM 呼び出しが他 step と同じ抽象レベルで表示される
- outputSchema により後続 step が型安全に AI 応答を参照できる
- 実装詳細 (provider / endpoint / auth) は description で記述、LLM 後段生成時にコード化

### 3.6 動作確認は data/ コピー (retail と同じ運用)

`examples/english-learning/` は git 管理の正本。動作確認は workspaces/ や任意フォルダにコピーして使う。詳細は `examples/english-learning/README.md` (子 2 で作成) に記載。

## 4. 受け入れ基準

- [ ] `examples/english-learning/project.json` が `schemas/v3/project.v3.schema.json` で AJV pass
- [ ] 全 entity ファイルが対応する v3 schema で pass
- [ ] designer 上で「フォルダを追加 → examples/english-learning」で開け、各一覧が描画される
- [ ] 4 シナリオの画面が画面フロー上で繋がっている
- [ ] 画面 HTML が **3.2 見栄え要件** を満たす (B2C トーン + 4 テーマ)
- [ ] AJV 全件検証 test が examples/english-learning/ もカバー、`npx vitest run` 全 pass
- [ ] `/review-flow` で全 ProcessFlow が Must-fix ゼロ
- [ ] description 待避リストが **3.3** の粒度妥当性レビューに通る (実装者が再現できる粒度)
- [ ] 半角カナ混入 0 件

## 5. 進め方 (シリーズ実装、各単独 PR)

| 子 ISSUE | 担当 | スコープ | branch |
|---|---|---|---|
| 子 1 (本 PR) | Opus | 本仕様書 (`docs/spec/examples-english-learning.md`) | `docs/issue-787-spec-english-learning` |
| 子 2 | Sonnet | 業務データ層 — `examples/english-learning/{tables,extensions,conventions}/` + `project.json` 雛形 + `README.md`。テーブル / 拡張 ID を確定 | `feat/issue-787-tables-conventions` |
| 子 3 | Sonnet | UI 層上半分 — `examples/english-learning/screens/` (HTML 見栄え重視) + `project.json` の `screens` / `screenTransitions` | `feat/issue-787-screens` |
| 子 4 | Sonnet | UI 層下半分 + 業務処理 — `examples/english-learning/{process-flows,view-definitions,sequences,views}/` (子 2 の table ID + 子 3 の screen ID 参照) | `feat/issue-787-flows` |
| 子 5 | Opus | dogfood 検証 — `npm run validate:samples` + `/review-flow` Must-fix ゼロ + description 待避リスト粒度監査 + smoke (multi-workspace で開いて表示) + 親メタ #680 README 表更新 | `chore/issue-787-dogfood` |

各子 PR で AJV / vitest / lint / Playwright が pass すること。子 PR は **逐次マージ**、シリーズ統合 PR にはしない (前段の table/screen ID 確定が後段の前提のため)。

## 6. 既存材料との関係

- 過去の dogfood (Phase 1-4) は B2B 業務系のみ。本サンプルが **本フレームワーク初の B2C + 外部 AI 連携サンプル**
- リリース前なので backward compat は考慮しない (memory `feedback_no_backward_compat_pre_release.md`)
- retail サンプルと並列の正本サンプル位置付け (memory `project_canonical_sample_layout_2026_05_03`)

## 7. テスト fixture としての利用

```bash
# 固定 workspace でアプリ起動 (AI の動作確認 / E2E テスト)
DESIGNER_DATA_DIR=examples/english-learning npm run dev:mcp
```

`schemas/v3/*.test.ts` (AJV) に `examples/english-learning/**/*.json` を組み込み、schema 進化時の regression を検出。

## 8. 想定されるドッグフード成果物

子 5 完了時に得られる知見の予想 (実際の結果は dogfood で確定):

1. **stepKind 拡張による外部 AI 表現の有用性検証** — `outputSchema` で型安全に AI 応答を後続 step に渡せるか
2. **description 待避リストのフレームワーク横断パターン化** — 他サンプル (医療画像診断、製造 AI 故障予測) にも転用できる「UX 待避テンプレート」が抽出できるか
3. **B2C 画面 HTML の品質レベル感** — retail (業務系) との見栄え差異をどこまで許容するか
4. **拡張パック (動的コンテンツ) の表現方針** — `content_packs.namespace_ref` で extension に紐付けるアプローチが妥当か
