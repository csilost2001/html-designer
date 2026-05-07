/**
 * ステップ管理・テンプレート・ソート E2E (#246)
 */
import { test, expect, type Page } from "@playwright/test";
import {
  setupTestWorkspace,
  cleanupRealWorkspaces,
  isMcpRunning,
  normalizeId,
  type OpenedWorkspace,
} from "./helpers/realWorkspace";


const groupId = "ag-step-ops-test";

const dummyGroup = {
  id: groupId,
  name: "ステップ操作テスト",
  type: "screen",
  description: "",
  mode: "upstream",
  maturity: "draft",
  actions: [
    {
      id: "act-1",
      name: "メインボタン",
      trigger: "click",
      maturity: "draft",
      steps: [
        {
          id: "step-1",
          type: "validation",
          description: "入力チェック",
          conditions: "必須",
          maturity: "draft",
        },
        {
          id: "step-2",
          type: "dbAccess",
          description: "検索",
          tableName: "users",
          operation: "SELECT",
          maturity: "draft",
        },
        {
          id: "step-3",
          type: "screenTransition",
          description: "遷移",
          targetScreenName: "完了",
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
  name: "step-ops",
  screens: [],
  groups: [],
  edges: [],
  tables: [],
  processFlows: [
    {
      id: groupId,
      no: 1,
      name: dummyGroup.name,
      type: dummyGroup.type,
      actionCount: 1,
      updatedAt: dummyGroup.updatedAt,
      maturity: "draft",
    },
  ],
  updatedAt: new Date().toISOString(),
};

async function setupEditor(page: Page) {
  await ws.gotoActive(page, `/process-flow/edit/${normalizeId(groupId)}`);
  await expect(page.locator(".step-editor, .process-flow-content").first()).toBeVisible({ timeout: 10000 });
  if (await page.locator(".edit-mode-modal-backdrop").isVisible({ timeout: 1000 }).catch(() => false)) {
    await page.evaluate(() => (document.querySelector('[data-testid="resume-discard"]') as HTMLButtonElement | null)?.click());
    await expect(page.locator(".edit-mode-modal-backdrop")).toBeHidden({ timeout: 5000 });
  }
  await page.getByTestId("edit-mode-start").click();
  await expect(page.getByTestId("edit-mode-save")).toBeVisible();
}

// realWorkspace 移植 (#926): 実 backend 経由の dummy fixture
// ProcessFlow body は dummyGroup を v3 shape (top-level id + meta) で再利用する。
const dummyGroupBody: Record<string, unknown> = {
  id: groupId,
  $schema: "../../../schemas/v3/process-flow.v3.schema.json",
  meta: { id: groupId, name: dummyGroup.name, kind: dummyGroup.type ?? dummyGroup.kind ?? "screen", mode: "upstream", maturity: "draft", version: "1.0.0", createdAt: dummyGroup.createdAt ?? "2026-05-08T00:00:00.000Z", updatedAt: dummyGroup.updatedAt ?? "2026-05-08T00:00:00.000Z" },
  actions: dummyGroup.actions,
  ...((dummyGroup as Record<string, unknown>).markers !== undefined ? { markers: (dummyGroup as Record<string, unknown>).markers } : {}),
};

const WS_KEY = "issue-926-step-ops.spec";
let mcpAvailable = false;
let ws: OpenedWorkspace;

test.describe("ステップツールバーから追加 (#246)", () => {
  test.beforeAll(async () => {
    mcpAvailable = await isMcpRunning();
  });

  test.afterAll(async () => {
    if (mcpAvailable) await cleanupRealWorkspaces([WS_KEY]);
  });

  test.beforeEach(async () => {
    test.skip(!mcpAvailable, "backend (port 5179) が起動していません");
    ws = await setupTestWorkspace({
      key: WS_KEY,
      project: dummyProject,
      processFlows: [dummyGroupBody as unknown as { id: string }],
    });
  });

  test("ツールバーの DB 操作をクリックで末尾に追加される", async ({ page }) => {
    await setupEditor(page);
    // 初期 3 ステップ
    await expect(page.locator(".step-card")).toHaveCount(3);
    // ツールバーの「DB操作」ボタンをクリック
    await page.getByRole("button", { name: /DB操作/ }).first().click();
    // 4 ステップに増える
    await expect(page.locator(".step-card")).toHaveCount(4);
  });

  test("ツールバーの ジャンプ をクリックで追加", async ({ page }) => {
    await setupEditor(page);
    await expect(page.locator(".step-card")).toHaveCount(3);
    await page.getByRole("button", { name: /ジャンプ/ }).first().click();
    await expect(page.locator(".step-card")).toHaveCount(4);
  });
});

test.describe("ステップコンテキストメニュー (#246)", () => {
  test("メニューから複製で 4 ステップに", async ({ page }) => {
    await setupEditor(page);
    // 1 つ目の card の ・・・ メニューを開く
    const firstCard = page.locator(".step-card").first();
    await firstCard.locator(".step-card-menu-btn").last().click();
    // 複製 メニュー項目クリック
    await page.getByRole("button", { name: /複製/ }).first().click();
    // 4 ステップに増える
    await expect(page.locator(".step-card")).toHaveCount(4);
  });

  test("メニューから削除で 2 ステップに", async ({ page }) => {
    await setupEditor(page);
    const firstCard = page.locator(".step-card").first();
    await firstCard.locator(".step-card-menu-btn").last().click();
    await page.getByRole("button", { name: /削除/ }).first().click();
    // ghost にはならず、即削除
    await expect(page.locator(".step-card")).toHaveCount(2);
  });
});

test.describe("ステップヘッダクリックで展開・閉じる (#246)", () => {
  test("type label クリックで body が表示される", async ({ page }) => {
    await setupEditor(page);
    const firstCard = page.locator(".step-card").first();
    // 初期は閉じている
    await expect(firstCard.locator(".step-card-body")).toHaveCount(0);
    // type label クリックで展開
    await firstCard.locator(".step-card-type-label").click();
    await expect(firstCard.locator(".step-card-body")).toBeVisible();
  });
});

test.describe("メタバッジクリックで展開 (#236)", () => {
  test("runIf を設定したステップのアイコンクリックで展開される", async ({ page }) => {
    // 事前に runIf 入りのステップを用意
    const withRunIfGroup = {
      ...dummyGroup,
      actions: [
        {
          ...dummyGroup.actions[0],
          steps: [
            { ...dummyGroup.actions[0].steps[0], runIf: "@x > 0" },
            ...dummyGroup.actions[0].steps.slice(1),
          ],
        },
      ],
    };
    await page.addInitScript(({ project, group }) => {
      localStorage.setItem("workspace-e2e-bypass", "true");
      localStorage.setItem("flow-project", JSON.stringify(project));
      localStorage.setItem(`process-flow-${group.id}`, JSON.stringify(group));
      localStorage.removeItem("harmony-open-tabs");
      localStorage.removeItem("harmony-active-tab");
    }, { project: dummyProject, group: withRunIfGroup });
    await page.goto(`/process-flow/edit/${groupId}`);
    const firstCard = page.locator(".step-card").first();
    // runIf アイコン (funnel) のクリック可能 button を探す
    const runIfBtn = firstCard.locator('button[title*="runIf"]').first();
    await runIfBtn.click();
    // body が表示される
    await expect(firstCard.locator(".step-card-body")).toBeVisible();
  });
});
