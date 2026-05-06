/**
 * useSessionUrlSync.test.ts (#882 Phase 4)
 * URL 解釈 / replaceState 呼び出しを検証する。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSessionUrlSync } from "./useSessionUrlSync";

// ── モック ─────────────────────────────────────────────────────────────────

const mockRequest = vi.fn().mockResolvedValue({});
vi.mock("../mcp/mcpBridge", () => ({
  mcpBridge: {
    request: (...args: unknown[]) => mockRequest(...args),
  },
}));

// history.replaceState をモック
const mockReplaceState = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  // window.location.search を空にリセット
  Object.defineProperty(window, "location", {
    writable: true,
    value: { ...window.location, search: "", href: "http://localhost/" },
  });
  Object.defineProperty(window, "history", {
    writable: true,
    value: { replaceState: mockReplaceState },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useSessionUrlSync", () => {
  it("URL に ?session= がない場合は subscribeAsViewer を呼ばない", () => {
    renderHook(() =>
      useSessionUrlSync({ resourceType: "process-flow", resourceId: "flow-001" }),
    );
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("URL に ?session=<sid> がある場合は subscribeAsViewer を呼ぶ", async () => {
    Object.defineProperty(window, "location", {
      writable: true,
      value: {
        ...window.location,
        search: "?session=session-abc",
        href: "http://localhost/?session=session-abc",
      },
    });

    const onViewerAttached = vi.fn();
    renderHook(() =>
      useSessionUrlSync({
        resourceType: "process-flow",
        resourceId: "flow-001",
        onViewerAttached,
      }),
    );

    await new Promise((r) => setTimeout(r, 0));

    expect(mockRequest).toHaveBeenCalledWith("lock.subscribeAsViewer", {
      resourceType: "process-flow",
      resourceId: "flow-001",
    });
    expect(onViewerAttached).toHaveBeenCalledWith("session-abc");
  });

  it("syncSessionToUrl は history.replaceState を呼ぶ", () => {
    Object.defineProperty(window, "location", {
      writable: true,
      value: {
        ...window.location,
        search: "",
        href: "http://localhost/process-flow/edit/flow-001",
      },
    });

    const { result } = renderHook(() =>
      useSessionUrlSync({ resourceType: "process-flow", resourceId: "flow-001" }),
    );

    result.current.syncSessionToUrl("session-xyz");

    expect(mockReplaceState).toHaveBeenCalledOnce();
    const calledUrl = mockReplaceState.mock.calls[0][2] as string;
    expect(calledUrl).toContain("session=session-xyz");
  });

  it("clearSessionFromUrl は ?session= を削除した URL で replaceState を呼ぶ", () => {
    Object.defineProperty(window, "location", {
      writable: true,
      value: {
        ...window.location,
        search: "?session=session-abc",
        href: "http://localhost/process-flow/edit/flow-001?session=session-abc",
      },
    });

    const { result } = renderHook(() =>
      useSessionUrlSync({ resourceType: "process-flow", resourceId: "flow-001" }),
    );

    result.current.clearSessionFromUrl();

    expect(mockReplaceState).toHaveBeenCalled();
    const calledUrl = mockReplaceState.mock.calls[0][2] as string;
    expect(calledUrl).not.toContain("session=");
  });
});
