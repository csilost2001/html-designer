/**
 * TransferNotificationBanner.test.tsx (#886 Phase 8)
 *
 * TransferNotificationBanner の RTL テスト。
 * docs/spec/collab-presence.md § 8 Take-over フロー に準拠。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { TransferNotificationBanner } from "./TransferNotificationBanner";

// ── broadcast ハンドラー管理 ─────────────────────────────────────────────────

const broadcastHandlers = new Map<string, Set<(data: unknown) => void>>();

vi.mock("../../mcp/mcpBridge", () => {
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

const CLIENT_ID = "client-alice-0000000000";

beforeEach(() => {
  vi.clearAllMocks();
  broadcastHandlers.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  broadcastHandlers.clear();
  vi.useRealTimers();
});

describe("TransferNotificationBanner", () => {
  it("初期状態では何も表示しない", () => {
    const { container } = render(
      <TransferNotificationBanner clientId={CLIENT_ID} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("previousOwner = self の broadcast → 「引き継がれました」バナーが表示される", () => {
    render(<TransferNotificationBanner clientId={CLIENT_ID} />);

    act(() => {
      fireBroadcast("lock.changed", {
        resourceType: "process-flow",
        resourceId: "pf-001",
        op: "transferred",
        ownerSessionId: "bob-session-id-0000000",
        by: "bob-session-id-0000000",
        previousOwner: CLIENT_ID,
      });
    });

    const banner = screen.getByTestId("transfer-notification-banner");
    expect(banner).toBeTruthy();
    // "に引き継がれました" を含む
    expect(banner.textContent).toContain("に引き継がれました");
    // newOwner の sessionId 先頭 8 文字が含まれる
    expect(banner.textContent).toContain("bob-sess");
  });

  it("newOwner = self の broadcast → 「draft を引継ぎました」バナーが表示される", () => {
    render(<TransferNotificationBanner clientId={CLIENT_ID} />);

    act(() => {
      fireBroadcast("lock.changed", {
        resourceType: "process-flow",
        resourceId: "pf-001",
        op: "transferred",
        ownerSessionId: CLIENT_ID,
        by: CLIENT_ID,
        previousOwner: "alice-prev-session-0000",
      });
    });

    const banner = screen.getByTestId("transfer-notification-banner");
    expect(banner).toBeTruthy();
    // "draft を引継ぎました" を含む
    expect(banner.textContent).toContain("draft を引継ぎました");
    // previousOwner の sessionId 先頭 8 文字が含まれる
    expect(banner.textContent).toContain("alice-pr");
  });

  it("5 秒後に autoclose される", () => {
    render(<TransferNotificationBanner clientId={CLIENT_ID} />);

    act(() => {
      fireBroadcast("lock.changed", {
        resourceType: "process-flow",
        resourceId: "pf-001",
        op: "transferred",
        ownerSessionId: "bob-session",
        by: "bob-session",
        previousOwner: CLIENT_ID,
      });
    });

    expect(screen.getByTestId("transfer-notification-banner")).toBeTruthy();

    // 5 秒 (5000ms) 経過
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.queryByTestId("transfer-notification-banner")).toBeNull();
  });

  it("transferred 以外の op は無視される", () => {
    render(<TransferNotificationBanner clientId={CLIENT_ID} />);

    act(() => {
      fireBroadcast("lock.changed", {
        resourceType: "process-flow",
        resourceId: "pf-001",
        op: "acquired",
        ownerSessionId: "bob-session",
        by: "bob-session",
        previousOwner: CLIENT_ID,
      });
    });

    expect(screen.queryByTestId("transfer-notification-banner")).toBeNull();
  });

  it("自分とも無関係な transferred は表示しない", () => {
    render(<TransferNotificationBanner clientId={CLIENT_ID} />);

    act(() => {
      fireBroadcast("lock.changed", {
        resourceType: "process-flow",
        resourceId: "pf-001",
        op: "transferred",
        ownerSessionId: "charlie-session",
        by: "charlie-session",
        previousOwner: "bob-session", // CLIENT_ID とは無関係
      });
    });

    expect(screen.queryByTestId("transfer-notification-banner")).toBeNull();
  });

  it("resourceType フィルタ: 一致しない場合は無視される", () => {
    render(
      <TransferNotificationBanner
        clientId={CLIENT_ID}
        resourceType="process-flow"
        resourceId="pf-001"
      />,
    );

    act(() => {
      fireBroadcast("lock.changed", {
        resourceType: "table", // 一致しない
        resourceId: "pf-001",
        op: "transferred",
        ownerSessionId: "bob-session",
        by: "bob-session",
        previousOwner: CLIENT_ID,
      });
    });

    expect(screen.queryByTestId("transfer-notification-banner")).toBeNull();
  });

  it("resourceId フィルタ: 一致しない場合は無視される", () => {
    render(
      <TransferNotificationBanner
        clientId={CLIENT_ID}
        resourceType="process-flow"
        resourceId="pf-001"
      />,
    );

    act(() => {
      fireBroadcast("lock.changed", {
        resourceType: "process-flow",
        resourceId: "pf-OTHER", // 一致しない
        op: "transferred",
        ownerSessionId: "bob-session",
        by: "bob-session",
        previousOwner: CLIENT_ID,
      });
    });

    expect(screen.queryByTestId("transfer-notification-banner")).toBeNull();
  });
});
