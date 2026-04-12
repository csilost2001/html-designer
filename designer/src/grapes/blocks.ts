import type { Editor, BlockProperties } from "grapesjs";

/* ==========================================================================
   ブロックカタログ — 業務システム向け標準部品
   階層:
     1. フィールド型バリエーション（ラベル+入力のセット、1項目単位）
     2. レイアウト行（1〜4カラム、セクション見出し）
     3. 検索・一覧部品
     4. 共通レイアウト部品
   ========================================================================== */

const CAT_PAGE   = "ページテンプレート";
const CAT_NAVI   = "ナビゲーション";
const CAT_DETAIL = "詳細表示";
const CAT_LAYOUT = "レイアウト";
const CAT_FIELD  = "フィールド";
const CAT_COMPOUND = "複合フィールド";
const CAT_LIST   = "検索・一覧";
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
  // ページテンプレート（キャンバス全体に1つ置く完成画面）
  // ==========================================================================
  {
    id: "page-login",
    label: "ログインページ",
    category: CAT_PAGE,
    media: icon("box-arrow-in-right"),
    content: `
<div style="min-height:100vh;background:#f0f4ff;display:flex;align-items:center;justify-content:center">
  <div style="width:100%;max-width:400px;padding:16px">
    <div class="card shadow">
      <div class="card-body p-4">
        <div class="text-center mb-4">
          <div style="width:56px;height:56px;background:#6366f1;border-radius:12px;display:inline-flex;align-items:center;justify-content:center">
            <i class="bi bi-building text-white fs-4"></i>
          </div>
          <h5 class="mt-3 mb-0 fw-bold">システム名</h5>
          <small class="text-muted">System Name</small>
        </div>
        <div class="mb-3">
          <label class="form-label fw-medium small">ユーザーID</label>
          <div class="input-group">
            <span class="input-group-text"><i class="bi bi-person"></i></span>
            <input type="text" class="form-control" placeholder="ユーザーIDを入力">
          </div>
        </div>
        <div class="mb-4">
          <label class="form-label fw-medium small">パスワード</label>
          <div class="input-group">
            <span class="input-group-text"><i class="bi bi-lock"></i></span>
            <input type="password" class="form-control" placeholder="パスワードを入力">
          </div>
        </div>
        <div class="d-grid">
          <button class="btn btn-primary btn-lg">ログイン</button>
        </div>
        <div class="text-center mt-3">
          <a href="#" class="text-decoration-none small text-muted">パスワードを忘れた方はこちら</a>
        </div>
      </div>
    </div>
    <p class="text-center text-muted small mt-3">© 2026 システム名</p>
  </div>
</div>`.trim(),
  },
  {
    id: "page-confirm-delete",
    label: "削除確認ページ",
    category: CAT_PAGE,
    media: icon("exclamation-triangle-fill"),
    content: `
<div style="min-height:100vh;background:#f8fafc;display:flex;align-items:center;justify-content:center">
  <div style="width:100%;max-width:480px;padding:16px">
    <div class="card border-0 shadow">
      <div class="card-body p-4">
        <div class="text-center mb-4">
          <div style="width:64px;height:64px;background:#fef2f2;border-radius:50%;display:inline-flex;align-items:center;justify-content:center">
            <i class="bi bi-exclamation-triangle-fill text-danger fs-3"></i>
          </div>
          <h5 class="mt-3 mb-1 fw-bold">削除の確認</h5>
          <p class="text-muted small">この操作は取り消しできません</p>
        </div>
        <div class="alert alert-danger border-0 mb-4">
          <div class="d-flex align-items-center gap-2 mb-2">
            <i class="bi bi-person-fill text-danger"></i>
            <span class="fw-bold">対象データ名（ID）</span>
          </div>
          <ul class="mb-0 small ps-3">
            <li>データがすべて削除されます</li>
            <li>この操作は元に戻すことができません</li>
          </ul>
        </div>
        <div class="mb-4">
          <label class="form-label small fw-medium">確認のため「削除」と入力してください</label>
          <input type="text" class="form-control" placeholder="削除">
        </div>
        <div class="d-grid gap-2">
          <button class="btn btn-danger"><i class="bi bi-trash me-1"></i>削除を実行する</button>
          <button class="btn btn-outline-secondary">キャンセル</button>
        </div>
      </div>
    </div>
  </div>
</div>`.trim(),
  },
  {
    id: "page-complete",
    label: "処理完了ページ",
    category: CAT_PAGE,
    media: icon("check-circle-fill"),
    content: `
<div style="min-height:100vh;background:#f0fdf4;display:flex;align-items:center;justify-content:center">
  <div style="width:100%;max-width:480px;padding:16px">
    <div class="card border-0 shadow">
      <div class="card-body p-5 text-center">
        <div style="width:72px;height:72px;background:#dcfce7;border-radius:50%;display:inline-flex;align-items:center;justify-content:center" class="mb-4">
          <i class="bi bi-check-lg text-success" style="font-size:2rem"></i>
        </div>
        <h4 class="fw-bold mb-2">処理が完了しました</h4>
        <p class="text-muted mb-4">操作は正常に完了しました。</p>
        <div class="card bg-light border-0 text-start mb-4">
          <div class="card-body py-3 px-4">
            <div class="row g-2">
              <div class="col-5 small text-muted">処理内容</div>
              <div class="col-7 small fw-medium">登録</div>
              <div class="col-5 small text-muted">対象</div>
              <div class="col-7 small fw-medium">対象データ名</div>
              <div class="col-5 small text-muted">処理日時</div>
              <div class="col-7 small">2026-01-01 00:00:00</div>
            </div>
          </div>
        </div>
        <div class="d-grid gap-2">
          <button class="btn btn-primary"><i class="bi bi-list-ul me-1"></i>一覧に戻る</button>
          <button class="btn btn-outline-secondary btn-sm"><i class="bi bi-house me-1"></i>メインメニューへ</button>
        </div>
      </div>
    </div>
  </div>
</div>`.trim(),
  },

  // ==========================================================================
  // ナビゲーション
  // ==========================================================================
  {
    id: "navbar-app",
    label: "アプリナビバー",
    category: CAT_NAVI,
    media: icon("layout-text-window"),
    content: `
<nav class="navbar navbar-dark px-3" style="background:#6366f1">
  <div class="d-flex align-items-center gap-2">
    <div style="width:32px;height:32px;background:rgba(255,255,255,0.2);border-radius:8px;display:flex;align-items:center;justify-content:center">
      <i class="bi bi-building text-white"></i>
    </div>
    <span class="navbar-brand mb-0 fw-bold">システム名</span>
  </div>
  <div class="d-flex align-items-center gap-2">
    <span class="text-white small"><i class="bi bi-person-circle me-1"></i>ユーザー名 様</span>
    <button class="btn btn-sm btn-outline-light">ログアウト</button>
  </div>
</nav>`.trim(),
  },
  {
    id: "navbar-simple",
    label: "ナビバー（シンプル）",
    category: CAT_NAVI,
    media: icon("layout-text-window-reverse"),
    content: `
<nav class="navbar navbar-dark px-3 py-2" style="background:#6366f1">
  <span class="navbar-brand mb-0 fw-bold small"><i class="bi bi-building me-2"></i>システム名</span>
  <span class="text-white small">ユーザー名 様</span>
</nav>`.trim(),
  },
  {
    id: "menu-card-grid",
    label: "メニューカードグリッド（4枚）",
    category: CAT_NAVI,
    media: icon("grid-fill"),
    content: `
<div class="container mt-4">
  <p class="text-muted small mb-4">操作する機能を選択してください</p>
  <div class="row g-3">
    <div class="col-md-6">
      <div class="card border-0 shadow-sm h-100" style="cursor:pointer">
        <div class="card-body p-4">
          <div class="d-flex align-items-center gap-3">
            <div style="width:48px;height:48px;background:#eff6ff;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <i class="bi bi-people-fill text-primary fs-4"></i>
            </div>
            <div>
              <h6 class="mb-0 fw-bold">メニュー項目1</h6>
              <small class="text-muted">説明文をここに記入</small>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="col-md-6">
      <div class="card border-0 shadow-sm h-100" style="cursor:pointer">
        <div class="card-body p-4">
          <div class="d-flex align-items-center gap-3">
            <div style="width:48px;height:48px;background:#f0fdf4;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <i class="bi bi-cart-fill text-success fs-4"></i>
            </div>
            <div>
              <h6 class="mb-0 fw-bold">メニュー項目2</h6>
              <small class="text-muted">説明文をここに記入</small>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="col-md-6">
      <div class="card border-0 shadow-sm h-100" style="cursor:pointer">
        <div class="card-body p-4">
          <div class="d-flex align-items-center gap-3">
            <div style="width:48px;height:48px;background:#fffbeb;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <i class="bi bi-graph-up-arrow text-warning fs-4"></i>
            </div>
            <div>
              <h6 class="mb-0 fw-bold">メニュー項目3</h6>
              <small class="text-muted">説明文をここに記入</small>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="col-md-6">
      <div class="card border-0 shadow-sm h-100" style="cursor:pointer">
        <div class="card-body p-4">
          <div class="d-flex align-items-center gap-3">
            <div style="width:48px;height:48px;background:#f8fafc;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <i class="bi bi-gear-fill text-secondary fs-4"></i>
            </div>
            <div>
              <h6 class="mb-0 fw-bold">メニュー項目4</h6>
              <small class="text-muted">説明文をここに記入</small>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`.trim(),
  },
  {
    id: "menu-card-item",
    label: "メニューカード（単体）",
    category: CAT_NAVI,
    media: icon("card-text"),
    content: `
<div class="col-md-6">
  <div class="card border-0 shadow-sm h-100" style="cursor:pointer">
    <div class="card-body p-4">
      <div class="d-flex align-items-center gap-3">
        <div style="width:48px;height:48px;background:#eff6ff;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i class="bi bi-star-fill text-primary fs-4"></i>
        </div>
        <div>
          <h6 class="mb-0 fw-bold">メニュー項目</h6>
          <small class="text-muted">説明文をここに記入</small>
        </div>
      </div>
    </div>
  </div>
</div>`.trim(),
  },

  // ==========================================================================
  // 詳細表示（読み取り専用フィールド）
  // ==========================================================================
  {
    id: "detail-action-bar",
    label: "詳細ページヘッダー（アクションバー）",
    category: CAT_DETAIL,
    media: icon("ui-checks-grid"),
    content: `
<div class="d-flex justify-content-between align-items-center mb-3">
  <div class="d-flex align-items-center gap-2">
    <button class="btn btn-outline-secondary btn-sm py-0"><i class="bi bi-chevron-left"></i></button>
    <h6 class="mb-0 fw-bold"><i class="bi bi-person me-2 text-primary"></i>詳細タイトル</h6>
  </div>
  <div class="d-flex gap-2">
    <button class="btn btn-warning btn-sm"><i class="bi bi-pencil me-1"></i>修正</button>
    <button class="btn btn-outline-danger btn-sm"><i class="bi bi-trash me-1"></i>削除</button>
  </div>
</div>`.trim(),
  },
  {
    id: "detail-card-section",
    label: "詳細カードセクション",
    category: CAT_DETAIL,
    media: icon("card-list"),
    content: `
<div class="card border-0 shadow-sm mb-3">
  <div class="card-header bg-white border-bottom py-2">
    <span class="fw-medium small text-muted">基本情報</span>
  </div>
  <div class="card-body">
    <div class="row g-3">
      <div class="col-md-6">
        <label class="form-label small text-muted mb-0">項目名1</label>
        <p class="mb-0 fw-medium">値1</p>
      </div>
      <div class="col-md-6">
        <label class="form-label small text-muted mb-0">項目名2</label>
        <p class="mb-0">値2</p>
      </div>
      <div class="col-md-6">
        <label class="form-label small text-muted mb-0">項目名3</label>
        <p class="mb-0 fw-medium">値3</p>
      </div>
      <div class="col-md-6">
        <label class="form-label small text-muted mb-0">項目名4</label>
        <p class="mb-0">値4</p>
      </div>
      <div class="col-12">
        <label class="form-label small text-muted mb-0">全幅項目</label>
        <p class="mb-0">全幅の値</p>
      </div>
    </div>
  </div>
</div>`.trim(),
  },
  {
    id: "detail-field-half",
    label: "詳細フィールド（半幅）",
    category: CAT_DETAIL,
    media: icon("layout-split"),
    content: `
<div class="col-md-6">
  <label class="form-label small text-muted mb-0">項目名</label>
  <p class="mb-0 fw-medium">値</p>
</div>`.trim(),
  },
  {
    id: "detail-field-full",
    label: "詳細フィールド（全幅）",
    category: CAT_DETAIL,
    media: icon("square"),
    content: `
<div class="col-12">
  <label class="form-label small text-muted mb-0">項目名</label>
  <p class="mb-0">値</p>
</div>`.trim(),
  },
  {
    id: "detail-badge-field",
    label: "詳細フィールド（バッジ付き）",
    category: CAT_DETAIL,
    media: icon("tag-fill"),
    content: `
<div class="col-md-6">
  <label class="form-label small text-muted mb-0">ステータス</label>
  <p class="mb-0"><span class="badge bg-success">有効</span></p>
</div>`.trim(),
  },
  {
    id: "detail-inline-table",
    label: "詳細内テーブル（関連データ）",
    category: CAT_DETAIL,
    media: icon("table"),
    content: `
<div class="card border-0 shadow-sm mb-3">
  <div class="card-header bg-white border-bottom py-2 d-flex justify-content-between align-items-center">
    <span class="fw-medium small text-muted">関連データ</span>
    <button class="btn btn-link btn-sm p-0 small">すべて見る →</button>
  </div>
  <div class="card-body p-0">
    <table class="table table-sm mb-0 align-middle">
      <thead class="table-light">
        <tr>
          <th class="ps-3">番号</th>
          <th>名称</th>
          <th>日付</th>
          <th>ステータス</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="ps-3 small">001</td>
          <td class="small">データ名1</td>
          <td class="small">2026-01-01</td>
          <td><span class="badge bg-success">完了</span></td>
        </tr>
        <tr>
          <td class="ps-3 small">002</td>
          <td class="small">データ名2</td>
          <td class="small">2026-01-02</td>
          <td><span class="badge bg-primary">処理中</span></td>
        </tr>
      </tbody>
    </table>
  </div>
</div>`.trim(),
  },

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
  {
    id: "grid-1col",
    label: "1カラムグリッド（空）",
    category: CAT_LAYOUT,
    media: icon("square"),
    content: `<div class="form-row fcol-1"></div>`,
  },
  {
    id: "grid-2col",
    label: "2カラムグリッド（空）",
    category: CAT_LAYOUT,
    media: icon("layout-split"),
    content: `<div class="form-row fcol-2"></div>`,
  },
  {
    id: "grid-3col",
    label: "3カラムグリッド（空）",
    category: CAT_LAYOUT,
    media: icon("grid-3x2"),
    content: `<div class="form-row fcol-3"></div>`,
  },
  {
    id: "grid-4col",
    label: "4カラムグリッド（空）",
    category: CAT_LAYOUT,
    media: icon("grid"),
    content: `<div class="form-row fcol-4"></div>`,
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
    id: "header-with-back",
    label: "ページヘッダー（戻るボタン付き）",
    category: CAT_COMMON,
    media: icon("arrow-left-circle"),
    content: `
<div class="d-flex align-items-center gap-2 mb-3">
  <button class="btn btn-outline-secondary btn-sm py-0"><i class="bi bi-chevron-left"></i></button>
  <h6 class="mb-0 fw-bold"><i class="bi bi-pencil me-2 text-primary"></i>ページタイトル</h6>
</div>`.trim(),
  },
  {
    id: "header-list",
    label: "ページヘッダー（一覧用・新規ボタン付き）",
    category: CAT_COMMON,
    media: icon("list-ul"),
    content: `
<div class="d-flex justify-content-between align-items-center mb-3">
  <h6 class="mb-0 fw-bold"><i class="bi bi-list me-2 text-primary"></i>一覧タイトル</h6>
  <button class="btn btn-primary btn-sm"><i class="bi bi-plus-lg me-1"></i>新規登録</button>
</div>`.trim(),
  },
  {
    id: "card-section",
    label: "カードセクション（フォーム用）",
    category: CAT_COMMON,
    media: icon("journal-text"),
    content: `
<div class="card border-0 shadow-sm mb-3">
  <div class="card-header bg-white border-bottom py-2">
    <span class="fw-medium small text-muted">セクション名</span>
  </div>
  <div class="card-body">
    <div class="row g-3">
    </div>
  </div>
</div>`.trim(),
  },
  {
    id: "line-items-table",
    label: "注文明細テーブル",
    category: CAT_COMMON,
    media: icon("receipt"),
    content: `
<div class="card border-0 shadow-sm mb-3">
  <div class="card-header bg-white border-bottom py-2 d-flex justify-content-between align-items-center">
    <span class="fw-medium small text-muted">明細</span>
    <button class="btn btn-outline-success btn-sm py-0"><i class="bi bi-plus me-1"></i>行追加</button>
  </div>
  <div class="card-body p-0">
    <table class="table table-sm mb-0 align-middle">
      <thead class="table-light">
        <tr>
          <th class="ps-3" style="width:40%">品名</th>
          <th style="width:18%">単価（円）</th>
          <th style="width:12%">数量</th>
          <th class="text-end" style="width:20%">小計</th>
          <th style="width:5%"></th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="ps-3"><input type="text" class="form-control form-control-sm" value="品名A"></td>
          <td><input type="number" class="form-control form-control-sm" value="10000"></td>
          <td><input type="number" class="form-control form-control-sm" value="1"></td>
          <td class="text-end pe-3">¥10,000</td>
          <td><button class="btn btn-outline-danger btn-sm py-0 px-1"><i class="bi bi-x"></i></button></td>
        </tr>
        <tr>
          <td class="ps-3"><input type="text" class="form-control form-control-sm" value="品名B"></td>
          <td><input type="number" class="form-control form-control-sm" value="5000"></td>
          <td><input type="number" class="form-control form-control-sm" value="2"></td>
          <td class="text-end pe-3">¥10,000</td>
          <td><button class="btn btn-outline-danger btn-sm py-0 px-1"><i class="bi bi-x"></i></button></td>
        </tr>
      </tbody>
      <tfoot class="table-light">
        <tr>
          <td colspan="3" class="text-end pe-2 fw-medium">税込合計</td>
          <td class="text-end pe-3 fw-bold fs-6">¥20,000</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
  </div>
</div>`.trim(),
  },
  {
    id: "card-footer-buttons",
    label: "カードフッターボタン（登録・キャンセル）",
    category: CAT_COMMON,
    media: icon("check-square"),
    content: `
<div class="card-footer bg-white d-flex justify-content-end gap-2">
  <button class="btn btn-outline-secondary">キャンセル</button>
  <button class="btn btn-primary"><i class="bi bi-check-lg me-1"></i>登録</button>
</div>`.trim(),
  },
  {
    id: "footer-buttons-standalone",
    label: "ページ下部ボタンエリア",
    category: CAT_COMMON,
    media: icon("three-dots"),
    content: `
<div class="d-flex justify-content-end gap-2 py-3">
  <button class="btn btn-outline-secondary">キャンセル</button>
  <button class="btn btn-primary"><i class="bi bi-check-lg me-1"></i>登録</button>
</div>`.trim(),
  },
  {
    id: "page-header",
    label: "ページヘッダー（旧）",
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
