/**
 * workspaceState.ts (#671 + #700)
 *
 * 現在 active なワークスペース (= project.json を含むフォルダ) の絶対パスを保持する。
 *
 * - #671 (v1): global singleton state でサーバ全体の 1 active workspace を管理
 * - #700 (v2 R-2): per-session active state に移行。`WorkspaceContextManager` を導入し、
 *   `Map<clientId, ConnectionContext>` で session ごとの active workspace を管理する。
 *
 * ### lockdown モード
 * 環境変数 DESIGNER_DATA_DIR が指定されている場合、起動時に lockdown が有効化され、
 * 全 session の active は env 値に固定される。
 * `setActivePath()` / `clearActive()` は全 session で LockdownError を throw する。
 * `recent-workspaces.json` も読み書きしない (recentStore 側で別途判定)。
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

// ── グローバル lockdown state (#700 設計: lockdown は global、per-session ではない) ──

let _lockdown = false;
let _lockdownPath: string | null = null;
let _initialized = false;

/**
 * env DESIGNER_DATA_DIR を読み、lockdown 状態を確定する。
 * idempotent — 複数回呼んでも初回判定が固定される。
 */
export function initWorkspaceState(): void {
  if (_initialized) return;
  _initialized = true;
  const envPath = process.env.DESIGNER_DATA_DIR;
  if (envPath && envPath.trim().length > 0) {
    _lockdown = true;
    _lockdownPath = path.resolve(envPath);
  }
}

export function isLockdown(): boolean {
  return _lockdown;
}

export function getLockdownPath(): string | null {
  return _lockdownPath;
}

// ── ConnectionContext / WorkspaceContextManager (#700 R-2) ──────────────────

export type ConnectionContext = {
  clientId: string;
  /** active workspace の絶対パス。未選択なら null */
  activePath: string | null;
  /** lockdown フラグ (global flag のコピー) */
  lockdown: boolean;
};

/**
 * per-session active workspace state を管理するクラス (#700 R-2 D-3)。
 *
 * WS 接続 / MCP session それぞれを clientId として登録し、connection 毎の
 * active workspace を独立して持つ。lockdown 時は全 context が env パスに固定される。
 */
export class WorkspaceContextManager {
  private _contexts = new Map<string, ConnectionContext>();

  /**
   * clientId を登録して context を作成する (WS 接続時 / MCP session 開始時)。
   * lockdown 時は activePath が lockdownPath で固定。
   * 既に登録済みの clientId は上書きしない (reconnect 時に既存 active を維持)。
   */
  connect(clientId: string, initialPath?: string | null): ConnectionContext {
    if (this._contexts.has(clientId)) {
      return this._contexts.get(clientId)!;
    }
    const activePath = _lockdown
      ? (_lockdownPath ?? null)
      : (initialPath ?? null);
    const ctx: ConnectionContext = {
      clientId,
      activePath,
      lockdown: _lockdown,
    };
    this._contexts.set(clientId, ctx);
    return ctx;
  }

  /**
   * clientId の context を削除する (WS 切断時 / MCP session 終了時)。
   * 存在しない clientId は無視する。
   */
  disconnect(clientId: string): void {
    this._contexts.delete(clientId);
  }

  /**
   * clientId の active workspace パスを取得する。
   * - lockdown 時: lockdownPath を返す
   * - 未登録の clientId: null を返す (context を自動生成しない)
   */
  getActivePath(clientId: string): string | null {
    const ctx = this._contexts.get(clientId);
    if (!ctx) return null;
    return ctx.activePath;
  }

  /**
   * read/write が前提となるリソース系関数で使う。
   * 未選択時は WorkspaceUnsetError を throw。
   * 未登録 clientId も WorkspaceUnsetError を throw する (接続なしで write は禁止)。
   */
  requireActivePath(clientId: string): string {
    const ctx = this._contexts.get(clientId);
    if (!ctx || !ctx.activePath) throw new WorkspaceUnsetError();
    return ctx.activePath;
  }

  /**
   * clientId の active workspace を設定する。
   * lockdown 時は LockdownError を throw。
   * 未登録の clientId の場合は自動的に context を作成する。
   */
  setActivePath(clientId: string, absPath: string): void {
    if (_lockdown) {
      throw new LockdownError(
        "DESIGNER_DATA_DIR で固定モード中のため、ワークスペースを切り替えできません",
      );
    }
    let ctx = this._contexts.get(clientId);
    if (!ctx) {
      ctx = { clientId, activePath: null, lockdown: false };
      this._contexts.set(clientId, ctx);
    }
    ctx.activePath = path.resolve(absPath);
  }

  /**
   * clientId の active workspace を null にする。
   * lockdown 時は LockdownError を throw。
   */
  clearActive(clientId: string): void {
    if (_lockdown) {
      throw new LockdownError(
        "DESIGNER_DATA_DIR で固定モード中のため、ワークスペースを閉じる操作はできません",
      );
    }
    const ctx = this._contexts.get(clientId);
    if (ctx) {
      ctx.activePath = null;
    }
  }

  /** 登録済み clientId の一覧を返す */
  listClientIds(): string[] {
    return Array.from(this._contexts.keys());
  }

  /** 指定パスを active として持つ clientId の一覧を返す */
  getClientIdsByPath(absPath: string): string[] {
    const resolved = path.resolve(absPath);
    const result: string[] = [];
    for (const [id, ctx] of this._contexts) {
      if (ctx.activePath === resolved) result.push(id);
    }
    return result;
  }

  /** 全 context を取得する (broadcast wsId scoping 用) */
  getAllContexts(): ConnectionContext[] {
    return Array.from(this._contexts.values());
  }

  /** test-only: 全 context クリア */
  _resetForTest(): void {
    this._contexts.clear();
  }
}

/** モジュールレベルのシングルトン WorkspaceContextManager */
export const workspaceContextManager = new WorkspaceContextManager();

// ── 後方互換 global API (v1 → v2 移行期。WS/MCP の clientId が解決されるまでの fallback) ──
//
// LEGACY_CLIENT_ID を使う経路は R-2 完了後も残す。理由:
// - MCP tool (index.ts) は stateless HTTP transport のため session ID が未解決
// - v1 テスト (workspaceState.test.ts) は global API を使っている
// - R-4/R-5 で clientId が全経路に整備されたら LEGACY 経路を廃止する
//
// IMPORTANT: LEGACY 経路は新規実装では使わない。既存呼び出し点の互換維持専用。

export const LEGACY_CLIENT_ID = "__legacy_global__";

// LEGACY_CLIENT_ID の context は initWorkspaceState() 後に作成する
// (workspaceContextManager.connect() が _initialized 後に初めて意味を持つため、
// 実際の connect は initWorkspaceState() を wrap する形で行う)
let _legacyContextCreated = false;

function ensureLegacyContext(): void {
  if (_legacyContextCreated) return;
  _legacyContextCreated = true;
  workspaceContextManager.connect(LEGACY_CLIENT_ID, _lockdown ? _lockdownPath : null);
}

/** @deprecated R-4 以降は clientId 引数付き API を使う */
export function getActivePath(): string | null {
  ensureLegacyContext();
  return workspaceContextManager.getActivePath(LEGACY_CLIENT_ID);
}

/** @deprecated R-4 以降は clientId 引数付き API を使う */
export function requireActivePath(): string {
  ensureLegacyContext();
  return workspaceContextManager.requireActivePath(LEGACY_CLIENT_ID);
}

/** @deprecated R-4 以降は clientId 引数付き API を使う */
export function setActivePath(absPath: string): void {
  ensureLegacyContext();
  workspaceContextManager.setActivePath(LEGACY_CLIENT_ID, absPath);
}

/** @deprecated R-4 以降は clientId 引数付き API を使う */
export function clearActive(): void {
  ensureLegacyContext();
  workspaceContextManager.clearActive(LEGACY_CLIENT_ID);
}

/** test-only: 状態リセット */
export function _resetForTest(): void {
  _lockdown = false;
  _lockdownPath = null;
  _initialized = false;
  _legacyContextCreated = false;
  workspaceContextManager._resetForTest();
}
