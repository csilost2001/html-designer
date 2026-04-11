import type { Editor, BlockProperties } from "grapesjs";

/* ==========================================================================
   ブロックカタログ — 業務システム向け標準部品
   階層:
     1. フィールド型バリエーション（ラベル+入力のセット、1項目単位）
     2. レイアウト行（1〜4カラム、セクション見出し）
     3. 検索・一覧部品
     4. 共通レイアウト部品
   ========================================================================== */

const CAT_LAYOUT = "レイアウト";
const CAT_FIELD = "フィールド";
const CAT_COMPOUND = "複合フィールド";
const CAT_LIST = "検索・一覧";
const CAT_COMMON = "共通パーツ";

// ---- HTML テンプレートヘルパ ----
const field = (
  label: string,
  inner: string,
  opts: { full?: boolean; required?: boolean } = {}
) => `
  <div class="form-field${opts.full ? " full-width" : ""}">
    <div class="field-label${opts.required ? " required" : ""}">${label}</div>
    <div class="field-value">${inner}</div>
  </div>`.trim();

const row = (cols: 1 | 2 | 3 | 4, inner: string) =>
  `<div class="form-row fcol-${cols}">${inner}</div>`;

const textInput = (ph = "") =>
  `<input type="text" class="form-control form-control-sm" placeholder="${ph}">`;
const numberInput = () =>
  `<input type="number" class="form-control form-control-sm">`;
const dateInput = () =>
  `<input type="date" class="form-control form-control-sm">`;
const selectInput = () => `
  <select class="form-select form-select-sm">
    <option value="">（選択してください）</option>
    <option>選択肢1</option>
    <option>選択肢2</option>
    <option>選択肢3</option>
  </select>`;

// ---- アイコン（media） ----
const icon = (name: string) =>
  `<i class="bi bi-${name}" style="font-size:20px"></i>`;

// ---- ブロック定義 ----
export const appBlocks: (BlockProperties & { id: string })[] = [
  // ==========================================================================
  // レイアウト（行コンテナ）
  // ==========================================================================
  {
    id: "section-header",
    label: "セクション見出し",
    category: CAT_LAYOUT,
    media: icon("bookmark-fill"),
    content: `
      <div class="form-section">
        <div class="form-section-title">［セクション名］</div>
        <div class="form-section-body"></div>
      </div>`,
  },
  {
    id: "row-1col",
    label: "1カラム行",
    category: CAT_LAYOUT,
    media: icon("square"),
    content: row(1, field("項目名", textInput())),
  },
  {
    id: "row-2col",
    label: "2カラム行",
    category: CAT_LAYOUT,
    media: icon("layout-split"),
    content: row(2, field("項目1", textInput()) + field("項目2", textInput())),
  },
  {
    id: "row-3col",
    label: "3カラム行",
    category: CAT_LAYOUT,
    media: icon("grid-3x2"),
    content: row(
      3,
      field("項目1", textInput()) +
        field("項目2", textInput()) +
        field("項目3", textInput())
    ),
  },
  {
    id: "row-4col",
    label: "4カラム行",
    category: CAT_LAYOUT,
    media: icon("grid"),
    content: row(
      4,
      field("項目1", textInput()) +
        field("項目2", textInput()) +
        field("項目3", textInput()) +
        field("項目4", textInput())
    ),
  },

  // ==========================================================================
  // フィールド（1行 = form-row fcol-1 に包んで単体配置可能）
  // ==========================================================================
  {
    id: "field-text",
    label: "テキスト",
    category: CAT_FIELD,
    media: icon("input-cursor-text"),
    content: row(1, field("テキスト", textInput())),
  },
  {
    id: "field-kana",
    label: "フリガナ",
    category: CAT_FIELD,
    media: icon("fonts"),
    content: row(1, field("フリガナ", textInput("カタカナ"))),
  },
  {
    id: "field-email",
    label: "メール",
    category: CAT_FIELD,
    media: icon("envelope"),
    content: row(1, field(
      "メール",
      `<input type="email" class="form-control form-control-sm" placeholder="name@example.com">`
    )),
  },
  {
    id: "field-tel",
    label: "電話",
    category: CAT_FIELD,
    media: icon("telephone"),
    content: row(1, field(
      "電話",
      `<input type="tel" class="form-control form-control-sm" placeholder="00-0000-0000">`
    )),
  },
  {
    id: "field-url",
    label: "URL",
    category: CAT_FIELD,
    media: icon("link-45deg"),
    content: row(1, field(
      "URL",
      `<input type="url" class="form-control form-control-sm" placeholder="https://">`
    )),
  },
  {
    id: "field-password",
    label: "パスワード",
    category: CAT_FIELD,
    media: icon("key"),
    content: row(1, field(
      "パスワード",
      `<input type="password" class="form-control form-control-sm">`
    )),
  },
  {
    id: "field-number",
    label: "数値",
    category: CAT_FIELD,
    media: icon("123"),
    content: row(1, field("数値", numberInput())),
  },
  {
    id: "field-money",
    label: "金額",
    category: CAT_FIELD,
    media: icon("currency-yen"),
    content: row(1, field("金額", `${numberInput()}<span>円</span>`)),
  },
  {
    id: "field-percent",
    label: "パーセント",
    category: CAT_FIELD,
    media: icon("percent"),
    content: row(1, field("割合", `${numberInput()}<span>%</span>`)),
  },
  {
    id: "field-date",
    label: "日付",
    category: CAT_FIELD,
    media: icon("calendar"),
    content: row(1, field("日付", dateInput())),
  },
  {
    id: "field-datetime",
    label: "日時",
    category: CAT_FIELD,
    media: icon("calendar-event"),
    content: row(1, field(
      "日時",
      `<input type="datetime-local" class="form-control form-control-sm">`
    )),
  },
  {
    id: "field-time",
    label: "時刻",
    category: CAT_FIELD,
    media: icon("clock"),
    content: row(1, field(
      "時刻",
      `<input type="time" class="form-control form-control-sm">`
    )),
  },
  {
    id: "field-select",
    label: "セレクト",
    category: CAT_FIELD,
    media: icon("menu-button-wide"),
    content: row(1, field("選択", selectInput())),
  },
  {
    id: "field-radio",
    label: "ラジオ",
    category: CAT_FIELD,
    media: icon("ui-radios"),
    content: row(1, field(
      "選択",
      `<div class="radio-group">
        <label><input type="radio" name="r1"> 選択1</label>
        <label><input type="radio" name="r1"> 選択2</label>
        <label><input type="radio" name="r1"> 選択3</label>
      </div>`
    )),
  },
  {
    id: "field-checkbox",
    label: "チェックボックス",
    category: CAT_FIELD,
    media: icon("ui-checks"),
    content: row(1, field(
      "チェック",
      `<div class="check-group">
        <label><input type="checkbox"> 項目1</label>
        <label><input type="checkbox"> 項目2</label>
        <label><input type="checkbox"> 項目3</label>
      </div>`
    )),
  },
  {
    id: "field-switch",
    label: "スイッチ",
    category: CAT_FIELD,
    media: icon("toggle-on"),
    content: row(1, field(
      "有効",
      `<div class="form-check form-switch">
        <input class="form-check-input" type="checkbox" role="switch">
      </div>`
    )),
  },
  {
    id: "field-textarea",
    label: "テキストエリア",
    category: CAT_FIELD,
    media: icon("textarea-resize"),
    content: row(1, field(
      "備考",
      `<textarea class="form-control form-control-sm" rows="3"></textarea>`,
      { full: true }
    )),
  },
  {
    id: "field-file",
    label: "ファイル",
    category: CAT_FIELD,
    media: icon("cloud-upload"),
    content: row(1, field(
      "添付",
      `<div class="file-upload">
        <label class="drop-zone">
          <i class="bi bi-cloud-upload"></i>
          ドラッグ&ドロップ または クリック
          <input type="file" multiple hidden>
        </label>
        <ul class="file-list"></ul>
      </div>`,
      { full: true }
    )),
  },

  // ==========================================================================
  // 複合フィールド（定番セット）
  // ==========================================================================
  {
    id: "compound-postal",
    label: "郵便番号+住所検索",
    category: CAT_COMPOUND,
    media: icon("geo-alt"),
    content: row(1, field(
      "郵便番号",
      `<input type="text" class="form-control form-control-sm" placeholder="000-0000" style="max-width:130px">
       <button type="button" class="btn btn-outline-secondary btn-sm">住所検索</button>`
    )),
  },
  {
    id: "compound-lookup",
    label: "コード+名称ルックアップ",
    category: CAT_COMPOUND,
    media: icon("search"),
    content: row(1, field(
      "コード",
      `<input type="text" class="form-control form-control-sm" style="max-width:120px" placeholder="コード">
       <button type="button" class="btn btn-outline-secondary btn-sm"><i class="bi bi-search"></i></button>
       <input type="text" class="form-control form-control-sm" placeholder="名称" readonly>`
    )),
  },
  {
    id: "compound-date-range",
    label: "日付範囲",
    category: CAT_COMPOUND,
    media: icon("calendar-range"),
    content: row(1, field(
      "期間",
      `${dateInput()}<span>〜</span>${dateInput()}`
    )),
  },
  {
    id: "compound-quantity-price",
    label: "単価×数量=金額",
    category: CAT_COMPOUND,
    media: icon("calculator"),
    content: row(1, field(
      "単価/数量",
      `<input type="number" class="form-control form-control-sm" placeholder="単価">
       <span>×</span>
       <input type="number" class="form-control form-control-sm" placeholder="数量">
       <span>=</span>
       <input type="number" class="form-control form-control-sm" placeholder="金額" readonly>`
    )),
  },
  {
    id: "compound-name-kana",
    label: "氏名+フリガナ",
    category: CAT_COMPOUND,
    media: icon("person"),
    content: row(
      2,
      field("氏名", textInput(), { required: true }) +
        field("フリガナ", textInput("カタカナ"))
    ),
  },

  // ==========================================================================
  // 検索・一覧
  // ==========================================================================
  {
    id: "search-area",
    label: "検索条件エリア",
    category: CAT_LIST,
    media: icon("funnel"),
    content: `
      <div class="search-area">
        <div class="search-fields">
          <div class="search-field">
            <label>コード</label>
            <input type="text" class="form-control form-control-sm" style="width:140px">
          </div>
          <div class="search-field">
            <label>名称</label>
            <input type="text" class="form-control form-control-sm" style="width:200px">
          </div>
          <div class="search-field">
            <label>ステータス</label>
            <select class="form-select form-select-sm" style="width:140px">
              <option value="">全て</option>
              <option>有効</option>
              <option>無効</option>
            </select>
          </div>
        </div>
        <div class="search-buttons">
          <button type="button" class="btn btn-outline-secondary btn-sm"><i class="bi bi-x-circle"></i> クリア</button>
          <button type="button" class="btn btn-primary btn-sm"><i class="bi bi-search"></i> 検索</button>
        </div>
      </div>`,
  },
  {
    id: "data-table",
    label: "データテーブル",
    category: CAT_LIST,
    media: icon("table"),
    content: `
      <div class="data-table-wrap">
        <div class="data-table-toolbar">
          <span>件数: <strong>0</strong></span>
          <span class="spacer"></span>
          <button type="button" class="btn btn-outline-success btn-sm"><i class="bi bi-plus-lg"></i> 新規</button>
          <button type="button" class="btn btn-outline-secondary btn-sm"><i class="bi bi-download"></i> CSV</button>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th class="sortable sort-asc">コード</th>
              <th class="sortable">名称</th>
              <th class="sortable">ステータス</th>
              <th class="sortable num">登録日</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>C0001</td><td>サンプル</td>
              <td><span class="status-badge status-active">有効</span></td>
              <td class="num">2026-04-01</td>
            </tr>
          </tbody>
        </table>
        <div class="paging-area">
          <span class="paging-count">1 - 1 / 1 件</span>
          <span class="spacer"></span>
          <nav><ul class="pagination pagination-sm mb-0">
            <li class="page-item active"><a class="page-link" href="#">1</a></li>
          </ul></nav>
        </div>
      </div>`,
  },
  {
    id: "paging",
    label: "ページング",
    category: CAT_LIST,
    media: icon("three-dots"),
    content: `
      <div class="paging-area">
        <span class="paging-count">1 - 20 / 100 件</span>
        <span class="spacer"></span>
        <nav><ul class="pagination pagination-sm mb-0">
          <li class="page-item"><a class="page-link" href="#">&laquo;</a></li>
          <li class="page-item active"><a class="page-link" href="#">1</a></li>
          <li class="page-item"><a class="page-link" href="#">2</a></li>
          <li class="page-item"><a class="page-link" href="#">3</a></li>
          <li class="page-item"><a class="page-link" href="#">&raquo;</a></li>
        </ul></nav>
      </div>`,
  },
  {
    id: "status-badge",
    label: "ステータスバッジ",
    category: CAT_LIST,
    media: icon("tag"),
    content: `<span class="status-badge status-active">有効</span>`,
  },

  // ==========================================================================
  // 共通パーツ
  // ==========================================================================
  {
    id: "page-header",
    label: "ページヘッダー",
    category: CAT_COMMON,
    media: icon("type-h1"),
    content: `
      <div class="page-header">
        <h1 class="page-title">ページタイトル</h1>
        <nav class="breadcrumb-area">ホーム &gt; 一覧 &gt; 詳細</nav>
      </div>`,
  },
  {
    id: "form-footer",
    label: "フォームフッター",
    category: CAT_COMMON,
    media: icon("layout-text-window-reverse"),
    content: `
      <div class="form-footer" style="position:static;box-shadow:none">
        <button type="button" class="btn btn-outline-danger"><i class="bi bi-trash"></i> 削除</button>
        <span class="spacer"></span>
        <button type="button" class="btn btn-outline-secondary"><i class="bi bi-arrow-left"></i> 戻る</button>
        <button type="reset" class="btn btn-outline-secondary"><i class="bi bi-arrow-counterclockwise"></i> リセット</button>
        <button type="submit" class="btn btn-primary"><i class="bi bi-check-lg"></i> 登録</button>
      </div>`,
  },
  {
    id: "tab-container",
    label: "タブ",
    category: CAT_COMMON,
    media: icon("segmented-nav"),
    content: `
      <div>
        <ul class="nav nav-tabs" role="tablist">
          <li class="nav-item"><a class="nav-link active" href="#">タブ1</a></li>
          <li class="nav-item"><a class="nav-link" href="#">タブ2</a></li>
          <li class="nav-item"><a class="nav-link" href="#">タブ3</a></li>
        </ul>
        <div class="tab-content p-3 border border-top-0">
          <p>タブコンテンツ</p>
        </div>
      </div>`,
  },
  {
    id: "button-primary",
    label: "ボタン（Primary）",
    category: CAT_COMMON,
    media: icon("square-fill"),
    content: `<button type="button" class="btn btn-primary btn-sm">ボタン</button>`,
  },
  {
    id: "button-secondary",
    label: "ボタン（Secondary）",
    category: CAT_COMMON,
    media: icon("square"),
    content: `<button type="button" class="btn btn-outline-secondary btn-sm">ボタン</button>`,
  },
];

export function registerBlocks(editor: Editor) {
  const bm = editor.BlockManager;
  appBlocks.forEach(({ id, ...props }) => bm.add(id, props));
}
