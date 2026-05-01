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
let _state: WorkspaceState = {
  workspaces: [],
  active: null,
  lockdown: false,
  lockdownPath: null,
  loading: true,
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
