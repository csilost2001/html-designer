/**
 * workspaceState 単体テスト (#671)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import {
  initWorkspaceState,
  isLockdown,
  getLockdownPath,
  getActivePath,
  setActivePath,
  clearActive,
  requireActivePath,
  LockdownError,
  WorkspaceUnsetError,
  _resetForTest,
} from "./workspaceState.js";

const ORIGINAL_ENV = process.env.DESIGNER_DATA_DIR;

beforeEach(() => {
  _resetForTest();
  delete process.env.DESIGNER_DATA_DIR;
});

afterEach(() => {
  if (ORIGINAL_ENV !== undefined) {
    process.env.DESIGNER_DATA_DIR = ORIGINAL_ENV;
  } else {
    delete process.env.DESIGNER_DATA_DIR;
  }
});

describe("workspaceState (通常モード)", () => {
  it("init 後 active は null、lockdown も false", () => {
    initWorkspaceState();
    expect(getActivePath()).toBeNull();
    expect(isLockdown()).toBe(false);
    expect(getLockdownPath()).toBeNull();
  });

  it("setActivePath で active が更新される (絶対パスに正規化)", () => {
    initWorkspaceState();
    setActivePath("/some/path");
    expect(getActivePath()).toBe(path.resolve("/some/path"));
  });

  it("clearActive で active が null に戻る", () => {
    initWorkspaceState();
    setActivePath("/some/path");
    clearActive();
    expect(getActivePath()).toBeNull();
  });

  it("requireActivePath は active 未選択時に WorkspaceUnsetError を throw", () => {
    initWorkspaceState();
    expect(() => requireActivePath()).toThrow(WorkspaceUnsetError);
  });

  it("requireActivePath は active 選択時にパスを返す", () => {
    initWorkspaceState();
    setActivePath("/some/path");
    expect(requireActivePath()).toBe(path.resolve("/some/path"));
  });
});

describe("workspaceState (lockdown モード)", () => {
  it("env DESIGNER_DATA_DIR 指定時は lockdown=true、active が env パス固定", () => {
    process.env.DESIGNER_DATA_DIR = "/env/data";
    initWorkspaceState();
    expect(isLockdown()).toBe(true);
    expect(getLockdownPath()).toBe(path.resolve("/env/data"));
    expect(getActivePath()).toBe(path.resolve("/env/data"));
  });

  it("lockdown 中の setActivePath は LockdownError", () => {
    process.env.DESIGNER_DATA_DIR = "/env/data";
    initWorkspaceState();
    expect(() => setActivePath("/other")).toThrow(LockdownError);
  });

  it("lockdown 中の clearActive は LockdownError", () => {
    process.env.DESIGNER_DATA_DIR = "/env/data";
    initWorkspaceState();
    expect(() => clearActive()).toThrow(LockdownError);
  });

  it("lockdown 中も requireActivePath は env パスを返す", () => {
    process.env.DESIGNER_DATA_DIR = "/env/data";
    initWorkspaceState();
    expect(requireActivePath()).toBe(path.resolve("/env/data"));
  });
});
