# 画面項目定義 (Screen Items)

**ステータス**: v1.1 (凍結)
**策定開始**: 2026-04-22
**凍結日 v1.0**: 2026-04-23
**更新 v1.1**: 2026-04-24 — 出力項目の `displayFormat` / `valueFrom` 追加 (#377)
**関連 issue**: #318 #354 #377

本書は画面項目定義 (画面 UI のフォーム項目に宣言的にバリデーション・ラベル・表示制御を紐付ける設計書) の仕様を定める。

## 位置づけ

バリデーションは 3 層構造 (#315 / #317 を経て確定):

| 層 | 担当 | 実装ステータス |
|---|---|---|
| **画面項目定義** (本書) | フォーム UI 関心事: 必須 / 長さ / フォーマット / エラーメッセージ | 未実装 (本書で策定) |
| **処理フロー** | 業務ロジック検証 (一意性 / 存在性 / 状態遷移) | 実装済 (#261 で 5/5 到達) |
| **横断規約** | 正規表現 / メッセージ / 制限値の再利用ライブラリ | 実装済 (#317 で UI 編集化) |

**境界のガイドライン**:
- フィールド単体で完結する制約 → 画面項目定義 (例: `required` / `maxLength` / `pattern`)
- 他フィールド・他レコードを跨ぐ検証 → 処理フロー (例: `unique(users, email)` / `stateTransition(from, to)`)
- 再利用可能な定数・テンプレート → 規約カタログ (例: `@conv.regex.phone-jp`)

## 論点と提案

以下 5 つの論点について叩き台の提案を示す。ユーザーレビューで合意後、v1.0 として凍結する。

---

### (A) データモデル

#### (A-1) ファイル配置: 画面ごとに独立 or 画面ファイル同梱

**案 A-1a 独立ファイル (推奨)**: `data/screen-items/{screenId}.json` を別ファイルに
- ✅ 画面デザインと粒度を揃えて CRUD しやすい
- ✅ 既存の `data/screens/{id}.json` (GrapesJS 生データ) は触らず追加だけで済む
- ✅ wsBridge で `loadScreenItems` / `saveScreenItems` ハンドラを対称に追加できる

**案 A-1b 画面同梱**: `data/screens/{id}.json` に `items[]` を追加
- 1 ファイルで完結するがファイルが肥大 + GrapesJS 生データとの責務混在
- ❌ 不採用

→ **(A-1a) 独立ファイル案**

#### (A-2) 項目 1 件のスキーマ

```typescript
interface ScreenItem {
  /** 業務識別子 (実装コードのフィールド名 / API キー, e.g. userName, postalCode).
   *  GrapesJS data-item-id と #331 以降で一致させる想定 (#330 で name から改称). */
  id: string;
  /** 日本語表示名 (ラベル、エラーメッセージの {label} に使われる) */
  label: string;
  /** 型 (処理フロー FieldType と同一、datalist + 自由入力) */
  type: FieldType;  // "string" | "number" | "boolean" | "date" | { kind: "custom", label: string }
  /** フォーム制御 */
  required?: boolean;
  readonly?: boolean;
  disabled?: boolean;
  /** 文字列系制約 */
  minLength?: number;
  maxLength?: number;
  /** 正規表現 (規約参照 @conv.regex.* または直接パターン) */
  pattern?: string;
  /** 数値系制約 */
  min?: number;
  max?: number;
  step?: number;
  /** 選択系 */
  options?: Array<{ value: string; label: string }>;
  /** 規定値・プレースホルダ・ヘルプ */
  defaultValue?: string | number | boolean;
  placeholder?: string;
  helperText?: string;
  /** エラーメッセージ (規約参照推奨) */
  errorMessages?: {
    required?: string;       // "@conv.msg.required" 推奨
    maxLength?: string;      // "@conv.msg.maxLength"
    invalidFormat?: string;  // "@conv.msg.invalidFormat"
    outOfRange?: string;     // "@conv.msg.outOfRange"
    [code: string]: string | undefined;
  };
  /** 表示制御 (式言語、docs/spec/process-flow-expression-language.md と共有) */
  visibleWhen?: string;
  enabledWhen?: string;
  /** 画面上での役割 (デフォルト: "input") */
  direction?: "input" | "output";
  /** 表示書式 (direction="output" 専用, 例: "YYYY/MM/DD", "¥#,##0") — #377 */
  displayFormat?: string;
  /** バインド元 (direction="output" 専用) — #377 */
  valueFrom?: ValueSource;
  /** 備考 */
  description?: string;
}

/**
 * 出力項目のバインド元 (4 種別) — #377
 */
type ValueSource =
  | { kind: "flowVariable"; processFlowId?: string; variableName: string }
  | { kind: "tableColumn"; tableName: string; columnName: string }   // tableName は物理名
  | { kind: "viewColumn"; viewName: string; columnName: string }     // viewName は物理名
  | { kind: "expression"; expression: string };

interface ScreenItemsFile {
  $schema?: string;
  screenId: string;
  version: string;  // SemVer
  updatedAt: string;
  items: ScreenItem[];
}
```

**決定済み** (#330):
- `ScreenItem.name` は廃止。`id` が業務識別子 (実装コードのフィールド名) を兼ねる。
- `ScreenItem.id` (旧 UUID 識別子) は廃止。業務識別子を直接 id とする。
- `options` のようなマスタ依存項目 → **MVP は静的、後続でテーブル参照サポート**

---

### (B) 処理フローとの関係 — **#321 で実装着手**

処理フローの `inputs: StructuredField[]` と画面項目定義は重複する可能性がある。どう整合するか。

**✅ 採用: 案 B-1 処理フロー inputs が画面項目を参照** (PR #321 で実装):
- `StructuredField.screenItemRef?: { screenId: string; itemId: string }` を追加
- ProcessFlowEditor の入出力テーブルに「画面項目から追加」ボタン + `ScreenItemPickerModal`
- 参照時は ScreenItem から name/label/type/required/description を一回コピー (一方向)
- 参照解除ボタンで `screenItemRef` のみ削除、フィールドは残る
- **TODO (別 issue)**: 参照整合性バリデータ (UNKNOWN_SCREEN_ITEM)、参照後の画面項目更新を自動反映する双方向同期

(以降の代替案は履歴として残す)

**案 B-1 処理フロー inputs が画面項目を参照 (推奨)**:
```json
{
  "action": {
    "name": "登録",
    "inputs": [
      { "name": "email", "screenItemRef": "screen-login/email" }
    ]
  }
}
```
- 画面項目定義が正本、処理フロー側は参照のみ
- 画面項目で `required` / `maxLength` が定義されていれば処理フロー側は再宣言不要
- ✅ 二重管理を避けられる

**案 B-2 処理フロー inputs が画面項目と独立**: 従来通り
- シンプルだが drift 発生

→ **(B-1) 参照方式**

**決定済み** (#354):

- **[x] 処理フロー inputs の `required` / `description` 等との共存方法**:
  - ScreenItem が正本 (source of truth)。ProcessFlow inputs 側の同名フィールドは「参照時の一回コピー」として保持する。
  - `screenItemRef` が存在する場合、AI 実装コード生成時は ScreenItem の値を優先参照する。
  - ProcessFlow inputs 側のフィールド値が ScreenItem と異なる場合は「意図的な上書き」として扱い、AI が判断する。
  - ScreenItem が更新されても ProcessFlow inputs は自動同期しない (一方向コピーのまま)。差異の解決は実装時に AI が行う。

- **[x] 画面なしフロー (batch / scheduled) での `screenItemRef` 無しケースの扱い**:
  - `screenItemRef` の省略が正常ケース。バッチ・定時実行・イベント駆動などの画面なしフローでは `screenItemRef` を使用しない。
  - `screenItemRef` は任意フィールドであり省略が正常。lint/バリデータは `screenItemRef` の有無を問わない。

---

### (C) 規約カタログ連携

画面項目定義から `@conv.regex.*` / `@conv.msg.*` / `@conv.limit.*` を参照可能にする。

- `pattern`: 直接パターン or `@conv.regex.phone-jp` 参照
- `errorMessages.required`: `@conv.msg.required` 参照 (既定)
- `maxLength`: 直接数値 or `@conv.limit.nameMax` 参照

→ **#317 で追加した規約カタログを UI の datalist で補完**。画面項目エディタ側で `@conv.` typing 時に候補表示。これは画面項目編集 UI (別 issue) のタスク。

---

### (D) フレームワーク中立 → 実装展開

画面項目定義は**抽象的制約**のみ記述し、具象フレームワークコードには触れない。実装時に AI (Claude Code) が `docs/conventions/product-scope.md` のターゲットスタック宣言を読んで展開する。

| ターゲット | 展開例 (`required + maxLength: 100`) |
|---|---|
| SpringBoot (Bean Validation) | `@NotBlank @Size(max = 100)` アノテーション |
| React Hook Form + Zod | `z.string().min(1).max(100)` |
| Next.js Server Action | action 関数内で Zod validate → `{errors: {...}}` 返却 |

**要決定**:
- \[ \] `product-scope.md` に stack 宣言セクション (JSON 化 or markdown 構造化) を追加するか → **本 issue 範囲外、別 issue で**

---

### (E) 画面デザイナーとの UX 統合

#### (E-1) 編集画面の位置

**案 E-1a 独立タブ (推奨)**: `/screen/items/:screenId` で専用タブ
- 画面デザイナー (GrapesJS) とは別の一覧ビューで、1 項目 1 行テーブル形式 (規約カタログ UI と類似)
- GrapesJS 側で選択した要素の `data-item-id` が自動でハイライト / ジャンプ
- ✅ 一覧操作 (ソート / 一括編集) がしやすい
- ✅ 既存の singleton/per-resource タブ運用と整合

**案 E-1b インライン編集**: GrapesJS サイドバーで要素選択時に項目定義を出す
- 文脈的にはクリアだが、一覧操作がしにくい
- E-1a と両立可能 (後続で追加)

→ **MVP は (E-1a) 独立タブ、後続で (E-1b) も追加**

#### (E-2) GrapesJS ブロック配置時の属性自動入力 (#328 で実装済み)

GrapesJS で `input` / `select` / `textarea` ブロックを **drop したとき**に、以下の属性を自動付与する:

| 属性 | 値 | 条件 |
|---|---|---|
| `data-item-id` | 新規 UUID | 未設定の場合のみ |
| `name` | 種別+連番形式 (`textInput1`, `select2` 等) | 未設定の場合のみ。editor あり時 (#331 以降) |
| `name` | `field_<UUID先頭8文字>` | 未設定の場合のみ。editor なし時 (フォールバック) |
| `id` | name と同じ値 | 未設定の場合のみ |

**実装**: `designer/src/grapes/dataItemId.ts` の `ensureFormFieldIdentity()` が `component:add` イベントで呼ばれる。  
**既存属性は絶対に上書きしない** (ユーザーが手で付けた name を壊さない)。  
`button` / `submit` / `reset` / `hidden` / `image` 型は対象外。  
種別+連番の prefix は `getItemIdPrefix(cmp)` で決定 (#331)。`isAutoGeneratedId(id)` が true の ID のみ上書き対象 (#333)。

#### (E-3) 既存画面からの移行

既存の `data/screens/{id}.json` には `data-item-id` が無い。migration:
- 画面を初めて編集するときに、既存ブロックから `name="email"` 等の属性を拾って自動で項目エントリを生成する提案 UI を出す
- ユーザーがラベルや required を埋めれば項目化完了

→ **migration は MVP で「空リストから手動追加」のみ、自動抽出は後続 issue**

---

## 実装の段階分割 (v1.0 確定後の後続 issue 候補)

1. **画面項目スキーマ + ストレージ + Backend** (projectStorage / wsBridge / Store)
2. **画面項目エディタ UI** (ScreenItemsView、ルーティング、HeaderMenu 配線)
3. **処理フロー inputs から screenItemRef 参照対応**
4. **GrapesJS ブロックとの `data-item-id` 紐付け + 選択連動**
5. **既存画面からの自動項目抽出 migration**
6. **実装コード生成 (Claude Code による Bean Validation / Zod 展開)**

MVP は 1-2-3 まで。4-5-6 は段階的に。

---

## ID リネーム時の参照追従仕様 (#332)

### 背景

画面項目 `id` は処理フローの `inputs[].screenItemRef.itemId` から参照される。
`id` を変更する場合、参照先が切れないよう **project 内の全処理フローを同時に書き換える** 必要がある。

### リネーム操作の仕様

| 項目 | 内容 |
|------|------|
| MCP ツール | `designer__rename_screen_item` (screenId / oldId / newId) |
| 確認ツール | `designer__check_screen_item_refs` (screenId / itemId) — 影響件数を dry-run で返す |
| 書き換え対象 | ① screen-items JSON の `items[].id`、② 画面 HTML の `name` / `id` 属性、③ 全処理フローの `screenItemRef.itemId` |
| 原子性 | ③ 処理フローは個別ファイルを逐次更新 (トランザクションなし。部分失敗時は再実行で冪等) |

### UI フロー

1. 画面項目定義画面で ID 欄を編集してフォーカスを外す
2. 変更前 ID への処理フロー参照が存在する場合: 確認ダイアログを表示
   - 追従される処理フロー名・件数を明示
   - 「リネーム実行」→ バックエンドが①②③を更新し、各コンポーネントへ broadcast
   - 「キャンセル」→ 入力を元の値に戻す
3. 参照なし: そのままコミット (ダイアログなし)

### バリデーション

| ルール | 結果 |
|--------|------|
| `newId` が空 | エラー: リネーム不可 |
| `newId` が無効な JS 識別子 (英字/_/$始まり、英数字/_/$のみ) | エラー: リネーム不可 |
| `newId` が同じ画面内の別 id と衝突 | エラー: リネーム不可 |
| `newId` が JS 予約語 (`let` / `const` 等) | 警告 (リネームは実行される) |
| `oldId` が存在しない | エラー |

### 参照走査の対象フィールド

- `ProcessFlow.actions[].inputs[].screenItemRef`
- `ProcessFlow.actions[].outputs[].screenItemRef`
- 上記のネスト (サブステップ / loop / branch 内) も再帰走査

### 対象外

- 処理フロー変数 (`@inputs.xxx` 形式の文字列参照) の rename → 後続 issue
- 一括リネーム (複数 id 同時変更) → リセット機能 issue で対応
- `label` フィールドは参照キーでないため rename refactoring 不要

---

## AI 推論による画面項目 ID 再命名 (#335)

### 背景

自動生成 ID (`textInput1`, `field_69f9561e` 等) を業務的に意味のある名前 (`userName`, `postalCode`) にするには LLM 推論が必要。API LLM を使わず **Claude Code の呼び出し元モデルが MCP tool 経由で推論・書き戻す** 方式を採る。

### 自動生成 ID の判定 (`isAutoGeneratedId`)

| パターン | 例 | 扱い |
|---|---|---|
| `field_[0-9a-f]{8}` | `field_69f9561e` | 自動生成 (上書き可) |
| `<prefix><数字>` | `textInput1`, `select3` | 自動生成 (上書き可) |
| それ以外 | `userName`, `postalCode` | 命名済み (保護) |

判定ロジックは `designer/src/utils/screenItemNaming.ts` (#333) が正本。`designer-mcp` は独立パッケージのため `renameContext.ts` に複製して保持。

### MCP tool 仕様

#### `designer__get_rename_context`

- **入力**: `screenId: string`
- **出力**: `GetRenameContextResult`
  ```typescript
  interface GetRenameContextResult {
    screenId: string;
    unnamedItems: Array<{
      id: string;           // 現在の自動生成 ID
      type: string;         // screen-items の FieldType
      label?: string;       // screen-items のラベル
      placeholder?: string; // screen-items のプレースホルダー
      htmlFragment: string; // 周辺 HTML 断片 (前後 ~500/200 文字)
      headingContext: string[]; // 直前の見出し/legend テキスト (最大 3 件)
    }>;
    namedCount: number;     // 命名済み項目数 (参考)
  }
  ```
- **ロジック**: `isAutoGeneratedId(id)` が true の項目のみ返す。命名済みは含めない。

#### `designer__apply_rename_mapping`

- **入力**: `screenId: string`, `mapping: Record<string, string>` (`{oldId: newId}`)
- **出力**: `ApplyRenameMappingResult`
  ```typescript
  interface ApplyRenameMappingResult {
    screenId: string;
    succeeded: Array<{
      oldId: string; newId: string;
      screenHtmlUpdated: boolean;
      processFlowsUpdated: string[];
      refsRenamed: number;
      warnings: string[];
    }>;
    failed: Array<{ oldId: string; newId: string; error: string }>;
  }
  ```
- **ロジック**: 各エントリに対して `designer__rename_screen_item` を順次実行。1 件の失敗は後続を止めない。

### 命名規則 (呼び出し元プロンプトに含める)

- **形式**: camelCase / 英数字のみ / JS 予約語禁止 / 30 字以内
- **優先順位**: 画面の見出し → ラベル → placeholder → htmlFragment の順で文脈を参照
- **業務名の例**: `userName`, `postalCode`, `loginId`, `emailAddress`
- **推論不能な場合**: 自動採番形式 (`textInput1` 等) を維持 (無理に命名しない)

### 呼び出しフロー

```
呼び出し元 (Claude Code / skill / ボタン)
  1. get_rename_context(screenId) → unnamedItems
  2. 各 item を LLM で推論 → {oldId: newId} mapping 生成
  3. ユーザーに提示 → 確認
  4. apply_rename_mapping(screenId, mapping) → 結果報告
```

---

## 対象外 (本 spec v1.0 の範囲外)

- 動的依存 (フィールド A の値に応じて B の required が変わる 等) は `visibleWhen` / `enabledWhen` 式で最低限対応。より高度な依存ロジック表現は将来
- 多言語化 (`label` の i18n) は将来
- カスタムバリデータ (任意の JS 式) は処理フロー側で
- マスタ連動 (`options` がテーブル参照) は後続 issue

---

## 決定事項 (v1.0 確定内容)

### (A) データモデル
- **A-1**: 独立ファイル方式 (`data/screen-items/{screenId}.json`) を採用
- **A-2**: `ScreenItem` スキーマは上記の通り。`direction?: "input" | "output"` を追加 (#359 連動)
- **A-3 (v1.1)**: `displayFormat?: string` / `valueFrom?: ValueSource` を追加 (#377)。`direction="output"` のときのみ使用。
  - `displayFormat`: 自由記述 + datalist 補完 (日付 / 数値 / 金額 / パーセント プリセット)
  - `valueFrom`: `flowVariable` / `tableColumn` / `viewColumn` / `expression` の 4 種別。入力項目 (`direction="input"` または未設定) ではエディタに表示されない
- `name` は廃止、`id` が業務識別子を兼ねる (#330)

### (B) 処理フローとの関係
- **B-1**: 参照方式を採用 (`screenItemRef`) (#321)
- **共存ルール**: ScreenItem が正本。ProcessFlow inputs は一回コピー (一方向)。AI 実装時は ScreenItem 優先
- **画面なしフロー**: `screenItemRef` 省略が正常。バリデータは有無を問わない

### (C) 規約カタログ連携
- `@conv.regex.*` / `@conv.msg.*` / `@conv.limit.*` 参照可能
- 画面項目編集 UI で `@conv.` prefix 入力時に候補補完 (別 issue)

### (D) フレームワーク中立 → 実装展開
- 抽象制約のみ記述。`product-scope.md` stack 宣言は別 issue

### (E) 画面デザイナーとの UX 統合
- **E-1**: 独立タブ `/screen/items/:screenId` を MVP。GrapesJS インライン編集は後続
- **E-2**: ブロック配置時の `data-item-id` 自動付与 (#328 実装済み)
- **E-2b (canvas 双方向同期)**: ブロック drop → screen-items 自動追加、ブロック削除 → screen-items 自動削除。ロード後の reconcile で canvas と全件突合する。
  - **制約**: 「先に画面項目を定義してから canvas に配置する」ワークフローは、ロード後の reconcile で定義が削除される。データ損失を避けるには、先にブロックを配置してから項目を編集すること。
- **E-3**: 既存画面 migration は「空リストから手動追加」のみ。自動抽出は後続
