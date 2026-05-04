# CSS フレームワーク切替対応 (#793) — 仕様書

`examples/<project-id>/` 単位で CSS フレームワーク (Bootstrap / Tailwind / Vanilla 等) を選択可能にする framework 中規模再設計の仕様書。

## 関連

- メタ ISSUE: [#793](https://github.com/csilost2001/html-designer/issues/793)
- 動機: 設計書 = 画面仕様書という核心思想に対し、現状は Bootstrap class が blocks.ts にハードコードされ Bootstrap 固定の見た目しか出せない実装負債がある
- 議論履歴: 設計者と Opus のセッション (2026-05-04)

---

## 1. 背景

### 1.1 現状の構造的乖離

**設計意図 (CSS 変数 + テーマ層を持つ抽象化)**:

`designer/src/styles/common.css:1-7`:

```css
/* common.css — 業務システム向け共通スタイル
   - Bootstrap 5 と共存可能（独自セマンティッククラスのみ）  ← 設計意図
*/
:root {
  --app-label-width: 130px;
  --app-label-bg: #f1f3f5;
  ...
}
```

`designer/src/components/Designer.tsx:88-93` で `THEME_URLS` 経由で iframe にテーマ CSS を注入する仕組み実装済 (standard / card / compact / dark)。

**実装の負債 (Bootstrap class ハードコード)**:

`designer/src/grapes/blocks.ts:36-43`:

```ts
const textInput = (ph = "") =>
  `<input type="text" class="form-control form-control-sm" placeholder="${ph}">`;
```

1034 行のうち 50 箇所以上が Bootstrap class を直接埋め込み。テーマで CSS を上書きしても `form-control` 等の Bootstrap class は HTML 内に残り続けるため、Tailwind に切り替えても効かない。

### 1.2 目的の確認 — α (見た目) であって β (DX) ではない

設計者との議論で確認:

- **α**: 見た目だけ Tailwind 風 (近年の SaaS 風モダンな見た目) — **本仕様の目的**
- **β**: Tailwind の utility-first 開発体験 (responsive prefix / arbitrary value / utility class 直書き) — **本仕様の目的外**

β を真に得るには GrapesJS 自体を別ツール (Webstudio / Pinegrow Tailwind) に置き換える話になり、本フレームワークの根本見直しが必要。本仕様は GrapesJS WYSIWYG 思想を維持したまま α を達成する。

### 1.3 切替タイミング

設計者との議論で確認:

- **project 作成時に CSS フレームワークを固定** (途中切替は非サポート)
- 切替可能性を担保するための抽象化コストは高い (margin/padding/shadow/border の defaults が theme 間で微妙に異なる)
- 案件単位で CSS フレームワークが決まっている (React 案件 = Tailwind / Thymeleaf 案件 = Bootstrap) のが現実

## 2. 設計概要

### 2.1 アーキテクチャ

```
┌─────────────────────────────────────────────────────────┐
│ blocks.ts (60+ → 15-20 個に絞り込み、AI 自動追加排除)   │
│   ↓ 出力 HTML                                           │
│ class="btn btn-primary"  ← semantic class のみ          │
│ class="card"  / class="form-control"  / etc.            │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ project.json:                                            │
│   design.cssFramework: "bootstrap" | "tailwind"          │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Designer.tsx — canvas iframe に project の framework CSS │
│ を読み込む                                               │
│                                                          │
│  bootstrap → theme-bootstrap.css                         │
│  tailwind  → theme-tailwind.css                          │
└─────────────────────────────────────────────────────────┘
                          ↓
                 [WYSIWYG 描画]
```

### 2.2 semantic class 一覧 (案)

`blocks.ts` 出力に使う semantic class を定義する。具体的な class 名は実装フェーズ (子 3) で確定するが、原則は Bootstrap class 名を踏襲 (Bootstrap が広く知られた semantic class 命名規則のため):

| カテゴリ | semantic class 例 |
|---|---|
| レイアウト | `container`, `row`, `col` (`col-1` ... `col-12`) |
| 見出し | `h1` `h2` `h3` `h4` |
| テキスト | `text-muted`, `text-center`, `text-end`, `small` |
| ボタン | `btn`, `btn-primary`, `btn-secondary`, `btn-danger`, `btn-sm`, `btn-lg` |
| フォーム | `form-control`, `form-control-sm`, `form-select`, `form-label`, `form-check`, `form-check-input` |
| カード | `card`, `card-body`, `card-header`, `card-footer`, `card-title` |
| ナビ | `navbar`, `navbar-brand`, `nav`, `nav-item` |
| バッジ/アラート | `badge`, `alert`, `alert-info`, `alert-warning` |
| テーブル | `table`, `table-striped`, `table-hover` |
| ユーティリティ最低限 | `mb-*` `mt-*` `gap-*` `d-flex` `justify-content-*` (rem ベース、Bootstrap 互換) |

→ Bootstrap class 名と同一にすることで `theme-bootstrap.css` は **既存 Bootstrap CSS を直接利用** で済む (再定義不要)。`theme-tailwind.css` 側で `@apply` で同 class を Tailwind utility にマップする。

### 2.3 theme CSS 構造

`designer/src/styles/themes/` (新規ディレクトリ) に:

- `theme-bootstrap.css` — Bootstrap 5 の CSS をそのまま import + project 固有上書き
- `theme-tailwind.css` — Tailwind の `@apply` で semantic class を utility class にマップ

**theme-bootstrap.css 雛形**:

```css
@import "bootstrap/dist/css/bootstrap.min.css";
@import "../common.css";  /* 既存の common.css は Bootstrap 互換のため流用可 */
@import "../theme-card.css";  /* 既存の card variant (任意) */
```

**theme-tailwind.css 雛形**:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer components {
  .btn {
    @apply inline-flex items-center justify-center px-4 py-2 rounded font-medium transition-colors;
  }
  .btn-primary {
    @apply bg-blue-600 text-white hover:bg-blue-700;
  }
  .btn-secondary {
    @apply bg-gray-200 text-gray-900 hover:bg-gray-300;
  }
  .card {
    @apply bg-white rounded-lg shadow-md border-0;
  }
  .card-body {
    @apply p-4;
  }
  .form-control {
    @apply block w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500;
  }
  /* ... */
}
```

詳細マッピングは子 4 で確定。

### 2.4 project.json schema 拡張 (子 2)

`schemas/v3/project.v3.schema.json` に optional field 追加:

```json
{
  "type": "object",
  "properties": {
    "$schema": { "type": "string" },
    "schemaVersion": { ... },
    "meta": { ... },
    "extensionsApplied": { ... },
    "entities": { ... },
    "design": {
      "type": "object",
      "additionalProperties": false,
      "description": "デザイン関連設定。CSS フレームワーク選択等。",
      "properties": {
        "cssFramework": {
          "type": "string",
          "enum": ["bootstrap", "tailwind"],
          "default": "bootstrap",
          "description": "画面デザイナー canvas + 最終実装で使用する CSS フレームワーク。project 作成時に固定し、途中切替は非サポート (#793)。"
        }
      }
    }
  }
}
```

省略時は `"bootstrap"` 扱い。**既存 3 サンプル (retail / realestate / english-learning) は明示的に `cssFramework: "bootstrap"` を追加** (子 6)。

### 2.5 Designer.tsx の theme ロード機構変更 (子 5)

現状 (`designer/src/components/Designer.tsx:88-112`):

```ts
const THEME_URLS: Record<ThemeId, string | null> = {
  standard: null,  // = Bootstrap default (canvas iframe で別途読み込み)
  card: new URL("../styles/theme-card.css", import.meta.url).href,
  compact: new URL("../styles/theme-compact.css", import.meta.url).href,
  dark: new URL("../styles/theme-dark.css", import.meta.url).href,
};
```

これは「Bootstrap 上書き variant」の仕組み。本仕様の cssFramework 選択は別軸:

```ts
const FRAMEWORK_URLS: Record<CssFramework, string> = {
  bootstrap: new URL("../styles/themes/theme-bootstrap.css", import.meta.url).href,
  tailwind: new URL("../styles/themes/theme-tailwind.css", import.meta.url).href,
};
```

canvas iframe には `project.design.cssFramework` に応じて FRAMEWORK_URLS を読み込み、その上に従来の variant CSS (card / compact / dark) を上書きで載せる 2 層構造とする (詳細は子 5 で確定)。

## 3. 実装ロードマップ (子 1-7)

| 子 | 内容 | 担当想定 | 想定 PR | 依存 |
|---|---|---|---|---|
| 子 1 (本 PR) | 仕様書 (`docs/spec/css-framework-switching.md`) | Opus | 本 PR | なし |
| 子 2 | schema 変更 (`project.v3.schema.json` に `design.cssFramework`) | 設計者承認後 Sonnet | 1 PR | 子 1 |
| 子 3 | `blocks.ts` を semantic class 出力に全面書き換え + ブロック数 60+ → 15-20 削減 | Sonnet | 1 PR | 子 1 |
| 子 4 | `theme-bootstrap.css` + `theme-tailwind.css` 新規作成 | Sonnet | 1 PR | 子 1, 子 3 |
| 子 5 | `Designer.tsx` theme ロード機構を `project.design.cssFramework` 対応 | Sonnet | 1 PR | 子 2, 子 4 |
| 子 6 | 既存 3 サンプル (retail / realestate / english-learning) の `project.json` に `cssFramework: "bootstrap"` 追加 + regression test | Sonnet | 1 PR | 子 2 |
| 子 7 | E2E + AJV + dogfood (Tailwind theme で新規 sample 1 件作成) | Opus | 1 PR | 子 1-6 全て |

子 2 (schema 変更) は **設計者承認済み** (#793 ISSUE 上で 2026-05-04 承認、本仕様書ベースに schema 変更可)。

子間で同根の派生 ISSUE が出た場合は AGENTS.md 鉄則 3 に従い 1 ISSUE に統合。

## 4. ブロック絞り込み方針 (子 3)

### 4.1 削減原則

現状 60+ ブロックは AI が次々追加した蓄積で、業務特化複合ブロックを含む。**設計者意図ではなく AI の自動追加** が大半。

絞り込み方針:

- **必要最低限の汎用部品** に絞る (15-20 個目安)
- 業務特化複合 (検索バー / データリスト等) は 4 個程度残す
- それ以外は **Custom Block (`customBlockStore`)** で運用に任せる

### 4.2 残すブロック (案)

| カテゴリ | ブロック | 必要性 |
|---|---|---|
| レイアウト | container / row / col / heading / paragraph / link | 必須 |
| フォーム | input / select / textarea / checkbox / radio / button | 必須 |
| データ表示 | table / image / icon | 必須 |
| 業務複合 | form-field-set / search-bar / data-list / pagination | 高頻度 |

合計 15-19 個程度。

### 4.3 削除候補

`blocks.ts` の以下カテゴリ群は基本削除 (Custom Block で代替可能):

- `CAT_PAGE` (ページテンプレート) — Custom Block で各案件に最適化
- `CAT_NAVI` (ナビゲーション) — 案件依存性が高い
- `CAT_DETAIL` (詳細表示) — レイアウト + フィールドの組合せで作る
- `CAT_COMPOUND` (複合フィールド) — 多様すぎ、Custom Block で

実際の取捨選択は子 3 で確定。

## 5. 自由デザイン経路の維持

Open Code (生 HTML 貼り付け) / Custom Block / Style Manager / 顧客提供デザイン HTML / AI 生成 HTML 貼り付け は **すべて維持**。これらは GrapesJS 本体の機能で、本仕様変更は影響しない。

「自由デザインで `class="flex p-4 bg-blue-500..."` のような Tailwind utility class が直接埋め込まれる」場合の運用方針:

- **再利用するものは semantic class 化** (theme CSS で定義)
- **1 回限りのユニークセクションは utility class 直書きで OK** (theme 切替時に崩れるが、project 作成時 framework 固定なら実害なし)

## 6. 受け入れ基準

- [ ] `schemas/v3/project.v3.schema.json` に `design.cssFramework` field 追加
- [ ] `designer/src/grapes/blocks.ts` から Bootstrap class ハードコード排除 (semantic class のみ出力)
- [ ] ブロック数 60+ → 15-20 個程度に絞り込み
- [ ] `designer/src/styles/themes/theme-bootstrap.css` + `theme-tailwind.css` 新規作成
- [ ] `Designer.tsx` が `project.design.cssFramework` を読み取り、対応 theme CSS を canvas iframe に注入
- [ ] 既存 3 サンプル (retail / realestate / english-learning) で `cssFramework: "bootstrap"` 設定後、regression なし (vitest / Playwright 全 pass)
- [ ] 新規 Tailwind sample 1 件で視覚的に Tailwind 風の見た目が出ることを確認
- [ ] dogfood report (`docs/spec/dogfood-2026-05-XX-css-framework.md`) 作成

## 7. リスク / 懸念

### 7.1 既存 3 サンプルへの影響

- `cssFramework: "bootstrap"` 明示追加だけで動作継続するはず
- ただし `blocks.ts` を semantic class 化すると、既存 sample の HTML が Bootstrap class を使い続ける限り、新規追加要素のスタイルが揃わない懸念
- 対策: 既存 sample の HTML はそのまま (regression なし)、新規追加要素のみ semantic class で出力。**Bootstrap class と semantic class は同一名** なので theme-bootstrap.css 配下では両方が同じ見た目になる

### 7.2 Tailwind theme で `@apply` の限界

Tailwind の `@apply` は静的 CSS 化なので、responsive prefix (`md:` `lg:`) や hover state は CSS 側で全部書く必要があり、HTML class に utility prefix を埋め込む β 体験は得られない (本仕様の目的外)。

### 7.3 既存 4 テーマ (standard / card / compact / dark) との関係

現状の `theme-card.css` / `theme-compact.css` / `theme-dark.css` は Bootstrap 上書き variant。本仕様の cssFramework 選択は別軸:

- bootstrap framework × standard / card / compact / dark variant
- tailwind framework × standard / card / compact / dark variant (各々で再実装が必要)

子 5 で 2 軸対応実装。MVP では tailwind framework は standard variant のみ実装、card / compact / dark は子 7 以降の future work。

## 8. 関連 memory

- `feedback_schema_governance_strict.md` (#511) — schema 変更は設計者承認必須、本仕様で承認済
- `feedback_consolidate_related_proposals_into_one_issue.md` — 子間の派生提案は同 ISSUE 統合
