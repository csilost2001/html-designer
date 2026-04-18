/**
 * 処理フロー一覧 (/process-flow/list) E2E スモークテスト — #133 Phase D
 */

import { test, expect, type Page } from "@playwright/test";

const dummyGroups = [
  {
    id: "ag-0001",
    name: "ログイン処理",
    type: "screen",
    actionCount: 3,
    screenId: "screen-1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "ag-0002",
    name: "月次集計バッチ",
    type: "batch",
    actionCount: 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "ag-0003",
    name: "共通バリデーション",
    type: "common",
    actionCount: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const dummyProject = {
  version: 1,
  name: "E2Eテスト用プロジェクト",
  screens: [],
  groups: [],
  edges: [],
  tables: [],
  actionGroups: dummyGroups,
  updatedAt: new Date().toISOString(),
};

async function setupActionList(page: Page) {
  await page.addInitScript(({ project, groups }) => {
    localStorage.setItem("flow-project", JSON.stringify(project));
    for (const g of groups) {
      localStorage.setItem(`action-group-${g.id}`, JSON.stringify({ ...g, actions: [] }));
    }
    localStorage.removeItem("designer-open-tabs");
    localStorage.removeItem("designer-active-tab");
    localStorage.removeItem("list-view-mode:process-flow-list");
  }, { project: dummyProject, groups: dummyGroups });
  await page.goto("/process-flow/list");
  await expect(page.locator(".action-page")).toBeVisible();
}

test.describe("処理フロー一覧", () => {
  test("既定はカードレイアウトで全件表示", async ({ page }) => {
    await setupActionList(page);
    await expect(page.locator(".data-list-layout-grid")).toBeVisible();
    await expect(page.locator(".data-list-card")).toHaveCount(3);
  });

  test("ViewModeToggle で表レイアウトに切替できる", async ({ page }) => {
    await setupActionList(page);
    await page.getByRole("button", { name: "表表示" }).click();
    await expect(page.locator(".data-list-table")).toBeVisible();
    await expect(page.locator(".data-list-row")).toHaveCount(3);
  });

  test("種別フィルタで絞り込める", async ({ page }) => {
    await setupActionList(page);
    // "バッチ" フィルタボタンをクリック
    await page.getByRole("button", { name: /^バッチ \(/ }).click();
    await expect(page.locator(".data-list-card")).toHaveCount(1);
    await expect(page.locator(".filter-bar")).toBeVisible();
  });

  test("カードのダブルクリックで編集画面へ遷移", async ({ page }) => {
    await setupActionList(page);
    const card = page.locator(".data-list-card").first();
    await card.dblclick();
    await expect(page).toHaveURL(/\/process-flow\/edit\//);
  });
});
