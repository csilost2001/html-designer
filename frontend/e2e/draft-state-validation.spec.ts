/**
 * draft-state validation 表示の網羅 spec (#934)
 *
 * `tmp/review-cache/e2e-coverage-audit.md` 領域 11 の B 判定 — `validation-warnings-panel.spec.ts`
 * 等は UNKNOWN_COLUMN / UNKNOWN_CONV_MSG 等の個別 validator はカバーしているが、
 * `docs/spec/draft-state-policy.md` 5 原則を主要リソース横断で検証する spec が欠けていた。
 *
 * ## 5 原則 (`docs/spec/draft-state-policy.md`)
 *
 *   2.1 schema は最終ゲート (テスト対象外、test layer の AJV 側)
 *   2.2 保存は常に許可 (schema 違反でも load 可)
 *   2.3 読み込み時に validate / Map で UI に渡す
 *   2.4 違反は一覧 (.has-error / .has-warning + ValidationBadge) と編集画面で示す
 *   2.5 MaturityBadge 表示
 *
 * ## カバー対象
 *
 * - Table 一覧 (.has-error / .has-warning + ValidationBadge) — physicalName 空 / 重複 /
 *   主キー未指定
 * - Table 編集画面: 「列」タブヘッダーの warning marker (列数 0 / 主キー 0)
 * - View 一覧 (.has-error / .has-warning) — outputColumns 空 / selectStatement 空
 * - schema 違反データの load 成功 (= 保存もブロックされない原則 2.2 の表明)
 * - MaturityBadge 表示 (一覧 + 編集画面、原則 2.5)
 *
 * ## カバー外 (理由付きで対象外)
 *
 * - **8 リソース全網羅**: `draft-state-policy.md` で言及される業務リソース全種別 (Screen /
 *   Table / View / ProcessFlow / ViewDefinition / Conventions / Extensions / Sequence) の
 *   8 × 5 マトリクスは spec 数が肥大化する。代表 2 リソース (Table / View) で原則を担保し、
 *   ProcessFlow は既存 `validation-warnings-panel.spec.ts` 系で個別 validator をカバー済
 * - **SQL alias violation 検出 (#775)**: ViewDefinition / dbAccess SELECT 句 alias の検証は
 *   `validation-sql-conv-panel.spec.ts` の責務。本 spec の draft-state policy とは別軸
 * - **commit (maturity 進行) 阻止条件**: 仕様調査の結果、現行の MaturityBadge は editor
 *   で `onChange` を受け取って自由に変更可能で、validation error 時の commit ブロックは
 *   設計に存在しない (spec §4.2)。本 spec では阻止検証を行わず、原則 2.5 の表示確認に絞る
 * - **新規リソース追加 checklist**: PR チェックリスト (spec §6) であり実装時に守るもの。
 *   e2e テスト範囲外
 *
 * ## 関連
 *
 * - 親: #929 (E2E カバレッジ強化シリーズ)
 * - 監査: `tmp/review-cache/e2e-coverage-audit.md` 領域 11 (B 判定)
 * - 仕様: `docs/spec/draft-state-policy.md` (5 原則)
 * - 既存: `frontend/e2e/validation-warnings-panel.spec.ts`、`frontend/e2e/maturity-notes.spec.ts`
 */

import { test, expect } from "@playwright/test";
import {
  setupTestWorkspace,
  cleanupRealWorkspaces,
  isMcpRunning,
  normalizeId,
  type OpenedWorkspace,
} from "./helpers/realWorkspace";
import { buildProject, buildView } from "./__fixtures__/builders";
import type {
  LocalId,
  PhysicalName,
  ProjectEntities,
  Table,
  TableId,
  Timestamp,
  View,
} from "../src/types/v3";

const FIXED_TS = "2026-05-08T00:00:00.000Z" as unknown as Timestamp;

// ── Table fixtures ──────────────────────────────────────────────────────────

const TABLE_OK_ID = normalizeId("test-tbl-934-ok-4000-8000-000000000001");
const TABLE_NOPK_ID = normalizeId("test-tbl-934-nopk-4000-8000-000000000001");
const TABLE_NONAME_ID = normalizeId("test-tbl-934-noname-4000-8000-000000000001");

function buildTableOk(): Table {
  return {
    $schema: "../../schemas/v3/table.v3.schema.json",
    id: TABLE_OK_ID as unknown as TableId,
    name: "正常テーブル",
    physicalName: "tbl_ok" as unknown as PhysicalName,
    maturity: "draft",
    columns: [
      {
        id: "col-pk" as unknown as LocalId,
        physicalName: "id" as unknown as PhysicalName,
        name: "ID",
        dataType: "BIGINT",
        primaryKey: true,
        notNull: true,
      },
    ],
    createdAt: FIXED_TS,
    updatedAt: FIXED_TS,
  };
}

function buildTableNoPk(): Table {
  // 主キー未指定 → warning (table.primaryKey.empty)
  return {
    $schema: "../../schemas/v3/table.v3.schema.json",
    id: TABLE_NOPK_ID as unknown as TableId,
    name: "PK 無テーブル",
    physicalName: "tbl_nopk" as unknown as PhysicalName,
    maturity: "draft",
    columns: [
      {
        id: "col-1" as unknown as LocalId,
        physicalName: "name" as unknown as PhysicalName,
        name: "氏名",
        dataType: "VARCHAR",
        length: 255,
      },
    ],
    createdAt: FIXED_TS,
    updatedAt: FIXED_TS,
  };
}

function buildTableNoName(): Table {
  // physicalName 空 → error (table.physicalName.empty)。
  // schema は最終ゲートで AJV では reject される data だが、UI 側 store は読み込みを許可し
  // 一覧で has-error / ValidationBadge.error として可視化する (原則 2.2 + 2.4)。
  return {
    $schema: "../../schemas/v3/table.v3.schema.json",
    id: TABLE_NONAME_ID as unknown as TableId,
    name: "物理名なしテーブル",
    physicalName: "" as unknown as PhysicalName,
    maturity: "draft",
    columns: [
      {
        id: "col-pk" as unknown as LocalId,
        physicalName: "id" as unknown as PhysicalName,
        name: "ID",
        dataType: "BIGINT",
        primaryKey: true,
        notNull: true,
      },
    ],
    createdAt: FIXED_TS,
    updatedAt: FIXED_TS,
  };
}

// ── View fixtures ───────────────────────────────────────────────────────────

const VIEW_OK_ID = normalizeId("test-view-934-ok-4000-8000-000000000001");
const VIEW_NOOUT_ID = normalizeId("test-view-934-noout-4000-8000-000000000001");
const VIEW_NOSEL_ID = normalizeId("test-view-934-nosel-4000-8000-000000000001");

function buildViewNoOutput(): View {
  // outputColumns 空 → warning (view.outputColumns.empty)
  // builder は schema minItems:1 を満たすために default 1 件を入れるので、明示空配列を強制する
  const v = buildView({
    id: "test-view-934-noout-4000-8000-000000000001",
    physicalName: "v_noout",
    name: "出力列なし view",
  });
  v.outputColumns = [];
  return v;
}

function buildViewNoSelect(): View {
  // selectStatement 空 → error (view.selectStatement.empty)
  const v = buildView({
    id: "test-view-934-nosel-4000-8000-000000000001",
    physicalName: "v_nosel",
    name: "SELECT 空 view",
    selectStatement: "",
  });
  return v;
}

const dummyProject = buildProject({
  name: "E2E draft-state validation",
  entities: {
    tables: [
      { id: TABLE_OK_ID, no: 1, physicalName: "tbl_ok", name: "正常テーブル", columnCount: 1, updatedAt: FIXED_TS, maturity: "draft" },
      { id: TABLE_NOPK_ID, no: 2, physicalName: "tbl_nopk", name: "PK 無テーブル", columnCount: 1, updatedAt: FIXED_TS, maturity: "draft" },
      { id: TABLE_NONAME_ID, no: 3, physicalName: "", name: "物理名なしテーブル", columnCount: 1, updatedAt: FIXED_TS, maturity: "draft" },
    ],
    views: [
      { id: VIEW_OK_ID, no: 1, physicalName: "v_ok", name: "正常 view", updatedAt: FIXED_TS },
      { id: VIEW_NOOUT_ID, no: 2, physicalName: "v_noout", name: "出力列なし view", updatedAt: FIXED_TS },
      { id: VIEW_NOSEL_ID, no: 3, physicalName: "v_nosel", name: "SELECT 空 view", updatedAt: FIXED_TS },
    ],
  } as ProjectEntities,
});

const WS_KEY = "issue-934-draft-state";
let mcpAvailable = false;
let ws: OpenedWorkspace;

const viewOk = buildView({
  id: "test-view-934-ok-4000-8000-000000000001",
  physicalName: "v_ok",
  name: "正常 view",
});

test.describe.configure({ mode: "serial" });

test.describe("draft-state validation 表示 (#934)", { tag: ["@regression"] }, () => {
  test.beforeAll(async () => {
    mcpAvailable = await isMcpRunning();
    if (!mcpAvailable) return;
    ws = await setupTestWorkspace({
      key: WS_KEY,
      project: dummyProject,
      tables: [buildTableOk(), buildTableNoPk(), buildTableNoName()],
      views: [viewOk, buildViewNoOutput(), buildViewNoSelect()],
    });
  });

  test.afterAll(async () => {
    if (mcpAvailable) await cleanupRealWorkspaces([WS_KEY]);
  });

  test.beforeEach(() => {
    test.skip(!mcpAvailable, "backend (port 5179) が起動していません");
  });

  test.describe("Table 一覧 — 原則 2.4 (一覧 has-error / ValidationBadge)", () => {
    test("physicalName 空の Table card は has-error + ValidationBadge.error", async ({ page }) => {
      await ws.gotoActive(page, "/table/list");
      await expect(page.locator(".table-list-page")).toBeVisible({ timeout: 15000 });
      // 全 3 件描画される (= schema 違反の TABLE_NONAME も load された、原則 2.2 の表明)
      await expect(page.locator(".table-card-content")).toHaveCount(3, { timeout: 10000 });
      // 物理名空 row を特定して has-error クラスを検証
      const errorCard = page.locator(".table-card-content.has-error");
      await expect(errorCard).toHaveCount(1);
      await expect(errorCard.locator(".validation-badge.error")).toBeVisible();
    });

    test("primaryKey 未指定の Table card は has-warning + ValidationBadge.warning", async ({ page }) => {
      await ws.gotoActive(page, "/table/list");
      await expect(page.locator(".table-list-page")).toBeVisible({ timeout: 15000 });
      // PK 無 + display name は OK な card は has-warning (error が無いので warning が出る)
      const warningCards = page.locator(".table-card-content.has-warning");
      await expect(warningCards).toHaveCount(1);
      await expect(warningCards.locator(".validation-badge.warning")).toBeVisible();
    });

    test("正常 Table card は has-error / has-warning どちらも付かない", async ({ page }) => {
      await ws.gotoActive(page, "/table/list");
      await expect(page.locator(".table-list-page")).toBeVisible({ timeout: 15000 });
      // すべての card のうち、validation 警告が無いものは 1 件
      // (正常: tbl_ok / has-warning: tbl_nopk / has-error: tbl_noname)
      const noWarn = page.locator(".table-card-content").filter({
        hasNot: page.locator(".has-error, .has-warning"),
      });
      // .filter `hasNot` は子孫検索なので、自身に has-error/has-warning がある card は noWarn から除外できない。
      // 代わりに count diff で検証:
      const total = await page.locator(".table-card-content").count();
      const error = await page.locator(".table-card-content.has-error").count();
      const warning = await page.locator(".table-card-content.has-warning").count();
      expect(total - error - warning).toBe(1);
      void noWarn; // 上記 hint 以外で活用しないが lint 警告抑止
    });
  });

  test.describe("View 一覧 — 原則 2.4", () => {
    test("selectStatement 空 view は has-error", async ({ page }) => {
      await ws.gotoActive(page, "/view/list");
      // ListView ではなく seq-card-content クラス (実装上 seq-card-* を共有)
      await expect(page.locator(".seq-card-content").first()).toBeVisible({ timeout: 15000 });
      const errorCard = page.locator(".seq-card-content.has-error");
      await expect(errorCard).toHaveCount(1);
      await expect(errorCard.locator(".validation-badge.error")).toBeVisible();
    });

    test("outputColumns 空 view は has-warning", async ({ page }) => {
      await ws.gotoActive(page, "/view/list");
      await expect(page.locator(".seq-card-content").first()).toBeVisible({ timeout: 15000 });
      const warningCards = page.locator(".seq-card-content.has-warning");
      await expect(warningCards).toHaveCount(1);
      await expect(warningCards.locator(".validation-badge.warning")).toBeVisible();
    });
  });

  test.describe("Table 編集画面 — 原則 2.4 (編集画面 warning marker)", () => {
    test("PK 無テーブルを開くと「列」タブヘッダーに warning marker が出る", async ({ page }) => {
      await ws.gotoActive(page, `/table/edit/${normalizeId(TABLE_NOPK_ID)}`);
      await expect(page.locator(".table-editor-page")).toBeVisible({ timeout: 15000 });
      // ResumeOrDiscardDialog 退避
      if (await page.locator(".edit-mode-modal-backdrop").isVisible({ timeout: 1000 }).catch(() => false)) {
        await page.evaluate(() => {
          const btn = document.querySelector('[data-testid="resume-discard"]') as HTMLButtonElement | null;
          btn?.click();
        });
        await expect(page.locator(".edit-mode-modal-backdrop")).toBeHidden({ timeout: 5000 });
      }
      // 「列」タブのヘッダー隣の warning marker (TableEditor.tsx 行 361 で title="主キーが未指定です")
      const tabBtn = page.locator(".table-editor-tabs button").filter({ hasText: /列/ }).first();
      await expect(tabBtn).toBeVisible();
      await expect(tabBtn.locator('[title="主キーが未指定です"]')).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe("MaturityBadge — 原則 2.5", () => {
    test("Table 一覧 card に MaturityBadge が表示される", async ({ page }) => {
      await ws.gotoActive(page, "/table/list");
      await expect(page.locator(".table-card-content").first()).toBeVisible({ timeout: 15000 });
      // 全 card に MaturityBadge が描画される
      await expect(page.locator(".table-card-content .maturity-badge")).toHaveCount(3);
    });

    test("Table 編集画面で MaturityBadge をクリックして変更できる (editable variant)", async ({ page }) => {
      await ws.gotoActive(page, `/table/edit/${normalizeId(TABLE_OK_ID)}`);
      await expect(page.locator(".table-editor-page")).toBeVisible({ timeout: 15000 });
      // ResumeOrDiscardDialog 退避
      if (await page.locator(".edit-mode-modal-backdrop").isVisible({ timeout: 1000 }).catch(() => false)) {
        await page.evaluate(() => {
          const btn = document.querySelector('[data-testid="resume-discard"]') as HTMLButtonElement | null;
          btn?.click();
        });
        await expect(page.locator(".edit-mode-modal-backdrop")).toBeHidden({ timeout: 5000 });
      }
      // 編集モードに入る (MaturityBadge は editor で onChange 接続される)
      await page.getByTestId("edit-mode-start").click();
      await expect(page.getByTestId("edit-mode-save")).toBeVisible();
      // テーブルメタ編集を開く (テーブルタイトルクリック → TableMetaEditor)
      await page.locator(".table-editor-title").click();
      // .table-meta-input.maturity または select で maturity を変更
      const maturitySelect = page.locator(".table-meta-editor select.table-meta-input").nth(1);
      await expect(maturitySelect).toBeVisible({ timeout: 3000 });
      // option を確認 (draft / provisional / committed のいずれか存在)
      await maturitySelect.selectOption("committed");
      await expect(maturitySelect).toHaveValue("committed");
    });
  });

  test.describe("原則 2.2 — schema 違反 fixture も保存・読み込みされる", () => {
    test("physicalName 空の Table が一覧に表示される (load 成功 = 保存もブロッカーではない)", async ({ page }) => {
      await ws.gotoActive(page, "/table/list");
      await expect(page.locator(".table-card-content")).toHaveCount(3, { timeout: 15000 });
      // 物理名空の row でも logical name が表示される
      await expect(page.locator(".table-card-logical").filter({ hasText: "物理名なしテーブル" })).toBeVisible();
    });

    test("selectStatement 空の View が一覧に表示される", async ({ page }) => {
      await ws.gotoActive(page, "/view/list");
      await expect(page.locator(".seq-card-content")).toHaveCount(3, { timeout: 15000 });
    });
  });
});
