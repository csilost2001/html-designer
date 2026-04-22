# 画面項目定義 (Screen Items)

**ステータス**: ドラフト v0.1 (仕様策定中)
**策定開始**: 2026-04-22
**関連 issue**: #318

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
  /** 備考 */
  description?: string;
}

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
- ActionEditor の入出力テーブルに「画面項目から追加」ボタン + `ScreenItemPickerModal`
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

**要決定**:
- \[ \] 処理フロー inputs の従来 `required` / `description` 等との共存方法 (参照優先 / 上書き可 等)
- \[ \] 画面なしフロー (batch / scheduled) での `screenItemRef` 無しケースの扱い

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
| `name` | `field_<UUID先頭8文字>` | 未設定の場合のみ |
| `id` | name と同じ値 | 未設定の場合のみ |

**実装**: `designer/src/grapes/dataItemId.ts` の `ensureFormFieldIdentity()` が `component:add` イベントで呼ばれる。  
**既存属性は絶対に上書きしない** (ユーザーが手で付けた name を壊さない)。  
`button` / `submit` / `reset` / `hidden` / `image` 型は対象外。

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

## 対象外 (本 spec v1.0 の範囲外)

- 動的依存 (フィールド A の値に応じて B の required が変わる 等) は `visibleWhen` / `enabledWhen` 式で最低限対応。より高度な依存ロジック表現は将来
- 多言語化 (`label` の i18n) は将来
- カスタムバリデータ (任意の JS 式) は処理フロー側で
- マスタ連動 (`options` がテーブル参照) は後続 issue

---

## レビュー観点

この v0.1 ドラフトで特に確認してほしい点:

1. **論点 (A) の ScreenItem スキーマは十分か** — 不足フィールド / 過剰フィールドがないか
2. **論点 (B) の screenItemRef 方式は妥当か** — 処理フロー側の既存 `inputs` との整合
3. **論点 (C) の規約参照は自然か** — `@conv.*` を画面項目から参照する UX
4. **論点 (E-1) 独立タブ案で問題ないか** — GrapesJS サイドバーでのインライン編集は MVP から外してよいか
5. **命名 "画面項目定義" / "screen-items" / "ScreenItem"** — 用語の妥当性
