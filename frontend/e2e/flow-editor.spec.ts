/**
 * 画面フロー (FlowEditor / `/screen/flow`) E2E (#933)
 *
 * `tmp/review-cache/e2e-coverage-audit.md` 領域 3 の B 判定 — `save-flow.spec.ts` /
 * `save-reset-flow.spec.ts` / `drawing-marker.spec.ts` (部分) は save / reset / dirty mark /
 * 画面追加 (基本) はカバーするが、以下が未検証だった本 spec で網羅する:
 *
 *  - node のドラッグによる位置変更 (onNodeDragStop → isDirty)
 *  - node 削除動線 (右クリックメニュー)
 *  - 画面 (node) 名変更の screen entity への伝搬
 *  - edge 表示 (fixture seed) + edge コンテキストメニュー → 削除
 *  - node ダブルクリックで designer タブ遷移
 *
 * ## カバー外 (理由付きで対象外)
 *
 * - **edge を handle drag (D&D) で新規作成**: ReactFlow の handle-drag は内部に
 *   threshold 判定 / connection-line 計算を持ち、Playwright `page.mouse` で
 *   onConnect が安定発火しない (Chromium レンダリング差で flaky)。本 spec は
 *   **fixture seed (project.edges 配列)** で edge を予め持たせ、表示と削除動線を
 *   検証する。新規作成 D&D は手動 QA に委ねる
 * - **画面間 anchor マーカー**: ProcessFlow editor 内の anchor (#261) と区別される。
 *   FlowEditor 自体に marker 機能は無いため、本 spec 範囲外 (drawing-anchor.spec.ts は
 *   ProcessFlow 内 anchor 用)
 * - **screenLayoutStore 永続化**: #928 (edit-session-draft モデル化) 完了後に追加予定
 *
 * ## 関連
 *
 * - 親: #929 (E2E カバレッジ強化シリーズ)
 * - 監査: `tmp/review-cache/e2e-coverage-audit.md` 領域 3 (B 判定)
 * - 既存: `frontend/e2e/save-reset-flow.spec.ts` / `frontend/e2e/save-flow.spec.ts`
 * - 関連 ISSUE: #928 (screenLayoutStore edit-session-draft モデル化、未完了)
 */

import { test, expect, type Page } from "@playwright/test";
import {
  setupTestWorkspace,
  cleanupRealWorkspaces,
  isMcpRunning,
  type OpenedWorkspace,
} from "./helpers/realWorkspace";
import { buildProject } from "./__fixtures__/builders";

const dummyProject = buildProject({ name: "E2E FlowEditor テスト" });

const WS_KEY = "issue-933-flow-editor";
let mcpAvailable = false;

/** save-reset-flow.spec.ts と同じ pattern: ResumeOrDiscardDialog 退避 + editing 移行 */
async function setupFlowEditor(page: Page, ws: OpenedWorkspace): Promise<void> {
  await ws.gotoActive(page, "/screen/flow");
  await expect(page.locator(".flow-root")).toBeVisible();
  await page.waitForTimeout(500);
  for (let i = 0; i < 3; i++) {
    if (await page.locator(".edit-mode-modal-backdrop").isVisible().catch(() => false)) {
      await page.evaluate(() => {
        const btn = document.querySelector('[data-testid="resume-discard"]') as HTMLButtonElement | null;
        btn?.click();
      });
      await page.locator(".edit-mode-modal-backdrop")
        .waitFor({ state: "hidden", timeout: 5000 }).catch(() => undefined);
    } else {
      break;
    }
  }
  await Promise.race([
    page.getByTestId("edit-mode-start").waitFor({ state: "visible", timeout: 10000 }),
    page.getByTestId("edit-mode-save").waitFor({ state: "visible", timeout: 10000 }),
  ]).catch(() => undefined);
  // editing が残っていれば discard
  if (await page.getByTestId("edit-mode-save").isVisible({ timeout: 100 }).catch(() => false)) {
    await page.getByTestId("edit-mode-discard").click();
    if (await page.getByTestId("discard-confirm").isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.getByTestId("discard-confirm").click();
    }
    await page.getByTestId("edit-mode-start").waitFor({ state: "visible", timeout: 8000 }).catch(() => undefined);
  }
  await page.getByTestId("edit-mode-start").click();
  await expect(page.getByTestId("edit-mode-save")).toBeVisible();
}

async function addScreenViaModal(page: Page, name: string): Promise<void> {
  const addBtn = page.locator("button.flow-btn-primary").filter({ hasText: /画面を追加|最初の画面/ }).first();
  await addBtn.click();
  await page.locator("#screen-name").fill(name);
  await page.locator('.flow-modal button[type="submit"]').click();
  // モーダルが閉じる
  await expect(page.locator(".flow-modal-overlay")).toHaveCount(0, { timeout: 3000 });
}

test.describe("画面フロー (FlowEditor) ノード操作 (#933)", { tag: ["@regression"] }, () => {
  let ws: OpenedWorkspace;

  test.beforeAll(async () => {
    mcpAvailable = await isMcpRunning();
    if (!mcpAvailable) return;
    ws = await setupTestWorkspace({ key: WS_KEY, project: dummyProject });
  });

  test.afterAll(async () => {
    if (mcpAvailable) await cleanupRealWorkspaces([WS_KEY]);
  });

  test.beforeEach(async ({ page }) => {
    test.skip(!mcpAvailable, "backend (port 5179) が起動していません");
    await setupFlowEditor(page, ws);
  });

  test.afterEach(async ({ page }) => {
    if (mcpAvailable) await ws.resetRuntimeState(page);
  });

  test("画面追加: モーダル経由で screen node が canvas に表示される", async ({ page }) => {
    await addScreenViaModal(page, "ログイン画面");
    // ReactFlow の screenNode 表示 + screen-node-name に画面名
    await expect(page.locator(".screen-node-name").filter({ hasText: "ログイン画面" })).toBeVisible({ timeout: 5000 });
    await expect(page.locator(".react-flow__node-screenNode")).toHaveCount(1);
  });

  test("ノードダブルクリックで designer (/screen/design/:id) に遷移する", async ({ page }) => {
    await addScreenViaModal(page, "顧客一覧");
    const node = page.locator(".react-flow__node-screenNode").first();
    await expect(node).toBeVisible();
    await node.dblclick();
    await expect(page).toHaveURL(/\/w\/[^/]+\/screen\/design\//, { timeout: 5000 });
  });

  test("ノード右クリック → 削除メニューで node が消える", async ({ page }) => {
    await addScreenViaModal(page, "削除候補画面");
    await expect(page.locator(".react-flow__node-screenNode")).toHaveCount(1);
    const node = page.locator(".react-flow__node-screenNode").first();
    await node.click({ button: "right" });
    await expect(page.locator(".flow-context-menu")).toBeVisible();
    page.once("dialog", (d) => d.accept()); // window.confirm
    await page.locator(".flow-context-menu-item.danger").filter({ hasText: /削除/ }).click();
    await expect(page.locator(".react-flow__node-screenNode")).toHaveCount(0, { timeout: 5000 });
  });

  test("ノード右クリック → プロパティ編集で画面名を変更できる", async ({ page }) => {
    await addScreenViaModal(page, "旧名");
    await page.locator(".react-flow__node-screenNode").first().click({ button: "right" });
    await expect(page.locator(".flow-context-menu")).toBeVisible();
    await page.locator(".flow-context-menu-item").filter({ hasText: /プロパティ編集/ }).click();
    // 編集モーダルが開く
    await expect(page.locator(".flow-modal-overlay")).toBeVisible({ timeout: 3000 });
    await page.locator("#screen-name").fill("新名");
    await page.locator('.flow-modal button[type="submit"]').click();
    await expect(page.locator(".flow-modal-overlay")).toHaveCount(0, { timeout: 3000 });
    // node 表示が更新される
    await expect(page.locator(".screen-node-name").filter({ hasText: "新名" })).toBeVisible({ timeout: 5000 });
    await expect(page.locator(".screen-node-name").filter({ hasText: "旧名" })).toHaveCount(0);
  });

  test("ノードドラッグで位置変更 → isDirty (保存ボタン有効化)", async ({ page }) => {
    await addScreenViaModal(page, "ドラッグ画面");
    // 画面追加直後に dirty 化しているはずなので、いったん保存して clean に戻す
    await page.keyboard.press("Control+s");
    await expect(page.locator(".save-reset-buttons button.srb-btn-save")).toBeDisabled({ timeout: 5000 });

    const node = page.locator(".react-flow__node-screenNode").first();
    const before = await node.boundingBox();
    if (!before) throw new Error("node bbox not found");
    // node 中心から +120,+80 へドラッグ (ReactFlow の onNodeDragStop が発火する閾値以上)
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width / 2 + 60, before.y + before.height / 2 + 40, { steps: 5 });
    await page.mouse.move(before.x + before.width / 2 + 120, before.y + before.height / 2 + 80, { steps: 5 });
    await page.mouse.up();
    // dirty 化したことの最終 assertion (位置の数値検証は ReactFlow 内部 transform で安定しないため避ける)
    await expect(page.locator(".save-reset-buttons button.srb-btn-save")).toBeEnabled({ timeout: 5000 });
  });
});

test.describe("画面フロー (FlowEditor) edge 操作 (#933)", { tag: ["@regression"] }, () => {
  let ws: OpenedWorkspace;
  const WS_KEY_E = "issue-933-flow-editor-edges";

  /**
   * 2 画面 + 1 edge を持つ project を seed する。
   * edge handle-drag は Playwright で安定再現できないため、表示と削除を fixture-seed で検証する。
   */
  const SCREEN_A = "scr-flow-933-a";
  const SCREEN_B = "scr-flow-933-b";

  function buildProjectWithEdge() {
    const FIXED_TS = "2026-05-08T00:00:00.000Z";
    return buildProject({
      name: "E2E flow edge",
      entities: {
        screens: [
          { id: SCREEN_A, no: 1, name: "画面A", kind: "list", updatedAt: FIXED_TS as never },
          { id: SCREEN_B, no: 2, name: "画面B", kind: "detail", updatedAt: FIXED_TS as never },
        ],
        screenTransitions: [
          {
            id: "tr-933-1" as never,
            sourceScreenId: SCREEN_A as never,
            targetScreenId: SCREEN_B as never,
            label: "次へ" as never,
            trigger: "click",
          },
        ],
      } as never,
    });
  }

  test.beforeAll(async () => {
    mcpAvailable = await isMcpRunning();
    if (!mcpAvailable) return;
    ws = await setupTestWorkspace({ key: WS_KEY_E, project: buildProjectWithEdge() });
  });

  test.afterAll(async () => {
    if (mcpAvailable) await cleanupRealWorkspaces([WS_KEY_E]);
  });

  test.beforeEach(async ({ page }) => {
    test.skip(!mcpAvailable, "backend (port 5179) が起動していません");
    await setupFlowEditor(page, ws);
  });

  test.afterEach(async ({ page }) => {
    if (mcpAvailable) await ws.resetRuntimeState(page);
  });

  test("seed した 2 画面 + edge 1 本が canvas に表示される", async ({ page }) => {
    await expect(page.locator(".react-flow__node-screenNode")).toHaveCount(2, { timeout: 10000 });
    await expect(page.locator(".react-flow__edge")).toHaveCount(1, { timeout: 5000 });
  });

  test("edge 右クリック → 「遷移を削除」で edge が消える", async ({ page }) => {
    await expect(page.locator(".react-flow__edge")).toHaveCount(1, { timeout: 10000 });
    // edge の interaction layer (`.react-flow__edge-interaction`) が確実に hit
    // することを期待し、bbox center 経由で右クリックする。
    const edge = page.locator(".react-flow__edge").first();
    const box = await edge.boundingBox();
    if (!box) throw new Error("edge bbox not found");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: "right" });
    await expect(page.locator(".flow-context-menu")).toBeVisible({ timeout: 3000 });
    page.once("dialog", (d) => d.accept());
    await page.locator(".flow-context-menu-item.danger").filter({ hasText: /遷移を削除/ }).click();
    await expect(page.locator(".react-flow__edge")).toHaveCount(0, { timeout: 5000 });
    await expect(page.locator(".save-reset-buttons button.srb-btn-save")).toBeEnabled();
  });
});
