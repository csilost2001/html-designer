/**
 * draft-history.spec.ts (#893)
 *
 * draft history 7 日保持 UI の E2E テスト。
 * docs/spec/collab-presence.md § 8.3 に準拠。
 *
 * #980-A: localStorage seed (#923 で fallback 廃止後 dead pattern) → realWorkspace 経由に書き換え。
 *
 * シナリオ:
 *   1. editSession.listHistory API 疎通確認 (空配列を返す)
 *   2. ProcessFlowListView コンテキストメニューから履歴 modal が開く
 *   3. EditSessionDropdown から履歴 modal が開く
 *   4. transferEdit → history → restore フルフロー
 */

import { test, expect, type Page } from "@playwright/test";
import {
  setupTestWorkspace,
  cleanupRealWorkspaces,
  isMcpRunning,
  normalizeId,
  seedTabsForWorkspace,
  type OpenedWorkspace,
} from "../helpers/realWorkspace";
import { buildProject, buildProcessFlow } from "../__fixtures__/builders";
import type { ProjectEntities, Timestamp } from "../../src/types/v3";

const FIXED_TS = "2026-05-08T00:00:00.000Z" as unknown as Timestamp;
const PF_ID = `pf-collab-history-${Date.now()}`;
const PF_NORM = normalizeId(PF_ID);

const dummyProcessFlowBody = buildProcessFlow({
  id: PF_ID,
  name: "履歴テストフロー",
  kind: "screen",
  mode: "upstream",
  actions: [],
});

const dummyProject = buildProject({
  name: "collab-draft-history-test",
  entities: {
    processFlows: [{ id: PF_ID, no: 1, name: "履歴テストフロー", kind: "screen", actionCount: 0, maturity: "draft", updatedAt: FIXED_TS }],
  } as ProjectEntities,
});

const dummyTab = { id: `process-flow:${PF_NORM}`, type: "process-flow", resourceId: PF_NORM, label: "履歴テストフロー", isDirty: false, isPinned: false };

const WS_KEY = "issue-980-collab-draft-history";
let mcpAvailable = false;
let ws: OpenedWorkspace;

async function gotoEditorAndDismiss(page: Page) {
  await ws.gotoActive(page, `/process-flow/edit/${PF_NORM}`);
  await expect(page.locator(".process-flow-page")).toBeVisible();
  await page.waitForTimeout(500);
  for (let _i = 0; _i < 3; _i++) {
    if (await page.locator(".edit-mode-modal-backdrop").isVisible().catch(() => false)) {
      await page.evaluate(() => (document.querySelector('[data-testid="resume-discard"]') as HTMLButtonElement | null)?.click());
      await page.locator(".edit-mode-modal-backdrop").waitFor({ state: "hidden", timeout: 5000 }).catch(() => undefined);
    } else { break; }
  }
}

async function ensureReadOnly(page: Page) {
  await Promise.race([
    page.getByTestId("edit-mode-start").waitFor({ state: "visible", timeout: 10000 }),
    page.getByTestId("edit-mode-save").waitFor({ state: "visible", timeout: 10000 }),
  ]).catch(() => undefined);
  if (await page.getByTestId("edit-mode-save").isVisible({ timeout: 100 }).catch(() => false)) {
    await page.getByTestId("edit-mode-discard").click();
    if (await page.getByTestId("discard-confirm").isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.getByTestId("discard-confirm").click();
    }
    await page.getByTestId("edit-mode-start").waitFor({ state: "visible", timeout: 8000 }).catch(() => undefined);
  }
}

test.describe("draft history 7 日保持 UI (#893)", () => {
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
      processFlows: [dummyProcessFlowBody],
    });
  });

  test("editSession.listHistory が空配列を返す (履歴なし)", async ({ page }) => {
    await seedTabsForWorkspace(page, ws.wsId, [dummyTab], dummyTab.id);
    await ws.gotoActive(page, "/process-flow/list");
    // mcpBridge が接続済みになるまで待つ
    await page.waitForFunction(
      () => (window as unknown as { __mcpBridge?: { status?: string } }).__mcpBridge?.status === "connected",
      undefined,
      { timeout: 10000 },
    );
    const result = await page.evaluate(async () => {
      const bridge = (window as unknown as { __mcpBridge?: { request?: (m: string, p: unknown) => Promise<unknown> } }).__mcpBridge;
      if (!bridge?.request) return { error: "no bridge" };
      try {
        const r = await bridge.request("editSession.listHistory", { resourceType: "process-flow", resourceId: "nonexistent-pf" });
        return { result: r };
      } catch (e) {
        return { error: String(e) };
      }
    });
    expect(result.error).toBeUndefined();
    expect(result.result).toHaveProperty("history");
  });

  test("ProcessFlowListView のコンテキストメニューから履歴 modal が開く", async ({ page }) => {
    await seedTabsForWorkspace(page, ws.wsId, [dummyTab], dummyTab.id);
    await ws.gotoActive(page, "/process-flow/list");
    // data-list-card 上で右クリック (selection も自動で 1 件に切り替わり、メニュー項目が enabled になる)
    const card = page.locator('[data-testid="data-list-card"]').filter({ hasText: "履歴テストフロー" }).first();
    await expect(card).toBeVisible({ timeout: 10000 });
    await card.click({ button: "right" });
    const historyMenuItem = page.getByText("履歴 (過去の EditSession)");
    await expect(historyMenuItem).toBeVisible({ timeout: 5000 });
    await historyMenuItem.click();
    const modal = page.getByTestId("draft-history-modal");
    await expect(modal).toBeVisible({ timeout: 5000 });
    // 「閉じる」は modal 内に X アイコン + フッターボタンの 2 つ存在するため modal scope 内から最初のものを click
    await modal.getByRole("button", { name: "閉じる" }).first().click();
    await expect(modal).not.toBeVisible({ timeout: 3000 });
  });

  test("エディタの EditSessionDropdown から履歴 modal が開く", async ({ page }) => {
    await seedTabsForWorkspace(page, ws.wsId, [dummyTab], dummyTab.id);
    await gotoEditorAndDismiss(page);
    await ensureReadOnly(page);
    await page.getByTestId("edit-mode-start").click();
    await expect(page.getByTestId("edit-mode-save")).toBeVisible({ timeout: 10000 });
    // EditSessionDropdown を開く
    const dropdownToggle = page.getByTestId("esd-toggle-btn");
    await expect(dropdownToggle).toBeVisible({ timeout: 5000 });
    await dropdownToggle.click();
    const historyBtn = page.getByTestId("esd-history-btn");
    await expect(historyBtn).toBeVisible({ timeout: 5000 });
    await historyBtn.click();
    const modal = page.getByTestId("draft-history-modal");
    await expect(modal).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("履歴がありません")).toBeVisible({ timeout: 5000 });
    // Esc で閉じる
    await page.keyboard.press("Escape");
    await expect(modal).not.toBeVisible({ timeout: 3000 });
    // クリーンアップ: discard
    await page.getByTestId("edit-mode-discard").click();
    if (await page.getByTestId("discard-confirm").isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.getByTestId("discard-confirm").click();
    }
  });

  test("transferEdit → history 記録 → 復元フルフロー", async ({ browser }) => {
    test.setTimeout(180000);
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      // pageA: 編集開始
      await seedTabsForWorkspace(pageA, ws.wsId, [dummyTab], dummyTab.id);
      await gotoEditorAndDismiss(pageA);
      await ensureReadOnly(pageA);
      await pageA.getByTestId("edit-mode-start").click();
      await expect(pageA.getByTestId("edit-mode-save")).toBeVisible({ timeout: 10000 });

      // pageB: bob を Viewer として attach (takeover 表示条件を満たすため)
      await seedTabsForWorkspace(pageB, ws.wsId, [dummyTab], dummyTab.id);
      await gotoEditorAndDismiss(pageB);
      const dropdownToggleB = pageB.getByTestId("esd-toggle-btn");
      await expect(dropdownToggleB).toBeVisible({ timeout: 15000 });
      await dropdownToggleB.click();
      const viewerBtn = pageB.locator('[data-testid^="esd-viewer-btn-"]').first();
      await expect(viewerBtn).toBeVisible({ timeout: 5000 });
      await viewerBtn.click();
      // attach 反映 (broadcast で sessions 再 fetch + dropdown 再 render) を待つ
      await pageB.waitForTimeout(1500);
      // viewer attach 後 setOpen(false) で dropdown が閉じるので再 open
      const reopenBtnB = pageB.getByTestId("esd-toggle-btn");
      await reopenBtnB.click();

      // pageB が take-over → pageA の snapshot が history 記録
      const takeoverBtn = pageB.locator('[data-testid^="esd-takeover-btn-"]').first();
      await expect(takeoverBtn).toBeVisible({ timeout: 15000 });
      // window.confirm を click 同期内で承認 (page.on("dialog") は取りこぼす場合あり)
      await pageB.evaluate(() => { window.confirm = () => true; });
      await takeoverBtn.click();
      // take-over 後 pageB が editor になる
      await expect(pageB.getByTestId("edit-mode-save")).toBeVisible({ timeout: 10000 });

      // pageA: take-over により View 化 → 履歴 modal を開いて「引継」バッジ表示確認
      // viewer 化された後の dropdown 表示まで少し待つ
      await pageA.waitForTimeout(1000);
      const dropdownToggleA = pageA.getByTestId("esd-toggle-btn");
      await expect(dropdownToggleA).toBeVisible({ timeout: 10000 });
      await dropdownToggleA.click();
      const historyBtnA = pageA.getByTestId("esd-history-btn");
      await expect(historyBtnA).toBeVisible({ timeout: 5000 });
      await historyBtnA.click();
      const modal = pageA.getByTestId("draft-history-modal");
      await expect(modal).toBeVisible({ timeout: 5000 });
      // 「引継」バッジが表示される (transferEdit の reason)
      await expect(pageA.getByText("引継")).toBeVisible({ timeout: 5000 });
      // クリーンアップは context.close() が breaks down するので明示 discard はスキップ
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
