/**
 * StepCard から直接 marker 起票 + Dashboard marker summary の E2E (#261)
 */
import { test, expect, type Page } from "@playwright/test";

const groupId = "ag-erg";

const dummyGroup = {
  id: groupId, name: "erg test", type: "screen", description: "",
  mode: "upstream", maturity: "draft",
  actions: [{
    id: "act-1", name: "ボタン", trigger: "click", maturity: "draft",
    responses: [{ id: "201-ok", status: 201 }],
    steps: [
      { id: "s1", type: "validation", description: "チェック", conditions: "", maturity: "draft" },
      { id: "s2", type: "dbAccess", description: "検索", tableName: "x", operation: "SELECT", maturity: "draft" },
    ],
  }],
  markers: [
    // 既存 unresolved marker 2 件 (dashboard panel がカウントする)
    { id: "m1", kind: "todo", body: "A", author: "human", createdAt: "2026-04-20T00:00:00Z" },
    { id: "m2", kind: "question", body: "B", author: "human", createdAt: "2026-04-20T00:00:00Z" },
  ],
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
};
const dummyProject = {
  version: 1, name: "erg", screens: [], groups: [], edges: [], tables: [],
  actionGroups: [{ id: groupId, no: 1, name: dummyGroup.name, type: dummyGroup.type, actionCount: 1, updatedAt: dummyGroup.updatedAt, maturity: "draft" }],
  updatedAt: new Date().toISOString(),
};

async function setupEditor(page: Page) {
  await page.addInitScript(({ project, group }) => {
    localStorage.setItem("flow-project", JSON.stringify(project));
    localStorage.setItem(`action-group-${group.id}`, JSON.stringify(group));
    localStorage.removeItem("designer-open-tabs");
    localStorage.removeItem("designer-active-tab");
  }, { project: dummyProject, group: dummyGroup });
  await page.goto(`/process-flow/edit/${groupId}`);
  await expect(page.locator(".step-editor, .action-content").first()).toBeVisible({ timeout: 10000 });
}

async function setupDashboard(page: Page) {
  await page.addInitScript(({ project, group }) => {
    localStorage.setItem("flow-project", JSON.stringify(project));
    localStorage.setItem(`action-group-${group.id}`, JSON.stringify(group));
    const tabs = [{ id: "dashboard", type: "dashboard", pinned: true }];
    localStorage.setItem("designer-open-tabs", JSON.stringify(tabs));
    localStorage.setItem("designer-active-tab", "dashboard");
  }, { project: dummyProject, group: dummyGroup });
  await page.goto(`/`);
  await expect(page.locator(".markers-summary-panel").first()).toBeVisible({ timeout: 10000 });
}

test.describe("StepCard から marker 起票 (#261)", () => {
  test("コンテキストメニューから AI に指摘 → marker 追加", async ({ page }) => {
    await setupEditor(page);

    // 1つ目の step の 3-dots メニューを開く
    page.on("dialog", async (d) => {
      if (d.type() === "prompt") await d.accept("並行制御のため affectedRowsCheck 追加して");
    });

    await page.evaluate(() => {
      const card = document.querySelectorAll(".step-card")[0];
      const btns = Array.from(card.querySelectorAll(".step-card-menu-btn"));
      const dots = btns.find(b => b.querySelector(".bi-three-dots"));
      dots?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    });
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll(".step-context-menu-item"));
      const ask = items.find(i => i.textContent?.includes("AI に指摘"));
      ask?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    });
    await page.waitForTimeout(300);

    // marker が 3 件 (既存 2 + 新規 1)
    await expect(page.locator(".marker-panel .marker-row")).toHaveCount(3);
    // 新しいのは stepId=s1 紐付き、body は dialog で answered
    const stepRef = page.locator(".marker-panel .marker-step-ref").filter({ hasText: "s1" });
    await expect(stepRef).toBeVisible();
  });
});

test.describe("Dashboard marker summary (#261)", () => {
  test("未解決 2 件 + kind 別内訳表示", async ({ page }) => {
    await setupDashboard(page);
    const panel = page.locator(".markers-summary-panel");
    await expect(panel).toContainText("2");
    await expect(panel).toContainText("TODO");
    await expect(panel).toContainText("質問");
    await expect(panel).toContainText("erg test"); // perGroup ランキング
  });

  test("最新マーカーリストに body preview が表示される", async ({ page }) => {
    await setupDashboard(page);
    const recent = page.locator(".markers-summary-panel .markers-recent-list");
    await expect(recent).toBeVisible();
    // 2 件とも表示
    await expect(recent.locator(".markers-recent-item")).toHaveCount(2);
    // body preview と AG 名
    await expect(recent).toContainText("A"); // body
    await expect(recent).toContainText("B");
    await expect(recent).toContainText("erg test"); // AG name
  });

  test("最新マーカーアイテムクリックで ActionEditor へ遷移", async ({ page }) => {
    await setupDashboard(page);
    const firstRecent = page.locator(".markers-summary-panel .markers-recent-list .markers-recent-btn").first();
    await firstRecent.click();
    await expect(page).toHaveURL(/\/process-flow\/edit\//);
  });

  test("marker 0 件の AG は表示なし、未解決 0 件メッセージ表示", async ({ page }) => {
    // 解決済みだけの状態で開く
    const resolved = {
      ...dummyGroup,
      markers: dummyGroup.markers.map((m) => ({ ...m, resolvedAt: "2026-04-20T01:00:00Z" })),
    };
    await page.addInitScript(({ project, group }) => {
      localStorage.setItem("flow-project", JSON.stringify(project));
      localStorage.setItem(`action-group-${group.id}`, JSON.stringify(group));
      const tabs = [{ id: "dashboard", type: "dashboard", pinned: true }];
      localStorage.setItem("designer-open-tabs", JSON.stringify(tabs));
      localStorage.setItem("designer-active-tab", "dashboard");
    }, { project: dummyProject, group: resolved });
    await page.goto(`/`);
    await expect(page.locator(".markers-summary-panel")).toContainText("未解決のマーカーはありません");
  });
});
