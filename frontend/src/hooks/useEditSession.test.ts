import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useEditSession } from "./useEditSession";

const broadcastHandlers = new Map<string, Set<(data: unknown) => void>>();

vi.mock("../mcp/mcpBridge", () => {
  const bridge = {
    getLock: vi.fn(),
    hasDraft: vi.fn(),
    acquireLock: vi.fn(),
    releaseLock: vi.fn(),
    forceReleaseLock: vi.fn(),
    createDraft: vi.fn(),
    commitDraft: vi.fn(),
    discardDraft: vi.fn(),
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

const SESSION_ID = "session-abc";
const OPTS = {
  resourceType: "table" as const,
  resourceId: "tbl-001",
  sessionId: SESSION_ID,
};

beforeEach(() => {
  vi.clearAllMocks();
  broadcastHandlers.clear();
  (mcpBridge.getLock as ReturnType<typeof vi.fn>).mockResolvedValue({ entry: null });
  (mcpBridge.hasDraft as ReturnType<typeof vi.fn>).mockResolvedValue({ exists: false });
  (mcpBridge.acquireLock as ReturnType<typeof vi.fn>).mockResolvedValue({ entry: { ownerSessionId: SESSION_ID } });
  (mcpBridge.releaseLock as ReturnType<typeof vi.fn>).mockResolvedValue({ released: true });
  (mcpBridge.forceReleaseLock as ReturnType<typeof vi.fn>).mockResolvedValue({ released: true, previousOwner: "other-session" });
  (mcpBridge.createDraft as ReturnType<typeof vi.fn>).mockResolvedValue({ created: true });
  (mcpBridge.commitDraft as ReturnType<typeof vi.fn>).mockResolvedValue({ committed: true });
  (mcpBridge.discardDraft as ReturnType<typeof vi.fn>).mockResolvedValue({ discarded: true });
  (mcpBridge.request as ReturnType<typeof vi.fn>).mockResolvedValue({});
});

afterEach(() => {
  broadcastHandlers.clear();
});

describe("useEditSession", () => {
  it("初期状態: ロックなし → readonly", async () => {
    const { result } = renderHook(() => useEditSession(OPTS));

    expect(result.current.loading).toBe(true);

    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    expect(result.current.loading).toBe(false);
    expect(result.current.mode.kind).toBe("readonly");
  });

  it("初期状態: 他セッションがロック中 → locked-by-other", async () => {
    (mcpBridge.getLock as ReturnType<typeof vi.fn>).mockResolvedValue({ entry: { ownerSessionId: "other-session" } });

    const { result } = renderHook(() => useEditSession(OPTS));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    expect(result.current.mode.kind).toBe("locked-by-other");
    if (result.current.mode.kind === "locked-by-other") {
      expect(result.current.mode.ownerSessionId).toBe("other-session");
    }
  });

  it("初期状態: 自分がロック中 → editing", async () => {
    (mcpBridge.getLock as ReturnType<typeof vi.fn>).mockResolvedValue({ entry: { ownerSessionId: SESSION_ID } });

    const { result } = renderHook(() => useEditSession(OPTS));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    expect(result.current.mode.kind).toBe("editing");
  });

  it("startEditing: readonly → editing", async () => {
    const { result } = renderHook(() => useEditSession(OPTS));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      await result.current.actions.startEditing();
    });

    expect(mcpBridge.acquireLock).toHaveBeenCalledWith("table", "tbl-001", SESSION_ID);
    expect(mcpBridge.createDraft).toHaveBeenCalledWith("table", "tbl-001");
    expect(result.current.mode.kind).toBe("editing");
  });

  it("save: editing → readonly", async () => {
    (mcpBridge.getLock as ReturnType<typeof vi.fn>).mockResolvedValue({ entry: { ownerSessionId: SESSION_ID } });

    const { result } = renderHook(() => useEditSession(OPTS));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      await result.current.actions.save();
    });

    expect(mcpBridge.commitDraft).toHaveBeenCalledWith("table", "tbl-001");
    expect(mcpBridge.releaseLock).toHaveBeenCalledWith("table", "tbl-001", SESSION_ID);
    expect(result.current.mode.kind).toBe("readonly");
  });

  it("discard: editing → readonly", async () => {
    (mcpBridge.getLock as ReturnType<typeof vi.fn>).mockResolvedValue({ entry: { ownerSessionId: SESSION_ID } });

    const { result } = renderHook(() => useEditSession(OPTS));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      await result.current.actions.discard();
    });

    expect(mcpBridge.discardDraft).toHaveBeenCalledWith("table", "tbl-001");
    expect(mcpBridge.releaseLock).toHaveBeenCalledWith("table", "tbl-001", SESSION_ID);
    expect(result.current.mode.kind).toBe("readonly");
  });

  it("broadcast lock.changed acquired: mode → locked-by-other", async () => {
    const { result } = renderHook(() => useEditSession(OPTS));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    act(() => {
      fireBroadcast("lock.changed", {
        resourceType: "table",
        resourceId: "tbl-001",
        op: "acquired",
        ownerSessionId: "other-session",
        by: "other-session",
      });
    });

    expect(result.current.mode.kind).toBe("locked-by-other");
  });

  it("broadcast lock.changed acquired: 自分がオーナー → editing", async () => {
    const { result } = renderHook(() => useEditSession(OPTS));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    act(() => {
      fireBroadcast("lock.changed", {
        resourceType: "table",
        resourceId: "tbl-001",
        op: "acquired",
        ownerSessionId: SESSION_ID,
        by: SESSION_ID,
      });
    });

    expect(result.current.mode.kind).toBe("editing");
  });

  it("broadcast lock.changed force-released: 自分がオーナー → force-released-pending", async () => {
    (mcpBridge.getLock as ReturnType<typeof vi.fn>).mockResolvedValue({ entry: { ownerSessionId: SESSION_ID } });

    const { result } = renderHook(() => useEditSession(OPTS));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    act(() => {
      fireBroadcast("lock.changed", {
        resourceType: "table",
        resourceId: "tbl-001",
        op: "force-released",
        ownerSessionId: SESSION_ID,
        by: "other-session",
        previousOwner: SESSION_ID,
      });
    });

    expect(result.current.mode.kind).toBe("force-released-pending");
  });

  it("handleForcedOut discard: draft を破棄して readonly", async () => {
    (mcpBridge.getLock as ReturnType<typeof vi.fn>).mockResolvedValue({ entry: { ownerSessionId: SESSION_ID } });

    const { result } = renderHook(() => useEditSession(OPTS));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    act(() => {
      fireBroadcast("lock.changed", {
        resourceType: "table",
        resourceId: "tbl-001",
        op: "force-released",
        ownerSessionId: SESSION_ID,
        by: "other-session",
        previousOwner: SESSION_ID,
      });
    });

    await act(async () => {
      await result.current.actions.handleForcedOut("discard");
    });

    expect(mcpBridge.discardDraft).toHaveBeenCalledWith("table", "tbl-001");
    expect(result.current.mode.kind).toBe("readonly");
  });

  it("broadcast lock.changed force-released: 自分が解除者 → after-force-unlock", async () => {
    const { result } = renderHook(() => useEditSession(OPTS));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    act(() => {
      fireBroadcast("lock.changed", {
        resourceType: "table",
        resourceId: "tbl-001",
        op: "force-released",
        ownerSessionId: "other-session",
        by: SESSION_ID,
        previousOwner: "other-session",
      });
    });

    expect(result.current.mode.kind).toBe("after-force-unlock");
    if (result.current.mode.kind === "after-force-unlock") {
      expect(result.current.mode.previousOwner).toBe("other-session");
    }
  });

  it("handleAfterForceUnlock adopt: lock 取得して editing へ", async () => {
    const { result } = renderHook(() => useEditSession(OPTS));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    act(() => {
      fireBroadcast("lock.changed", {
        resourceType: "table",
        resourceId: "tbl-001",
        op: "force-released",
        ownerSessionId: "other-session",
        by: SESSION_ID,
        previousOwner: "other-session",
      });
    });

    await act(async () => {
      await result.current.actions.handleAfterForceUnlock("adopt");
    });

    expect(mcpBridge.acquireLock).toHaveBeenCalledWith("table", "tbl-001", SESSION_ID);
    expect(result.current.mode.kind).toBe("editing");
  });

  it("handleAfterForceUnlock discard: draft 削除して readonly へ", async () => {
    const { result } = renderHook(() => useEditSession(OPTS));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    act(() => {
      fireBroadcast("lock.changed", {
        resourceType: "table",
        resourceId: "tbl-001",
        op: "force-released",
        ownerSessionId: "other-session",
        by: SESSION_ID,
        previousOwner: "other-session",
      });
    });

    await act(async () => {
      await result.current.actions.handleAfterForceUnlock("discard");
    });

    expect(mcpBridge.discardDraft).toHaveBeenCalledWith("table", "tbl-001");
    expect(result.current.mode.kind).toBe("readonly");
  });

  it("broadcast の resourceType / resourceId が異なる場合は無視", async () => {
    const { result } = renderHook(() => useEditSession(OPTS));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    act(() => {
      fireBroadcast("lock.changed", {
        resourceType: "screen",
        resourceId: "other-resource",
        op: "acquired",
        ownerSessionId: "other-session",
        by: "other-session",
      });
    });

    expect(result.current.mode.kind).toBe("readonly");
  });

  describe("isDirtyForTab", () => {
    it("readonly モードでは false", async () => {
      const { result } = renderHook(() => useEditSession(OPTS));
      await act(async () => { await Promise.resolve(); });
      await act(async () => { await Promise.resolve(); });

      expect(result.current.mode.kind).toBe("readonly");
      expect(result.current.isDirtyForTab).toBe(false);
    });

    it("editing モードでは true", async () => {
      (mcpBridge.getLock as ReturnType<typeof vi.fn>).mockResolvedValue({ entry: { ownerSessionId: SESSION_ID } });

      const { result } = renderHook(() => useEditSession(OPTS));
      await act(async () => { await Promise.resolve(); });
      await act(async () => { await Promise.resolve(); });

      expect(result.current.mode.kind).toBe("editing");
      expect(result.current.isDirtyForTab).toBe(true);
    });

    it("force-released-pending モードでは true", async () => {
      (mcpBridge.getLock as ReturnType<typeof vi.fn>).mockResolvedValue({ entry: { ownerSessionId: SESSION_ID } });

      const { result } = renderHook(() => useEditSession(OPTS));
      await act(async () => { await Promise.resolve(); });
      await act(async () => { await Promise.resolve(); });

      act(() => {
        fireBroadcast("lock.changed", {
          resourceType: "table",
          resourceId: "tbl-001",
          op: "force-released",
          ownerSessionId: SESSION_ID,
          by: "other-session",
          previousOwner: SESSION_ID,
        });
      });

      expect(result.current.mode.kind).toBe("force-released-pending");
      expect(result.current.isDirtyForTab).toBe(true);
    });
  });

  // ── Phase 2 / Phase 6 追加テスト (#886 Phase 8) ────────────────────────────

  describe("LockConflictError → viewer fallback (#878 Phase 2)", () => {
    it("startEditing: ロック競合エラー → subscribeAsViewer 成功 → mode viewer", async () => {
      // acquireLock が LockConflictError を返す
      (mcpBridge.acquireLock as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("既に他のセッションがロック中"),
      );
      // subscribeAsViewer は成功
      (mcpBridge.request as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const { result } = renderHook(() => useEditSession(OPTS));
      await act(async () => { await Promise.resolve(); });
      await act(async () => { await Promise.resolve(); });

      await act(async () => {
        await result.current.actions.startEditing();
      });

      expect(mcpBridge.request).toHaveBeenCalledWith("lock.subscribeAsViewer", {
        resourceType: "table",
        resourceId: "tbl-001",
      });
      expect(result.current.mode.kind).toBe("viewer");
    });

    it("startEditing: ロック競合エラー → subscribeAsViewer も失敗 → mode locked-by-other", async () => {
      // getLock で他セッションのロックを返す (refreshLockState 用)
      (mcpBridge.getLock as ReturnType<typeof vi.fn>).mockResolvedValue({
        entry: { ownerSessionId: "other-session" },
      });
      // acquireLock が LockConflictError を返す
      (mcpBridge.acquireLock as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("既に他のセッションがロック中"),
      );
      // subscribeAsViewer も失敗
      (mcpBridge.request as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("subscribeAsViewer failed"),
      );

      const { result } = renderHook(() => useEditSession(OPTS));
      // 初期化: getLock が "other-session" を返すので locked-by-other になる
      await act(async () => { await Promise.resolve(); });
      await act(async () => { await Promise.resolve(); });

      expect(result.current.mode.kind).toBe("locked-by-other");

      // startEditing は locked-by-other から呼ばれた場合にも競合エラーになる
      await act(async () => {
        await result.current.actions.startEditing();
      });

      // subscribeAsViewer 失敗後は refreshLockState → locked-by-other
      expect(result.current.mode.kind).toBe("locked-by-other");
    });

    it("viewer mode の unmount cleanup で unsubscribeViewer が呼ばれる", async () => {
      // acquireLock が LockConflictError → viewer になる
      (mcpBridge.acquireLock as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("既に他のセッションがロック中"),
      );
      (mcpBridge.request as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const { result, unmount } = renderHook(() => useEditSession(OPTS));
      await act(async () => { await Promise.resolve(); });
      await act(async () => { await Promise.resolve(); });

      await act(async () => {
        await result.current.actions.startEditing();
      });

      expect(result.current.mode.kind).toBe("viewer");

      // unmount で unsubscribeViewer が呼ばれることを確認
      unmount();

      // unmount 後に unsubscribeViewer が呼ばれる
      // (cleanup は同期的ではなく useEffect cleanup のため、call を確認する)
      const requestCalls = (mcpBridge.request as ReturnType<typeof vi.fn>).mock.calls;
      const unsubCall = requestCalls.find(
        (args: unknown[]) => args[0] === "lock.unsubscribeViewer",
      );
      expect(unsubCall).toBeDefined();
    });
  });

  describe("lock.changed transferred — mode 自動切替 (#884 Phase 6)", () => {
    it("transferred: previousOwner = self → mode viewer に自動 fallback + subscribeAsViewer 呼び出し", async () => {
      // 自分が editing 中の状態を作る
      (mcpBridge.getLock as ReturnType<typeof vi.fn>).mockResolvedValue({
        entry: { ownerSessionId: SESSION_ID },
      });

      const { result } = renderHook(() => useEditSession(OPTS));
      await act(async () => { await Promise.resolve(); });
      await act(async () => { await Promise.resolve(); });

      expect(result.current.mode.kind).toBe("editing");

      // transferred broadcast: 自分が previousOwner
      act(() => {
        fireBroadcast("lock.changed", {
          resourceType: "table",
          resourceId: "tbl-001",
          op: "transferred",
          ownerSessionId: "new-owner-session",
          by: "new-owner-session",
          previousOwner: SESSION_ID,
        });
      });

      expect(result.current.mode.kind).toBe("viewer");
      expect(mcpBridge.request).toHaveBeenCalledWith("lock.subscribeAsViewer", {
        resourceType: "table",
        resourceId: "tbl-001",
      });
    });

    it("transferred: newOwner = self → mode editing に自動 promote", async () => {
      // viewer 状態を作る: acquireLock 失敗 → viewer
      (mcpBridge.acquireLock as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("既に他のセッションがロック中"),
      );
      (mcpBridge.request as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const { result } = renderHook(() => useEditSession(OPTS));
      await act(async () => { await Promise.resolve(); });
      await act(async () => { await Promise.resolve(); });

      // viewer になるために startEditing を呼ぶ
      await act(async () => {
        await result.current.actions.startEditing();
      });

      expect(result.current.mode.kind).toBe("viewer");

      // transferred broadcast: 自分が新 owner
      act(() => {
        fireBroadcast("lock.changed", {
          resourceType: "table",
          resourceId: "tbl-001",
          op: "transferred",
          ownerSessionId: SESSION_ID,
          by: SESSION_ID,
          previousOwner: "old-owner-session",
        });
      });

      expect(result.current.mode.kind).toBe("editing");
    });

    it("transferred: 自分と無関係な場合は mode 変更なし", async () => {
      const { result } = renderHook(() => useEditSession(OPTS));
      await act(async () => { await Promise.resolve(); });
      await act(async () => { await Promise.resolve(); });

      expect(result.current.mode.kind).toBe("readonly");

      // transferred broadcast: 他者間の引き継ぎ
      act(() => {
        fireBroadcast("lock.changed", {
          resourceType: "table",
          resourceId: "tbl-001",
          op: "transferred",
          ownerSessionId: "bob-session",
          by: "bob-session",
          previousOwner: "alice-session",
        });
      });

      // readonly のまま
      expect(result.current.mode.kind).toBe("readonly");
    });
  });
});
