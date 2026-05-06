/**
 * EditSessionDropdown.test.tsx (#882 Phase 4)
 * RTL で展開 / アクション dispatch / role アイコン表示を検証する。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EditSessionDropdown } from "./EditSessionDropdown";
import type { PresenceEntry } from "../../hooks/usePresenceRegistry";

// ── モック ─────────────────────────────────────────────────────────────────

// usePresenceFor が返す entries をテストごとに制御
let mockEntries: PresenceEntry[] = [];

vi.mock("../../hooks/usePresenceRegistry", () => ({
  usePresenceFor: () => mockEntries,
}));

// mcpBridge.request をモック
const mockRequest = vi.fn().mockResolvedValue({});
vi.mock("../../mcp/mcpBridge", () => ({
  mcpBridge: {
    request: (...args: unknown[]) => mockRequest(...args),
  },
}));

// CSS import は Vitest 環境で副作用なし
vi.mock("../../styles/editSessionDropdown.css", () => ({}));

// ── テスト ─────────────────────────────────────────────────────────────────

const defaultProps = {
  resourceType: "process-flow" as const,
  resourceId: "flow-001",
  currentMode: { kind: "readonly" } as const,
  currentSessionId: "session-self",
};

function makeEntry(overrides: Partial<PresenceEntry> = {}): PresenceEntry {
  return {
    sessionId: "session-alice",
    resourceType: "process-flow",
    resourceId: "flow-001",
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
  mockEntries = [];
});

describe("EditSessionDropdown", () => {
  it("closed 状態では 📄 正規版 バッジが表示される", () => {
    render(<EditSessionDropdown {...defaultProps} />);
    expect(screen.getByTestId("esd-toggle-btn")).toBeTruthy();
    expect(screen.getByText("正規版")).toBeTruthy();
  });

  it("editing mode では ✏️ 編集中 バッジが表示される", () => {
    render(
      <EditSessionDropdown
        {...defaultProps}
        currentMode={{ kind: "editing" }}
      />,
    );
    expect(screen.getByText("編集中")).toBeTruthy();
  });

  it("viewer mode では 👁 観察中 バッジが表示される", () => {
    render(
      <EditSessionDropdown
        {...defaultProps}
        currentMode={{ kind: "viewer" }}
      />,
    );
    expect(screen.getByText("観察中")).toBeTruthy();
  });

  it("トグルボタンをクリックするとドロップダウンが展開される", () => {
    render(<EditSessionDropdown {...defaultProps} />);
    const toggle = screen.getByTestId("esd-toggle-btn");
    fireEvent.click(toggle);
    expect(screen.getByTestId("esd-dropdown")).toBeTruthy();
  });

  it("展開後、ドロップダウン外をクリックすると閉じる", () => {
    render(
      <div>
        <EditSessionDropdown {...defaultProps} />
        <div data-testid="outside">outside</div>
      </div>,
    );
    fireEvent.click(screen.getByTestId("esd-toggle-btn"));
    expect(screen.getByTestId("esd-dropdown")).toBeTruthy();
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(screen.queryByTestId("esd-dropdown")).toBeNull();
  });

  it("+ 新規 draft を作成 ボタンが表示され、クリックで onStartEditing が呼ばれる", () => {
    const onStartEditing = vi.fn();
    render(<EditSessionDropdown {...defaultProps} onStartEditing={onStartEditing} />);
    fireEvent.click(screen.getByTestId("esd-toggle-btn"));
    fireEvent.click(screen.getByTestId("esd-new-draft-btn"));
    expect(onStartEditing).toHaveBeenCalledTimes(1);
  });

  it("editor role の他人エントリに 👁 観察 ボタンが表示される", () => {
    const editorEntry = makeEntry({ sessionId: "session-alice", role: "editor" });
    mockEntries = [editorEntry];
    render(<EditSessionDropdown {...defaultProps} />);
    fireEvent.click(screen.getByTestId("esd-toggle-btn"));
    expect(screen.getByTestId(`esd-viewer-btn-session-alice`)).toBeTruthy();
  });

  it("[👁 観察] クリックで lock.subscribeAsViewer が呼ばれる", async () => {
    const editorEntry = makeEntry({ sessionId: "session-alice", role: "editor" });
    mockEntries = [editorEntry];
    const onViewerAttached = vi.fn();
    render(
      <EditSessionDropdown
        {...defaultProps}
        onViewerAttached={onViewerAttached}
      />,
    );
    fireEvent.click(screen.getByTestId("esd-toggle-btn"));
    fireEvent.click(screen.getByTestId(`esd-viewer-btn-session-alice`));
    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith("lock.subscribeAsViewer", {
        resourceType: "process-flow",
        resourceId: "flow-001",
      });
    });
    expect(onViewerAttached).toHaveBeenCalledWith("session-alice");
  });

  it("[↪ 引継] ボタンは active になっている (#884 Phase 6 で活性化済)", () => {
    const editorEntry = makeEntry({ sessionId: "session-alice", role: "editor" });
    mockEntries = [editorEntry];
    render(<EditSessionDropdown {...defaultProps} />);
    fireEvent.click(screen.getByTestId("esd-toggle-btn"));
    const takeoverBtn = screen.getByTestId(`esd-takeover-btn-session-alice`);
    expect((takeoverBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it("自分のエントリには [▶ 再開] ボタンが表示される", () => {
    const selfEntry = makeEntry({
      sessionId: "session-self",
      role: "editor",
    });
    mockEntries = [selfEntry];
    render(<EditSessionDropdown {...defaultProps} />);
    fireEvent.click(screen.getByTestId("esd-toggle-btn"));
    expect(screen.getByTestId(`esd-resume-btn-session-self`)).toBeTruthy();
  });

  it("[▶ 再開] クリックで onStartEditing が呼ばれる", () => {
    const selfEntry = makeEntry({
      sessionId: "session-self",
      role: "editor",
    });
    mockEntries = [selfEntry];
    const onStartEditing = vi.fn();
    render(
      <EditSessionDropdown
        {...defaultProps}
        onStartEditing={onStartEditing}
      />,
    );
    fireEvent.click(screen.getByTestId("esd-toggle-btn"));
    fireEvent.click(screen.getByTestId(`esd-resume-btn-session-self`));
    expect(onStartEditing).toHaveBeenCalledTimes(1);
  });

  it("AI 借受エントリには 🤖 アイコンが表示される", () => {
    const aiEntry = makeEntry({
      sessionId: "session-ai",
      role: "editor",
      ownerLabel: "@ai (alice 代行)",
    });
    mockEntries = [aiEntry];
    render(<EditSessionDropdown {...defaultProps} />);
    fireEvent.click(screen.getByTestId("esd-toggle-btn"));
    expect(screen.getByTitle("AI 借受")).toBeTruthy();
    expect(screen.getByText("@ai (alice 代行)")).toBeTruthy();
  });

  it("viewer role エントリには 👁 アイコンが表示される", () => {
    const viewerEntry = makeEntry({
      sessionId: "session-bob",
      role: "viewer",
    });
    mockEntries = [viewerEntry];
    render(<EditSessionDropdown {...defaultProps} />);
    fireEvent.click(screen.getByTestId("esd-toggle-btn"));
    expect(screen.getByTitle("観察中")).toBeTruthy();
  });
});
