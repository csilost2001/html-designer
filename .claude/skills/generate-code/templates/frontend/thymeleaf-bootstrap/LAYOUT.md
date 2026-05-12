# Thymeleaf + Bootstrap — PageLayout テンプレート

PageLayout JSON (`page-layouts/<id>.json`) から Thymeleaf passive layout HTML を生成する。
`techStack.designer.cssFramework = "bootstrap"` の前提。生成先: `src/main/resources/templates/layouts/<pageLayoutId>.html`

**参照スキル**: SKILL.md の Step 3-D に対応。

---

## フィールドマッピング

| PageLayout JSON フィールド | Thymeleaf 出力 |
|---|---|
| `id` | ファイル名 `layouts/<id>.html`、HTML コメントで `<!-- PageLayout: <id> -->` |
| `name` | HTML コメントで `<!-- name: <name> -->` |
| `regions[].name` | region slot タグ (`<nav>` / `<aside>` / `<main>` / `<footer>`) の識別子 |
| `assignments["header"]` | `<div th:replace="~{fragments/<gadgetId> :: gadget}"></div>` (header region 内) |
| `assignments["sidebar"]` | `<div th:replace="~{fragments/<gadgetId> :: gadget}"></div>` (aside region 内) |
| `assignments["footer"]` | `<div th:replace="~{fragments/<gadgetId> :: gadget}"></div>` (footer region 内) |
| `assignments["main"]` | main region は assignment 不要。各 page の body-content fragment を inject する slot |
| `design.cssFramework="bootstrap"` | Bootstrap クラス規約を適用 (下記 Bootstrap region 規約参照) |
| `design.designFileRef` | コード生成時は HTML 構造のみ採用 (wireframe ヒントとして参照するが出力に含めない) |

### assignments が未指定の region の扱い

`assignments` に `regionId` が存在しない region は **空のプレースホルダ** として出力する:

```html
<!-- region: <name> — 未割り当て (assignments に "<name>" なし) -->
<!-- 必要に応じて Gadget を割り当ててください -->
```

main region は常に assignment なし (`assignments` にキーがあっても無視) — page の content を inject する予約 slot。

---

## Bootstrap region 規約

全テンプレート (LAYOUT.md / FRAGMENT.md / PAGE.md) で一貫して使用する Bootstrap クラス:

| region | HTML タグ | Bootstrap クラス |
|---|---|---|
| `header` | `<nav>` | `navbar navbar-expand bg-primary navbar-dark px-3` |
| `sidebar` | `<aside>` | `col-md-3 col-lg-2 bg-light p-3 border-end` |
| `main` | `<main>` | `col p-4` |
| `footer` | `<footer>` | `text-center bg-light py-3 border-top mt-auto` |

全体構造:
- `<body class="d-flex flex-column min-vh-100">` — flexbox による縦全画面レイアウト
- main + sidebar は `<div class="container-fluid flex-grow-1"><div class="row h-100">...</div></div>` の row で並列配置

---

## Thymeleaf Layout Dialect 依存

本テンプレートは **Thymeleaf Layout Dialect** (`nz.net.ultraq.thymeleaf:thymeleaf-layout-dialect`) を使用する。

```
// build.gradle に追加 (Phase D で実機ビルド時に確認)
implementation 'nz.net.ultraq.thymeleaf:thymeleaf-layout-dialect:3.3.0'
```

主要な Dialect 要素:

| Dialect 記法 | 役割 |
|---|---|
| `layout:fragment="layout-content"` | layout 側で page content を受け取る slot を定義 |
| `th:replace="${content}"` | 渡された fragment 変数を展開 (標準 Thymeleaf) |
| Page 側での `th:replace="~{layouts/<id> :: layout-content(content=~{::body-content})}"` | page が layout に content を渡す |

---

## 完成テンプレート HTML 例

**対象**: `examples/retail/harmony/page-layouts/17595b62-fef1-4b22-9c25-16736c772567.json` (Main Layout)
- regions: header / sidebar / footer / main
- assignments: header → `68709449-c9e1-47db-a351-ac9c12a19046` (グローバルヘッダ) / sidebar → `c1cff7da-1057-4ba1-b780-2d021f6c8679` (ナビゲーションサイドバー) / footer → `f7daa764-4015-4ad7-8f0a-142944ea2038` (グローバルフッタ)
- main は assignment なし (各 page が body-content を inject)

```html
<!DOCTYPE html>
<html xmlns:th="http://www.thymeleaf.org"
      xmlns:layout="http://www.ultraq.net.nz/thymeleaf/layout"
      lang="ja">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <!-- title は page 側が上書き可能 (th:title または th:replace で) -->
  <title th:text="${pageTitle != null} ? ${pageTitle} : 'システム'">システム</title>
  <!-- Bootstrap 5.3 CDN (本番は static 配置を推奨) -->
  <link rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css"/>
</head>
<body class="d-flex flex-column min-vh-100">

  <!--
    PageLayout: 17595b62-fef1-4b22-9c25-16736c772567
    name: Main Layout
    regions: header, sidebar, footer, main
  -->

  <!-- region: header (assignment → グローバルヘッダ gadget) -->
  <nav class="navbar navbar-expand bg-primary navbar-dark px-3">
    <div th:replace="~{fragments/68709449-c9e1-47db-a351-ac9c12a19046 :: gadget}"></div>
  </nav>

  <!-- main コンテンツエリア (sidebar + main を横並び) -->
  <div class="container-fluid flex-grow-1">
    <div class="row h-100">

      <!-- region: sidebar (assignment → ナビゲーションサイドバー gadget) -->
      <aside class="col-md-3 col-lg-2 bg-light p-3 border-end">
        <div th:replace="~{fragments/c1cff7da-1057-4ba1-b780-2d021f6c8679 :: gadget}"></div>
      </aside>

      <!-- region: main (各 page の body-content fragment を inject する slot) -->
      <main class="col p-4" th:fragment="layout-content(content)">
        <th:block th:replace="${content}"></th:block>
      </main>

    </div>
  </div>

  <!-- region: footer (assignment → グローバルフッタ gadget) -->
  <footer class="text-center bg-light py-3 border-top mt-auto">
    <div th:replace="~{fragments/f7daa764-4015-4ad7-8f0a-142944ea2038 :: gadget}"></div>
  </footer>

  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
```

---

## AI コード生成時の置換ルール

上記テンプレートを生成する際、AI は以下の `<<...>>` placeholder を PageLayout JSON の実値で置換する:

| placeholder | 置換値 |
|---|---|
| `<<pageLayoutId>>` | `PageLayout.id` |
| `<<pageLayoutName>>` | `PageLayout.name` |
| `<<regionNames>>` | `regions[].name` をカンマ区切り |
| `<<headerGadgetId>>` | `assignments["header"]` の gadget ID |
| `<<sidebarGadgetId>>` | `assignments["sidebar"]` の gadget ID |
| `<<footerGadgetId>>` | `assignments["footer"]` の gadget ID |

### region が一部未割り当ての場合

`assignments` に未指定の region は対応する HTML タグをプレースホルダコメントに置き換える。例として sidebar が未割り当ての場合:

```html
<!-- region: sidebar — 未割り当て (assignments に "sidebar" なし) -->
<!-- 必要に応じて Gadget を割り当ててください -->
```

main region の `th:fragment="layout-content(content)"` は assignments に関わらず **常に出力**する (page content の inject 先であるため)。

---

## 生成ファイル一覧

```
<出力先>/
  src/main/resources/templates/layouts/
    <pageLayoutId>.html        (Thymeleaf passive layout)
```

---

## Placeholder 解釈ルール (AI コード生成時必読)

本テンプレートでは **`<<...>>`** を AI が値で置換する placeholder として使用する。
Thymeleaf の `th:replace="~{...}"` 式内の `<<...>>` は必ず実際の gadget ID に置換してから出力すること。
`<<...>>` のまま Thymeleaf テンプレートに出力してはならない。

| テンプレート記法 | 置換後の出力例 |
|---|---|
| `fragments/<<headerGadgetId>> :: gadget` | `fragments/68709449-c9e1-47db-a351-ac9c12a19046 :: gadget` |
| `layouts/<<pageLayoutId>>` | `layouts/17595b62-fef1-4b22-9c25-16736c772567` |
