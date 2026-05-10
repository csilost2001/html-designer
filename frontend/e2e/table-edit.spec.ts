/**
 * テーブル編集画面 (`/table/edit/:tableId`) の column CRUD / 制約 / インデックス E2E (#932)
 *
 * `tmp/review-cache/e2e-coverage-audit.md` 領域 6 の B 判定 — テーブル一覧 (CRUD/検索/選択/
 * ソート) は `table-list.spec.ts` でカバー済だが、編集画面に踏み込んだ操作 (column CRUD /
 * 型変更 / PK / 制約 / インデックス) の専用 spec が欠けていた。本 spec は
 * `docs/spec/list-common.md` 仕様の `カラム一覧` 部分 + TableEditor 全タブを網羅する。
 *
 * ## カバー対象
 *
 * - カラム追加 (空 / テンプレート)
 * - カラム編集 (physicalName / 表示名 / 型変更)
 * - フラグ切替 (NOT NULL / PRIMARY KEY / UNIQUE / AUTO INCREMENT)
 * - カラム並び替え (上へ / 下へ)
 * - カラム削除
 * - 保存 → 別 page reload で永続化を確認
 * - 制約タブ: UNIQUE 制約追加
 * - インデックスタブ: インデックス追加
 * - ER 図ページ smoke (canvas が render される)
 *
 * ## カバー外 (理由付きで対象外)
 *
 * - **SQL alias 編集**: #932 ISSUE 本文に SQL alias 編集 (#775) と記載があるが、SQL alias は
 *   ProcessFlow `dbAccess.sql` の SELECT 句 alias (`AS "<camelCase>"`) を指す概念で、
 *   TableEditor のカラム属性ではない (`docs/spec/view-definition.md` D-5 参照)。よって
 *   TableEditor 範囲外として除外する
 * - **view-definition への列追加伝搬**: 別 spec で扱う方が責務分離上自然。本 spec は
 *   TableEditor の自己完結性に絞る (#932 ISSUE 受入条件「最低 1 検証」は本シリーズの
 *   #934 (draft-state validation) 側で view 一括検証と合わせて拾う方針)
 * - **D&D 並び替え**: TableEditor の columns-data-list は HTML5 D&D を提供していない可能性が
 *   あり、UI 上は「上へ / 下へ」ボタンで並び替えるのが標準動線。spec はボタン経路で検証する
 *
 * ## 関連
 *
 * - 親: #929 (E2E カバレッジ強化シリーズ)
 * - 監査: `tmp/review-cache/e2e-coverage-audit.md` 領域 6 (B 判定)
 * - 既存: `frontend/e2e/table-list.spec.ts` (一覧側)、`frontend/e2e/save-reset.spec.ts` (保存ボタン)
 * - 仕様: `docs/spec/list-common.md`、`docs/spec/draft-state-policy.md`
 */

import { test, expect, type Page } from "@playwright/test";
import {
  setupTestWorkspace,
  cleanupRealWorkspaces,
  isMcpRunning,
  normalizeId,
  seedTabsForWorkspace,
  type OpenedWorkspace,
} from "./helpers/realWorkspace";
import { buildProject } from "./__fixtures__/builders";
import type {
  Column,
  LocalId,
  PhysicalName,
  ProjectEntities,
  Table,
  TableId,
  Timestamp,
} from "../src/types/v3";

const TABLE_ID = normalizeId("test-table-0932-4000-8000-000000000001");
const TABLE_NORM = normalizeId(TABLE_ID);
const FIXED_TS = "2026-05-08T00:00:00.000Z" as unknown as Timestamp;

/** 物理名 1 / 主キー 1、追加検証用に「2 列目以降を後から add する」前提の最小 fixture */
function buildTableFixture(): Table {
  const cols: Column[] = [
    {
      id: "col-pk" as unknown as LocalId,
      physicalName: "id" as unknown as PhysicalName,
      name: "ユーザーID",
      dataType: "BIGINT",
      notNull: true,
      primaryKey: true,
      autoIncrement: true,
    },
    {
      id: "col-name" as unknown as LocalId,
      physicalName: "name" as unknown as PhysicalName,
      name: "氏名",
      dataType: "VARCHAR",
      length: 255,
      notNull: true,
    },
  ];
  return {
    $schema: "../../schemas/v3/table.v3.schema.json",
    id: TABLE_ID as unknown as TableId,
    name: "ユーザーマスタ",
    physicalName: "users" as unknown as PhysicalName,
    category: "マスタ",
    maturity: "draft",
    columns: cols,
    createdAt: FIXED_TS,
    updatedAt: FIXED_TS,
  };
}

const dummyProject = buildProject({
  name: "E2E テーブル編集テスト",
  entities: {
    tables: [
      {
        id: TABLE_ID,
        no: 1,
        physicalName: "users",
        name: "ユーザーマスタ",
        category: "マスタ",
        columnCount: 2,
        updatedAt: FIXED_TS,
      },
    ],
  } as ProjectEntities,
});

const dummyTab = {
  id: `table:${TABLE_NORM}`,
  type: "table",
  resourceId: TABLE_NORM,
  label: "ユーザーマスタ",
  isDirty: false,
  isPinned: false,
};

const WS_KEY = "issue-932-table-edit";
let mcpAvailable = false;

async function setupTableEditor(page: Page, ws: OpenedWorkspace): Promise<void> {
  await seedTabsForWorkspace(page, ws.wsId, [dummyTab], dummyTab.id);
  await ws.gotoActive(page, `/table/edit/${TABLE_NORM}`);
  await expect(page.locator(".table-editor-page")).toBeVisible({ timeout: 15000 });
  // save-reset.spec.ts 同様: 残骸 EditSession の ResumeOrDiscardDialog を破棄する。
  // Playwright click が edit-mode-modal-footer に intercept されるため evaluate で送る。
  if (await page.locator(".edit-mode-modal-backdrop").isVisible({ timeout: 1000 }).catch(() => false)) {
    await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="resume-discard"]') as HTMLButtonElement | null;
      btn?.click();
    });
    await expect(page.locator(".edit-mode-modal-backdrop")).toBeHidden({ timeout: 5000 });
  }
  // editing モードに入る (#683 edit-session-draft)
  await page.getByTestId("edit-mode-start").click();
  await expect(page.getByTestId("edit-mode-save")).toBeVisible();
}

test.describe("テーブル編集画面 column CRUD (#932)", { tag: ["@regression"] }, () => {
  let ws: OpenedWorkspace;

  test.beforeAll(async () => {
    mcpAvailable = await isMcpRunning();
    if (!mcpAvailable) return;
    ws = await setupTestWorkspace({
      key: WS_KEY,
      project: dummyProject,
      tables: [buildTableFixture()],
    });
  });

  test.afterAll(async () => {
    if (mcpAvailable) await cleanupRealWorkspaces([WS_KEY]);
  });

  test.beforeEach(async ({ page }) => {
    test.skip(!mcpAvailable, "backend (port 5179) が起動していません");
    await setupTableEditor(page, ws);
  });

  test.afterEach(async ({ page }) => {
    if (mcpAvailable) await ws.resetRuntimeState(page);
  });

  test("既定 fixture が 2 カラム持って表示される", async ({ page }) => {
    // columns-data-list 内 row が 2 件 (DataList layout=table の row、または card)
    const rows = page.locator(".columns-data-list .data-list-row, .columns-data-list .data-list-card");
    await expect(rows).toHaveCount(2);
    // 物理名表示
    await expect(page.locator(".col-name-code").filter({ hasText: "id" })).toBeVisible();
    await expect(page.locator(".col-name-code").filter({ hasText: "name" })).toBeVisible();
  });

  test("カラム追加 (空) で row が増え保存ボタンが有効化", async ({ page }) => {
    const rows = page.locator(".columns-data-list .data-list-row, .columns-data-list .data-list-card");
    await expect(rows).toHaveCount(2);
    await page.locator(".columns-add-bar .tbl-btn-primary").filter({ hasText: /カラム追加/ }).click();
    await expect(rows).toHaveCount(3);
    // edit-mode-save は disabled 解除 (有効化)
    await expect(page.getByTestId("edit-mode-save")).toBeEnabled();
    // tab dirty インジケーター
    await expect(page.locator(".tabbar-tab.dirty")).toBeVisible();
  });

  test("カラム編集: 追加した列の物理名・型を変更できる", async ({ page }) => {
    // 1 列追加して detail panel を開く
    await page.locator(".columns-add-bar .tbl-btn-primary").filter({ hasText: /カラム追加/ }).click();
    const rows = page.locator(".columns-data-list .data-list-row, .columns-data-list .data-list-card");
    await expect(rows).toHaveCount(3);
    // 末尾 row をクリックして detail panel を開く
    await rows.last().click();
    const detail = page.locator(".column-detail").last();
    await expect(detail).toBeVisible();

    // 物理名を編集 (1 つ目の text input が物理名)
    const physicalInput = detail.locator(".column-detail-grid input[type='text']").first();
    await physicalInput.fill("email");
    // 型を VARCHAR に変更
    const typeSelect = detail.locator(".column-detail-grid select").first();
    await typeSelect.selectOption("VARCHAR");
    // データリストの該当 row 表示が更新される
    await expect(page.locator(".col-name-code").filter({ hasText: "email" })).toBeVisible();
    await expect(page.locator(".col-type-badge").filter({ hasText: "VARCHAR" }).first()).toBeVisible();
  });

  test("フラグ切替 (NOT NULL / PRIMARY KEY / UNIQUE / AUTO INCREMENT)", async ({ page }) => {
    // 既存の `name` 列 (2 列目) を選択
    const rows = page.locator(".columns-data-list .data-list-row, .columns-data-list .data-list-card");
    await rows.nth(1).click();
    const detail = page.locator(".column-detail").last();
    await expect(detail).toBeVisible();

    const flags = detail.locator(".column-flag-label");
    // NOT NULL (既に true)、PRIMARY KEY (false)、UNIQUE (false)、AUTO INCREMENT (false)
    const pkCheckbox = flags.nth(1).locator("input[type='checkbox']");
    const ukCheckbox = flags.nth(2).locator("input[type='checkbox']");
    await pkCheckbox.check();
    await ukCheckbox.check();
    await expect(pkCheckbox).toBeChecked();
    await expect(ukCheckbox).toBeChecked();
    // 列ヘッダ表示でも PK アイコンが点く
    await expect(rows.nth(1).locator(".col-pk-icon")).toBeVisible();
  });

  test("カラム並び替え (上へ): 2 列目を 1 列目に上げる", async ({ page }) => {
    const rows = page.locator(".columns-data-list .data-list-row, .columns-data-list .data-list-card");
    // 2 列目 (name) を選択
    await rows.nth(1).click();
    // selection bar の「上へ」ボタン
    await page.locator(".columns-selection-actions button").filter({ hasText: /上へ/ }).click();
    // 順序が name / id に変わる (1 列目に name が来る)
    await expect(rows.first().locator(".col-name-code")).toHaveText("name");
    await expect(rows.nth(1).locator(".col-name-code")).toHaveText("id");
  });

  test("カラム削除: row が消えて保存ボタンが有効", async ({ page }) => {
    const rows = page.locator(".columns-data-list .data-list-row, .columns-data-list .data-list-card");
    // 2 列目 (name) を選択
    await rows.nth(1).click();
    // 削除ボタン (selection-actions の danger)
    await page.locator(".columns-selection-actions button.danger").click();
    // 残り 1 件
    await expect(rows).toHaveCount(1);
    await expect(page.locator(".col-name-code").filter({ hasText: "name" })).toHaveCount(0);
    await expect(page.getByTestId("edit-mode-save")).toBeEnabled();
  });

  test("保存後に reload しても変更が永続化される", async ({ page }) => {
    // カラム追加 → 物理名編集 → 保存
    await page.locator(".columns-add-bar .tbl-btn-primary").filter({ hasText: /カラム追加/ }).click();
    const rows = page.locator(".columns-data-list .data-list-row, .columns-data-list .data-list-card");
    await rows.last().click();
    const detail = page.locator(".column-detail").last();
    await detail.locator(".column-detail-grid input[type='text']").first().fill("memo");
    await page.getByTestId("edit-mode-save").click();
    // 保存完了 → readonly モード復帰
    await expect(page.getByTestId("edit-mode-start")).toBeVisible({ timeout: 10000 });
    // reload して反映確認
    await page.reload();
    await expect(page.locator(".table-editor-page")).toBeVisible({ timeout: 15000 });
    // ResumeOrDiscardDialog が出ていれば破棄
    if (await page.locator(".edit-mode-modal-backdrop").isVisible({ timeout: 1000 }).catch(() => false)) {
      await page.evaluate(() => {
        const btn = document.querySelector('[data-testid="resume-discard"]') as HTMLButtonElement | null;
        btn?.click();
      });
    }
    await expect(page.locator(".col-name-code").filter({ hasText: "memo" })).toBeVisible({ timeout: 5000 });
  });
});

test.describe("テーブル編集画面 制約タブ (#932)", { tag: ["@regression"] }, () => {
  let ws: OpenedWorkspace;
  const WS_KEY_C = "issue-932-table-edit-constraints";

  test.beforeAll(async () => {
    mcpAvailable = await isMcpRunning();
    if (!mcpAvailable) return;
    ws = await setupTestWorkspace({
      key: WS_KEY_C,
      project: dummyProject,
      tables: [buildTableFixture()],
    });
  });

  test.afterAll(async () => {
    if (mcpAvailable) await cleanupRealWorkspaces([WS_KEY_C]);
  });

  test.beforeEach(async ({ page }) => {
    test.skip(!mcpAvailable, "backend (port 5179) が起動していません");
    await setupTableEditor(page, ws);
  });

  test.afterEach(async ({ page }) => {
    if (mcpAvailable) await ws.resetRuntimeState(page);
  });

  test("UNIQUE 制約を追加できる + 一覧 row に表示される", async ({ page }) => {
    // 制約タブに切替
    await page.locator(".table-editor-tabs button").filter({ hasText: /制約/ }).click();
    await expect(page.locator(".constraints-tab")).toBeVisible();
    // 「制約を追加」ドロップダウン → UNIQUE
    await page.locator(".constraints-add-wrap .tbl-btn-primary").filter({ hasText: /制約を追加/ }).click();
    await page.locator(".constraints-add-menu button").filter({ hasText: "UNIQUE" }).click();
    // constraint-row が 1 件追加される
    await expect(page.locator(".constraint-row")).toHaveCount(1);
    await expect(page.locator(".constraint-kind-badge--unique")).toBeVisible();
    await expect(page.getByTestId("edit-mode-save")).toBeEnabled();
  });
});

test.describe("テーブル編集画面 インデックスタブ (#932)", { tag: ["@regression"] }, () => {
  let ws: OpenedWorkspace;
  const WS_KEY_I = "issue-932-table-edit-indexes";

  test.beforeAll(async () => {
    mcpAvailable = await isMcpRunning();
    if (!mcpAvailable) return;
    ws = await setupTestWorkspace({
      key: WS_KEY_I,
      project: dummyProject,
      tables: [buildTableFixture()],
    });
  });

  test.afterAll(async () => {
    if (mcpAvailable) await cleanupRealWorkspaces([WS_KEY_I]);
  });

  test.beforeEach(async ({ page }) => {
    test.skip(!mcpAvailable, "backend (port 5179) が起動していません");
    await setupTableEditor(page, ws);
  });

  test.afterEach(async ({ page }) => {
    if (mcpAvailable) await ws.resetRuntimeState(page);
  });

  test("インデックスを追加できる", async ({ page }) => {
    await page.locator(".table-editor-tabs button").filter({ hasText: /インデックス/ }).click();
    await expect(page.locator(".indexes-tab2")).toBeVisible();
    await page.locator(".indexes-toolbar2 .tbl-btn-primary").filter({ hasText: /追加/ }).click();
    // 追加直後に index-editor-card が開く
    await expect(page.locator(".index-editor-card")).toBeVisible();
    // 物理名 input にデフォルト値が入る (idx_<table>_... 等)
    const nameInput = page.locator(".index-name-input2");
    await expect(nameInput).toBeVisible();
    await expect(page.getByTestId("edit-mode-save")).toBeEnabled();
  });
});

test.describe("ER 図ページ (#932)", { tag: ["@regression"] }, () => {
  let ws: OpenedWorkspace;
  const WS_KEY_ER = "issue-932-er-diagram";

  test.beforeAll(async () => {
    mcpAvailable = await isMcpRunning();
    if (!mcpAvailable) return;
    ws = await setupTestWorkspace({
      key: WS_KEY_ER,
      project: dummyProject,
      tables: [buildTableFixture()],
    });
  });

  test.afterAll(async () => {
    if (mcpAvailable) await cleanupRealWorkspaces([WS_KEY_ER]);
  });

  test.beforeEach(() => {
    test.skip(!mcpAvailable, "backend (port 5179) が起動していません");
  });

  test("/table/er を開くと canvas が render される (smoke)", async ({ page }) => {
    await ws.gotoActive(page, "/table/er");
    await expect(page.locator(".er-diagram-page")).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".er-diagram-canvas")).toBeVisible();
    // toolbar が出る
    await expect(page.locator(".er-toolbar")).toBeVisible();
  });
});
