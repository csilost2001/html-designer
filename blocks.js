/* ==========================================================================
   blocks.js — GrapesJS 用カスタムブロック定義
   業務システム向け標準部品セット（Bootstrap 5 + common.css 前提）
   使い方:
     const editor = grapesjs.init({ ... });
     registerAppBlocks(editor);
   ========================================================================== */
(function (global) {
  "use strict";

  const CAT_FORM = "フォーム";
  const CAT_LIST = "検索・一覧";
  const CAT_LAYOUT = "レイアウト";

  // ---- 部品テンプレート生成ヘルパ ----
  const field = (label, inner, opts = {}) => `
    <div class="form-field${opts.full ? " full-width" : ""}">
      <div class="field-label${opts.required ? " required" : ""}">${label}</div>
      <div class="field-value">${inner}</div>
    </div>`;

  const row = (cols, inner) => `<div class="form-row col-${cols}">${inner}</div>`;

  const section = (title, bodyHtml) => `
    <div class="form-section">
      <div class="form-section-title">${title}</div>
      <div class="form-section-body">${bodyHtml}</div>
    </div>`;

  const textInput = (name = "value") =>
    `<input type="text" class="form-control form-control-sm" name="${name}">`;
  const numberInput = (name = "num") =>
    `<input type="number" class="form-control form-control-sm" name="${name}">`;
  const dateInput = (name = "date") =>
    `<input type="date" class="form-control form-control-sm" name="${name}">`;
  const selectInput = (name = "sel") =>
    `<select class="form-select form-select-sm" name="${name}">
       <option value="">（選択してください）</option>
       <option value="1">項目1</option>
       <option value="2">項目2</option>
     </select>`;
  const radioGroup = (name = "radio") =>
    `<div class="radio-group">
       <label><input type="radio" name="${name}" value="1"> 選択1</label>
       <label><input type="radio" name="${name}" value="2"> 選択2</label>
       <label><input type="radio" name="${name}" value="3"> 選択3</label>
     </div>`;
  const checkGroup = (name = "chk") =>
    `<div class="check-group">
       <label><input type="checkbox" name="${name}" value="1"> 項目1</label>
       <label><input type="checkbox" name="${name}" value="2"> 項目2</label>
       <label><input type="checkbox" name="${name}" value="3"> 項目3</label>
     </div>`;
  const textareaInput = (name = "memo") =>
    `<textarea class="form-control form-control-sm" name="${name}" rows="3"></textarea>`;
  const fileUpload = (name = "files") => `
    <div class="file-upload">
      <label class="drop-zone">
        <i class="bi bi-cloud-upload"></i>
        ファイルをドラッグ&ドロップ または クリックして選択
        <input type="file" name="${name}" multiple hidden>
      </label>
      <ul class="file-list"></ul>
    </div>`;

  // ---- ブロック定義 ----
  const BLOCKS = [
    // ===== フォーム =====
    {
      id: "section-header",
      label: "セクションヘッダー",
      category: CAT_FORM,
      content: section("［セクション名］", row(1, field("項目名", textInput()))),
    },
    {
      id: "row-1col",
      label: "1カラム行",
      category: CAT_FORM,
      content: row(1, field("項目名", textInput())),
    },
    {
      id: "row-2col",
      label: "2カラム行",
      category: CAT_FORM,
      content: row(2, field("項目1", textInput()) + field("項目2", textInput())),
    },
    {
      id: "row-3col",
      label: "3カラム行",
      category: CAT_FORM,
      content: row(
        3,
        field("項目1", textInput()) + field("項目2", textInput()) + field("項目3", textInput())
      ),
    },
    {
      id: "row-4col",
      label: "4カラム行",
      category: CAT_FORM,
      content: row(
        4,
        field("項目1", textInput()) +
          field("項目2", textInput()) +
          field("項目3", textInput()) +
          field("項目4", textInput())
      ),
    },
    {
      id: "row-text",
      label: "テキスト行",
      category: CAT_FORM,
      content: row(1, field("テキスト", textInput())),
    },
    {
      id: "row-number",
      label: "数値行",
      category: CAT_FORM,
      content: row(1, field("数値", numberInput())),
    },
    {
      id: "row-date",
      label: "日付行",
      category: CAT_FORM,
      content: row(1, field("日付", dateInput())),
    },
    {
      id: "row-select",
      label: "セレクト行",
      category: CAT_FORM,
      content: row(1, field("選択", selectInput())),
    },
    {
      id: "row-radio",
      label: "ラジオ行",
      category: CAT_FORM,
      content: row(1, field("ラジオ", radioGroup())),
    },
    {
      id: "row-checkbox",
      label: "チェックボックス行",
      category: CAT_FORM,
      content: row(1, field("チェック", checkGroup())),
    },
    {
      id: "row-textarea",
      label: "テキストエリア行",
      category: CAT_FORM,
      content: row(1, field("備考", textareaInput(), { full: true })),
    },
    {
      id: "row-file",
      label: "ファイルアップロード行",
      category: CAT_FORM,
      content: row(1, field("添付ファイル", fileUpload(), { full: true })),
    },

    // ===== 検索・一覧 =====
    {
      id: "search-area",
      label: "検索条件エリア",
      category: CAT_LIST,
      content: `
        <div class="search-area">
          <div class="search-fields">
            <div class="search-field"><label>コード</label>${textInput("code")}</div>
            <div class="search-field"><label>名称</label>${textInput("name")}</div>
            <div class="search-field"><label>ステータス</label>${selectInput("status")}</div>
          </div>
          <div class="search-buttons">
            <button type="button" class="btn btn-secondary btn-sm">クリア</button>
            <button type="button" class="btn btn-primary btn-sm">検索</button>
          </div>
        </div>`,
    },
    {
      id: "data-table",
      label: "データテーブル",
      category: CAT_LIST,
      content: `
        <div class="data-table-wrap">
          <div class="data-table-toolbar">
            <span>件数: <strong>0</strong></span>
            <span class="spacer"></span>
            <button type="button" class="btn btn-outline-secondary btn-sm">
              <i class="bi bi-download"></i> CSV出力
            </button>
          </div>
          <table class="data-table">
            <thead>
              <tr>
                <th class="sortable sort-asc">コード</th>
                <th class="sortable">名称</th>
                <th class="sortable">ステータス</th>
                <th class="sortable">登録日</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>C0001</td>
                <td>サンプル</td>
                <td><span class="status-badge status-active">有効</span></td>
                <td>2026-04-01</td>
              </tr>
            </tbody>
          </table>
          <div class="paging-area">
            <span class="paging-count">1 - 1 / 1 件</span>
            <span class="spacer"></span>
            <nav><ul class="pagination pagination-sm mb-0">
              <li class="page-item disabled"><a class="page-link" href="#">&laquo;</a></li>
              <li class="page-item active"><a class="page-link" href="#">1</a></li>
              <li class="page-item disabled"><a class="page-link" href="#">&raquo;</a></li>
            </ul></nav>
          </div>
        </div>`,
    },
    {
      id: "paging-area",
      label: "ページングエリア",
      category: CAT_LIST,
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

    // ===== レイアウト =====
    {
      id: "page-header",
      label: "ページヘッダー",
      category: CAT_LAYOUT,
      content: `
        <div class="page-header">
          <h1 class="page-title">ページタイトル</h1>
          <nav class="breadcrumb-area">ホーム &gt; 一覧 &gt; 詳細</nav>
        </div>`,
    },
    {
      id: "form-footer",
      label: "フォームフッター",
      category: CAT_LAYOUT,
      content: `
        <div class="form-footer">
          <button type="button" class="btn btn-outline-danger">削除</button>
          <span class="spacer"></span>
          <button type="button" class="btn btn-outline-secondary">戻る</button>
          <button type="reset" class="btn btn-outline-secondary">リセット</button>
          <button type="submit" class="btn btn-primary">登録</button>
        </div>`,
    },
    {
      id: "sidebar-layout",
      label: "サイドバー付きレイアウト",
      category: CAT_LAYOUT,
      content: `
        <div class="app-shell">
          <header class="app-header">
            <h1 class="app-title">システム名</h1>
          </header>
          <div class="app-body">
            <aside class="app-sidebar">
              <ul>
                <li><a href="#" class="active">メニュー1</a></li>
                <li><a href="#">メニュー2</a></li>
                <li><a href="#">メニュー3</a></li>
              </ul>
            </aside>
            <main class="app-main">
              <div class="page-header">
                <h1 class="page-title">ページタイトル</h1>
                <nav class="breadcrumb-area">ホーム &gt; ページ</nav>
              </div>
            </main>
          </div>
        </div>`,
    },
    {
      id: "modal-dialog",
      label: "モーダルダイアログ",
      category: CAT_LAYOUT,
      content: `
        <div class="modal fade show" style="display:block;position:relative;" tabindex="-1">
          <div class="modal-dialog">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title">確認</h5>
                <button type="button" class="btn-close"></button>
              </div>
              <div class="modal-body">
                <p>メッセージ本文</p>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary">キャンセル</button>
                <button type="button" class="btn btn-primary">OK</button>
              </div>
            </div>
          </div>
        </div>`,
    },
    {
      id: "tab-container",
      label: "タブコンテナ",
      category: CAT_LAYOUT,
      content: `
        <div>
          <ul class="nav nav-tabs" role="tablist">
            <li class="nav-item"><a class="nav-link active" href="#">タブ1</a></li>
            <li class="nav-item"><a class="nav-link" href="#">タブ2</a></li>
            <li class="nav-item"><a class="nav-link" href="#">タブ3</a></li>
          </ul>
          <div class="tab-content p-3 border border-top-0">
            <p>タブ1のコンテンツ</p>
          </div>
        </div>`,
    },
  ];

  function registerAppBlocks(editor) {
    if (!editor || !editor.BlockManager) {
      console.error("registerAppBlocks: GrapesJS editor is required");
      return;
    }
    const bm = editor.BlockManager;
    BLOCKS.forEach((b) => {
      bm.add(b.id, {
        label: b.label,
        category: b.category,
        content: b.content,
        media: `<svg viewBox="0 0 24 24" width="24" height="24"><rect x="3" y="5" width="18" height="14" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`,
      });
    });
  }

  global.registerAppBlocks = registerAppBlocks;
  global.APP_BLOCKS = BLOCKS;
})(typeof window !== "undefined" ? window : globalThis);
