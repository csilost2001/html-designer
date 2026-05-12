/**
 * BackendFolderPicker 単体テスト (#1056)
 *
 * mcpBridge を mock し、navigate / parent / select / error の各経路を確認。
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowseFsResult } from "../../store/workspaceStore";

const browseFsMock = vi.fn<(path?: string) => Promise<BrowseFsResult>>();

vi.mock("../../store/workspaceStore", () => ({
  browseFs: (path?: string) => browseFsMock(path),
}));

const { BackendFolderPicker, _internals } = await import("./BackendFolderPicker");

beforeEach(() => {
  browseFsMock.mockReset();
});

describe("BackendFolderPicker", () => {
  it("初期表示で browseFs を呼び、結果を一覧表示する", async () => {
    browseFsMock.mockResolvedValueOnce({
      path: "/home/node/projects",
      parent: "/home/node",
      entries: [
        { name: "ws-a", isDir: true, isWorkspace: true, mtime: "2026-05-12T10:00:00Z" },
        { name: "ws-b", isDir: true, isWorkspace: false, mtime: "2026-05-12T11:00:00Z" },
        { name: "readme.md", isDir: false, isWorkspace: false, mtime: "2026-05-12T12:00:00Z" },
      ],
    });

    render(<BackendFolderPicker onSelect={vi.fn()} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId("folder-picker-current-path")).toHaveTextContent("/home/node/projects");
    });
    const entries = screen.getAllByTestId("folder-picker-entry");
    expect(entries.length).toBe(3);
    expect(entries[0]).toHaveAttribute("data-name", "ws-a");
    expect(entries[0]).toHaveAttribute("data-is-workspace", "true");
    expect(entries[2]).toHaveAttribute("data-is-dir", "false");
  });

  it("フォルダクリックで cd (browseFs 再呼出)", async () => {
    browseFsMock.mockResolvedValueOnce({
      path: "/home/node/projects",
      parent: "/home/node",
      entries: [{ name: "ws-a", isDir: true, isWorkspace: true, mtime: null }],
    });
    browseFsMock.mockResolvedValueOnce({
      path: "/home/node/projects/ws-a",
      parent: "/home/node/projects",
      entries: [{ name: "screens", isDir: true, isWorkspace: false, mtime: null }],
    });

    render(<BackendFolderPicker onSelect={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByTestId("folder-picker-entry").length).toBe(1));

    fireEvent.click(screen.getAllByTestId("folder-picker-entry")[0]);

    await waitFor(() => {
      expect(screen.getByTestId("folder-picker-current-path")).toHaveTextContent(
        "/home/node/projects/ws-a",
      );
    });
    expect(browseFsMock).toHaveBeenNthCalledWith(2, "/home/node/projects/ws-a");
  });

  it("ファイルクリックでは何も起きない (isDir=false)", async () => {
    browseFsMock.mockResolvedValueOnce({
      path: "/home/node",
      parent: null,
      entries: [{ name: "readme.md", isDir: false, isWorkspace: false, mtime: null }],
    });

    render(<BackendFolderPicker onSelect={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByTestId("folder-picker-entry").length).toBe(1));

    fireEvent.click(screen.getAllByTestId("folder-picker-entry")[0]);

    expect(browseFsMock).toHaveBeenCalledTimes(1); // 初期 1 回のみ、cd は起きていない
  });

  it("「上の階層」ボタンで parent に移動。root では disabled", async () => {
    browseFsMock.mockResolvedValueOnce({
      path: "/home/node",
      parent: null, // root 扱い
      entries: [],
    });

    render(<BackendFolderPicker onSelect={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("folder-picker-up")).toBeDisabled());
  });

  it("parent 有りなら「上の階層」が押せる", async () => {
    browseFsMock.mockResolvedValueOnce({
      path: "/home/node/projects",
      parent: "/home/node",
      entries: [],
    });
    browseFsMock.mockResolvedValueOnce({
      path: "/home/node",
      parent: "/home",
      entries: [],
    });

    render(<BackendFolderPicker onSelect={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("folder-picker-up")).not.toBeDisabled());

    fireEvent.click(screen.getByTestId("folder-picker-up"));

    await waitFor(() => {
      expect(screen.getByTestId("folder-picker-current-path")).toHaveTextContent("/home/node");
    });
    expect(browseFsMock).toHaveBeenNthCalledWith(2, "/home/node");
  });

  it("「このフォルダを選択」で現在 path を onSelect に渡し close 要求", () => {
    const onSelect = vi.fn();
    browseFsMock.mockResolvedValueOnce({
      path: "/home/node/projects",
      parent: "/home/node",
      entries: [],
    });

    render(<BackendFolderPicker onSelect={onSelect} onClose={vi.fn()} />);
    return waitFor(() => {
      const selectBtn = screen.getByTestId("folder-picker-select");
      expect(selectBtn).not.toBeDisabled();
      fireEvent.click(selectBtn);
      expect(onSelect).toHaveBeenCalledWith("/home/node/projects");
    });
  });

  it("browseFs が throw した場合は error を表示し、UI が固まらない", async () => {
    browseFsMock.mockRejectedValueOnce(new Error("フォルダが見つかりません: /nope"));

    render(<BackendFolderPicker initialPath="/nope" onSelect={vi.fn()} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId("folder-picker-error")).toHaveTextContent(
        "フォルダが見つかりません: /nope",
      );
    });
  });

  it("外側 overlay クリックで onClose", async () => {
    browseFsMock.mockResolvedValueOnce({
      path: "/home/node",
      parent: null,
      entries: [],
    });
    const onClose = vi.fn();
    render(<BackendFolderPicker onSelect={vi.fn()} onClose={onClose} />);
    await waitFor(() => expect(browseFsMock).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId("backend-folder-picker-overlay"));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("joinPath (internal)", () => {
  it("posix path: / 連結", () => {
    expect(_internals.joinPath("/home/node/projects", "ws-a")).toBe("/home/node/projects/ws-a");
  });

  it("posix root: / + name", () => {
    expect(_internals.joinPath("/", "tmp")).toBe("/tmp");
  });

  it("末尾 / は重複しない", () => {
    expect(_internals.joinPath("/home/node/", "ws-a")).toBe("/home/node/ws-a");
  });

  it("windows path: \\ 連結 (path に \\ のみ含む場合)", () => {
    expect(_internals.joinPath("C:\\Users\\node", "ws-a")).toBe("C:\\Users\\node\\ws-a");
  });

  it("windows drive root: C:\\ → C:\\name", () => {
    expect(_internals.joinPath("C:\\", "Users")).toBe("C:\\Users");
  });
});
