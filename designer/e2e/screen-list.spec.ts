/**
 * 画面一覧 (/screen/list) E2E スモークテスト — #133 Phase C
 *
 * 視点: HeaderMenu から画面一覧に遷移し、カード ⇔ 表切替と検索が動作するか確認
 * 前提: dev サーバー起動済み (playwright.config.ts の webServer で自動起動)
 */

import { test, expect, type Page } from "@playwright/test";

const dummyProject = {
  version: 1,
  name: "E2Eテスト用プロジェクト",
  screens: [
    {
      id: "screen-0001",
      name: "ログイン画面",
      type: "login",
      description: "",
      path: "/login",
      position: { x: 100, y: 100 },
      size: { width: 240, height: 140 },
      hasDesign: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "screen-0002",
      name: "ダッシュボード",
      type: "dashboard",
      description: "",
      path: "/dashboard",
      position: { x: 400, y: 100 },
      size: { width: 240, height: 140 },
      hasDesign: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "screen-0003",
      name: "ユーザー一覧",
      type: "list",
      description: "",
      path: "/users",
      position: { x: 700, y: 100 },
      size: { width: 240, height: 140 },
      hasDesign: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  groups: [],
  edges: [],
  tables: [],
  updatedAt: new Date().toISOString(),
};

async function setupScreenList(page: Page) {
  await page.addInitScript((project) => {
    localStorage.setItem("flow-project", JSON.stringify(project));
    localStorage.removeItem("designer-open-tabs");
    localStorage.removeItem("designer-active-tab");
    // 表示モード設定をリセット
    localStorage.removeItem("list-view-mode:screen-list");
  }, dummyProject);
  await page.goto("/screen/list");
  await expect(page.locator(".screen-list-page")).toBeVisible();
}

test.describe("画面一覧", () => {
  test("/screen/list でカードレイアウトが既定表示される", async ({ page }) => {
    await setupScreenList(page);
    await expect(page.locator(".data-list-grid")).toBeVisible();
    await expect(page.locator(".data-list-card")).toHaveCount(3);
    await expect(page.locator(".screen-list-count")).toHaveText("3 画面");
  });

  test("ViewModeToggle で表レイアウトに切替できる", async ({ page }) => {
    await setupScreenList(page);
    await page.getByRole("button", { name: "表表示" }).click();
    await expect(page.locator(".data-list-table")).toBeVisible();
    await expect(page.locator(".data-list-row")).toHaveCount(3);
  });

  test("検索で絞り込みできる", async ({ page }) => {
    await setupScreenList(page);
    await page.locator(".screen-list-search input").fill("ログイン");
    await expect(page.locator(".data-list-card")).toHaveCount(1);
    await expect(page.locator(".filter-bar")).toBeVisible();
  });

  test("カードクリックで選択、ダブルクリックで画面デザイナーへ遷移", async ({ page }) => {
    await setupScreenList(page);
    const card = page.locator(".data-list-card").first();
    await card.click();
    await expect(card).toHaveClass(/selected/);
    await card.dblclick();
    await expect(page).toHaveURL(/\/screen\/design\/screen-0001/);
  });

  test("HeaderMenu に「画面一覧」が出て active になる", async ({ page }) => {
    await setupScreenList(page);
    await page.locator(".header-menu-btn").click();
    const menuItem = page.locator(".header-menu-item.active", { hasText: "画面一覧" });
    await expect(menuItem).toBeVisible();
  });
});
