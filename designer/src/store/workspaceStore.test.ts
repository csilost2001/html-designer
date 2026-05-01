/**
 * workspaceStore 単体テスト (#677-A)
 * loadWorkspaces() の直列化: 並行呼び出しでも順次実行される
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// mcpBridge をモックする
vi.mock("../mcp/mcpBridge", () => {
  let callCount = 0;
  const mockRequest = vi.fn(async () => {
    callCount++;
    const n = callCount;
    return {
      workspaces: [{ id: `ws-${n}`, path: `/tmp/ws${n}`, name: `WS${n}`, lastOpenedAt: null }],
      lastActiveId: null,
      active: null,
      lockdown: false,
      lockdownPath: null,
    };
  });
  return {
    mcpBridge: {
      request: mockRequest,
      onBroadcast: vi.fn(() => () => {}),
      onStatusChange: vi.fn(() => () => {}),
      startWithoutEditor: vi.fn(),
    },
  };
});

// モック後に import する (vi.mock は hoisted)
const { mcpBridge } = await import("../mcp/mcpBridge");

// ストアモジュールは vi.mock が確定した後にインポートする必要があるため動的 import
const storeModule = await import("./workspaceStore");
const { loadWorkspaces, getState } = storeModule;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loadWorkspaces 直列化 (A)", () => {
  it("2 つの並行 loadWorkspaces 呼び出しで request が 2 回順次呼ばれる", async () => {
    const p1 = loadWorkspaces();
    const p2 = loadWorkspaces();
    await Promise.all([p1, p2]);

    // request が 2 回呼ばれたことを確認 (並行ではなく直列に実行された)
    expect((mcpBridge.request as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });

  it("1 つ目が reject しても 2 つ目が正常に実行される", async () => {
    const mockReq = mcpBridge.request as ReturnType<typeof vi.fn>;
    // 1 回目は失敗、2 回目は成功
    mockReq
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce({
        workspaces: [{ id: "ws-ok", path: "/tmp/ok", name: "OK", lastOpenedAt: null }],
        lastActiveId: null,
        active: null,
        lockdown: false,
        lockdownPath: null,
      });

    const p1 = loadWorkspaces();
    const p2 = loadWorkspaces();

    // p1 は失敗してもチェーンは切れない
    await Promise.allSettled([p1, p2]);

    // 2 つとも実行された
    expect(mockReq.mock.calls.length).toBe(2);
    // 2 つ目が成功した結果が state に反映されている
    const st = getState();
    expect(st.error).toBeNull();
    expect(st.workspaces.length).toBe(1);
    expect(st.workspaces[0].id).toBe("ws-ok");
  });
});
