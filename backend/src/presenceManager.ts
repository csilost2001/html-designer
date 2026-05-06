/**
 * presenceManager.ts (#878 Phase 1)
 *
 * CRDT 非依存の presence/awareness 独立 channel 実装。
 * Forward-Compat 原則 ③ (presence 独立 channel) に準拠。
 * docs/spec/collab-presence.md § 4 / § 6 / § 9 を参照。
 */
import type { DraftResourceType } from "./draftStore.js";

export type PresenceRole = "editor" | "viewer";

export interface PresenceEntry {
  sessionId: string;
  resourceType: DraftResourceType;
  resourceId: string;
  role: PresenceRole;
  /** ISO 8601 — 最後のアクティビティ (kind="activity" or "edit" の heartbeat) */
  lastActivityAt: string;
  /** ISO 8601 | null — 最後の編集 (kind="edit" heartbeat)。editor のみ更新 */
  lastEditAt: string | null;
  /** ISO 8601 | null — visibility 連動。null = 切断中扱い */
  focusAt: string | null;
  /** AI 借受時の表示名。例: "@ai (alice 代行)"。通常は null */
  ownerLabel: string | null;
}

/** presenceManager 内部の複合キー: wsId 独立でリソースをスコープする */
type ResourceKey = `${DraftResourceType}:${string}`;

function makeResourceKey(resourceType: DraftResourceType, resourceId: string): ResourceKey {
  return `${resourceType}:${resourceId}` as ResourceKey;
}

/**
 * in-memory store: Map<wsId, Map<sessionId+resourceKey, PresenceEntry>>
 *
 * セッションが同一リソースに対して保持できるエントリは 1 件のみ。
 * 複合キー = `${sessionId}::${resourceKey}` で管理する。
 */
type EntryKey = string; // `${sessionId}::${resourceType}:${resourceId}`

function makeEntryKey(sessionId: string, resourceType: DraftResourceType, resourceId: string): EntryKey {
  return `${sessionId}::${resourceType}:${resourceId}`;
}

const store = new Map<string, Map<EntryKey, PresenceEntry>>();

function getWsMap(wsId: string): Map<EntryKey, PresenceEntry> {
  let m = store.get(wsId);
  if (!m) {
    m = new Map();
    store.set(wsId, m);
  }
  return m;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * editor として presence を登録 (lock holder)。
 * 同一 sessionId + resourceKey が既に存在する場合は role を editor に更新して返す。
 */
export function registerEditor(
  wsId: string,
  sessionId: string,
  resourceType: DraftResourceType,
  resourceId: string,
  ownerLabel?: string,
): PresenceEntry {
  const wsMap = getWsMap(wsId);
  const entryKey = makeEntryKey(sessionId, resourceType, resourceId);
  const now = new Date().toISOString();
  const existing = wsMap.get(entryKey);
  if (existing) {
    // 既存エントリを editor に更新
    existing.role = "editor";
    existing.lastActivityAt = now;
    existing.focusAt = now;
    if (ownerLabel !== undefined) existing.ownerLabel = ownerLabel ?? null;
    return existing;
  }
  const entry: PresenceEntry = {
    sessionId,
    resourceType,
    resourceId,
    role: "editor",
    lastActivityAt: now,
    lastEditAt: null,
    focusAt: now,
    ownerLabel: ownerLabel ?? null,
  };
  wsMap.set(entryKey, entry);
  return entry;
}

/**
 * viewer として presence を登録 (read-only follower)。
 * 同一 sessionId + resourceKey が既に存在する場合は role を viewer に更新して返す。
 */
export function registerViewer(
  wsId: string,
  sessionId: string,
  resourceType: DraftResourceType,
  resourceId: string,
): PresenceEntry {
  const wsMap = getWsMap(wsId);
  const entryKey = makeEntryKey(sessionId, resourceType, resourceId);
  const now = new Date().toISOString();
  const existing = wsMap.get(entryKey);
  if (existing) {
    existing.role = "viewer";
    existing.lastActivityAt = now;
    existing.focusAt = now;
    return existing;
  }
  const entry: PresenceEntry = {
    sessionId,
    resourceType,
    resourceId,
    role: "viewer",
    lastActivityAt: now,
    lastEditAt: null,
    focusAt: now,
    ownerLabel: null,
  };
  wsMap.set(entryKey, entry);
  return entry;
}

/**
 * presence を解除する。存在しない場合は何もしない。
 */
export function unregister(
  wsId: string,
  sessionId: string,
  resourceType: DraftResourceType,
  resourceId: string,
): void {
  const wsMap = store.get(wsId);
  if (!wsMap) return;
  const entryKey = makeEntryKey(sessionId, resourceType, resourceId);
  wsMap.delete(entryKey);
}

/**
 * heartbeat を受信して presence entry を更新する。
 *
 * - kind="activity": lastActivityAt = now, focusAt = now
 * - kind="edit":     lastActivityAt = now, lastEditAt = now, focusAt = now
 *
 * 返り値の changed は「activity level が遷移したか」を示す。
 * Phase 1 では簡易実装 (lastActivityAt が更新されたら changed=true) とし、
 * activity taxonomy による細粒度判定は Phase 7 (#885) で詳細化する。
 */
export function heartbeat(
  wsId: string,
  sessionId: string,
  resourceType: DraftResourceType,
  resourceId: string,
  kind: "activity" | "edit",
): { changed: boolean; entry: PresenceEntry } {
  const wsMap = store.get(wsId);
  if (!wsMap) {
    // 未登録セッションは activity heartbeat で auto-register (viewer として)
    const entry = registerViewer(wsId, sessionId, resourceType, resourceId);
    if (kind === "edit") entry.lastEditAt = entry.lastActivityAt;
    return { changed: true, entry };
  }
  const entryKey = makeEntryKey(sessionId, resourceType, resourceId);
  let entry = wsMap.get(entryKey);
  if (!entry) {
    entry = registerViewer(wsId, sessionId, resourceType, resourceId);
    if (kind === "edit") entry.lastEditAt = entry.lastActivityAt;
    return { changed: true, entry };
  }

  const now = new Date().toISOString();
  entry.lastActivityAt = now;
  entry.focusAt = now;
  if (kind === "edit") {
    entry.lastEditAt = now;
  }
  // Phase 1: always broadcast on heartbeat (changed=true)
  // Phase 7 で activity level 遷移時のみに絞る
  return { changed: true, entry };
}

/**
 * 指定 wsId + resourceType + resourceId に対する全 presence エントリを返す。
 */
export function list(
  wsId: string,
  resourceType: DraftResourceType,
  resourceId: string,
): PresenceEntry[] {
  const wsMap = store.get(wsId);
  if (!wsMap) return [];
  const resourceKey = makeResourceKey(resourceType, resourceId);
  const result: PresenceEntry[] = [];
  for (const entry of wsMap.values()) {
    if (makeResourceKey(entry.resourceType, entry.resourceId) === resourceKey) {
      result.push(entry);
    }
  }
  return result;
}

/**
 * 期限切れ (stale) エントリを削除して返す。
 * `thresholdSec` より古い lastActivityAt を持つエントリを対象とする。
 * Phase 7 (#885) で cleanupAbandoned (WS 切断状態の判定) と統合する予定。
 * 今は実装のみ、setInterval による定期実行は Phase 7 で追加する。
 */
export function cleanupStale(thresholdSec: number): PresenceEntry[] {
  const removed: PresenceEntry[] = [];
  const cutoff = Date.now() - thresholdSec * 1000;
  for (const wsMap of store.values()) {
    for (const [key, entry] of wsMap) {
      const lastActivity = new Date(entry.lastActivityAt).getTime();
      if (lastActivity <= cutoff) {
        removed.push(entry);
        wsMap.delete(key);
      }
    }
  }
  return removed;
}

/** テスト用: store 全体をリセット */
export function _resetForTest(): void {
  store.clear();
}
