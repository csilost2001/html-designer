import { mcpBridge } from "../mcp/mcpBridge";

// ─── 型定義 ─────────────────────────────────────────────────────────────────

export interface WorkspaceEntry {
  id: string;
  path: string;
  name: string;
  lastOpenedAt: string | null;
}

export interface WorkspaceActive {
  id?: string;
  path: string;
  name: string | null;
}

export interface WorkspaceState {
  workspaces: WorkspaceEntry[];
  active: WorkspaceActive | null;
  lockdown: boolean;
  lockdownPath: string | null;
  loading: boolean;
  error: string | null;
}

export interface WorkspaceInspectResult {
  status: "ready" | "needsInit" | "notFound";
  path: string;
  name?: string;
}

// ─── 内部ストア ───────────────────────────────────────────────────────────────

type Listener = () => void;

// loading は初期 true: WS 未接続のうちはガードを発動させない。
// 最初の loadWorkspaces() (成功 or 失敗) で false になる。WS が永続的に未接続でも
// loading=true のままなので /workspace/select への誤強制遷移を起こさない。
//
// テスト環境向け: "workspace-e2e-bypass" フラグが立っている場合 loading=false で起動。
// これにより MCP 未接続の既存 e2e テストが workspace guard をバイパスして
// dashboard, screen-design 等に直接アクセスできる (#703 R-5)。
//
// 設定方法 (playwright addInitScript 内):
//   localStorage.setItem("workspace-e2e-bypass", "true");
const _initialLoading = typeof localStorage !== "undefined"
  ? localStorage.getItem("workspace-e2e-bypass") !== "true"
  : true;

let _state: WorkspaceState = {
  workspaces: [],
  active: null,
  lockdown: false,
  lockdownPath: null,
  loading: _initialLoading,
  error: null,
};

const _listeners = new Set<Listener>();
let _broadcastUnsubscribe: (() => void) | null = null;

function _setState(partial: Partial<WorkspaceState>): void {
  _state = { ..._state, ...partial };
  _listeners.forEach((fn) => fn());
}

// ─── 公開 API ─────────────────────────────────────────────────────────────────

export function getState(): WorkspaceState {
  return _state;
}

export function subscribe(listener: Listener): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

// 並行呼び出しを直列化するための Promise チェーン (A: loadWorkspaces 直列化)
let _loadChain: Promise<void> = Promise.resolve();

/** @internal テスト専用: _loadChain を初期状態にリセットする */
export function __resetLoadChainForTest(): void {
  _loadChain = Promise.resolve();
}

/** @internal テスト専用: _state を初期状態にリセットする (#703 R-5) */
export function __resetStateForTest(): void {
  _state = {
    workspaces: [],
    active: null,
    lockdown: false,
    lockdownPath: null,
    loading: true,
    error: null,
  };
  _broadcastUnsubscribe = null;
  _listeners.clear();
}

export async function loadWorkspaces(): Promise<void> {
  _loadChain = _loadChain
    .catch(() => undefined) // 前回失敗でチェーンを切らない
    .then(() => _doLoadWorkspaces());
  return _loadChain;
}

async function _doLoadWorkspaces(): Promise<void> {
  _setState({ loading: true, error: null });
  try {
    const result = (await mcpBridge.request("workspace.list")) as {
      workspaces: WorkspaceEntry[];
      lastActiveId: string | null;
      active: { path: string; name: string | null } | null;
      lockdown: boolean;
      lockdownPath: string | null;
    };
    _setState({
      workspaces: result.workspaces ?? [],
      active: result.active
        ? {
            id: result.workspaces?.find((w) => w.path === result.active!.path)?.id,
            path: result.active.path,
            name: result.active.name,
          }
        : null,
      lockdown: result.lockdown ?? false,
      lockdownPath: result.lockdownPath ?? null,
      loading: false,
      error: null,
    });
  } catch (e) {
    _setState({
      loading: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

export async function inspectWorkspace(path: string): Promise<WorkspaceInspectResult> {
  const result = (await mcpBridge.request("workspace.inspect", { path })) as WorkspaceInspectResult;
  return result;
}

export async function openWorkspace(pathOrId: string, useId = false): Promise<void> {
  _setState({ loading: true, error: null });
  try {
    const params = useId ? { id: pathOrId } : { path: pathOrId };
    await mcpBridge.request("workspace.open", params);
    await loadWorkspaces();
  } catch (e) {
    _setState({
      loading: false,
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

export async function initAndOpen(path: string): Promise<void> {
  _setState({ loading: true, error: null });
  try {
    await mcpBridge.request("workspace.open", { path, init: true });
    await loadWorkspaces();
  } catch (e) {
    _setState({
      loading: false,
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

export async function closeWorkspace(): Promise<void> {
  _setState({ loading: true, error: null });
  try {
    await mcpBridge.request("workspace.close");
    await loadWorkspaces();
  } catch (e) {
    _setState({
      loading: false,
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

export async function removeWorkspace(id: string): Promise<void> {
  _setState({ loading: true, error: null });
  try {
    await mcpBridge.request("workspace.remove", { id });
    await loadWorkspaces();
  } catch (e) {
    _setState({
      loading: false,
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

/** workspace.changed ブロードキャストをサブスクライブし、状態を自動更新する */
export function subscribeWorkspaceChanges(): () => void {
  if (_broadcastUnsubscribe) {
    _broadcastUnsubscribe();
    _broadcastUnsubscribe = null;
  }

  const unsub = mcpBridge.onBroadcast("workspace.changed", (data) => {
    const ev = data as {
      activeId: string | null;
      path: string | null;
      name: string | null;
      lockdown: boolean;
    };

    // Defense-in-depth: per-session フィルタ (#703 R-5 B)
    // backend は wsId scoping で既にフィルタしているが、WS マルチプレックス環境の念のため:
    // - 自分の active が null の場合 → hydration broadcast として受信 (初回 active 設定)
    // - 自分の active が非 null かつ ev.path が一致しない場合 → 別 workspace のブロードキャストを無視
    const currentActive = _state.active;
    if (currentActive !== null && ev.path !== null && currentActive.path !== ev.path) {
      // 別 workspace の workspace.changed broadcast → ignore
      return;
    }

    // B: payload だけで state を完成させる。loadWorkspaces() は呼ばない。
    // recent list の更新は次の明示的 loadWorkspaces() (ListView mount 等) まで遅延 — 許容範囲。
    if (ev.activeId === null || ev.path === null) {
      _setState({ active: null, lockdown: ev.lockdown ?? false });
    } else {
      _setState({
        active: { id: ev.activeId, path: ev.path, name: ev.name },
        lockdown: ev.lockdown ?? false,
      });
    }
  });

  _broadcastUnsubscribe = unsub;
  return unsub;
}
