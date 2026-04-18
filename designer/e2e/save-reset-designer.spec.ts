/**
 * 画面デザイナー：リセットボタン E2E テスト
 *
 * 視点: ユーザーが画面デザイナーでリセットを行う
 * 前提: dev サーバーが起動済み (playwright.config.ts の webServer で自動起動)
 *       MCP サーバーは不要 — localStorage でドラフトマーカーを直接セットアップ
 *
 * GrapesJS キャンバス内部（iframe）はスコープ外。
 * ドラフトマーカーを localStorage に事前セットして isDirty=true の初期状態を再現し、
 * リセット後に dirty 状態が解除されることを検証する。
 */

import { test, expect, type Page } from "@playwright/test";

// ─── テスト用ダミーデータ ───────────────────────────────────────────────────

const SCREEN_ID = "aaaaaaaa-0001-4000-8000-aaaaaaaaaaaa";

const dummyProject = {
  version: 1,
  name: "E2Eテスト用プロジェクト",
  screens: [
    {
      id: SCREEN_ID,
      name: "ログイン",
      path: "/login",
      description: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  groups: [],
  edges: [],
  tables: [],
  updatedAt: new Date().toISOString(),
};

const dummyTab = {
  id: `design:${SCREEN_ID}`,
  type: "design",
  resourceId: SCREEN_ID,
  label: "ログイン",
  isDirty: true,
  isPinned: false,
};

// ─── セットアップ ──────────────────────────────────────────────────────────

async function setupDesigner(page: Page, { withDraft = true } = {}) {
  await page.addInitScript(
    ({ project, screenId, tab, withDraft }) => {
      localStorage.setItem("flow-project", JSON.stringify(project));
      // GrapesJS 用の最小スクリーンデータ（ロード可能な空プロジェクト）
      localStorage.setItem(`gjs-screen-${screenId}`, JSON.stringify({}));
      localStorage.setItem("designer-open-tabs", JSON.stringify([tab]));
      localStorage.setItem("designer-active-tab", tab.id);
      if (withDraft) {
        // ドラフトマーカー: Designer が isDirty=true で初期化される
        localStorage.setItem(`gjs-screen-${screenId}-draft`, "1");
      } else {
        localStorage.removeItem(`gjs-screen-${screenId}-draft`);
      }
    },
    { project: dummyProject, screenId: SCREEN_ID, tab: dummyTab, withDraft },
  );
  await page.goto(`/screen/design/${SCREEN_ID}`);
  // GrapesJS 初期化完了を待つ（リセットボタンが出現するまで）
  await expect(page.locator(".srb-btn-reset")).toBeVisible({ timeout: 15000 });
}

// ─── テスト ────────────────────────────────────────────────────────────────

test.describe("画面デザイナー：リセットボタン", () => {
  test("ドラフトあり初期状態では保存・リセットボタンが有効", async ({ page }) => {
    await setupDesigner(page);

    await expect(page.getByRole("button", { name: /保存/ })).toBeEnabled();
    await expect(page.getByRole("button", { name: /リセット/ })).toBeEnabled();
  });

  test("リセット後に保存・リセットボタンが無効に戻る", async ({ page }) => {
    await setupDesigner(page);
    page.on("dialog", (d) => d.accept());

    await page.getByRole("button", { name: /リセット/ }).click();

    await expect(page.getByRole("button", { name: /保存/ })).toBeDisabled();
    await expect(page.getByRole("button", { name: /リセット/ })).toBeDisabled();
  });

  test("リセットキャンセル後は保存・リセットボタンが有効のまま", async ({ page }) => {
    await setupDesigner(page);
    page.on("dialog", (d) => d.dismiss());

    await page.getByRole("button", { name: /リセット/ }).click();

    await expect(page.getByRole("button", { name: /保存/ })).toBeEnabled();
    await expect(page.getByRole("button", { name: /リセット/ })).toBeEnabled();
  });

  test("リセット後にタブを閉じても未保存ダイアログが出ない", async ({ page }) => {
    await setupDesigner(page);
    page.on("dialog", (d) => d.accept());

    // リセット実行
    await page.getByRole("button", { name: /リセット/ }).click();
    await expect(page.getByRole("button", { name: /保存/ })).toBeDisabled();

    // タブの閉じるボタンをクリック
    const tab = page.locator(".tabbar-tab").filter({ hasText: "ログイン" });
    await tab.locator(".tabbar-tab-close").click({ force: true });

    // ダイアログが出ずにタブが閉じられること
    await expect(tab).not.toBeVisible();
  });

  test("ドラフトなし初期状態では保存・リセットボタンが無効", async ({ page }) => {
    await setupDesigner(page, { withDraft: false });

    await expect(page.getByRole("button", { name: /保存/ })).toBeDisabled();
    await expect(page.getByRole("button", { name: /リセット/ })).toBeDisabled();
  });
});
