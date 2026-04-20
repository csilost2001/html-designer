/**
 * MarkerPanel E2E (#261 リアルタイム編集ワークフロー)
 */
import { test, expect, type Page } from "@playwright/test";

const groupId = "ag-marker";

const dummyGroup = {
  id: groupId, name: "marker test", type: "screen", description: "",
  mode: "upstream", maturity: "draft",
  actions: [{ id: "act-1", name: "ボタン", trigger: "click", maturity: "draft", steps: [] }],
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
};
const dummyProject = {
  version: 1, name: "marker", screens: [], groups: [], edges: [], tables: [],
  actionGroups: [{ id: groupId, no: 1, name: dummyGroup.name, type: dummyGroup.type, actionCount: 1, updatedAt: dummyGroup.updatedAt, maturity: "draft" }],
  updatedAt: new Date().toISOString(),
};

async function setup(page: Page) {
  await page.addInitScript(({ project, group }) => {
    localStorage.setItem("flow-project", JSON.stringify(project));
    localStorage.setItem(`action-group-${group.id}`, JSON.stringify(group));
    localStorage.removeItem("designer-open-tabs");
    localStorage.removeItem("designer-active-tab");
  }, { project: dummyProject, group: dummyGroup });
  await page.goto(`/process-flow/edit/${groupId}`);
  await expect(page.locator(".step-editor, .action-content").first()).toBeVisible({ timeout: 10000 });
}

test.describe("MarkerPanel (#261)", () => {
  test("初期は展開、0 件表示", async ({ page }) => {
    await setup(page);
    await expect(page.locator(".marker-panel")).toBeVisible();
    await expect(page.locator(".marker-panel .catalog-panel-toggle")).toContainText("0 未解決");
    await expect(page.locator(".marker-panel .catalog-empty")).toBeVisible();
  });

  test("新規マーカー追加 (質問 kind)", async ({ page }) => {
    await setup(page);
    await page.locator(".marker-panel select").selectOption("question");
    await page.locator(".marker-panel .marker-add-row input").fill("この SQL を条件付き UPDATE に書き換えて");
    await page.locator(".marker-panel button:has-text('追加')").click();
    await expect(page.locator(".marker-panel .marker-row")).toHaveCount(1);
    await expect(page.locator(".marker-panel .marker-row.marker-kind-question")).toBeVisible();
    await expect(page.locator(".marker-panel .marker-kind-badge")).toContainText("質問");
    await expect(page.locator(".marker-panel .marker-body")).toContainText("条件付き UPDATE");
  });

  test("解決ボタンで resolved、表示切替で見える", async ({ page }) => {
    await setup(page);
    await page.locator(".marker-panel .marker-add-row input").fill("A");
    await page.locator(".marker-panel button:has-text('追加')").click();
    // resolve (check icon)
    await page.locator(".marker-panel .marker-row .bi-check-circle").first().click();
    // 既定で解決済み非表示
    await expect(page.locator(".marker-panel .marker-row")).toHaveCount(0);
    // 解決済みも表示に切替
    await page.locator(".marker-panel input[type='checkbox']").check();
    await expect(page.locator(".marker-panel .marker-row.resolved")).toHaveCount(1);
  });

  test("削除ボタンで marker 消去", async ({ page }) => {
    await setup(page);
    await page.locator(".marker-panel .marker-add-row input").fill("消すよ");
    await page.locator(".marker-panel button:has-text('追加')").click();
    await page.locator(".marker-panel .marker-row .bi-trash").click();
    await expect(page.locator(".marker-panel .marker-row")).toHaveCount(0);
    await expect(page.locator(".marker-panel .catalog-panel-toggle")).toContainText("0 未解決");
  });

  test("Enter キーで追加", async ({ page }) => {
    await setup(page);
    const input = page.locator(".marker-panel .marker-add-row input");
    await input.fill("Enter で追加");
    await input.press("Enter");
    await expect(page.locator(".marker-panel .marker-row")).toHaveCount(1);
  });
});
