# 処理フローの入出力・変数構造化

Issue: #152 (親トラッキング: #151)
策定日: 2026-04-20
ステータス: **初版** (#151 のドッグフード検証を踏まえて策定、実装フェーズで改訂予定)

本ドキュメントは、処理フローの **入出力とステップ間の変数受け渡し** を構造化して、AI エージェントが実装時に関数シグネチャと中間変数を明確に決められるようにする仕様を定める。

## 1. 目的

現状の処理フローは:

- `inputs` / `outputs` が「改行区切り自由テキスト」
- ステップ間のデータ受け渡しが `description` の自由文で表現
- 条件式 / ループソース / 表示対象が自由テキスト

これにより AI エージェントは実装時に以下で迷う:

- 各入出力の**型・必須性**が不明 → 関数シグネチャが決まらない
- DB 検索結果 → 後続ステップでの**参照方法**が不明 → 中間変数名を推測
- 共通処理呼び出し時の**引数マッピング**が書けない
- 条件式内のフィールド参照が識別子か自然言語か不明

本仕様は、これを「**自由テキスト併用可能・漸進的に構造化**」な形式に拡張する。全か無かではなく、書ける範囲だけ構造化する。

## 2. 背景

2026-04-20 のドッグフード結果:

- 「Top 3 不足項目」の **1 位**「共通のコード採番ポリシーおよび outputs で保持する変数の型・命名」
- 曖昧さパターン **A (変数の受け渡し方法)** が全 4 サンプルで頻出
- パターン **C (DB 操作の詳細)** で INSERT/UPDATE のフィールド順・省略項目・採番が不明と指摘

## 3. 概念モデル (4 ピース)

### 3.1 入出力の構造化

`ActionDefinition.inputs` / `outputs` を **自由テキスト or 構造化配列** の union に拡張:

```ts
interface StructuredField {
  name: string;                    // 識別子 (例: "userId")
  label?: string;                  // 表示名 (例: "ユーザーID")
  type: FieldType;
  required?: boolean;
  description?: string;
  defaultValue?: string;
}

type FieldType =
  | "string" | "number" | "boolean" | "date"
  | { kind: "array"; itemType: FieldType }              // 配列型 (#253 v1.1)
  | { kind: "object"; fields: StructuredField[] }       // オブジェクト型 (#253 v1.1)
  | { kind: "tableRow"; tableId: string }        // テーブル 1 行
  | { kind: "tableList"; tableId: string }       // テーブルの配列
  | { kind: "screenInput"; screenId: string }    // 画面の入力セット
  | { kind: "custom"; label: string };           // 自由記述型 (array/object で表現できない場合の最終手段)

interface ActionDefinition {
  inputs?: string | StructuredField[];
  outputs?: string | StructuredField[];
}
```

### 3.2 ステップの出力変数 (Output Binding)

各ステップに「結果を何という名前で残すか」を 1 本:

```ts
interface StepBase {
  outputBinding?: string;   // 例: "users", "authResult", "duplicates"
}
```

対応ステップタイプ:

| ステップ | 出力変数 |
|---|---|
| DB SELECT | ✓ (既定候補: テーブル名) |
| 共通処理呼出 | ✓ |
| 外部システム呼出 | ✓ |
| 検証 | ✕ (真偽は内部、分岐直結) |
| 分岐 / ループ制御 | ✕ (制御構造) |
| 画面遷移・表示更新 | ✕ (副作用のみ) |
| その他 | ✓ (自由命名) |

空欄なら「この名前では参照できない」でよい。強制しない。

### 3.3 参照補完 (`@` 記法)

自由テキストフィールド内で **`@` プレフィックス**を使った補完可能参照を導入:

```
@users.0.role        # users 配列の先頭要素の role
@authResult.userId   # authResult オブジェクトの userId
@userId              # そのアクションの入力値
```

対象フィールド (v1):

- `BranchStep.branches[].condition`
- `LoopStep.conditionExpression` / `countExpression` / `collectionSource` / `collectionItemName`
- `DisplayUpdateStep.target`
- `ValidationStep.conditions`
- `CommonProcessStep.argumentMapping` の値側 (§3.4)

動作:

- `@` 押下でポップアップ、そのステップまでに定義された変数 + アクションの inputs を候補表示
- ↑↓ で選択、Enter で確定
- `@` を使わない自由テキストは従来通り保存 (後方互換)
- **厳密な型チェックはしない** (v1 は構文的補完のみ)

### 3.4 共通処理の引数マッピング

`CommonProcessStep` に引数マッピング欄を追加:

```ts
interface CommonProcessStep extends StepBase {
  // 既存
  refId: string;
  refName?: string;

  // 新規
  argumentMapping?: Record<string, string>;
  // キー: 呼び先フローの input 名
  // 値: 値表現 (リテラル or "@変数名")
}
```

UI: `refId` 選択時、呼び先フローの `inputs` を自動展開して対応表が現れる:

```
共通処理: 認証チェック
  呼び先の入力:
    sessionId     → [@session.id         ]
    trustedLevel  → ['high'               ]
```

### 3.5 変数スコープ

- **アクション単位**がスコープの単位
- アクション内の `outputBinding` は、そのステップ以降・同一アクション内で参照可能
- 分岐・ループ内で定義した変数は、その分岐・ループを抜けると参照不可 (v1 では警告のみ、禁止にはしない)
- アクションの `inputs` はアクションの先頭から参照可能

## 4. UI 要素

### 4.1 入出力の表形式エディタ (Phase 1)

現在の改行区切りテキストエリアを次の表に置換 (切替可能):

```
┌─ 入力 ──────────────────────────────────────────────┐
│  名前       | 型        | 必須 | 説明           [+] │
│  userId     | 文字列    | ✓    | ログイン ID        │
│  password   | 文字列    | ✓    |                    │
└─────────────────────────────────────────────────────┘
[自由記述モードに戻す]
```

- **自由記述モード ↔ 表形式** のトグルがあり、いつでも行き来可能
- 表形式から自由記述に戻すと、改行区切りのテキストに再シリアライズ (name のみ)
- 自由記述から表形式に切り替えると、改行区切りを `StructuredField[]` に自動変換 (name のみ、type=`"string"` 既定)

### 4.2 ステップカードの出力変数欄 (Phase 2)

該当ステップタイプのカードに「結果変数名」欄を追加:

```
┌─ DB 検索 (customers) ────────────────┐
│  検索条件: email = @email             │
│  結果を: [duplicates             ]    │
└───────────────────────────────────────┘
```

### 4.3 `@` 補完付き参照入力 (Phase 3)

自由テキストフィールド内で `@` 入力時にポップアップ:

```
条件: @users
         ┌──────────────────────────────────────┐
         │ users      (DB検索結果, users テーブル) │ ← 矢印キー
         │ userId     (入力)                      │
         │ authResult (共通処理戻り値)            │
         └──────────────────────────────────────┘
```

候補は、そのステップまでに定義された `outputBinding` + アクションの `inputs.name`。Esc で閉じる、選択しなくても自由テキストとして保存可能。

### 4.4 共通処理の引数マッピング UI (Phase 4)

共通処理カードに、呼び先 `inputs` が自動展開される専用エリア:

```
共通処理: 認証チェック [ref: cccccccc-0003 ▼]
───────────────────────────────────────
呼び先の入力:
  sessionId    → [@session.id       ] (文字列)
  trustedLevel → ['high'             ] (文字列)
```

値側入力は §4.3 の `@` 補完が利く。

### 4.5 型のテーブル・画面連携 (Phase 5, 任意)

型ドロップダウンに:

- `テーブル: users の 1 行`
- `テーブル: users の配列`
- `画面: ログイン画面の入力`

を追加。選択するとその型のフィールド一覧が自動的に利用可能に。

## 5. データモデル (後方互換)

### 5.1 変更点

| 型 | フィールド | 変更 |
|---|---|---|
| `ActionDefinition.inputs` | — | `string` → `string \| StructuredField[]` |
| `ActionDefinition.outputs` | — | 同上 |
| `StepBase` | `outputBinding?: string` | 新規 |
| `CommonProcessStep` | `argumentMapping?: Record<string,string>` | 新規 |

### 5.2 読み込み時

- 旧 `inputs: "userId\npassword"` は `string` のまま保持
- UI は自由記述モードで表示
- ユーザーが表形式に切替時、改行区切りを `StructuredField[]` に自動変換 (name のみ、type=`"string"` 既定)

### 5.3 書き込み時

- 最新形式で保存 (表形式使用時は `StructuredField[]`、自由記述モード時は `string`)
- 破壊的変更なし

## 6. 型システム (v1 の範囲)

v1 は**構文レベルのみ**:

- `FieldType` の 5 基本型は文字列定数として保存
- `tableRow` / `tableList` は `tableId` の参照整合性だけ検査 (存在する ID か)
- `@` 参照のパスは検索可能な識別子列として保存 (ドット/インデックス解釈は実装側)
- 型ミスマッチの実行時検査はしない

## 7. Phase 分け

| Phase | 内容 | 視覚影響 | 規模 |
|---|---|---|---|
| 1 | 入出力の表形式エディタ + `StructuredField[]` 保存 + モード切替 | 中 | 中 |
| 2 | ステップの `outputBinding` 欄 | 小 | 小 |
| 3 | `@` 補完付き参照入力 (候補ポップアップ) | 中 | 中 |
| 4 | 共通処理の引数マッピング UI | 中 | 中 |
| 5 (任意) | 型のテーブル・画面連携 | 大 | 大 |

Phase 1 から段階投入可能。Phase 2〜4 は独立に進められる。`process-flow-maturity.md` とは独立。

## 8. 受け入れ条件

- [ ] `inputs` / `outputs` を表形式で編集でき、`StructuredField[]` として JSON に保存される
- [ ] 旧形式 (`string`) のデータは壊れず、自由記述モードで表示される
- [ ] 表形式 ↔ 自由記述モードを UI で切り替え可能 (往復可能)
- [ ] 各ステップ (対応タイプのみ) に `outputBinding` 欄があり、JSON に保存される
- [ ] 自由テキストフィールドで `@` 押下時、そのステップまでに定義された変数 + アクション入力の補完ポップアップが出る
- [ ] 共通処理ステップで `refId` を選択すると、呼び先の `inputs` が展開されて引数マッピングを指定できる
- [ ] 既存 4 画面 (画面一覧 / テーブル一覧 / 処理フロー一覧 / テーブル定義) は引き続き動作する
- [ ] Vitest で主要ケース (変換、補完、マッピング) が検証されている
- [ ] Playwright で入出力表形式 / `@` 補完 / 引数マッピングの基本動作が検証されている
- [ ] docs/spec/process-flow-variables.md (本書) の仕様と実装が逐条一致する

## 9. スコープ外 (将来検討)

- 実行時の型検査 / 厳密な型整合性チェック
- 列型の自動推論 (SELECT 結果列から型を自動生成)
- 変数のスコープリーク検査 (ループ外から中の変数参照を強制禁止)
- `@` 補完のドット記法候補 (オブジェクトのフィールド候補)
- 変数のリネーム・リファクタリング機能
- 式言語の構文検証 (+、==、>、AND 等)

## 10. 関連仕様

- `docs/spec/process-flow-maturity.md` — 成熟度・曖昧さ管理 (並行策定中)
- `docs/spec/process-flow-extensions.md` — Phase B 以降のスキーマ拡張 (HTTP 契約 / TX / outcome / Saga / runIf / ReturnStep / ComputeStep 等 15 種)
- `designer/src/types/action.ts` — 現状の型定義

## 11. 変更履歴

- 2026-04-20: 初版ドラフト。ドッグフード結果 (別 AI セッション実装依頼) に基づき策定
