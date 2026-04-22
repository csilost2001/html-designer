/**
 * GrapesJS 部品配置時の name / id / data-item-id 自動入力 E2E (#328)
 *
 * Designer に input ブロックをプログラム的に追加し、
 * ensureFormFieldIdentity() が自動で属性を付与することを検証する。
 * window.editor が GrapesJS editor を公開している前提 (Designer.tsx:206)。
 */
import { test, expect, type Page } from "@playwright/test";

const SCREEN_ID = "aaaaaaaa-0001-4000-8000-aaaaaaaaaaaa";

const dummyProject = {
  version: 1,
  name: "data-item-id-auto-test",
  screens: [
    {
      id: SCREEN_ID,
      no: 1,
      name: "テスト画面",
      type: "standard",
      updatedAt: new Date().toISOString(),
    },
  ],
  groups: [],
  edges: [],
  tables: [],
  actionGroups: [],
  updatedAt: new Date().toISOString(),
};

const emptyScreen = {
  dataSources: [],
  assets: [],
  styles: [],
  pages: [
    {
      frames: [
        {
          component: { type: "wrapper", components: "<div></div>" },
          id: "fr-auto-0001",
        },
      ],
      type: "main",
      id: "pg-auto-0001",
    },
  ],
  symbols: [],
};

async function setupDesigner(page: Page) {
  const tab = {
    id: `design:${SCREEN_ID}`,
    type: "design",
    resourceId: SCREEN_ID,
    label: "テスト画面",
    isDirty: false,
    isPinned: false,
  };

  await page.addInitScript(
    ({ project, screenId, tab, screenData }) => {
      localStorage.setItem("flow-project", JSON.stringify(project));
      localStorage.setItem(`gjs-screen-${screenId}`, JSON.stringify(screenData));
      localStorage.setItem("designer-open-tabs", JSON.stringify([tab]));
      localStorage.setItem("designer-active-tab", tab.id);
      localStorage.removeItem(`gjs-screen-${screenId}-draft`);
    },
    { project: dummyProject, screenId: SCREEN_ID, tab, screenData: emptyScreen },
  );

  await page.goto(`/screen/design/${SCREEN_ID}`);
  // GrapesJS 初期化完了を待つ
  await expect(page.locator(".gjs-frame")).toBeVisible({ timeout: 15000 });
  // window.editor が設定されるまで待つ
  await page.waitForFunction(() => !!(window as unknown as { editor?: unknown }).editor, {
    timeout: 15000,
  });
}

test.describe("部品配置時 name / id / data-item-id 自動入力 (#328)", () => {
  test("input[text] を追加すると name / id / data-item-id が自動付与される", async ({ page }) => {
    await setupDesigner(page);

    const attrs = await page.evaluate(() => {
      type GEditor = {
        DomComponents: {
          addComponent: (def: Record<string, unknown>) => {
            getAttributes: () => Record<string, string>;
          };
        };
      };
      const editor = (window as unknown as { editor?: GEditor }).editor;
      if (!editor) throw new Error("GrapesJS editor not found on window.editor");
      const cmp = editor.DomComponents.addComponent({
        tagName: "input",
        attributes: { type: "text", class: "form-control" },
      });
      return cmp.getAttributes();
    });

    expect(attrs["data-item-id"]).toBeTruthy();
    expect(attrs["data-item-id"]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(attrs.name).toMatch(/^field_[0-9a-f]{8}$/);
    expect(attrs.id).toBe(attrs.name);
  });

  test("既に name がある input を追加しても name は上書きされない", async ({ page }) => {
    await setupDesigner(page);

    const attrs = await page.evaluate(() => {
      type GEditor = {
        DomComponents: {
          addComponent: (def: Record<string, unknown>) => {
            getAttributes: () => Record<string, string>;
          };
        };
      };
      const editor = (window as unknown as { editor?: GEditor }).editor;
      if (!editor) throw new Error("GrapesJS editor not found");
      const cmp = editor.DomComponents.addComponent({
        tagName: "input",
        attributes: { type: "text", name: "existing_name" },
      });
      return cmp.getAttributes();
    });

    expect(attrs.name).toBe("existing_name");
    // data-item-id は付与される
    expect(attrs["data-item-id"]).toBeTruthy();
  });

  test("button type の input には属性付与されない", async ({ page }) => {
    await setupDesigner(page);

    const attrs = await page.evaluate(() => {
      type GEditor = {
        DomComponents: {
          addComponent: (def: Record<string, unknown>) => {
            getAttributes: () => Record<string, string>;
          };
        };
      };
      const editor = (window as unknown as { editor?: GEditor }).editor;
      if (!editor) throw new Error("GrapesJS editor not found");
      const cmp = editor.DomComponents.addComponent({
        tagName: "input",
        attributes: { type: "button", value: "送信" },
      });
      return cmp.getAttributes();
    });

    expect(attrs["data-item-id"]).toBeFalsy();
    expect(attrs.name).toBeFalsy();
  });
});
