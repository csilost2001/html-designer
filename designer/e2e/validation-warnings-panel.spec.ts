/**
 * 警告詳細パネルの UI 配線テスト (#261 UI 統合)
 *
 * aggregateValidation が新バリデータ (referentialIntegrity / identifierScope)
 * の issue を ValidationError にマップし、ActionEditor 側で:
 * - 警告バッジが表示される
 * - クリックで詳細パネルが開く
 * - 詳細パネルに code / message / path が表示される
 */
import { test, expect, type Page } from "@playwright/test";

const groupId = "ag-validation-test";

// 意図的に未定義 @ 参照 + 未定義 responseRef を含むグループ
const dummyGroup = {
  id: groupId,
  name: "警告テスト用",
  type: "screen",
  description: "",
  mode: "upstream",
  maturity: "draft",
  actions: [
    {
      id: "act-1",
      name: "ボタン",
      trigger: "click",
      maturity: "draft",
      responses: [{ id: "201-ok", status: 201 }],
      steps: [
        // UNKNOWN_IDENTIFIER 発生: @undefinedVar が inputs/outputBinding/ambient いずれにも無い
        {
          id: "step-compute",
          type: "compute",
          description: "意図的な未定義参照",
          expression: "@undefinedVar * 2",
          outputBinding: "r",
          maturity: "draft",
        },
        // UNKNOWN_RESPONSE_REF: "404-missing" が responses[] に無い
        {
          id: "step-return",
          type: "return",
          description: "未定義 response 参照",
          responseRef: "404-missing",
          maturity: "draft",
        },
      ],
    },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const dummyProject = {
  version: 1,
  name: "validation-test",
  screens: [],
  groups: [],
  edges: [],
  tables: [],
  actionGroups: [{
    id: groupId,
    no: 1,
    name: dummyGroup.name,
    type: dummyGroup.type,
    actionCount: 1,
    updatedAt: dummyGroup.updatedAt,
    maturity: "draft",
  }],
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

test.describe("警告パネル UI 配線 (#261 UI 統合)", () => {
  test("警告バッジが表示される (UNKNOWN_IDENTIFIER + UNKNOWN_RESPONSE_REF)", async ({ page }) => {
    await setupEditor(page);
    const badge = page.locator(".validation-badge.warning");
    await expect(badge).toBeVisible();
    // 最低 2 件 (identifier + responseRef) の警告が出る
    await expect(badge).toContainText(/2|3|4|5|\d+ 警告/);
  });

  test("バッジクリックで詳細パネルが開く", async ({ page }) => {
    await setupEditor(page);
    const panel = page.locator(".action-validation-panel");
    await expect(panel).toHaveCount(0);

    await page.locator(".validation-badge.warning").click();
    await expect(panel).toBeVisible();
  });

  test("詳細パネルに UNKNOWN_IDENTIFIER / UNKNOWN_RESPONSE_REF code が表示", async ({ page }) => {
    await setupEditor(page);
    await page.locator(".validation-badge.warning").click();

    const panel = page.locator(".action-validation-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("UNKNOWN_IDENTIFIER");
    await expect(panel).toContainText("UNKNOWN_RESPONSE_REF");
  });

  test("詳細パネルに path が表示される", async ({ page }) => {
    await setupEditor(page);
    await page.locator(".validation-badge.warning").click();

    // path の代表的な断片 (actions[0].steps) が含まれる
    await expect(page.locator(".validation-path").first()).toContainText("actions[0]");
  });

  test("閉じるボタンでパネルが閉じる", async ({ page }) => {
    await setupEditor(page);
    await page.locator(".validation-badge.warning").click();
    await expect(page.locator(".action-validation-panel")).toBeVisible();

    // ヘッダには「全て AI に依頼」ボタンもあるため title="閉じる" で指定
    await page.locator('.action-validation-panel-header button[title="閉じる"]').click();
    await expect(page.locator(".action-validation-panel")).toHaveCount(0);
  });
});
