/**
 * workspaceState.ts (#671)
 *
 * 現在 active なワークスペース (= project.json を含むフォルダ) の絶対パスを
 * モジュールローカル state として保持する single source of truth。
 *
 * - 通常モード: `setActivePath()` / `clearActive()` で実行時に切替可能。
 * - lockdown モード: 環境変数 DESIGNER_DATA_DIR が指定されている場合、
 *   起動時に lockdown が有効化され、active は env 値に固定される。
 *   `setActivePath()` / `clearActive()` は LockdownError を throw する。
 *   `recent-workspaces.json` も読み書きしない (recentStore 側で別途判定)。
 */
import path from "path";

export class LockdownError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LockdownError";
  }
}

export class WorkspaceUnsetError extends Error {
  constructor() {
    super("ワークスペースが選択されていません");
    this.name = "WorkspaceUnsetError";
  }
}

let _activePath: string | null = null;
let _lockdown = false;
let _lockdownPath: string | null = null;
let _initialized = false;

/**
 * env DESIGNER_DATA_DIR を読み、lockdown 状態を確定する。
 * 通常モード時は active 未選択のまま起動する (recentStore 側で前回 active の自動オープンを試みる)。
 * idempotent — 複数回呼んでも初回判定が固定される。
 */
export function initWorkspaceState(): void {
  if (_initialized) return;
  _initialized = true;
  const envPath = process.env.DESIGNER_DATA_DIR;
  if (envPath && envPath.trim().length > 0) {
    const abs = path.resolve(envPath);
    _lockdown = true;
    _lockdownPath = abs;
    _activePath = abs;
  }
}

export function isLockdown(): boolean {
  return _lockdown;
}

export function getLockdownPath(): string | null {
  return _lockdownPath;
}

/** 現在 active な workspace の絶対パス。未選択なら null */
export function getActivePath(): string | null {
  return _activePath;
}

/**
 * read/write が前提となるリソース系関数で使う。
 * 未選択時は WorkspaceUnsetError を throw して UI 側で「未選択」状態を明示できるようにする。
 */
export function requireActivePath(): string {
  if (!_activePath) throw new WorkspaceUnsetError();
  return _activePath;
}

export function setActivePath(absPath: string): void {
  if (_lockdown) {
    throw new LockdownError(
      "DESIGNER_DATA_DIR で固定モード中のため、ワークスペースを切り替えできません",
    );
  }
  _activePath = path.resolve(absPath);
}

export function clearActive(): void {
  if (_lockdown) {
    throw new LockdownError(
      "DESIGNER_DATA_DIR で固定モード中のため、ワークスペースを閉じる操作はできません",
    );
  }
  _activePath = null;
}

/** test-only: 状態リセット */
export function _resetForTest(): void {
  _activePath = null;
  _lockdown = false;
  _lockdownPath = null;
  _initialized = false;
}
