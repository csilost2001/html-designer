/**
 * usePresenceRegistry.test.ts (#886 Phase 8)
 *
 * usePresenceRegistry の subscribe / Map 更新 / unsubscribe / filter テスト。
 * docs/spec/collab-presence.md § 4 に準拠。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePresenceFor, usePresenceAll } from "./usePresenceRegistry";
import type { PresenceEntry } from "./usePresenceRegistry";

// ── broadcast ハンドラー管理 ─────────────────────────────────────────────────

const broadcastHandlers = new Map<string, Set<(data: unknown) => void>>();

vi.mock("../mcp/mcpBridge", () => {
  const bridge = {
    request: vi.fn().mockResolvedValue({}),
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

// PresenceRegistryStore はシングルトンなので window から reset する
function resetStore() {
  if (typeof window !== "undefined") {
    delete (window as unknown as { __presenceRegistryStore?: unknown }).__presenceRegistryStore;
  }
}

function makeEntry(overrides: Partial<PresenceEntry> = {}): PresenceEntry {
  return {
    sessionId: "sess-001",
    resourceType: "process-flow",
    resourceId: "pf-001",
    role: "editor",
    lastActivityAt: new Date().toISOString(),
    lastEditAt: new Date().toISOString(),
    focusAt: new Date().toISOString(),
    ownerLabel: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  broadcastHandlers.clear();
  resetStore();
});

afterEach(() => {
  broadcastHandlers.clear();
  resetStore();
});

// ── usePresenceFor ──────────────────────────────────────────────────────────

describe("usePresenceFor", () => {
  it("初期状態は空配列", () => {
    const { result } = renderHook(() =>
      usePresenceFor("process-flow", "pf-001"),
    );
    expect(result.current).toEqual([]);
  });

  it("presence:update broadcast を受信して entries が更新される", async () => {
    const { result } = renderHook(() =>
      usePresenceFor("process-flow", "pf-001"),
    );

    const entry = makeEntry();

    act(() => {
      fireBroadcast("presence:update", {
        resourceType: "process-flow",
        resourceId: "pf-001",
        entries: [entry],
      });
    });

    expect(result.current).toHaveLength(1);
    expect(result.current[0].sessionId).toBe("sess-001");
  });

  it("異なる resourceId の broadcast は無視される", async () => {
    const { result } = renderHook(() =>
      usePresenceFor("process-flow", "pf-001"),
    );

    act(() => {
      fireBroadcast("presence:update", {
        resourceType: "process-flow",
        resourceId: "pf-OTHER",
        entries: [makeEntry({ resourceId: "pf-OTHER" })],
      });
    });

    expect(result.current).toHaveLength(0);
  });

  it("異なる resourceType の broadcast は無視される", async () => {
    const { result } = renderHook(() =>
      usePresenceFor("process-flow", "pf-001"),
    );

    act(() => {
      fireBroadcast("presence:update", {
        resourceType: "table",
        resourceId: "pf-001",
        entries: [makeEntry({ resourceType: "table" })],
      });
    });

    expect(result.current).toHaveLength(0);
  });

  it("entries が空配列の broadcast でエントリが削除される", async () => {
    const { result } = renderHook(() =>
      usePresenceFor("process-flow", "pf-001"),
    );

    act(() => {
      fireBroadcast("presence:update", {
        resourceType: "process-flow",
        resourceId: "pf-001",
        entries: [makeEntry()],
      });
    });

    expect(result.current).toHaveLength(1);

    act(() => {
      fireBroadcast("presence:update", {
        resourceType: "process-flow",
        resourceId: "pf-001",
        entries: [],
      });
    });

    expect(result.current).toHaveLength(0);
  });

  it("unmount 後は broadcast を受信しない", async () => {
    const { result, unmount } = renderHook(() =>
      usePresenceFor("process-flow", "pf-001"),
    );

    unmount();

    act(() => {
      fireBroadcast("presence:update", {
        resourceType: "process-flow",
        resourceId: "pf-001",
        entries: [makeEntry()],
      });
    });

    // unmount 後なので result.current は初期値のまま
    expect(result.current).toHaveLength(0);
  });
});

// ── usePresenceAll ──────────────────────────────────────────────────────────

describe("usePresenceAll", () => {
  it("初期状態は空 Map", () => {
    const { result } = renderHook(() => usePresenceAll());
    expect(result.current.size).toBe(0);
  });

  it("複数リソースの broadcast を受信してすべて Map に格納される", async () => {
    const { result } = renderHook(() => usePresenceAll());

    const entryPf = makeEntry({ resourceType: "process-flow", resourceId: "pf-001" });
    const entryTbl = makeEntry({ resourceType: "table", resourceId: "tbl-001" });

    act(() => {
      fireBroadcast("presence:update", {
        resourceType: "process-flow",
        resourceId: "pf-001",
        entries: [entryPf],
      });
    });

    act(() => {
      fireBroadcast("presence:update", {
        resourceType: "table",
        resourceId: "tbl-001",
        entries: [entryTbl],
      });
    });

    expect(result.current.size).toBe(2);
    expect(result.current.get("process-flow:pf-001")).toHaveLength(1);
    expect(result.current.get("table:tbl-001")).toHaveLength(1);
  });

  it("同一リソースへの重複登録は upsert (上書き) される", async () => {
    const { result } = renderHook(() => usePresenceAll());

    act(() => {
      fireBroadcast("presence:update", {
        resourceType: "process-flow",
        resourceId: "pf-001",
        entries: [makeEntry({ sessionId: "sess-A" })],
      });
    });

    expect(result.current.get("process-flow:pf-001")).toHaveLength(1);
    expect(result.current.get("process-flow:pf-001")![0].sessionId).toBe("sess-A");

    // 同一キーに別のエントリセットで上書き
    act(() => {
      fireBroadcast("presence:update", {
        resourceType: "process-flow",
        resourceId: "pf-001",
        entries: [
          makeEntry({ sessionId: "sess-A" }),
          makeEntry({ sessionId: "sess-B" }),
        ],
      });
    });

    expect(result.current.get("process-flow:pf-001")).toHaveLength(2);
  });

  it("entries が空でリソースが Map から削除される", async () => {
    const { result } = renderHook(() => usePresenceAll());

    act(() => {
      fireBroadcast("presence:update", {
        resourceType: "process-flow",
        resourceId: "pf-001",
        entries: [makeEntry()],
      });
    });

    expect(result.current.size).toBe(1);

    act(() => {
      fireBroadcast("presence:update", {
        resourceType: "process-flow",
        resourceId: "pf-001",
        entries: [],
      });
    });

    expect(result.current.size).toBe(0);
  });
});
