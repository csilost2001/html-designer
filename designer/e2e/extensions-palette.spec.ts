import { test, expect, type Page } from "@playwright/test";

const groupId = "ag-extension-palette";

const dummyGroup = {
  id: groupId,
  name: "extension palette",
  type: "screen",
  description: "",
  mode: "upstream",
  maturity: "draft",
  actions: [{ id: "act-1", name: "ボタン", trigger: "click", maturity: "draft", responses: [], steps: [] }],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const dummyProject = {
  version: 1,
  name: "extension-palette",
  screens: [],
  groups: [],
  edges: [],
  tables: [],
  processFlows: [{ id: groupId, no: 1, name: dummyGroup.name, type: dummyGroup.type, actionCount: 1, updatedAt: dummyGroup.updatedAt, maturity: "draft" }],
  updatedAt: new Date().toISOString(),
};

async function setup(page: Page) {
  await page.addInitScript(({ project, group }) => {
    localStorage.setItem("flow-project", JSON.stringify(project));
    localStorage.setItem(`process-flow-${group.id}`, JSON.stringify(group));
    localStorage.removeItem("designer-open-tabs");
    localStorage.removeItem("designer-active-tab");
  }, { project: dummyProject, group: dummyGroup });
}

test.describe("カスタムステップカードパレット (#447)", () => {
  test("カスタムセクションに表示され、配置ボタンは disabled", async ({ page }) => {
    await setup(page);
    await page.goto(`/process-flow/edit/${groupId}`);
    await expect(page.locator(".step-editor")).toBeVisible({ timeout: 10000 });

    await expect(page.getByText("カスタム")).toBeVisible();
    const card = page.getByRole("button", { name: /バッチ|Batch|gm50/ }).first();
    await expect(card).toBeDisabled();
  });
});
