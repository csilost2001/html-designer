/**
 * step card の marker バッジ表示 (#261)
 */
import { test, expect, type Page } from "@playwright/test";

const groupId = "ag-smb";

const dummyGroup = {
  id: groupId, name: "smb", type: "screen", description: "",
  mode: "upstream", maturity: "draft",
  actions: [{
    id: "act-1", name: "ボタン", trigger: "click", maturity: "draft",
    responses: [{ id: "201-ok", status: 201 }],
    steps: [
      { id: "s1", type: "validation", description: "check1", conditions: "", maturity: "draft" },
      { id: "s2", type: "dbAccess", description: "query", tableName: "x", operation: "SELECT", maturity: "draft" },
    ],
  }],
  markers: [
    { id: "m1", kind: "todo", body: "A を修正して", stepId: "s1", author: "human", createdAt: "2026-04-21T00:00:00Z" },
    { id: "m2", kind: "attention", body: "B を確認", stepId: "s1", author: "human", createdAt: "2026-04-21T00:00:00Z" },
    { id: "m3", kind: "question", body: "C?", stepId: "s2", author: "human", createdAt: "2026-04-21T00:00:00Z" },
    { id: "m4", kind: "chat", body: "解決済み", stepId: "s1", author: "human", createdAt: "2026-04-21T00:00:00Z", resolvedAt: "2026-04-21T01:00:00Z" },
    { id: "m5", kind: "chat", body: "グループ宛", author: "human", createdAt: "2026-04-21T00:00:00Z" },
  ],
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
};
const dummyProject = {
  version: 1, name: "smb", screens: [], groups: [], edges: [], tables: [],
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

test.describe("step marker badge (#261)", () => {
  test("step-card に未解決 marker の件数バッジ表示 (解決済み除外)", async ({ page }) => {
    await setup(page);

    // s1: 未解決 2 件 (m1, m2)、resolved 1 件 (m4) は除外
    // s2: 未解決 1 件 (m3)
    // m5 は stepId なし (グループ宛) → どの step にも出ない
    const allBadges = page.locator(".step-marker-badge");
    await expect(allBadges).toHaveCount(2);

    // s1 のカードのバッジは 2
    await expect(page.locator(".step-card").nth(0).locator(".step-marker-badge")).toContainText("2");
    // s2 のカードのバッジは 1
    await expect(page.locator(".step-card").nth(1).locator(".step-marker-badge")).toContainText("1");
  });

  test("tooltip (title 属性) に kind + body 抜粋が含まれる", async ({ page }) => {
    await setup(page);
    const title = await page.locator(".step-card").nth(0).locator(".step-marker-badge").getAttribute("title");
    expect(title).toContain("AI 依頼マーカー 2 件");
    expect(title).toContain("todo");
    expect(title).toContain("attention");
    expect(title).toContain("A を修正");
  });

  test("AI に指摘 で新規 marker 追加後バッジが +1 される", async ({ page }) => {
    await setup(page);
    page.on("dialog", async (d) => { if (d.type() === "prompt") await d.accept("新規指摘"); });
    await page.evaluate(() => {
      const card = document.querySelectorAll(".step-card")[1]; // s2
      const dots = Array.from(card.querySelectorAll(".step-card-menu-btn")).find(b => b.querySelector(".bi-three-dots"));
      dots?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    });
    await page.waitForTimeout(150);
    await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll(".step-context-menu-item"));
      items.find(i => i.textContent?.includes("AI に指摘"))?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    });
    await page.waitForTimeout(300);
    // s2 のバッジが 2 (元 1 + 新 1)
    await expect(page.locator(".step-card").nth(1).locator(".step-marker-badge")).toContainText("2");
  });
});
