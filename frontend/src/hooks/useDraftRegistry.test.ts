/**
 * useDraftRegistry.test.ts — Phase 6 (#903) リファクタ後テスト
 *
 * 旧 draft.list / draft.changed ベースから editSession.list / editSession.* broadcast ベースに移行済み。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDraftRegistry } from "./useDraftRegistry";

const broadcastHandlers = new Map<string, Set<(data: unknown) => void>>();

vi.mock("../mcp/mcpBridge", () => {
  const bridge = {
    request: vi.fn(),
    onBroadcast: vi.fn((event: string, handler: (data: unknown) => void) => {
      if (!broadcastHandlers.has(event)) {
        broadcastHandlers.set(event, new Set());
      }
      broadcastHandlers.get(event)!.add(handler);
      return () => broadcastHandlers.get(event)?.delete(handler);
    }),
  };
  return { mcpBridge: bridge };
});

function fireBroadcast(event: string, data: unknown) {
  broadcastHandlers.get(event)?.forEach((h) => h(data));
}

import { mcpBridge } from "../mcp/mcpBridge";

beforeEach(() => {
  vi.clearAllMocks();
  broadcastHandlers.clear();
  (mcpBridge.request as ReturnType<typeof vi.fn>).mockResolvedValue({
    sessions: [
      { id: "es-001", resourceType: "table", resourceId: "tbl-001", state: "Active" },
      { id: "es-002", resourceType: "process-flow", resourceId: "pf-001", state: "Active" },
      { id: "es-003", resourceType: "view", resourceId: "view-old", state: "Discarded" },
    ],
  });
});

afterEach(() => {
  broadcastHandlers.clear();
});

describe("useDraftRegistry (Phase 6: editSession.list ベース)", () => {
  it("mount 時に editSession.list を fetch して Active session を Map に構築する", async () => {
    const { result } = renderHook(() => useDraftRegistry());

    await act(async () => {
      await Promise.resolve();
    });

    expect(mcpBridge.request).toHaveBeenCalledWith("editSession.list", {});
    expect(result.current.hasDraft("table", "tbl-001")).toBe(true);
    expect(result.current.hasDraft("process-flow", "pf-001")).toBe(true);
    // Discarded state は含まない
    expect(result.current.hasDraft("view", "view-old")).toBe(false);
    expect(result.current.hasDraft("table", "not-exist")).toBe(false);
  });

  it("editSession.created broadcast で Map を再取得する", async () => {
    const { result } = renderHook(() => useDraftRegistry());

    await act(async () => {
      await Promise.resolve();
    });

    (mcpBridge.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      sessions: [
        { id: "es-001", resourceType: "table", resourceId: "tbl-001", state: "Active" },
        { id: "es-002", resourceType: "process-flow", resourceId: "pf-001", state: "Active" },
        { id: "es-004", resourceType: "view", resourceId: "view-001", state: "Active" },
      ],
    });

    await act(async () => {
      fireBroadcast("editSession.created", { editSession: { id: "es-004" } });
      await Promise.resolve();
    });

    expect(result.current.hasDraft("view", "view-001")).toBe(true);
  });

  it("editSession.discarded broadcast で Map を再取得し Discarded 分が除外される", async () => {
    const { result } = renderHook(() => useDraftRegistry());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.hasDraft("table", "tbl-001")).toBe(true);

    (mcpBridge.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      sessions: [
        { id: "es-001", resourceType: "table", resourceId: "tbl-001", state: "Discarded" },
        { id: "es-002", resourceType: "process-flow", resourceId: "pf-001", state: "Active" },
      ],
    });

    await act(async () => {
      fireBroadcast("editSession.discarded", { editSessionId: "es-001", reason: "manual" });
      await Promise.resolve();
    });

    expect(result.current.hasDraft("table", "tbl-001")).toBe(false);
  });

  it("unmount 時に editSession.* broadcast の unsubscribe が呼ばれる", async () => {
    const { unmount } = renderHook(() => useDraftRegistry());

    await act(async () => {
      await Promise.resolve();
    });

    const handlersCreated = broadcastHandlers.get("editSession.created")?.size ?? 0;
    expect(handlersCreated).toBeGreaterThan(0);

    unmount();

    const handlersAfter = broadcastHandlers.get("editSession.created")?.size ?? 0;
    expect(handlersAfter).toBe(handlersCreated - 1);
  });

  it("MCP 未接続時は空 Map で初期化される", async () => {
    (mcpBridge.request as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("not connected"));

    const { result } = renderHook(() => useDraftRegistry());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.hasDraft("table", "any-id")).toBe(false);
    expect(result.current.drafts.size).toBe(0);
  });
});
