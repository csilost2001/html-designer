/**
 * AddWorkspaceDialog テスト (#858)
 *
 * - OS-aware placeholder (host info に応じて切り替え)
 * - debounced auto-inspect (入力後 400ms で inspectWorkspace 自動呼び出し)
 * - recent dropdown (focus / 入力時に表示、クリックで補完)
 * - WSL 検出時に専用ヒント表示
 */
import { fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HostInfo, WorkspaceInspectResult } from "../../store/workspaceStore";

// vi.mock factory は hoist されるので、内部で参照する mock は vi.hoisted で持ち上げる
const mocks = vi.hoisted(() => {
  const recentEntries = [
    { id: "ws-1", path: "/home/user/projects/diary", name: "Diary", lastOpenedAt: null },
    { id: "ws-2", path: "/home/user/projects/retail", name: "Retail", lastOpenedAt: null },
  ];
  const baseState = {
    workspaces: recentEntries,
    active: null,
    lockdown: false,
    lockdownPath: null,
    loading: false,
    error: null,
  };
  return {
    inspectWorkspaceMock: vi.fn(),
    getHostInfoMock: vi.fn(),
    openWorkspaceMock: vi.fn(),
    initAndOpenMock: vi.fn(),
    recentEntries,
    baseState,
  };
});

const { inspectWorkspaceMock, getHostInfoMock, openWorkspaceMock, initAndOpenMock } = mocks;

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("../../mcp/mcpBridge", () => ({
  mcpBridge: {
    onStatusChange: vi.fn(() => () => {}),
  },
}));

vi.mock("../../store/workspaceStore", async () => {
  const actual = await vi.importActual<typeof import("../../store/workspaceStore")>("../../store/workspaceStore");
  return {
    ...actual,
    getState: vi.fn(() => mocks.baseState),
    subscribe: vi.fn(() => () => {}),
    loadWorkspaces: vi.fn(),
    openWorkspace: mocks.openWorkspaceMock,
    inspectWorkspace: mocks.inspectWorkspaceMock,
    initAndOpen: mocks.initAndOpenMock,
    removeWorkspace: vi.fn(),
    getHostInfo: mocks.getHostInfoMock,
  };
});

import { AddWorkspaceDialog } from "./WorkspaceListView";

describe("AddWorkspaceDialog (#858)", () => {
  beforeEach(() => {
    inspectWorkspaceMock.mockReset();
    getHostInfoMock.mockReset();
    openWorkspaceMock.mockReset();
    initAndOpenMock.mockReset();
    vi.useRealTimers();
  });

  function makeHost(overrides: Partial<HostInfo> = {}): HostInfo {
    return {
      platform: "linux",
      isWSL: false,
      homeDir: "/home/user",
      ...overrides,
    };
  }

  it("placeholder に workspaces/ ヒントを含む (#755 e2e regression 防止)", async () => {
    getHostInfoMock.mockResolvedValue(makeHost());
    inspectWorkspaceMock.mockResolvedValue({ status: "notFound", path: "" } satisfies WorkspaceInspectResult);

    render(<AddWorkspaceDialog onClose={() => {}} onAdded={() => {}} />);

    const input = await screen.findByTestId("workspace-path-input");
    const placeholder = input.getAttribute("placeholder") ?? "";
    expect(placeholder).toContain("workspaces/my-app");
  });

  it("WSL 環境では Linux 形式の絶対パスと WSL 専用ヒントを表示する", async () => {
    getHostInfoMock.mockResolvedValue(makeHost({ platform: "linux", isWSL: true, homeDir: "/home/wsluser" }));
    inspectWorkspaceMock.mockResolvedValue({ status: "notFound", path: "" } satisfies WorkspaceInspectResult);

    render(<AddWorkspaceDialog onClose={() => {}} onAdded={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/WSL2 環境を検出しました/)).toBeTruthy();
    });
    const input = screen.getByTestId("workspace-path-input");
    const placeholder = input.getAttribute("placeholder") ?? "";
    expect(placeholder).toContain("/home/wsluser/projects/my-app");
  });

  it("Windows ホストではバックスラッシュ形式の例を出す", async () => {
    getHostInfoMock.mockResolvedValue(makeHost({ platform: "win32", isWSL: false, homeDir: "C:\\Users\\winuser" }));
    inspectWorkspaceMock.mockResolvedValue({ status: "notFound", path: "" } satisfies WorkspaceInspectResult);

    render(<AddWorkspaceDialog onClose={() => {}} onAdded={() => {}} />);

    const input = await screen.findByTestId("workspace-path-input");
    await waitFor(() => {
      const placeholder = input.getAttribute("placeholder") ?? "";
      expect(placeholder).toContain("C:\\Users\\winuser\\projects\\my-app");
    });
  });

  it("入力後 400ms で inspectWorkspace が自動呼び出しされ、status バッジが描画される", async () => {
    getHostInfoMock.mockResolvedValue(makeHost());
    inspectWorkspaceMock.mockResolvedValue({ status: "ready", path: "/home/user/projects/diary", name: "Diary" } satisfies WorkspaceInspectResult);
    vi.useFakeTimers({ shouldAdvanceTime: true });

    render(<AddWorkspaceDialog onClose={() => {}} onAdded={() => {}} />);

    const input = await screen.findByTestId("workspace-path-input");
    fireEvent.change(input, { target: { value: "/home/user/projects/diary" } });

    // debounce 期間中は呼び出されない
    expect(inspectWorkspaceMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    await waitFor(() => {
      expect(inspectWorkspaceMock).toHaveBeenCalledWith("/home/user/projects/diary");
    });

    vi.useRealTimers();
    await waitFor(() => {
      const badge = screen.getByTestId("workspace-status");
      expect(badge.getAttribute("data-status")).toBe("ready");
    });
  });

  it("入力欄フォーカスで recent dropdown が出る", async () => {
    getHostInfoMock.mockResolvedValue(makeHost());
    inspectWorkspaceMock.mockResolvedValue({ status: "notFound", path: "" } satisfies WorkspaceInspectResult);

    render(<AddWorkspaceDialog onClose={() => {}} onAdded={() => {}} />);

    const input = await screen.findByTestId("workspace-path-input");
    fireEvent.focus(input);

    expect(screen.getByRole("listbox", { name: "最近使ったワークスペース" })).toBeTruthy();
    expect(screen.getByText("Diary")).toBeTruthy();
    expect(screen.getByText("Retail")).toBeTruthy();
  });

  it("recent dropdown のエントリをクリックすると入力欄に絶対パスが入る", async () => {
    getHostInfoMock.mockResolvedValue(makeHost());
    inspectWorkspaceMock.mockResolvedValue({ status: "ready", path: "/home/user/projects/diary", name: "Diary" } satisfies WorkspaceInspectResult);

    render(<AddWorkspaceDialog onClose={() => {}} onAdded={() => {}} />);

    const input = (await screen.findByTestId("workspace-path-input")) as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.click(screen.getByText("Diary"));

    expect(input.value).toBe("/home/user/projects/diary");
  });

  it("入力中の文字列で recent エントリを prefix-match で絞り込む", async () => {
    getHostInfoMock.mockResolvedValue(makeHost());
    inspectWorkspaceMock.mockResolvedValue({ status: "notFound", path: "" } satisfies WorkspaceInspectResult);

    render(<AddWorkspaceDialog onClose={() => {}} onAdded={() => {}} />);

    const input = await screen.findByTestId("workspace-path-input");
    fireEvent.change(input, { target: { value: "diary" } });

    // dropdown は表示状態のまま (focus + 入力)
    expect(screen.getByText("Diary")).toBeTruthy();
    // Retail はマッチしないので非表示
    expect(screen.queryByText("Retail")).toBeNull();
  });
});
