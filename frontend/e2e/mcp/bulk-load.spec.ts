import { test, expect } from "@playwright/test";
import { isMcpRunning, sendBrowserRequest, openBrowserSessionWorkspace, closeBrowserSession } from "./_helpers";
import { setupTestWorkspace, cleanupRealWorkspaces } from "../helpers/realWorkspace";
import { buildProject } from "../__fixtures__/builders";

const WS_KEY = "issue-958-mcp-bulk-load";

// #958: 永続 WS + clientId 共有構造 + beforeAll workspace.open で activePath を立てる
test.describe("wsBridge bulk load (#587) (#958)", { tag: ["@regression"] }, () => {
  let mcpAvailable = false;

  test.beforeAll(async () => {
    mcpAvailable = await isMcpRunning();
    if (!mcpAvailable) return;
    const ws = await setupTestWorkspace({ key: WS_KEY, project: buildProject({ name: "mcp-bulk-load-e2e" }) });
    await openBrowserSessionWorkspace(ws.workspacePath);
  });

  test.afterAll(async () => {
    await closeBrowserSession();
    if (mcpAvailable) await cleanupRealWorkspaces([WS_KEY]);
  });

  test.beforeEach(async () => {
    if (!mcpAvailable) test.skip();
  });

  test("listAllTables は配列を返す", async () => {
    const result = await sendBrowserRequest("listAllTables");
    expect(Array.isArray(result)).toBe(true);
  });

  test("listAllViews は配列を返す", async () => {
    const result = await sendBrowserRequest("listAllViews");
    expect(Array.isArray(result)).toBe(true);
  });
});
