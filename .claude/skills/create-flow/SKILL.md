---
name: create-flow
description: ProcessFlow JSON を品質ガード付きで新規作成する。/review-flow の 10 観点 + 17 ルールを作成前 self-check として組み込み、既知パターンの再発を抑制 + グローバル schema 変更禁止 (#511) + 画面項目連携整合性 (#621)
argument-hint: <flowId> <業務概要> [namespace]
disable-model-invocation: true
---

<!--
  使い方:
    - `/create-flow ffffffff-0001-4000-8000-ffffffffffff "受注処理 → 在庫引当 → 出荷指示" logistics`
    - `/create-flow <flowId> <業務概要>` (namespace なしでもよい)

  目的:
    ProcessFlow JSON の作成時点で `/review-flow` の 10 観点を self-check として遵守させ、
    既知パターン (TX outputBinding ネスト参照 / branch return 後 fallthrough / 死コード rollbackOn /
    画面項目イベント argumentMapping 不整合 等) の再発を抑制する。完成後の `/review-flow` 検出件数を
    削減し、修正サイクル数を減らす。

  /review-flow との関係:
    - 本スキル = 作成支援 (作成前 self-check)
    - /review-flow = 最終防衛線 (作成後の独立検証)
    - **両者は併用前提**。本スキルだけでは Must-fix ゼロ達成は保証されない。

  発動制御:
    - `disable-model-invocation: true`: ユーザーが明示的に `/create-flow [args]` と打った時のみ起動
    - `/issues` オーケストレーターから委譲先 AI への briefing 経由でも参照される
-->

ProcessFlow `$ARGUMENTS` を品質ガード付きで作成します。

## 役割と前提

- **あなたは ProcessFlow 設計者**。`/review-flow` の 10 観点を**作成前** に遵守して JSON を組み立てる
- 出力: 処理フロー JSON 1 ファイル + (必要なら) 拡張定義の追加 + testScenarios 3 件以上
- 完成後は **必ず `/review-flow` で自己検証**してから PR / マージに進める
- 本スキルは spec の**索引 + 既知パターン要約**。詳細は `docs/spec/process-flow-*.md` を `Read` で参照

## Step 0: 引数解析

`$ARGUMENTS` を以下のように解析:

- 第1引数 `flowId` (必須): UUID v4 形式 (例: `ffffffff-0001-4000-8000-ffffffffffff`)
- 第2引数 `業務概要` (必須): 自然言語 (例: `"受注 → 在庫引当 → 出荷指示の業務フロー"`)
- 第3引数 `namespace` (任意): 業界拡張定義の namespace (例: `securities`, `manufacturing`, `logistics`)

引数が不足していれば「不足: ...」と報告して中止。

## Step 1: 参考資料の確認

実装前に以下を必ず読む (skim でよい):

1. `docs/spec/process-flow-transaction.md` の §8 (TX 制御フロー)
2. `docs/spec/process-flow-extensions.md` の §15 (拡張機構)
3. `docs/spec/process-flow-runtime-conventions.md` の §13 (runtime conventions)
4. 既存サンプル 1-2 件: `docs/sample-project/process-flows/dddddddd-0001-4000-8000-dddddddddddd.json` (金融 注文受付、5/5 達成) と業務概要に近いシナリオ
5. namespace 指定があれば `docs/sample-project/extensions/<namespace>/*.json` を Read で確認 (既存拡張定義の把握)

## Step 2: 必須セクション チェックリスト

ProcessFlow JSON に含めるべき要素 (5/5 達成サンプル準拠):

| セクション | 要件 |
|---|---|
| `id` | UUID v4 |
| `name` | 業務名 (日本語、業界文脈含む) |
| `type` | `screen` / `system` / `batch` から選択 |
| `screenId` | UUID (画面実体不要なら任意の UUID で可) |
| `apiVersion` | `"v2"` 推奨 |
| `mode` | `"upstream"` (UI 起点) / `"downstream"` (内部呼出) |
| `maturity` | `"draft"` / `"provisional"` / `"committed"` |
| `description` | 短い業務説明 (推奨、`/review-flow` 厳格モード評価では無視される) |
| `eventsCatalog` | 業務イベント 4-6 件、各 description + payload schema (required + properties) |
| `glossary` | 業界用語 8 件以上、各 definition + aliases + domainRef |
| `decisions` | ADR 形式 3 件以上 (id / title / status / context / decision / consequences / date) |
| `ambientVariables` | requestId / sessionUserId 等の暗黙変数定義 |
| `errorCatalog` | 5 件以上、key + httpStatus + defaultMessage + responseRef |
| `externalSystemCatalog` | 連携する外部システム (auth / baseUrl / timeoutMs / openApiSpec 任意) |
| `secretsCatalog` | 各 API トークン (source / name / rotationDays) |
| `domainsCatalog` | ID 系・金額系等のドメイン型 (constraints 付き) |
| `functionsCatalog` | 業務固有関数のシグネチャ (signature / returnType / examples) |
| `actions[]` | 1-3 アクション。各 trigger / inputs / outputs / responses / steps |
| `testScenarios` | 3 件以上 (happy path / validation error / 業務エッジケース) |

各セクション 0 件は許されない (eventsCatalog と decisions と testScenarios は特に必須)。

## Step 3: 既知パターン回避 self-check (17 ルール、必須遵守)

`/review-flow` で検出される既知パターンを**作成中**に避けること。各 step を書くたびに以下を確認:

### Rule 1: 変数ライフサイクル

- 全 `@varName` 参照は実行順で先に設定済み (`inputs` / `outputBinding` / `ambientVariables` のいずれか)
- TX 内 step が **TX 外で設定される変数を前方参照しない**
- typo 注意: `@input.x` は誤り、`@inputs.x` が正しい

### Rule 2: TransactionScope 内外整合

- TX 内 step は TX **開始前**に設定された変数のみ参照
- TX 外 step が TX inner outputBinding を参照する場合の方針:
  - **方針 A (推奨)**: TX 後に `dbAccess SELECT` で再取得する step を挟んで `@persistedX` 等にバインド
  - **方針 B**: TX outputBinding に shape を明示 (現行 schema が許容するか要確認)
- **外部呼び出し (`externalSystem` step) は TX 内に入れない** (anti-pattern、DB 接続長時間占有)

### Rule 3: runIf 連鎖の網羅性

- 冪等 UPSERT (`UPSERT_IDEMPOTENT` 等) 後に続く step **すべて**に同条件 runIf
- no-op パスにも対応する return step (典型: `{ status: 'ALREADY_PROCESSED' }`)
- TX rollback ガード: TX 後の step に `runIf: "@txResult.committed == true"` (もしくは `false` で rollback パス)

### Rule 4: branch / elseBranch 到達性

- 全 branch + elseBranch が return か後続 step に到達 (dead end 禁止)
- branch 内で return した後の共通 step に **fallthrough しない設計** にする
- BLOCK/REJECT パスで return した後に共通 step に流れる構造は避ける (#458/#478 で多発)

### Rule 5: compensatesFor 参照健全性

- `compensatesFor: "step-X"` の step-X が同じ action 内に実在
- 補償処理が補償対象の書き込みを正しく打ち消す内容になっているか

### Rule 6: eventsCatalog ⇄ eventPublish 双方向整合

- `eventsCatalog` で宣言した全イベントに対応する `eventPublish` step が存在
- `eventPublish.topic` (or `eventRef`) で参照する topic が `eventsCatalog` に登録済み
- payload が catalog の payload schema と整合 (required フィールド網羅、型整合)

### Rule 7: 外部呼び出しと TX 位置関係

- `type: "externalSystem"` step は `transactionScope` の inner にいないか確認
- TX 外なら `outcomes.failure: "compensate"` 等の補償処理を明記
- `fireAndForget: true` の場合は `outcomes.failure: "continue"` で整合

### Rule 8: rollbackOn 発火可能性

- `transactionScope.rollbackOn` には TX inner step から実際に発生しうるエラーコードのみ列挙
- `errorCatalog` に登録されたコードを使用
- **死コード rollbackOn 禁止** (#458/#478 で頻発): TX 外 step が返すエラーコードを書かない

### Rule 9: SQL SELECT カラム整合 (#486 で発覚)

- 後続 step で `@bind.column` を参照するすべてのカラムが、対応する `dbAccess` step の SELECT 句に含まれているか確認
- 典型ミス: `SELECT id, status FROM table` で取得後、後続で `@row.quantity` を参照 → 実行時 undefined
- 対処: SELECT 句に必要カラムを全列挙、または compute step で別途取得

**Step 5.2 で `validate:dogfood` により機械的に検出される**

### Rule 10: `@conv.*` 参照の catalog 整合 (#486 で発覚)

- フロー内で参照する全 `@conv.*` キーが `docs/sample-project/conventions/conventions-catalog.json` に存在することを確認
- 典型ミス: ADR で `@conv.limit.maxDeliveryAttempts` を仕様化したが catalog 追加を忘れる → runtime で undefined 解決、condition が常に false
- 対処: 新規 `@conv.*` キーを使うときは必ず catalog にも追加 (本 PR で追加するか、別 ISSUE で先行追加)

**Step 5.2 で `validate:dogfood` により機械的に検出される**

### Rule 11: TX 内 branch return 後の制御 (#486 で発覚)

- Rule 4 (TX 外の branch fallthrough) の TX 内バージョン
- TX inner で `branch` step を使い branch 内で return する場合、後続 inner step に fallthrough しないか明示確認
- **推奨**: TX 内 branch を避け、`affectedRowsCheck.errorCode` で TX rollback を発火させる経路に統一
- 典型ミス: `step-tx-02` の branch A で `return 422` した後、`step-tx-03` が implicit に実行されて二重処理 / undefined 参照

### Rule 12: `affectedRowsCheck.operator` は `=` のみ受容 (schema 制約、#486 Opus 発見)

- 利用可能な operator: `>` / `>=` / `=` / `<` / `<=`
- **`==` は不可**、`!=` も不可
- 典型ミス: `"operator": "==", "expected": 1` を書く → schema 違反

### Rule 13: `affectedRowsCheck.expected` は integer リテラル必須 (schema 制約、#486 Opus 発見)

- 整数リテラル (`1` / `0` 等) のみ受容
- **式参照不可** (`@var` 不可)
- 「N 行更新」を式で表現できないため、複数行 affected の検証が必要なら別の方法 (compute step で count → branch 等)

### Rule 14: `OtherStep.outputSchema` 形式制約 (schema 制約、#486 Opus 発見)

- `{field: "string"}` 形式のみ受容 (フィールド名 → 型名の単純マッピング)
- **複雑な JSON Schema 不可**: nested object / required / additionalProperties / enum 等は使えない
- 参考: 拡張定義 (`extensions/<namespace>/steps.json`) の `schema` フィールドは別物 (こちらは JSON Schema 完全対応)
- 典型ミス: `"outputSchema": { "type": "object", "properties": {...}, "required": [...] }` を書く → schema 違反、Sonnet が #486 で実装中に修正

### Rule 15: グローバル schema 変更禁止 (#511 教訓、最重要)

- **`schemas/process-flow.schema.json` / `schemas/extensions-*.schema.json` / `schemas/conventions.schema.json` を変更しない**
- これらは **フレームワーク製作者 (設計者) の専権事項**、AI による変更は権限外行為
- 業務記述で表現できない場合の対処順序:
  1. **拡張機構 (namespace 拡張定義) で代替できないか確認** — `extensions/<namespace>/*.json` で field-types / triggers / db-operations / steps を追加
  2. **既存 schema フィールドで代替表現できないか確認** — description / note フィールドで意図を表現、`type: "other"` + outputSchema パターンを使う
  3. それでも無理なら、**ISSUE 起票して作業を一時停止** (例: `improve(schema): <フィールド名> 追加検討 — <経緯>`)、設計者承認待ち
- **絶対禁止**: テスト pass を理由に schema を勝手に拡張すること
- 参考: PR #508 で Sonnet が 6 フィールド勝手追加 → #511 でガバナンス導入の発端

### Rule 16: 画面項目イベント連携整合 (#619 / #621、Phase 3)

UI 起点フロー (`type: "screen"` / `mode: "upstream"`) を作成するときは、画面項目側との接続点を整合させる。`screenItemFlowValidator` が以下を機械検出する。

- **`meta.primaryInvoker` (任意、推奨)**: 主要起動元の画面項目イベントを `{kind: "screen-item-event", screenId, itemId, eventId}` で宣言。同 PR or 後続 PR で対応する `ScreenItem.events[]` 側に `handlerFlowId: <本フロー id>` を載せると validator が双方向参照を確認する
- **`actions[0].inputs[]` の引数契約**: `name` / `type` / `required` を画面側 `argumentMapping` のキー集合と一致させる
  - 必須引数 (`required: true`) を画面側 `argumentMapping` に含めない → `MISSING_REQUIRED_ARGUMENT`
  - 画面側 `argumentMapping` に inputs[] に無いキーがある → `EXTRA_ARGUMENT`
  - 1 フローを複数画面項目イベントから呼ぶ場合の **キー集合統一** (異なると `INCONSISTENT_ARGUMENT_CONTRACT` warning)
- **典型ミス**:
  - inputs[] に `userId` を `required: true` で入れたが、ScreenItem.events[].argumentMapping を空にしている → MISSING
  - inputs[] には無い `extraInfo` を ScreenItem.events[].argumentMapping に書いている → EXTRA
  - 同じ flow を 「ボタンクリック」と「フォーム送信」両方から呼んでいて、片方は `customerId` を渡して片方は渡していない → INCONSISTENT (warning)
- **本ルールが対象外のシナリオ**: `type: "system"` / `type: "batch"` / `mode: "downstream"` 等、画面項目から起動されないフローは `meta.primaryInvoker` を省略してよい (validator はフロー側のみ検査するためエラーにならない)
- **Phase 3 補足**: 画面定義 (Screen / ScreenItem) は本スキルの作成範囲外 (ProcessFlow JSON のみ作成)。画面側の `events[]` 追加が必要な場合は、フロー作成と同 PR で画面側 JSON も整合させるか、別 ISSUE で先行整合する

**Step 5.2 で `validate:dogfood` の `screenItemFlowValidator` により機械的に検出される**

### Rule 17: 画面項目値レベル整合 (#631 / #627、Phase 3 evolved)

UI 起点フロー (`type: "screen"` / `mode: "upstream"`) を作成するときは、画面項目側 ScreenItem.type / options / validation と処理フロー inputs[].type / domain の **値レベル** で整合させる。`screenItemFieldTypeValidator` が以下を機械検出する。

| code | severity | 検出内容 |
|---|---|---|
| `OPTIONS_NOT_SUBSET_OF_ENUM` | error | 画面 ScreenItem.options[].value (selectbox / radio 等) ⊆ flow input domain.enum.values の包含検査。Phase 3 M2 (BenefitType enum 不一致) の構造的検出機構 |
| `DOMAIN_KEY_MISMATCH` | error | 画面 ScreenItem.type.domainKey と flow input type.domainKey の不一致 (両方 domainKey 形式時) |
| `TYPE_MISMATCH` | error | argumentMapping 値が `@self.<itemId>` 参照の場合、ScreenItem.type と inputs[].type の比較 (#627 吸収) |
| `PATTERN_DIVERGENCE` | warning | 画面 validation.pattern と flow input domain.pattern (regex) の不一致 (両方定義時) |
| `RANGE_DIVERGENCE` | warning | 画面 min/max と flow input domain.minimum/maximum の不一致 (両方定義時) |
| `LENGTH_DIVERGENCE` | warning | 画面 minLength/maxLength と flow input domain.minLength/maxLength の不一致 |

**Step 5.2 で `validate:dogfood` の `screenItemFieldTypeValidator` により機械的に検出される**ため、本ルールは「機械検出は事後で必ず行われる」前提で、設計時に options / type / domainKey の対応関係を意識すること。

業務文脈の妥当性 (例えば「BenefitType の意味的妥当性」「画面選択肢の業務命名」) は引き続き AI 目視で `/review-flow` 観点 10 で扱う。

## Step 4: 拡張定義の使い方

### 既存 namespace を使う場合

- `docs/sample-project/extensions/<namespace>/*.json` を `Read` で確認
- 既定義の field-types / triggers / db-operations / steps を流用する
- 新規追加が必要な場合は同ファイルに追記 (シナリオ #2 以降のパターン参考)

### 新規 namespace を作る場合

- `docs/sample-project/extensions/<新namespace>/` ディレクトリ作成
- 必要なファイルだけ追加: `field-types.json` / `triggers.json` / `db-operations.json` / `steps.json` / `README.md`
- 各ファイルは `{namespace, fieldTypes/triggers/dbOperations/steps}` の構造に従う

### 重要原則 (`docs/spec/process-flow-extensions.md` §15)

- **拡張定義の実利用必須** (§15.3): 定義した拡張は**同 PR 内**で実フローから実体使用する。「定義したが未使用」は禁止
- **拡張 step の参照形式** (#492 / PR #494 で schema 改修済):
  - **推奨**: `type: "namespace:StepName"` (例: `"securities:TradeMatchStep"`) — 現行 schema 受容済
  - **後方互換**: `type: "other"` + `outputSchema` + description 注記の旧形式も引き続き valid
  - 旧版の `/create-flow` SKILL では `type: "other"` workaround を強制していたが、#492 で解消
- **fieldType vs domainsCatalog 使い分け** (§15.1):
  - 拡張 fieldType (`{kind: "orderId"}`): 業界固有の**型自体**を追加
  - domainsCatalog (`OrderId: {type: "string", constraints: ...}`): ドメイン**制約付き**の型エイリアス

## Step 5: 完成後の自己検証 (必須)

### 5.1 構造検証

```bash
cd designer
npx vitest run src/schemas/extensions-samples.test.ts src/schemas/process-flow.schema.test.ts
npm run build
```

### 5.2 バリデータ横断検証 (Rule 9 / 10 / 16 / 17 の機械的検出)

作成したフローを `docs/sample-project/process-flows/<flowId>.json` に配置した状態で:

```bash
cd designer
npm run validate:dogfood
```

これにより以下を機械的に検出する:

| バリデータ | 検出内容 | 対応 Rule |
|---|---|---|
| sqlColumnValidator | SQL 内で参照したカラムがテーブル定義に存在しない | Rule 9 |
| conventionsValidator | `@conv.*` 参照が conventions-catalog.json 未登録 | Rule 10 |
| referentialIntegrity | responseRef / errorCode / systemRef / compensatesFor の不整合 | Rule 5 / Rule 8 補強 |
| identifierScope | 識別子スコープ違反 (root レベル) | Rule 1 補強 |
| screenItemFlowValidator | 画面項目イベント ↔ 処理フロー連携の整合 (handlerFlowId 実在 / argumentMapping 整合 / primaryInvoker 双方向) | Rule 16 |
| screenItemFieldTypeValidator | 画面項目 ↔ 処理フロー 値レベル整合 (options 包含 / domainKey / 型 / pattern / range / length) | Rule 17 |

**fail した場合の対処**:
- `UNKNOWN_COLUMN` → SELECT 句を見直す or テーブル定義を更新
- `UNKNOWN_CONV_LIMIT` 等 → `docs/sample-project/conventions/conventions-catalog.json` に追加 or 既存キーへ修正
- `UNKNOWN_HANDLER_FLOW` → 画面項目側 `handlerFlowId` を本フロー id に修正 (画面側 JSON 編集が必要なら同 PR or 別 ISSUE で整合)
- `MISSING_REQUIRED_ARGUMENT` / `EXTRA_ARGUMENT` → `actions[0].inputs[]` と画面側 `argumentMapping` の **キー集合 + required** を一致させる
- `PRIMARY_INVOKER_MISMATCH` → `meta.primaryInvoker` が指す ScreenItem.events[].handlerFlowId が本フロー id を返すように整える (双方向参照)
- `INCONSISTENT_ARGUMENT_CONTRACT` (warning) → 同フローを呼ぶ複数イベントの `argumentMapping` キー集合を統一 (意図的に異なるなら warning 受容可)
- 構造的に解消できない場合は ISSUE 起票して停止 (グローバル schema 変更は禁止 — Rule 15)

### 5.3 単一フロー検証 (任意)

`validate:dogfood` は `docs/sample-project/` 全件対象のため、作成中フロー 1 件のみを検証したい場合:

```bash
cd designer
npx vitest run src/schemas/validateDogfood.test.ts -t "<flowId の一部>"
```

または `validateDogfood.test.ts` のパターンを参考にインライン実行 (詳細は同テストを参照)。

### 5.4 /review-flow による最終検証

5.1 / 5.2 が pass したら、**強く推奨**:

```
/review-flow <flowId>
```

`/review-flow` 検出 Must-fix が 0 件になるまで自己修正してから出力 / PR 作成へ進む。

## Step 6: 出力フォーマット

ユーザーに渡すもの:

```markdown
## 作成完了: <name>

### 出力ファイル
- `docs/sample-project/process-flows/<flowId>.json` (新規)
- (新規拡張がある場合) `docs/sample-project/extensions/<namespace>/*.json`

### 統計
- アクション数: N
- step 総数: M
- testScenarios: K 件
- decisions (ADR): 件数
- 拡張利用: 既存 namespace から N 件 / 新規定義 M 件 (実利用済み)

### Step 3 self-check 結果

| Rule | 状態 |
|---|---|
| 1. 変数ライフサイクル | ✓ / ❌ (問題があれば詳細) |
| 2. TransactionScope 内外整合 | ✓ / ❌ |
| 3. runIf 連鎖の網羅性 | ✓ / ❌ |
| 4. branch / elseBranch 到達性 (TX 外) | ✓ / ❌ |
| 5. compensatesFor 参照健全性 | ✓ / 該当なし |
| 6. eventsCatalog ⇄ eventPublish | ✓ / ❌ |
| 7. 外部呼び出しと TX 位置関係 | ✓ / ❌ |
| 8. rollbackOn 発火可能性 | ✓ / 該当なし |
| 9. SQL SELECT カラム整合 | ✓ / ❌ (参照しているのに SELECT に無いカラム) |
| 10. `@conv.*` 参照の catalog 整合 | ✓ / ❌ (catalog 未登録キーがあれば list) |
| 11. TX 内 branch return 後制御 | ✓ / 該当なし (TX 内 branch を使っていない) |
| 12. `affectedRowsCheck.operator` (`=` のみ) | ✓ / 該当なし |
| 13. `affectedRowsCheck.expected` (integer リテラル) | ✓ / 該当なし |
| 14. `OtherStep.outputSchema` 形式 | ✓ / 該当なし |
| 15. グローバル schema 変更禁止 | ✓ (`schemas/*.json` 未変更) / ❌ |
| 16. 画面項目イベント連携整合 | ✓ / 該当なし (画面起点でない) / ❌ |
| 17. 画面項目値レベル整合 | ✓ / 該当なし (画面起点でない) / ❌ (options / domainKey / 型 / pattern / range / length 不一致) |

### 検証結果
- vitest: <pass/fail 件数>
- build: <pass/fail>
- validate:dogfood: <pass/fail 件数> (sqlColumnValidator / conventionsValidator / referentialIntegrity / identifierScope / screenItemFlowValidator / screenItemFieldTypeValidator)
- /review-flow: <Must-fix 件数 / Should-fix 件数>

### 推奨: 次の手順
- /review-flow を未実施なら実施
- PR 作成へ
```

## 制約 (必守)

- **`/review-flow` を最終防衛線として併用**: 本スキルだけでは Must-fix ゼロ達成は保証されない
- **spec の正本性**: 本スキルは要約。詳細は `docs/spec/process-flow-*.md` を `Read`
- **拡張定義は実利用必須**: 定義のみで未使用は禁止 (spec §15.3)
- **schema を尊重**: `type: "manufacturing:StepName"` のような未対応形式は使わない (`type: "other"` + outputSchema が正解)
- **データファイル (`data/`) は触らない** (gitignore 対象)
- **17 ルールすべて作成中に意識する**: 1 つでも無視するとレビューで detect される

## 注意事項

- スキル肥大化を避けるため、spec 本文は転記しない (要約のみ)
- 業務概要が短すぎて不明瞭な場合は、ユーザーに「もう少し詳しく」と聞き返すのも可
- 既存サンプル (`dddddddd-0001-*` / `eeeeeeee-0001-*` / `ffffffff-0001-*` 等) は 5/5 達成済の良サンプル、構造を参考にする
- `/issues` オーケストレーターから委譲される場合、briefing に「`/create-flow` の 17 ルールを遵守すること」が含まれているはず
