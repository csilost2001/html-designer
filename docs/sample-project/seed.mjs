/**
 * docs/sample-project/seed.mjs
 *
 * 顧客管理システム サンプルデータ生成スクリプト
 *
 * 使用方法:
 *   node docs/sample-project/seed.mjs
 *
 * 実行すると data/project.json と data/screens/*.json を上書き生成します。
 * テストで削除してしまった場合も、このスクリプトを再実行すれば元に戻ります。
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../data");
const SCREENS_DIR = path.join(DATA_DIR, "screens");
const TABLES_DIR = path.join(DATA_DIR, "tables");
const PROCESS_FLOWS_DIR = path.join(DATA_DIR, "process-flows");
const SEED_SCREENS_DIR = path.join(__dirname, "screens");
const SEED_TABLES_DIR = path.join(__dirname, "tables");
const SEED_PROCESS_FLOWS_DIR = path.join(__dirname, "process-flows");
const CONVENTIONS_DIR = path.join(DATA_DIR, "conventions");
const SEED_CONVENTIONS_DIR = path.join(__dirname, "conventions");
const SCREEN_ITEMS_DIR = path.join(DATA_DIR, "screen-items");
const SEED_SCREEN_ITEMS_DIR = path.join(__dirname, "screen-items");
// 新規追加した process flow は必須ファイルとして明示して seed 対象にする。古いファイルは省略可
const REQUIRED_PROCESS_FLOW_FILES = [
  "cccccccc-0008-4000-8000-cccccccccccc.json",
];

fs.mkdirSync(SCREENS_DIR, { recursive: true });
fs.mkdirSync(TABLES_DIR, { recursive: true });
fs.mkdirSync(PROCESS_FLOWS_DIR, { recursive: true });
fs.mkdirSync(CONVENTIONS_DIR, { recursive: true });
fs.mkdirSync(SEED_SCREENS_DIR, { recursive: true });
fs.mkdirSync(SCREEN_ITEMS_DIR, { recursive: true });
fs.mkdirSync(SEED_SCREEN_ITEMS_DIR, { recursive: true });

// ── GrapesJS スクリーンデータ生成ヘルパー ─────────────────────────────────
function makeScreenData(html, pageId, frameId) {
  return {
    dataSources: [],
    assets: [],
    styles: [],
    pages: [
      {
        frames: [
          {
            component: {
              type: "wrapper",
              stylable: [
                "background", "background-color", "background-image",
                "background-repeat", "background-attachment",
                "background-position", "background-size",
              ],
              head: { type: "head" },
              docEl: { tagName: "html" },
              components: html,
            },
            id: frameId,
          },
        ],
        type: "main",
        id: pageId,
      },
    ],
    symbols: [],
  };
}

// ── 画面項目定義生成ヘルパー ───────────────────────────────────────────────
function makeScreenItemsFile(screenId, items) {
  return {
    screenId,
    version: "0.1.0",
    updatedAt: "2026-04-22T00:00:00.000Z",
    items,
  };
}

// ── 固定 UUID 定義 (seed は冪等性のためハードコード) ─────────────────────
// 0001 ログイン画面
const UUID_0001_USER_ID   = "11000001-0001-4000-8000-aaaaaaaaaaaa";
const UUID_0001_PASSWORD  = "11000001-0002-4000-8000-aaaaaaaaaaaa";

// 0003 顧客一覧 (検索フォーム)
const UUID_0003_KEYWORD   = "11000003-0001-4000-8000-aaaaaaaaaaaa";
const UUID_0003_PHONE     = "11000003-0002-4000-8000-aaaaaaaaaaaa";
const UUID_0003_EMAIL     = "11000003-0003-4000-8000-aaaaaaaaaaaa";

// 0005 顧客登録
const UUID_0005_NAME      = "11000005-0001-4000-8000-aaaaaaaaaaaa";
const UUID_0005_KANA      = "11000005-0002-4000-8000-aaaaaaaaaaaa";
const UUID_0005_BIRTHDAY  = "11000005-0003-4000-8000-aaaaaaaaaaaa";
const UUID_0005_GENDER    = "11000005-0004-4000-8000-aaaaaaaaaaaa";
const UUID_0005_PHONE     = "11000005-0005-4000-8000-aaaaaaaaaaaa";
const UUID_0005_EMAIL     = "11000005-0006-4000-8000-aaaaaaaaaaaa";
const UUID_0005_POSTAL    = "11000005-0007-4000-8000-aaaaaaaaaaaa";
const UUID_0005_ADDRESS   = "11000005-0008-4000-8000-aaaaaaaaaaaa";
const UUID_0005_ADDRESS2  = "11000005-0009-4000-8000-aaaaaaaaaaaa";
const UUID_0005_RANK      = "11000005-0010-4000-8000-aaaaaaaaaaaa";
const UUID_0005_NOTES     = "11000005-0011-4000-8000-aaaaaaaaaaaa";

// 0006 顧客修正 (0005 と同じ項目名)
const UUID_0006_NAME      = "11000006-0001-4000-8000-aaaaaaaaaaaa";
const UUID_0006_KANA      = "11000006-0002-4000-8000-aaaaaaaaaaaa";
const UUID_0006_BIRTHDAY  = "11000006-0003-4000-8000-aaaaaaaaaaaa";
const UUID_0006_GENDER    = "11000006-0004-4000-8000-aaaaaaaaaaaa";
const UUID_0006_PHONE     = "11000006-0005-4000-8000-aaaaaaaaaaaa";
const UUID_0006_EMAIL     = "11000006-0006-4000-8000-aaaaaaaaaaaa";
const UUID_0006_POSTAL    = "11000006-0007-4000-8000-aaaaaaaaaaaa";
const UUID_0006_ADDRESS   = "11000006-0008-4000-8000-aaaaaaaaaaaa";
const UUID_0006_ADDRESS2  = "11000006-0009-4000-8000-aaaaaaaaaaaa";
const UUID_0006_RANK      = "11000006-0010-4000-8000-aaaaaaaaaaaa";
const UUID_0006_NOTES     = "11000006-0011-4000-8000-aaaaaaaaaaaa";

// 0007 削除確認
const UUID_0007_CONFIRM   = "11000007-0001-4000-8000-aaaaaaaaaaaa";

// 0008 注文一覧 (検索フォーム)
const UUID_0008_CUST_NAME = "11000008-0001-4000-8000-aaaaaaaaaaaa";
const UUID_0008_DATE_FROM = "11000008-0002-4000-8000-aaaaaaaaaaaa";
const UUID_0008_DATE_TO   = "11000008-0003-4000-8000-aaaaaaaaaaaa";
const UUID_0008_STATUS    = "11000008-0004-4000-8000-aaaaaaaaaaaa";

// 0009 注文登録
const UUID_0009_CUST        = "11000009-0001-4000-8000-aaaaaaaaaaaa";
const UUID_0009_ORDER_DATE  = "11000009-0002-4000-8000-aaaaaaaaaaaa";
const UUID_0009_DELIVERY    = "11000009-0003-4000-8000-aaaaaaaaaaaa";
const UUID_0009_PAYMENT     = "11000009-0004-4000-8000-aaaaaaaaaaaa";
const UUID_0009_NOTES       = "11000009-0005-4000-8000-aaaaaaaaaaaa";
// 注文明細 (テーブル行)
const UUID_0009_ITEM1_NAME  = "11000009-0006-4000-8000-aaaaaaaaaaaa";
const UUID_0009_ITEM1_PRICE = "11000009-0007-4000-8000-aaaaaaaaaaaa";
const UUID_0009_ITEM1_QTY   = "11000009-0008-4000-8000-aaaaaaaaaaaa";
const UUID_0009_ITEM2_NAME  = "11000009-0009-4000-8000-aaaaaaaaaaaa";
const UUID_0009_ITEM2_PRICE = "11000009-0010-4000-8000-aaaaaaaaaaaa";
const UUID_0009_ITEM2_QTY   = "11000009-0011-4000-8000-aaaaaaaaaaaa";

// ── 画面項目定義 ───────────────────────────────────────────────────────────
const SCREEN_ITEMS = {
  "aaaaaaaa-0001-4000-8000-aaaaaaaaaaaa": [
    { id: "user_id",  label: "ユーザーID",  type: "string", required: true, maxLength: 50 },
    { id: "password", label: "パスワード", type: "string", required: true, maxLength: 100 },
  ],
  "aaaaaaaa-0003-4000-8000-aaaaaaaaaaaa": [
    { id: "keyword", label: "顧客名",         type: "string", maxLength: 100 },
    { id: "phone",   label: "電話番号",       type: "string", maxLength: 20 },
    { id: "email",   label: "メールアドレス", type: "string", maxLength: 255 },
  ],
  "aaaaaaaa-0005-4000-8000-aaaaaaaaaaaa": [
    { id: "name",     label: "顧客名",         type: "string", required: true, maxLength: 100 },
    { id: "kana",     label: "フリガナ",       type: "string", required: true, maxLength: 100 },
    { id: "birthday", label: "生年月日",       type: "date" },
    { id: "gender",   label: "性別",           type: "string",
      options: [{ value: "m", label: "男性" }, { value: "f", label: "女性" }, { value: "o", label: "その他" }] },
    { id: "phone",    label: "電話番号",       type: "string", required: true, maxLength: 20 },
    { id: "email",    label: "メールアドレス", type: "string", maxLength: 255 },
    { id: "postal",   label: "郵便番号",       type: "string", maxLength: 8, pattern: "\\d{3}-\\d{4}" },
    { id: "address",  label: "住所",           type: "string", maxLength: 200 },
    { id: "address2", label: "住所（建物名）", type: "string", maxLength: 100 },
    { id: "rank",     label: "会員ランク",     type: "string",
      options: [{ value: "standard", label: "スタンダード" }, { value: "silver", label: "シルバー" },
                { value: "gold", label: "ゴールド" }, { value: "platinum", label: "プラチナ" }] },
    { id: "notes",    label: "備考",           type: "string", maxLength: 500 },
  ],
  "aaaaaaaa-0006-4000-8000-aaaaaaaaaaaa": [
    { id: "name",     label: "顧客名",         type: "string", required: true, maxLength: 100 },
    { id: "kana",     label: "フリガナ",       type: "string", required: true, maxLength: 100 },
    { id: "birthday", label: "生年月日",       type: "date" },
    { id: "gender",   label: "性別",           type: "string",
      options: [{ value: "m", label: "男性" }, { value: "f", label: "女性" }, { value: "o", label: "その他" }] },
    { id: "phone",    label: "電話番号",       type: "string", required: true, maxLength: 20 },
    { id: "email",    label: "メールアドレス", type: "string", maxLength: 255 },
    { id: "postal",   label: "郵便番号",       type: "string", maxLength: 8, pattern: "\\d{3}-\\d{4}" },
    { id: "address",  label: "住所",           type: "string", maxLength: 200 },
    { id: "address2", label: "住所（建物名）", type: "string", maxLength: 100 },
    { id: "rank",     label: "会員ランク",     type: "string",
      options: [{ value: "standard", label: "スタンダード" }, { value: "silver", label: "シルバー" },
                { value: "gold", label: "ゴールド" }, { value: "platinum", label: "プラチナ" }] },
    { id: "notes",    label: "備考",           type: "string", maxLength: 500 },
  ],
  "aaaaaaaa-0007-4000-8000-aaaaaaaaaaaa": [
    { id: "confirm_text", label: "削除確認入力", type: "string", required: true },
  ],
  "aaaaaaaa-0008-4000-8000-aaaaaaaaaaaa": [
    { id: "cust_name",  label: "顧客名",         type: "string", maxLength: 100 },
    { id: "date_from",  label: "注文日（開始）", type: "date" },
    { id: "date_to",    label: "注文日（終了）", type: "date" },
    { id: "status",     label: "ステータス",     type: "string",
      options: [{ value: "", label: "すべて" }, { value: "processing", label: "処理中" },
                { value: "completed", label: "完了" }, { value: "cancelled", label: "キャンセル" }] },
  ],
  "aaaaaaaa-0009-4000-8000-aaaaaaaaaaaa": [
    { id: "customer",     label: "顧客",           type: "string", required: true },
    { id: "order_date",   label: "注文日",         type: "date",   required: true },
    { id: "delivery",     label: "配送先",         type: "string" },
    { id: "payment",      label: "支払方法",       type: "string" },
    { id: "notes",        label: "備考",           type: "string", maxLength: 500 },
    { id: "item_name_1",  label: "商品名 (1行目)", type: "string" },
    { id: "unit_price_1", label: "単価 (1行目)",   type: "number" },
    { id: "qty_1",        label: "数量 (1行目)",   type: "number" },
    { id: "item_name_2",  label: "商品名 (2行目)", type: "string" },
    { id: "unit_price_2", label: "単価 (2行目)",   type: "number" },
    { id: "qty_2",        label: "数量 (2行目)",   type: "number" },
  ],
};

// ── 属性注入ヘルパー ───────────────────────────────────────────────────────
// HTML 文字列の <input|select|textarea ...> タグに name/id/data-item-id を注入する
// match はその要素を一意に識別するための正規表現パターン (string)。
// select/textarea の場合は後続コンテンツを含んで要素を特定する。
// 注入は常に「最初の '>'」(= 開始タグの閉じ括弧) の直前に行う。
function injectAttrs(html, injections) {
  let result = html;
  for (const { match, attrs } of injections) {
    const re = new RegExp(match);
    result = result.replace(re, (fullMatch) => {
      // 開始タグの閉じ '>' を探し、その前に属性を注入する
      // select/textarea はコンテンツを含むマッチになるが、最初の '>' が開始タグの終端
      const gtIdx = fullMatch.indexOf('>');
      let openTag = fullMatch.substring(0, gtIdx); // '<tag attrs...'
      const rest = fullMatch.substring(gtIdx);     // '>' + 後続コンテンツ
      for (const [k, v] of Object.entries(attrs)) {
        if (new RegExp(`\\b${k}=`).test(openTag)) continue;
        openTag += ` ${k}="${v}"`;
      }
      return openTag + rest;
    });
  }
  return result;
}

// ── 画面 HTML 定義 ─────────────────────────────────────────────────────────

const SCREENS = {
  "aaaaaaaa-0001-4000-8000-aaaaaaaaaaaa": {
    pageId: "pg-login-0001", frameId: "fr-login-0001",
    html: injectAttrs(`
<div style="min-height:100vh;background:#f0f4ff;display:flex;align-items:center;justify-content:center">
  <div style="width:100%;max-width:400px;padding:16px">
    <div class="card shadow">
      <div class="card-body p-4">
        <div class="text-center mb-4">
          <div style="width:56px;height:56px;background:#6366f1;border-radius:12px;display:inline-flex;align-items:center;justify-content:center">
            <i class="bi bi-building text-white fs-4"></i>
          </div>
          <h5 class="mt-3 mb-0 fw-bold">顧客管理システム</h5>
          <small class="text-muted">Customer Management System</small>
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
    <p class="text-center text-muted small mt-3">© 2026 顧客管理システム</p>
  </div>
</div>`, [
      { match: `<input type="text" class="form-control" placeholder="ユーザーIDを入力">`,
        attrs: { name: "user_id", id: "user_id", "data-item-id": UUID_0001_USER_ID } },
      { match: `<input type="password" class="form-control" placeholder="パスワードを入力">`,
        attrs: { name: "password", id: "password", "data-item-id": UUID_0001_PASSWORD } },
    ]),
  },

  "aaaaaaaa-0002-4000-8000-aaaaaaaaaaaa": {
    pageId: "pg-menu-0002", frameId: "fr-menu-0002",
    html: `
<div>
  <nav class="navbar navbar-dark px-3" style="background:#6366f1">
    <div class="d-flex align-items-center gap-2">
      <div style="width:32px;height:32px;background:rgba(255,255,255,0.2);border-radius:8px;display:flex;align-items:center;justify-content:center">
        <i class="bi bi-building text-white"></i>
      </div>
      <span class="navbar-brand mb-0 fw-bold">顧客管理システム</span>
    </div>
    <div class="d-flex align-items-center gap-2">
      <span class="text-white small"><i class="bi bi-person-circle me-1"></i>管理者 様</span>
      <button class="btn btn-sm btn-outline-light">ログアウト</button>
    </div>
  </nav>
  <div class="container mt-4">
    <p class="text-muted small mb-4">メインメニュー — 操作する機能を選択してください</p>
    <div class="row g-3">
      <div class="col-md-6">
        <div class="card border-0 shadow-sm h-100" style="cursor:pointer;transition:box-shadow .15s" onmouseover="this.style.boxShadow='0 4px 16px rgba(99,102,241,.2)'" onmouseout="this.style.boxShadow=''">
          <div class="card-body p-4">
            <div class="d-flex align-items-center gap-3 mb-2">
              <div style="width:48px;height:48px;background:#eff6ff;border-radius:12px;display:flex;align-items:center;justify-content:center">
                <i class="bi bi-people-fill text-primary fs-4"></i>
              </div>
              <div>
                <h6 class="mb-0 fw-bold">顧客管理</h6>
                <small class="text-muted">顧客の検索・登録・修正・削除</small>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="col-md-6">
        <div class="card border-0 shadow-sm h-100" style="cursor:pointer">
          <div class="card-body p-4">
            <div class="d-flex align-items-center gap-3 mb-2">
              <div style="width:48px;height:48px;background:#f0fdf4;border-radius:12px;display:flex;align-items:center;justify-content:center">
                <i class="bi bi-cart-fill text-success fs-4"></i>
              </div>
              <div>
                <h6 class="mb-0 fw-bold">注文管理</h6>
                <small class="text-muted">注文の検索・登録・確認</small>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="col-md-6">
        <div class="card border-0 shadow-sm h-100" style="cursor:pointer">
          <div class="card-body p-4">
            <div class="d-flex align-items-center gap-3 mb-2">
              <div style="width:48px;height:48px;background:#fffbeb;border-radius:12px;display:flex;align-items:center;justify-content:center">
                <i class="bi bi-graph-up-arrow text-warning fs-4"></i>
              </div>
              <div>
                <h6 class="mb-0 fw-bold">レポート</h6>
                <small class="text-muted">売上・顧客統計レポート</small>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="col-md-6">
        <div class="card border-0 shadow-sm h-100" style="cursor:pointer">
          <div class="card-body p-4">
            <div class="d-flex align-items-center gap-3 mb-2">
              <div style="width:48px;height:48px;background:#f8fafc;border-radius:12px;display:flex;align-items:center;justify-content:center">
                <i class="bi bi-gear-fill text-secondary fs-4"></i>
              </div>
              <div>
                <h6 class="mb-0 fw-bold">システム設定</h6>
                <small class="text-muted">マスタ・ユーザー管理</small>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`,
  },

  "aaaaaaaa-0003-4000-8000-aaaaaaaaaaaa": {
    pageId: "pg-custlist-0003", frameId: "fr-custlist-0003",
    html: injectAttrs(`
<div>
  <nav class="navbar navbar-dark px-3 py-2" style="background:#6366f1">
    <span class="navbar-brand mb-0 fw-bold small"><i class="bi bi-building me-2"></i>顧客管理システム</span>
    <span class="text-white small">管理者 様</span>
  </nav>
  <div class="container-fluid px-3 pt-3">
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h6 class="mb-0 fw-bold"><i class="bi bi-people me-2 text-primary"></i>顧客一覧</h6>
      <button class="btn btn-primary btn-sm"><i class="bi bi-plus-lg me-1"></i>新規登録</button>
    </div>
    <div class="card mb-3 border-0 shadow-sm">
      <div class="card-body py-2 px-3">
        <div class="row g-2 align-items-end">
          <div class="col">
            <label class="form-label mb-1 small">顧客名</label>
            <input type="text" class="form-control form-control-sm" placeholder="例：山田">
          </div>
          <div class="col">
            <label class="form-label mb-1 small">電話番号</label>
            <input type="text" class="form-control form-control-sm" placeholder="例：03-1234">
          </div>
          <div class="col">
            <label class="form-label mb-1 small">メールアドレス</label>
            <input type="text" class="form-control form-control-sm" placeholder="例：@example.com">
          </div>
          <div class="col-auto">
            <button class="btn btn-primary btn-sm"><i class="bi bi-search me-1"></i>検索</button>
          </div>
          <div class="col-auto">
            <button class="btn btn-outline-secondary btn-sm">クリア</button>
          </div>
        </div>
      </div>
    </div>
    <div class="card border-0 shadow-sm">
      <div class="card-body p-0">
        <table class="table table-sm table-hover mb-0 align-middle">
          <thead class="table-light">
            <tr>
              <th class="ps-3" style="width:80px">顧客ID</th>
              <th>顧客名</th>
              <th>フリガナ</th>
              <th>電話番号</th>
              <th>メールアドレス</th>
              <th style="width:80px"></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="ps-3 text-muted small">C-0001</td>
              <td class="fw-medium">山田 太郎</td>
              <td class="text-muted small">ヤマダ タロウ</td>
              <td class="small">03-1234-5678</td>
              <td class="small">yamada@example.com</td>
              <td><button class="btn btn-outline-primary btn-sm py-0 px-2">詳細</button></td>
            </tr>
            <tr>
              <td class="ps-3 text-muted small">C-0002</td>
              <td class="fw-medium">佐藤 花子</td>
              <td class="text-muted small">サトウ ハナコ</td>
              <td class="small">06-9876-5432</td>
              <td class="small">sato@example.com</td>
              <td><button class="btn btn-outline-primary btn-sm py-0 px-2">詳細</button></td>
            </tr>
            <tr>
              <td class="ps-3 text-muted small">C-0003</td>
              <td class="fw-medium">鈴木 一郎</td>
              <td class="text-muted small">スズキ イチロウ</td>
              <td class="small">045-111-2222</td>
              <td class="small">suzuki@example.com</td>
              <td><button class="btn btn-outline-primary btn-sm py-0 px-2">詳細</button></td>
            </tr>
            <tr>
              <td class="ps-3 text-muted small">C-0004</td>
              <td class="fw-medium">田中 美咲</td>
              <td class="text-muted small">タナカ ミサキ</td>
              <td class="small">052-333-4444</td>
              <td class="small">tanaka@example.com</td>
              <td><button class="btn btn-outline-primary btn-sm py-0 px-2">詳細</button></td>
            </tr>
            <tr>
              <td class="ps-3 text-muted small">C-0005</td>
              <td class="fw-medium">伊藤 健太</td>
              <td class="text-muted small">イトウ ケンタ</td>
              <td class="small">011-555-6666</td>
              <td class="small">ito@example.com</td>
              <td><button class="btn btn-outline-primary btn-sm py-0 px-2">詳細</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="d-flex justify-content-between align-items-center mt-2">
      <small class="text-muted">全 5 件</small>
      <nav><ul class="pagination pagination-sm mb-0">
        <li class="page-item disabled"><a class="page-link py-1">«</a></li>
        <li class="page-item active"><a class="page-link py-1">1</a></li>
        <li class="page-item"><a class="page-link py-1">2</a></li>
        <li class="page-item"><a class="page-link py-1">»</a></li>
      </ul></nav>
    </div>
  </div>
</div>`, [
      { match: `<input type="text" class="form-control form-control-sm" placeholder="例：山田">`,
        attrs: { name: "keyword", id: "keyword", "data-item-id": UUID_0003_KEYWORD } },
      { match: `<input type="text" class="form-control form-control-sm" placeholder="例：03-1234">`,
        attrs: { name: "phone", id: "phone", "data-item-id": UUID_0003_PHONE } },
      { match: `<input type="text" class="form-control form-control-sm" placeholder="例：@example.com">`,
        attrs: { name: "email", id: "email", "data-item-id": UUID_0003_EMAIL } },
    ]),
  },

  "aaaaaaaa-0004-4000-8000-aaaaaaaaaaaa": {
    pageId: "pg-custdet-0004", frameId: "fr-custdet-0004",
    html: `
<div>
  <nav class="navbar navbar-dark px-3 py-2" style="background:#6366f1">
    <span class="navbar-brand mb-0 fw-bold small"><i class="bi bi-building me-2"></i>顧客管理システム</span>
  </nav>
  <div class="container-fluid px-3 pt-3">
    <div class="d-flex justify-content-between align-items-center mb-3">
      <div class="d-flex align-items-center gap-2">
        <button class="btn btn-outline-secondary btn-sm py-0"><i class="bi bi-chevron-left"></i></button>
        <h6 class="mb-0 fw-bold"><i class="bi bi-person me-2 text-primary"></i>顧客詳細</h6>
      </div>
      <div class="d-flex gap-2">
        <button class="btn btn-outline-primary btn-sm"><i class="bi bi-cart me-1"></i>注文一覧</button>
        <button class="btn btn-warning btn-sm"><i class="bi bi-pencil me-1"></i>修正</button>
        <button class="btn btn-outline-danger btn-sm"><i class="bi bi-trash me-1"></i>削除</button>
      </div>
    </div>
    <div class="card border-0 shadow-sm mb-3">
      <div class="card-header bg-white border-bottom py-2">
        <span class="fw-medium small text-muted">基本情報</span>
      </div>
      <div class="card-body">
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label small text-muted mb-0">顧客ID</label>
            <p class="mb-0 fw-medium">C-0001</p>
          </div>
          <div class="col-md-6">
            <label class="form-label small text-muted mb-0">登録日</label>
            <p class="mb-0">2025-06-15</p>
          </div>
          <div class="col-md-6">
            <label class="form-label small text-muted mb-0">顧客名</label>
            <p class="mb-0 fw-bold fs-5">山田 太郎</p>
          </div>
          <div class="col-md-6">
            <label class="form-label small text-muted mb-0">フリガナ</label>
            <p class="mb-0">ヤマダ タロウ</p>
          </div>
          <div class="col-md-6">
            <label class="form-label small text-muted mb-0">生年月日</label>
            <p class="mb-0">1985-03-20</p>
          </div>
          <div class="col-md-6">
            <label class="form-label small text-muted mb-0">電話番号</label>
            <p class="mb-0">03-1234-5678</p>
          </div>
          <div class="col-md-6">
            <label class="form-label small text-muted mb-0">メールアドレス</label>
            <p class="mb-0">yamada@example.com</p>
          </div>
          <div class="col-md-6">
            <label class="form-label small text-muted mb-0">会員ランク</label>
            <p class="mb-0"><span class="badge bg-warning text-dark">ゴールド</span></p>
          </div>
          <div class="col-12">
            <label class="form-label small text-muted mb-0">住所</label>
            <p class="mb-0">〒100-0001 東京都千代田区千代田1-1-1</p>
          </div>
          <div class="col-12">
            <label class="form-label small text-muted mb-0">備考</label>
            <p class="mb-0 text-muted small">月次請求書を郵送希望。担当：営業部 鈴木</p>
          </div>
        </div>
      </div>
    </div>
    <div class="card border-0 shadow-sm">
      <div class="card-header bg-white border-bottom py-2 d-flex justify-content-between align-items-center">
        <span class="fw-medium small text-muted">最近の注文（直近3件）</span>
        <button class="btn btn-link btn-sm p-0 small">すべて見る →</button>
      </div>
      <div class="card-body p-0">
        <table class="table table-sm mb-0 align-middle">
          <thead class="table-light">
            <tr><th class="ps-3">注文番号</th><th>注文日</th><th>金額</th><th>ステータス</th></tr>
          </thead>
          <tbody>
            <tr><td class="ps-3 small">ORD-2024-0123</td><td class="small">2024-11-20</td><td class="small">¥128,000</td><td><span class="badge bg-success">完了</span></td></tr>
            <tr><td class="ps-3 small">ORD-2024-0089</td><td class="small">2024-09-05</td><td class="small">¥56,400</td><td><span class="badge bg-success">完了</span></td></tr>
            <tr><td class="ps-3 small">ORD-2024-0041</td><td class="small">2024-06-12</td><td class="small">¥203,500</td><td><span class="badge bg-success">完了</span></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</div>`,
  },

  "aaaaaaaa-0005-4000-8000-aaaaaaaaaaaa": {
    pageId: "pg-custnew-0005", frameId: "fr-custnew-0005",
    html: injectAttrs(`
<div>
  <nav class="navbar navbar-dark px-3 py-2" style="background:#6366f1">
    <span class="navbar-brand mb-0 fw-bold small"><i class="bi bi-building me-2"></i>顧客管理システム</span>
  </nav>
  <div class="container-fluid px-3 pt-3">
    <div class="d-flex align-items-center gap-2 mb-3">
      <button class="btn btn-outline-secondary btn-sm py-0"><i class="bi bi-chevron-left"></i></button>
      <h6 class="mb-0 fw-bold"><i class="bi bi-person-plus me-2 text-primary"></i>顧客登録</h6>
    </div>
    <div class="card border-0 shadow-sm">
      <div class="card-header bg-white border-bottom py-2">
        <span class="fw-medium small text-muted">顧客情報を入力してください</span>
      </div>
      <div class="card-body">
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label small fw-medium">顧客名 <span class="text-danger">*</span></label>
            <input type="text" class="form-control form-control-sm" placeholder="例：山田 太郎">
          </div>
          <div class="col-md-6">
            <label class="form-label small fw-medium">フリガナ <span class="text-danger">*</span></label>
            <input type="text" class="form-control form-control-sm" placeholder="例：ヤマダ タロウ">
          </div>
          <div class="col-md-6">
            <label class="form-label small fw-medium">生年月日</label>
            <input type="date" class="form-control form-control-sm">
          </div>
          <div class="col-md-6">
            <label class="form-label small fw-medium">性別</label>
            <select class="form-select form-select-sm">
              <option value="">選択してください</option>
              <option>男性</option><option>女性</option><option>その他</option>
            </select>
          </div>
          <div class="col-md-6">
            <label class="form-label small fw-medium">電話番号 <span class="text-danger">*</span></label>
            <input type="tel" class="form-control form-control-sm" placeholder="例：03-1234-5678">
          </div>
          <div class="col-md-6">
            <label class="form-label small fw-medium">メールアドレス</label>
            <input type="email" class="form-control form-control-sm" placeholder="例：yamada@example.com">
          </div>
          <div class="col-md-3">
            <label class="form-label small fw-medium">郵便番号</label>
            <div class="input-group input-group-sm">
              <input type="text" class="form-control" placeholder="000-0000">
              <button class="btn btn-outline-secondary btn-sm">検索</button>
            </div>
          </div>
          <div class="col-md-9">
            <label class="form-label small fw-medium">住所</label>
            <input type="text" class="form-control form-control-sm" placeholder="都道府県・市区町村・番地">
          </div>
          <div class="col-12">
            <label class="form-label small fw-medium">住所（建物名など）</label>
            <input type="text" class="form-control form-control-sm" placeholder="マンション名・部屋番号など">
          </div>
          <div class="col-md-6">
            <label class="form-label small fw-medium">会員ランク</label>
            <select class="form-select form-select-sm">
              <option selected>スタンダード</option><option>シルバー</option>
              <option>ゴールド</option><option>プラチナ</option>
            </select>
          </div>
          <div class="col-12">
            <label class="form-label small fw-medium">備考</label>
            <textarea class="form-control form-control-sm" rows="2" placeholder="担当者・特記事項など"></textarea>
          </div>
        </div>
      </div>
      <div class="card-footer bg-white d-flex justify-content-end gap-2">
        <button class="btn btn-outline-secondary">キャンセル</button>
        <button class="btn btn-primary"><i class="bi bi-check-lg me-1"></i>登録</button>
      </div>
    </div>
  </div>
</div>`, [
      { match: `<input type="text" class="form-control form-control-sm" placeholder="例：山田 太郎">`,
        attrs: { name: "name", id: "name", "data-item-id": UUID_0005_NAME } },
      { match: `<input type="text" class="form-control form-control-sm" placeholder="例：ヤマダ タロウ">`,
        attrs: { name: "kana", id: "kana", "data-item-id": UUID_0005_KANA } },
      { match: `<input type="date" class="form-control form-control-sm">`,
        attrs: { name: "birthday", id: "birthday", "data-item-id": UUID_0005_BIRTHDAY } },
      { match: `<select class="form-select form-select-sm">\\s*<option value="">選択してください`,
        attrs: { name: "gender", id: "gender", "data-item-id": UUID_0005_GENDER } },
      { match: `<input type="tel" class="form-control form-control-sm" placeholder="例：03-1234-5678">`,
        attrs: { name: "phone", id: "phone", "data-item-id": UUID_0005_PHONE } },
      { match: `<input type="email" class="form-control form-control-sm" placeholder="例：yamada@example.com">`,
        attrs: { name: "email", id: "email", "data-item-id": UUID_0005_EMAIL } },
      { match: `<input type="text" class="form-control" placeholder="000-0000">`,
        attrs: { name: "postal", id: "postal", "data-item-id": UUID_0005_POSTAL } },
      { match: `<input type="text" class="form-control form-control-sm" placeholder="都道府県・市区町村・番地">`,
        attrs: { name: "address", id: "address", "data-item-id": UUID_0005_ADDRESS } },
      { match: `<input type="text" class="form-control form-control-sm" placeholder="マンション名・部屋番号など">`,
        attrs: { name: "address2", id: "address2", "data-item-id": UUID_0005_ADDRESS2 } },
      { match: `<select class="form-select form-select-sm">\\s*<option selected>スタンダード`,
        attrs: { name: "rank", id: "rank", "data-item-id": UUID_0005_RANK } },
      { match: `<textarea class="form-control form-control-sm" rows="2" placeholder="担当者・特記事項など">`,
        attrs: { name: "notes", id: "notes", "data-item-id": UUID_0005_NOTES } },
    ]),
  },

  "aaaaaaaa-0006-4000-8000-aaaaaaaaaaaa": {
    pageId: "pg-custedit-0006", frameId: "fr-custedit-0006",
    html: injectAttrs(`
<div>
  <nav class="navbar navbar-dark px-3 py-2" style="background:#6366f1">
    <span class="navbar-brand mb-0 fw-bold small"><i class="bi bi-building me-2"></i>顧客管理システム</span>
  </nav>
  <div class="container-fluid px-3 pt-3">
    <div class="d-flex align-items-center gap-2 mb-3">
      <button class="btn btn-outline-secondary btn-sm py-0"><i class="bi bi-chevron-left"></i></button>
      <h6 class="mb-0 fw-bold"><i class="bi bi-pencil-square me-2 text-warning"></i>顧客修正</h6>
      <span class="badge bg-light text-muted border ms-1">C-0001 山田 太郎</span>
    </div>
    <div class="card border-0 shadow-sm">
      <div class="card-header bg-white border-bottom py-2">
        <span class="fw-medium small text-muted">修正する項目を変更してください</span>
      </div>
      <div class="card-body">
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label small fw-medium">顧客名 <span class="text-danger">*</span></label>
            <input type="text" class="form-control form-control-sm" value="山田 太郎">
          </div>
          <div class="col-md-6">
            <label class="form-label small fw-medium">フリガナ <span class="text-danger">*</span></label>
            <input type="text" class="form-control form-control-sm" value="ヤマダ タロウ">
          </div>
          <div class="col-md-6">
            <label class="form-label small fw-medium">生年月日</label>
            <input type="date" class="form-control form-control-sm" value="1985-03-20">
          </div>
          <div class="col-md-6">
            <label class="form-label small fw-medium">性別</label>
            <select class="form-select form-select-sm">
              <option selected>男性</option><option>女性</option><option>その他</option>
            </select>
          </div>
          <div class="col-md-6">
            <label class="form-label small fw-medium">電話番号 <span class="text-danger">*</span></label>
            <input type="tel" class="form-control form-control-sm" value="03-1234-5678">
          </div>
          <div class="col-md-6">
            <label class="form-label small fw-medium">メールアドレス</label>
            <input type="email" class="form-control form-control-sm" value="yamada@example.com">
          </div>
          <div class="col-md-3">
            <label class="form-label small fw-medium">郵便番号</label>
            <div class="input-group input-group-sm">
              <input type="text" class="form-control" value="100-0001">
              <button class="btn btn-outline-secondary btn-sm">検索</button>
            </div>
          </div>
          <div class="col-md-9">
            <label class="form-label small fw-medium">住所</label>
            <input type="text" class="form-control form-control-sm" value="東京都千代田区千代田1-1-1">
          </div>
          <div class="col-12">
            <label class="form-label small fw-medium">住所（建物名など）</label>
            <input type="text" class="form-control form-control-sm" placeholder="マンション名・部屋番号など">
          </div>
          <div class="col-md-6">
            <label class="form-label small fw-medium">会員ランク</label>
            <select class="form-select form-select-sm">
              <option>スタンダード</option><option>シルバー</option>
              <option selected>ゴールド</option><option>プラチナ</option>
            </select>
          </div>
          <div class="col-12">
            <label class="form-label small fw-medium">備考</label>
            <textarea class="form-control form-control-sm" rows="2">月次請求書を郵送希望。担当：営業部 鈴木</textarea>
          </div>
        </div>
      </div>
      <div class="card-footer bg-white d-flex justify-content-between align-items-center">
        <small class="text-muted"><i class="bi bi-clock me-1"></i>最終更新: 2024-11-20</small>
        <div class="d-flex gap-2">
          <button class="btn btn-outline-secondary">キャンセル</button>
          <button class="btn btn-warning"><i class="bi bi-check-lg me-1"></i>更新</button>
        </div>
      </div>
    </div>
  </div>
</div>`, [
      { match: `<input type="text" class="form-control form-control-sm" value="山田 太郎">`,
        attrs: { name: "name", id: "name", "data-item-id": UUID_0006_NAME } },
      { match: `<input type="text" class="form-control form-control-sm" value="ヤマダ タロウ">`,
        attrs: { name: "kana", id: "kana", "data-item-id": UUID_0006_KANA } },
      { match: `<input type="date" class="form-control form-control-sm" value="1985-03-20">`,
        attrs: { name: "birthday", id: "birthday", "data-item-id": UUID_0006_BIRTHDAY } },
      { match: `<select class="form-select form-select-sm">\\s*<option selected>男性`,
        attrs: { name: "gender", id: "gender", "data-item-id": UUID_0006_GENDER } },
      { match: `<input type="tel" class="form-control form-control-sm" value="03-1234-5678">`,
        attrs: { name: "phone", id: "phone", "data-item-id": UUID_0006_PHONE } },
      { match: `<input type="email" class="form-control form-control-sm" value="yamada@example.com">`,
        attrs: { name: "email", id: "email", "data-item-id": UUID_0006_EMAIL } },
      { match: `<input type="text" class="form-control" value="100-0001">`,
        attrs: { name: "postal", id: "postal", "data-item-id": UUID_0006_POSTAL } },
      { match: `<input type="text" class="form-control form-control-sm" value="東京都千代田区千代田1-1-1">`,
        attrs: { name: "address", id: "address", "data-item-id": UUID_0006_ADDRESS } },
      { match: `<input type="text" class="form-control form-control-sm" placeholder="マンション名・部屋番号など">`,
        attrs: { name: "address2", id: "address2", "data-item-id": UUID_0006_ADDRESS2 } },
      { match: `<select class="form-select form-select-sm">\\s*<option>スタンダード`,
        attrs: { name: "rank", id: "rank", "data-item-id": UUID_0006_RANK } },
      { match: `<textarea class="form-control form-control-sm" rows="2">月次請求書`,
        attrs: { name: "notes", id: "notes", "data-item-id": UUID_0006_NOTES } },
    ]),
  },

  "aaaaaaaa-0007-4000-8000-aaaaaaaaaaaa": {
    pageId: "pg-custdel-0007", frameId: "fr-custdel-0007",
    html: injectAttrs(`
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
            <span class="fw-bold">山田 太郎（C-0001）</span>
          </div>
          <ul class="mb-0 small ps-3">
            <li>顧客情報がすべて削除されます</li>
            <li>関連する注文データの顧客参照が解除されます</li>
            <li>この操作は元に戻すことができません</li>
          </ul>
        </div>
        <div class="mb-4">
          <label class="form-label small fw-medium">確認のため「削除」と入力してください</label>
          <input type="text" class="form-control" placeholder="削除">
        </div>
        <div class="d-grid gap-2">
          <button class="btn btn-danger"><i class="bi bi-trash me-1"></i>削除を実行する</button>
          <button class="btn btn-outline-secondary">キャンセル（詳細画面に戻る）</button>
        </div>
      </div>
    </div>
  </div>
</div>`, [
      { match: `<input type="text" class="form-control" placeholder="削除">`,
        attrs: { name: "confirm_text", id: "confirm_text", "data-item-id": UUID_0007_CONFIRM } },
    ]),
  },

  "aaaaaaaa-0008-4000-8000-aaaaaaaaaaaa": {
    pageId: "pg-ordlist-0008", frameId: "fr-ordlist-0008",
    html: injectAttrs(`
<div>
  <nav class="navbar navbar-dark px-3 py-2" style="background:#6366f1">
    <span class="navbar-brand mb-0 fw-bold small"><i class="bi bi-building me-2"></i>顧客管理システム</span>
    <span class="text-white small">管理者 様</span>
  </nav>
  <div class="container-fluid px-3 pt-3">
    <div class="d-flex justify-content-between align-items-center mb-3">
      <div class="d-flex align-items-center gap-2">
        <button class="btn btn-outline-secondary btn-sm py-0"><i class="bi bi-chevron-left"></i></button>
        <h6 class="mb-0 fw-bold"><i class="bi bi-cart me-2 text-success"></i>注文一覧</h6>
      </div>
      <button class="btn btn-success btn-sm"><i class="bi bi-plus-lg me-1"></i>新規注文</button>
    </div>
    <div class="card mb-3 border-0 shadow-sm">
      <div class="card-body py-2 px-3">
        <div class="row g-2 align-items-end">
          <div class="col">
            <label class="form-label mb-1 small">顧客名</label>
            <input type="text" class="form-control form-control-sm" placeholder="例：山田">
          </div>
          <div class="col">
            <label class="form-label mb-1 small">注文日（開始）</label>
            <input type="date" class="form-control form-control-sm">
          </div>
          <div class="col">
            <label class="form-label mb-1 small">注文日（終了）</label>
            <input type="date" class="form-control form-control-sm">
          </div>
          <div class="col">
            <label class="form-label mb-1 small">ステータス</label>
            <select class="form-select form-select-sm">
              <option value="">すべて</option>
              <option>処理中</option><option>完了</option><option>キャンセル</option>
            </select>
          </div>
          <div class="col-auto">
            <button class="btn btn-primary btn-sm"><i class="bi bi-search me-1"></i>検索</button>
          </div>
        </div>
      </div>
    </div>
    <div class="card border-0 shadow-sm">
      <div class="card-body p-0">
        <table class="table table-sm table-hover mb-0 align-middle">
          <thead class="table-light">
            <tr>
              <th class="ps-3">注文番号</th><th>顧客名</th><th>注文日</th>
              <th class="text-end">金額</th><th>ステータス</th><th></th>
            </tr>
          </thead>
          <tbody>
            <tr><td class="ps-3 small">ORD-2024-0123</td><td class="small">山田 太郎</td><td class="small">2024-11-20</td><td class="text-end small">¥128,000</td><td><span class="badge bg-success">完了</span></td><td><button class="btn btn-outline-secondary btn-sm py-0 px-2">詳細</button></td></tr>
            <tr><td class="ps-3 small">ORD-2024-0122</td><td class="small">佐藤 花子</td><td class="small">2024-11-18</td><td class="text-end small">¥45,200</td><td><span class="badge bg-primary">処理中</span></td><td><button class="btn btn-outline-secondary btn-sm py-0 px-2">詳細</button></td></tr>
            <tr><td class="ps-3 small">ORD-2024-0121</td><td class="small">鈴木 一郎</td><td class="small">2024-11-15</td><td class="text-end small">¥89,600</td><td><span class="badge bg-success">完了</span></td><td><button class="btn btn-outline-secondary btn-sm py-0 px-2">詳細</button></td></tr>
            <tr><td class="ps-3 small">ORD-2024-0120</td><td class="small">田中 美咲</td><td class="small">2024-11-10</td><td class="text-end small">¥234,000</td><td><span class="badge bg-warning text-dark">保留</span></td><td><button class="btn btn-outline-secondary btn-sm py-0 px-2">詳細</button></td></tr>
            <tr><td class="ps-3 small">ORD-2024-0119</td><td class="small">伊藤 健太</td><td class="small">2024-11-08</td><td class="text-end small">¥12,800</td><td><span class="badge bg-secondary">キャンセル</span></td><td><button class="btn btn-outline-secondary btn-sm py-0 px-2">詳細</button></td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="d-flex justify-content-between align-items-center mt-2">
      <small class="text-muted">全 5 件 / 合計 ¥509,600</small>
      <nav><ul class="pagination pagination-sm mb-0">
        <li class="page-item disabled"><a class="page-link py-1">«</a></li>
        <li class="page-item active"><a class="page-link py-1">1</a></li>
        <li class="page-item"><a class="page-link py-1">»</a></li>
      </ul></nav>
    </div>
  </div>
</div>`, [
      { match: `<input type="text" class="form-control form-control-sm" placeholder="例：山田">`,
        attrs: { name: "cust_name", id: "cust_name", "data-item-id": UUID_0008_CUST_NAME } },
      { match: `<input type="date" class="form-control form-control-sm">`,
        attrs: { name: "date_from", id: "date_from", "data-item-id": UUID_0008_DATE_FROM } },
      // positional: 1回目の注入で date_from が決まり、2回目はそれ以外の日付入力にマッチ
      { match: `<input type="date" class="form-control form-control-sm">`,
        attrs: { name: "date_to", id: "date_to", "data-item-id": UUID_0008_DATE_TO } },
      { match: `<select class="form-select form-select-sm">\\s*<option value="">すべて`,
        attrs: { name: "status", id: "status", "data-item-id": UUID_0008_STATUS } },
    ]),
  },

  "aaaaaaaa-0009-4000-8000-aaaaaaaaaaaa": {
    pageId: "pg-ordnew-0009", frameId: "fr-ordnew-0009",
    html: injectAttrs(`
<div>
  <nav class="navbar navbar-dark px-3 py-2" style="background:#6366f1">
    <span class="navbar-brand mb-0 fw-bold small"><i class="bi bi-building me-2"></i>顧客管理システム</span>
  </nav>
  <div class="container-fluid px-3 pt-3">
    <div class="d-flex align-items-center gap-2 mb-3">
      <button class="btn btn-outline-secondary btn-sm py-0"><i class="bi bi-chevron-left"></i></button>
      <h6 class="mb-0 fw-bold"><i class="bi bi-cart-plus me-2 text-success"></i>注文登録</h6>
    </div>
    <div class="card border-0 shadow-sm mb-3">
      <div class="card-header bg-white border-bottom py-2">
        <span class="fw-medium small text-muted">顧客情報</span>
      </div>
      <div class="card-body">
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label small fw-medium">顧客 <span class="text-danger">*</span></label>
            <div class="input-group input-group-sm">
              <input type="text" class="form-control" placeholder="顧客名で検索">
              <button class="btn btn-outline-secondary">選択</button>
            </div>
          </div>
          <div class="col-md-6">
            <label class="form-label small fw-medium">注文日 <span class="text-danger">*</span></label>
            <input type="date" class="form-control form-control-sm" value="2026-04-12">
          </div>
          <div class="col-md-6">
            <label class="form-label small fw-medium">配送先</label>
            <select class="form-select form-select-sm">
              <option>登録住所と同じ</option><option>別住所を指定</option>
            </select>
          </div>
          <div class="col-md-6">
            <label class="form-label small fw-medium">支払方法</label>
            <select class="form-select form-select-sm">
              <option>銀行振込</option><option>クレジットカード</option><option>代引き</option>
            </select>
          </div>
        </div>
      </div>
    </div>
    <div class="card border-0 shadow-sm mb-3">
      <div class="card-header bg-white border-bottom py-2 d-flex justify-content-between align-items-center">
        <span class="fw-medium small text-muted">注文明細</span>
        <button class="btn btn-outline-success btn-sm py-0"><i class="bi bi-plus me-1"></i>行追加</button>
      </div>
      <div class="card-body p-0">
        <table class="table table-sm mb-0 align-middle">
          <thead class="table-light">
            <tr>
              <th class="ps-3" style="width:40%">商品名</th>
              <th style="width:15%">単価（円）</th>
              <th style="width:10%">数量</th>
              <th class="text-end" style="width:20%">小計</th>
              <th style="width:5%"></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="ps-3"><input type="text" class="form-control form-control-sm" value="商品A"></td>
              <td><input type="number" class="form-control form-control-sm" value="50000"></td>
              <td><input type="number" class="form-control form-control-sm" value="2"></td>
              <td class="text-end pe-3">¥100,000</td>
              <td><button class="btn btn-outline-danger btn-sm py-0 px-1"><i class="bi bi-x"></i></button></td>
            </tr>
            <tr>
              <td class="ps-3"><input type="text" class="form-control form-control-sm" value="商品B"></td>
              <td><input type="number" class="form-control form-control-sm" value="28000"></td>
              <td><input type="number" class="form-control form-control-sm" value="1"></td>
              <td class="text-end pe-3">¥28,000</td>
              <td><button class="btn btn-outline-danger btn-sm py-0 px-1"><i class="bi bi-x"></i></button></td>
            </tr>
          </tbody>
          <tfoot class="table-light">
            <tr>
              <td colspan="3" class="text-end pe-2 fw-medium">税込合計</td>
              <td class="text-end pe-3 fw-bold fs-6">¥140,800</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
    <div class="card border-0 shadow-sm mb-3">
      <div class="card-header bg-white border-bottom py-2">
        <span class="fw-medium small text-muted">備考</span>
      </div>
      <div class="card-body">
        <textarea class="form-control form-control-sm" rows="2" placeholder="配送上の注意点、特記事項など"></textarea>
      </div>
    </div>
    <div class="d-flex justify-content-end gap-2 pb-3">
      <button class="btn btn-outline-secondary">キャンセル</button>
      <button class="btn btn-success"><i class="bi bi-check-lg me-1"></i>注文確定</button>
    </div>
  </div>
</div>`, [
      { match: `<input type="text" class="form-control" placeholder="顧客名で検索">`,
        attrs: { name: "customer", id: "customer", "data-item-id": UUID_0009_CUST } },
      { match: `<input type="date" class="form-control form-control-sm" value="2026-04-12">`,
        attrs: { name: "order_date", id: "order_date", "data-item-id": UUID_0009_ORDER_DATE } },
      { match: `<select class="form-select form-select-sm">\\s*<option>登録住所と同じ`,
        attrs: { name: "delivery", id: "delivery", "data-item-id": UUID_0009_DELIVERY } },
      { match: `<select class="form-select form-select-sm">\\s*<option>銀行振込`,
        attrs: { name: "payment", id: "payment", "data-item-id": UUID_0009_PAYMENT } },
      // 注文明細 1行目 (text → number → number の順)
      { match: `<input type="text" class="form-control form-control-sm" value="商品A">`,
        attrs: { name: "item_name_1", id: "item_name_1", "data-item-id": UUID_0009_ITEM1_NAME } },
      { match: `<input type="number" class="form-control form-control-sm" value="50000">`,
        attrs: { name: "unit_price_1", id: "unit_price_1", "data-item-id": UUID_0009_ITEM1_PRICE } },
      { match: `<input type="number" class="form-control form-control-sm" value="2">`,
        attrs: { name: "qty_1", id: "qty_1", "data-item-id": UUID_0009_ITEM1_QTY } },
      // 注文明細 2行目
      { match: `<input type="text" class="form-control form-control-sm" value="商品B">`,
        attrs: { name: "item_name_2", id: "item_name_2", "data-item-id": UUID_0009_ITEM2_NAME } },
      { match: `<input type="number" class="form-control form-control-sm" value="28000">`,
        attrs: { name: "unit_price_2", id: "unit_price_2", "data-item-id": UUID_0009_ITEM2_PRICE } },
      { match: `<input type="number" class="form-control form-control-sm" value="1">`,
        attrs: { name: "qty_2", id: "qty_2", "data-item-id": UUID_0009_ITEM2_QTY } },
      { match: `<textarea class="form-control form-control-sm" rows="2" placeholder="配送上の注意点、特記事項など">`,
        attrs: { name: "notes", id: "notes", "data-item-id": UUID_0009_NOTES } },
    ]),
  },

  "aaaaaaaa-0010-4000-8000-aaaaaaaaaaaa": {
    pageId: "pg-complete-0010", frameId: "fr-complete-0010",
    html: `
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
              <div class="col-7 small fw-medium">顧客登録</div>
              <div class="col-5 small text-muted">対象</div>
              <div class="col-7 small fw-medium">山田 太郎（C-0001）</div>
              <div class="col-5 small text-muted">処理日時</div>
              <div class="col-7 small">2026-04-12 10:30:45</div>
              <div class="col-5 small text-muted">担当者</div>
              <div class="col-7 small">管理者</div>
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
</div>`,
  },
};

// ── ファイル生成 ────────────────────────────────────────────────────────────
let count = 0;
for (const [screenId, { pageId, frameId, html }] of Object.entries(SCREENS)) {
  const data = makeScreenData(html.trim(), pageId, frameId);
  const json = JSON.stringify(data, null, 2);

  // data/screens/ に書き込み
  fs.writeFileSync(path.join(SCREENS_DIR, `${screenId}.json`), json, "utf8");

  // docs/sample-project/screens/ にバックアップ
  fs.writeFileSync(path.join(SEED_SCREENS_DIR, `${screenId}.json`), json, "utf8");

  count++;
  console.log(`[${count}/10] ${screenId}`);
}

// ── 画面項目定義ファイル生成 ───────────────────────────────────────────────
let siCount = 0;
for (const [screenId, items] of Object.entries(SCREEN_ITEMS)) {
  const file = makeScreenItemsFile(screenId, items);
  const json = JSON.stringify(file, null, 2);
  fs.writeFileSync(path.join(SCREEN_ITEMS_DIR, `${screenId}.json`), json, "utf8");
  fs.writeFileSync(path.join(SEED_SCREEN_ITEMS_DIR, `${screenId}.json`), json, "utf8");
  siCount++;
}

// project.json を data/ にコピー
fs.copyFileSync(
  path.join(__dirname, "project.json"),
  path.join(DATA_DIR, "project.json"),
);

// ── テーブル定義データをコピー ────────────────────────────────────────────
let tableCount = 0;
if (fs.existsSync(SEED_TABLES_DIR)) {
  const tableFiles = fs.readdirSync(SEED_TABLES_DIR).filter((f) => f.endsWith(".json"));
  for (const file of tableFiles) {
    fs.copyFileSync(
      path.join(SEED_TABLES_DIR, file),
      path.join(TABLES_DIR, file),
    );
    tableCount++;
    console.log(`[table ${tableCount}/${tableFiles.length}] ${file.replace(".json", "")}`);
  }
}

// ── 処理フロー定義データをコピー ──────────────────────────────────────────
let actionCount = 0;
if (fs.existsSync(SEED_PROCESS_FLOWS_DIR)) {
  const actionFiles = fs.readdirSync(SEED_PROCESS_FLOWS_DIR).filter((f) => f.endsWith(".json"));
  for (const file of REQUIRED_PROCESS_FLOW_FILES) {
    if (!actionFiles.includes(file)) {
      throw new Error(`Required process-flow sample is missing: ${file}`);
    }
  }
  for (const file of actionFiles) {
    fs.copyFileSync(
      path.join(SEED_PROCESS_FLOWS_DIR, file),
      path.join(PROCESS_FLOWS_DIR, file),
    );
    actionCount++;
    console.log(`[action ${actionCount}/${actionFiles.length}] ${file.replace(".json", "")}`);
  }
}

// ── 規約カタログをコピー (#317) ───────────────────────────────────────────
// docs/sample-project/conventions/conventions-catalog.json を
// data/conventions/catalog.json にコピー (ファイル名を正規化)
let conventionsCount = 0;
if (fs.existsSync(SEED_CONVENTIONS_DIR)) {
  const src = path.join(SEED_CONVENTIONS_DIR, "conventions-catalog.json");
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(CONVENTIONS_DIR, "catalog.json"));
    conventionsCount++;
    console.log(`[conventions 1/1] catalog.json`);
  }
}

console.log("\n✅ シードデータ生成完了");
console.log(`   data/screens/        → ${count} ファイル`);
console.log(`   data/screen-items/   → ${siCount} ファイル`);
console.log(`   data/tables/         → ${tableCount} ファイル`);
console.log(`   data/process-flows/        → ${actionCount} ファイル`);
console.log(`   data/conventions/    → ${conventionsCount} ファイル`);
console.log(`   docs/sample-project/ → バックアップ済み`);
console.log("\n復元方法:");
console.log("   node docs/sample-project/seed.mjs");
