/**
 * テーブル一覧 (/table/list) E2E スモークテスト — #133 Phase E
 */

import { test, expect, type Page } from "@playwright/test";

const dummyTables = [
  { id: "tbl-0001", name: "users", logicalName: "ユーザーマスタ", description: "", category: "マスタ", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "tbl-0002", name: "orders", logicalName: "注文", description: "", category: "トランザクション", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "tbl-0003", name: "products", logicalName: "商品マスタ", description: "", category: "マスタ", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

const dummyProject = {
  version: 1,
  name: "E2Eテスト用プロジェクト",
  screens: [],
  groups: [],
  edges: [],
  tables: dummyTables,
  updatedAt: new Date().toISOString(),
};

async function setupTableList(page: Page) {
  await page.addInitScript(({ project, tables }) => {
    localStorage.setItem("flow-project", JSON.stringify(project));
    for (const t of tables) {
      localStorage.setItem(`table-${t.id}`, JSON.stringify({ ...t, columns: [], indexes: [] }));
    }
    localStorage.removeItem("designer-open-tabs");
    localStorage.removeItem("designer-active-tab");
    localStorage.removeItem("list-view-mode:table-list");
  }, { project: dummyProject, tables: dummyTables });
  await page.goto("/table/list");
  await expect(page.locator(".table-list-page")).toBeVisible();
}

test.describe("テーブル一覧", () => {
  test("既定はカードレイアウトで全件表示", async ({ page }) => {
    await setupTableList(page);
    await expect(page.locator(".tables-data-list.data-list-layout-grid")).toBeVisible();
    await expect(page.locator(".data-list-card")).toHaveCount(3);
  });

  test("ViewModeToggle で表レイアウトに切替できる", async ({ page }) => {
    await setupTableList(page);
    await page.getByRole("button", { name: "表表示" }).click();
    await expect(page.locator(".tables-data-list .data-list-table")).toBeVisible();
    await expect(page.locator(".data-list-row")).toHaveCount(3);
  });

  test("検索で絞り込みできる", async ({ page }) => {
    await setupTableList(page);
    await page.locator(".table-list-search input").fill("ユーザー");
    await expect(page.locator(".data-list-card")).toHaveCount(1);
    await expect(page.locator(".filter-bar")).toBeVisible();
  });

  test("カードのダブルクリックでテーブル編集画面へ遷移", async ({ page }) => {
    await setupTableList(page);
    const card = page.locator(".data-list-card").first();
    await card.dblclick();
    await expect(page).toHaveURL(/\/table\/edit\//);
  });
});
