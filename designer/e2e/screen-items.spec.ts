/**
 * 画面項目定義プロトタイプ (#318 / PR #320) の基本 E2E。
 *
 * - /screen-items を開けること
 * - 画面セレクタで画面を選べること
 * - 新規項目の追加 / name / type / required 編集
 * - 項目の削除
 * - 保存ボタン押下で isDirty が解消されること
 */
import { test, expect, type Page } from "@playwright/test";

const screenId1 = "scr-1";
const screenId2 = "scr-2";

const dummyProject = {
  version: 1,
  name: "screen-items-ui",
  screens: [
    { id: screenId1, no: 1, name: "ログイン画面", type: "standard", updatedAt: new Date().toISOString() },
    { id: screenId2, no: 2, name: "顧客登録画面", type: "standard", updatedAt: new Date().toISOString() },
  ],
  groups: [], edges: [], tables: [], actionGroups: [],
  updatedAt: new Date().toISOString(),
};

async function setup(page: Page) {
  // MCP WebSocket をブロックして localStorage モードに固定する。
  // 接続が成立するとプロジェクトが実 MCP データで上書きされ、
  // テスト途中で画面切替が発生して状態がリセットされるため。
  await page.routeWebSocket(/ws:\/\/localhost:5179/, (ws) => {
    ws.close();
  });
  await page.addInitScript(({ project }) => {
    localStorage.setItem("flow-project", JSON.stringify(project));
    localStorage.removeItem("designer-open-tabs");
    localStorage.removeItem("designer-active-tab");
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("screen-items-") || k.startsWith("draft-screen-items-")) {
        localStorage.removeItem(k);
      }
    }
  }, { project: dummyProject });
  await page.goto("/screen-items");
  await expect(page.locator(".screen-items-view")).toBeVisible({ timeout: 10000 });
}

test.describe("画面項目定義プロトタイプ (#318)", () => {
  test("画面一覧が selector に反映される", async ({ page }) => {
    await setup(page);
    const sel = page.locator(".screen-items-screen-select");
    await expect(sel).toBeVisible();
    await expect(sel.locator("option")).toHaveCount(2);
    await expect(sel).toContainText("ログイン画面");
    await expect(sel).toContainText("顧客登録画面");
  });

  test("項目追加 → ID 入力 → 保存", async ({ page }) => {
    await setup(page);
    await page.locator(".screen-items-view button:has-text('項目追加')").click();
    // 1 行出現
    await expect(page.locator(".screen-items-table tbody tr")).toHaveCount(1);
    // ID 入力
    const idInput = page.locator('.screen-items-table input[placeholder="email"]').first();
    await idInput.fill("userId");
    await expect(idInput).toHaveValue("userId");
    // label 入力
    const labelInput = page.locator('.screen-items-table input[placeholder="メールアドレス"]').first();
    await labelInput.fill("ユーザー ID");
    // 必須 チェック
    await page.locator('.screen-items-table input[type="checkbox"][aria-label="必須"]').first().check();
    // 保存 (EditorHeader 内の SaveResetButtons)
    const saveBtn = page.locator(".srb-btn-save");
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();
    await expect(saveBtn).toBeDisabled({ timeout: 3000 }); // isDirty 解消
  });

  test("画面切替で項目リストがリセットされる", async ({ page }) => {
    await setup(page);
    // scr-1 に 1 件追加 + 保存
    await page.locator(".screen-items-view button:has-text('項目追加')").click();
    await page.locator('.screen-items-table input[placeholder="email"]').first().fill("field1");
    await page.locator(".srb-btn-save").click();
    await expect(page.locator(".srb-btn-save")).toBeDisabled({ timeout: 3000 });
    // scr-2 に切替
    await page.locator(".screen-items-screen-select").selectOption(screenId2);
    // scr-2 は項目 0 件
    await expect(page.locator(".screen-items-empty-row")).toBeVisible();
    // scr-1 に戻す
    await page.locator(".screen-items-screen-select").selectOption(screenId1);
    await expect(page.locator('.screen-items-table input[value="field1"]')).toBeVisible({ timeout: 3000 });
  });

  test("画面デザインから追加モーダルを開ける", async ({ page }) => {
    await setup(page);
    const btn = page.locator(".screen-items-view button:has-text('画面デザインから追加')");
    await expect(btn).toBeVisible();
    await btn.click();
    await expect(page.locator(".screen-item-candidates")).toBeVisible();
    // キャンセルで閉じる
    await page.locator(".screen-item-candidates-footer button:has-text('キャンセル')").click();
    await expect(page.locator(".screen-item-candidates")).toHaveCount(0);
  });

  test("削除ボタンで項目が消える", async ({ page }) => {
    await setup(page);
    await page.locator(".screen-items-view button:has-text('項目追加')").click();
    await page.locator('.screen-items-table input[placeholder="email"]').first().fill("willDelete");
    await expect(page.locator(".screen-items-table tbody tr")).toHaveCount(1);
    await page.locator('.screen-items-table button[aria-label="削除"]').first().click();
    await expect(page.locator(".screen-items-empty-row")).toBeVisible();
  });

  test("ID を空にして blur すると元の ID に戻る", async ({ page }) => {
    await setup(page);
    await page.locator(".screen-items-view button:has-text('項目追加')").click();
    // tr:last-child で新規追加行のみを対象にする (既存 MCP 行を避ける)
    const row = page.locator(".screen-items-table tbody tr:last-child");
    const idInput = row.locator('input[placeholder="email"]');
    const labelInput = row.locator('input[placeholder="メールアドレス"]');
    // ID を設定して blur で確定 (originalId が "" → !originalId → commit)
    await idInput.fill("userId");
    await labelInput.click();
    // クリックして focus → idFocusVals に "userId" が記録される
    await idInput.click();
    await idInput.fill("");
    await labelInput.click();
    // 元の ID に戻っているはず
    await expect(idInput).toHaveValue("userId", { timeout: 2000 });
  });

  test("ID を既存 ID に変更して blur するとアラートが出て元の ID に戻る", async ({ page }) => {
    await setup(page);
    await page.locator(".screen-items-view button:has-text('項目追加')").click();
    await page.locator(".screen-items-view button:has-text('項目追加')").click();
    // nth-last-child で末尾 2 行のみ操作 (既存 MCP 行を避ける)
    const rowA = page.locator(".screen-items-table tbody tr:nth-last-child(2)");
    const rowB = page.locator(".screen-items-table tbody tr:last-child");
    const idA = rowA.locator('input[placeholder="email"]');
    const idB = rowB.locator('input[placeholder="email"]');
    const labelA = rowA.locator('input[placeholder="メールアドレス"]');
    const labelB = rowB.locator('input[placeholder="メールアドレス"]');
    // 各行の ID を設定して確定
    await idA.fill("fieldA");
    await labelA.click();
    await idB.fill("fieldB");
    await labelB.click();
    // 2 行目をクリックして focus → idFocusVals に "fieldB" が記録される
    await idB.click();
    let alertFired = false;
    page.on("dialog", async (dialog) => {
      if (dialog.message().includes("既に同じ画面内で使用されています")) {
        alertFired = true;
        await dialog.accept();
      }
    });
    await idB.fill("fieldA");
    await labelB.click();
    await expect.poll(() => alertFired, { timeout: 3000 }).toBe(true);
    // 元の ID (fieldB) に戻る
    await expect(idB).toHaveValue("fieldB", { timeout: 2000 });
  });

  test("無効な JS 識別子 (数字始まり) を入力して blur するとアラートが出て元の ID に戻る", async ({ page }) => {
    await setup(page);
    await page.locator(".screen-items-view button:has-text('項目追加')").click();
    const row = page.locator(".screen-items-table tbody tr:last-child");
    const idInput = row.locator('input[placeholder="email"]');
    const labelInput = row.locator('input[placeholder="メールアドレス"]');
    // ID を設定して blur で確定
    await idInput.fill("myField");
    await labelInput.click();
    // クリックして focus → idFocusVals に "myField" が記録される
    await idInput.click();
    let alertFired = false;
    page.on("dialog", async (dialog) => {
      if (dialog.message().includes("有効な ID ではありません")) {
        alertFired = true;
        await dialog.accept();
      }
    });
    await idInput.fill("123invalid");
    await labelInput.click();
    await expect.poll(() => alertFired, { timeout: 3000 }).toBe(true);
    await expect(idInput).toHaveValue("myField", { timeout: 2000 });
  });
});
