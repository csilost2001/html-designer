import { test, expect } from "@playwright/test";
import { isMcpRunning, sendBrowserRequest } from "./_helpers";

// TODO(#945-G follow-up): mcp-tools.spec.ts と同じく sendBrowserRequest 構造修正待ち
test.describe.skip("wsBridge bulk load (#587) (#945-G follow-up)", () => {
  test.beforeEach(async () => {
    const running = await isMcpRunning();
    if (!running) test.skip();
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
