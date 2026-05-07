/**
 * useEditSession.ts (#900 / meta #897 Phase 3)
 *
 * docs/spec/edit-session-protocol.md §15.2 の UseEditSessionResult シグネチャに準拠した
 * 新 API と、後方互換のために残す旧 API (useEditSessionLegacy / @deprecated) を提供する。
 *
 * 旧 API は Phase 6 で削除予定。
 *
 * ## 変更履歴
 * - Phase 3 (#900): 新 API (useEditSession v2) を追加
 *   - attach 時 initial fetchPayload (= §13.3 根本欠陥の解消)
 *   - editSession.update broadcast で sequence reorder 検出
 *   - EditSessionDropdown / useResourceEditor の内部用に設計
 * - 旧 API: useEditSessionLegacy に押し出し、@deprecated marker を付与
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { mcpBridge } from "../mcp/mcpBridge";
import { usePresenceHeartbeat } from "./usePresenceHeartbeat";
import type { DraftResourceType } from "../types/draft";

// ── 共通型 ─────────────────────────────────────────────────────────────────────

export type EditMode =
  | { kind: "readonly" }
  | { kind: "editing" }
  | { kind: "viewer" }
  | { kind: "locked-by-other"; ownerSessionId: string; ownerLabel?: string }
  | { kind: "force-released-pending"; previousDraftExists: boolean }
  | { kind: "after-force-unlock"; previousOwner: string };

// ── 旧 API 型定義 (互換用、@deprecated) ────────────────────────────────────────

/**
 * @deprecated Phase 6 で削除。useEditSession (新 API) に移行してください。
 */
export interface UseLegacyEditSessionOptions {
  resourceType: DraftResourceType;
  resourceId: string;
  sessionId: string;
}

/**
 * @deprecated Phase 6 で削除。UseEditSessionResult (新 API) に移行してください。
 */
export interface UseLegacyEditSessionResult {
  mode: EditMode;
  loading: boolean;
  error: Error | null;
  isDirtyForTab: boolean;
  /** viewer および readonly 以外の mode では編集不可 */
  canEdit: boolean;
  /** editing mode か否か */
  isEditing: boolean;
  actions: {
    startEditing: () => Promise<void>;
    save: () => Promise<void>;
    discard: () => Promise<void>;
    forceReleaseOther: () => Promise<void>;
    handleForcedOut: (choice: "adopt" | "discard" | "continue") => Promise<void>;
    handleAfterForceUnlock: (choice: "adopt" | "discard" | "continue") => Promise<void>;
    refreshLockState: () => Promise<void>;
  };
}

// ── 旧 API 実装 (互換維持用、@deprecated) ──────────────────────────────────────

/**
 * @deprecated Phase 6 で削除。useEditSession (新 API、spec §15.2) に移行してください。
 * 旧 API は lock/draft 直呼び出しモデル。既存の consumer は Phase 6 まで引き続き動作する。
 */
export function useEditSessionLegacy(opts: UseLegacyEditSessionOptions): UseLegacyEditSessionResult {
  const { resourceType, resourceId, sessionId } = opts;

  const [mode, setMode] = useState<EditMode>({ kind: "readonly" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const modeRef = useRef<EditMode>(mode);
  modeRef.current = mode;

  // viewer mode では usePresenceHeartbeat を有効化する
  const isViewerMode = mode.kind === "viewer";
  usePresenceHeartbeat({
    resourceType,
    resourceId,
    role: "viewer",
    enabled: isViewerMode,
  });

  const refreshLockState = useCallback(async () => {
    try {
      const lockRes = await mcpBridge.getLock(resourceType, resourceId) as {
        entry: { ownerSessionId: string } | null;
      } | null;
      const entry = lockRes?.entry ?? null;

      if (!entry) {
        setMode({ kind: "readonly" });
        return;
      }

      if (entry.ownerSessionId === sessionId) {
        setMode({ kind: "editing" });
        return;
      }

      setMode({ kind: "locked-by-other", ownerSessionId: entry.ownerSessionId });
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, [resourceType, resourceId, sessionId]);

  const refreshLockStateRef = useRef(refreshLockState);
  refreshLockStateRef.current = refreshLockState;

  useEffect(() => {
    let cancelled = false;
    // 切替前のリソース情報をキャプチャ (cleanup でゾンビロック解放に使う)
    const prevResourceType = resourceType;
    const prevResourceId = resourceId;

    const init = async () => {
      setLoading(true);
      try {
        const lockRes = await mcpBridge.getLock(resourceType, resourceId) as {
          entry: { ownerSessionId: string } | null;
        } | null;
        const entry = lockRes?.entry ?? null;

        if (cancelled) return;

        if (!entry) {
          const draftRes = await mcpBridge.hasDraft(resourceType, resourceId) as { exists: boolean } | null;
          if (cancelled) return;
          if (draftRes?.exists) {
            setMode({ kind: "force-released-pending", previousDraftExists: true });
          } else {
            setMode({ kind: "readonly" });
          }
        } else if (entry.ownerSessionId === sessionId) {
          setMode({ kind: "editing" });
        } else {
          setMode({ kind: "locked-by-other", ownerSessionId: entry.ownerSessionId });
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    init().catch(console.error);

    return () => {
      cancelled = true;
      // resourceId 変更時: 旧リソースのロックを保持していた場合はゾンビロックを解放する
      if (modeRef.current.kind === "editing") {
        mcpBridge.discardDraft(prevResourceType, prevResourceId).catch(() => {});
        mcpBridge.releaseLock(prevResourceType, prevResourceId, sessionId).catch(() => {});
        setMode({ kind: "readonly" });
      } else if (modeRef.current.kind === "viewer") {
        // viewer mode から離脱: viewer サブスクリプションを解除する
        mcpBridge.request("lock.unsubscribeViewer", { resourceType: prevResourceType, resourceId: prevResourceId }).catch(() => {});
      }
    };
  }, [resourceType, resourceId, sessionId]);

  useEffect(() => {
    const unsubLock = mcpBridge.onBroadcast("lock.changed", (data) => {
      const d = data as {
        resourceType: string;
        resourceId: string;
        op: "acquired" | "released" | "force-released" | "transferred" | "viewer-joined" | "viewer-left";
        ownerSessionId?: string;
        by: string;
        previousOwner?: string;
        viewerCount?: number;
      };

      if (d.resourceType !== resourceType || d.resourceId !== resourceId) return;

      const current = modeRef.current;

      if (d.op === "acquired") {
        if (d.ownerSessionId === sessionId) {
          setMode({ kind: "editing" });
        } else {
          // 他のセッションがロックを取得: viewer mode だった場合は locked-by-other に遷移
          if (current.kind !== "viewer") {
            setMode({ kind: "locked-by-other", ownerSessionId: d.ownerSessionId ?? d.by });
          }
        }
        return;
      }

      if (d.op === "released") {
        if (current.kind === "editing") return;
        // viewer mode は lock 解放後も維持 (readonly へは戻さない)
        if (current.kind === "viewer") return;
        setMode({ kind: "readonly" });
        return;
      }

      if (d.op === "force-released") {
        if (d.previousOwner === sessionId) {
          // 自分が強制解除を受けた側 (evicted)
          setMode({ kind: "force-released-pending", previousDraftExists: true });
        } else if (d.by === sessionId) {
          // 自分が強制解除を実行した側 (forcer)
          setMode({ kind: "after-force-unlock", previousOwner: d.previousOwner ?? d.ownerSessionId ?? "" });
        } else {
          // viewer mode は force-release で影響を受けない
          if (current.kind !== "viewer") {
            setMode({ kind: "readonly" });
          }
        }
        return;
      }

      if (d.op === "transferred") {
        const previousOwner = d.previousOwner ?? "";
        const newOwner = d.ownerSessionId ?? d.by ?? "";

        if (previousOwner === sessionId) {
          // 自分が引き継がれた側 (元 owner): editing → viewer に自動 fallback
          mcpBridge.request("lock.subscribeAsViewer", { resourceType, resourceId }).catch(() => {});
          setMode({ kind: "viewer" });
        } else if (newOwner === sessionId) {
          // 自分が新 owner (caller): viewer → editing に自動 promote
          // lock は既に lockManager に登録済み、lock 取り直しは不要
          setMode({ kind: "editing" });
        }
        return;
      }

      // viewer-joined / viewer-left: 状態変更なし (viewerCount は上位コンポーネントが必要なら別途ハンドル)
    });

    const unsubDraft = mcpBridge.onBroadcast("draft.changed", (data) => {
      const d = data as {
        type: string;
        id: string;
        op: string;
      };

      if (d.type !== resourceType || d.id !== resourceId) return;
      // 自分が editing 中に他セッションが同じリソースの draft を更新した場合
      // (通常発生しないが、競合検出のため lock state を再取得してログ出力する)
      if (modeRef.current.kind === "editing") {
        console.warn(`[useEditSessionLegacy] draft.changed received for ${resourceType}/${resourceId} while editing — refreshing lock state`);
        refreshLockStateRef.current().catch(console.error);
      }
    });

    return () => {
      unsubLock();
      unsubDraft();
    };
  }, [resourceType, resourceId, sessionId]);

  const startEditing = useCallback(async () => {
    setError(null);
    try {
      await mcpBridge.acquireLock(resourceType, resourceId, sessionId);
      await mcpBridge.createDraft(resourceType, resourceId);
      setMode({ kind: "editing" });
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      // LockConflictError 時: viewer として自動 fallback を試みる
      if (err.message.includes("既に") && err.message.includes("ロック中")) {
        try {
          await mcpBridge.request("lock.subscribeAsViewer", { resourceType, resourceId });
          setMode({ kind: "viewer" });
          return;
        } catch {
          // viewer subscribeAsViewer 失敗時は従来の locked-by-other に fallback
          await refreshLockState();
          return;
        }
      }
      setError(err);
      await refreshLockState();
    }
  }, [resourceType, resourceId, sessionId, refreshLockState]);

  const save = useCallback(async () => {
    setError(null);
    try {
      await mcpBridge.commitDraft(resourceType, resourceId);
      await mcpBridge.releaseLock(resourceType, resourceId, sessionId);
      setMode({ kind: "readonly" });
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, [resourceType, resourceId, sessionId]);

  const discard = useCallback(async () => {
    setError(null);
    try {
      await mcpBridge.discardDraft(resourceType, resourceId);
      await mcpBridge.releaseLock(resourceType, resourceId, sessionId);
      setMode({ kind: "readonly" });
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, [resourceType, resourceId, sessionId]);

  const forceReleaseOther = useCallback(async () => {
    setError(null);
    try {
      await mcpBridge.forceReleaseLock(resourceType, resourceId, sessionId);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, [resourceType, resourceId, sessionId]);

  const handleForcedOut = useCallback(async (choice: "adopt" | "discard" | "continue") => {
    setError(null);
    try {
      if (choice === "discard") {
        await mcpBridge.discardDraft(resourceType, resourceId);
        setMode({ kind: "readonly" });
      } else if (choice === "continue") {
        await mcpBridge.acquireLock(resourceType, resourceId, sessionId);
        setMode({ kind: "editing" });
      } else {
        // adopt: draft はそのまま保持し readonly に戻る (解除者に引き渡す)
        setMode({ kind: "readonly" });
      }
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, [resourceType, resourceId, sessionId]);

  const handleAfterForceUnlock = useCallback(async (choice: "adopt" | "discard" | "continue") => {
    setError(null);
    try {
      if (choice === "discard") {
        // 元の draft を削除して readonly に戻る
        await mcpBridge.discardDraft(resourceType, resourceId);
        setMode({ kind: "readonly" });
      } else if (choice === "adopt" || choice === "continue") {
        // 元の draft をそのまま自分のものとして lock を取得し editing へ
        await mcpBridge.acquireLock(resourceType, resourceId, sessionId);
        setMode({ kind: "editing" });
      }
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, [resourceType, resourceId, sessionId]);

  const isDirtyForTab =
    mode.kind === "editing" ||
    mode.kind === "force-released-pending";

  // viewer mode は read-only 扱い (canEdit=false, isEditing=false)
  const canEdit = mode.kind !== "viewer" && mode.kind !== "readonly" && mode.kind !== "locked-by-other";
  const isEditing = mode.kind === "editing";

  return {
    mode,
    loading,
    error,
    isDirtyForTab,
    canEdit,
    isEditing,
    actions: {
      startEditing,
      save,
      discard,
      forceReleaseOther,
      handleForcedOut,
      handleAfterForceUnlock,
      refreshLockState,
    },
  };
}

// ── 新 API 型定義 (spec §15.2) ─────────────────────────────────────────────────

/**
 * spec §15.2 の UseEditSessionOptions に準拠。
 */
export interface UseEditSessionOptions {
  resourceType: DraftResourceType;
  resourceId: string;
  /** URL ?session= 復元時に渡す EditSession ID。undefined の場合は新規作成 flow */
  editSessionId?: string;
}

/**
 * EditSession の participant 情報 (backend の ParticipantInfo と同一 shape)。
 * spec §3.2 参照。
 */
export interface ParticipantInfo {
  sessionId: string;
  role: "Edit" | "View";
  joinedAt: string;
  lastActivityAt: string;
  parentHumanSessionId?: string;
  displayLabel: string;
}

/**
 * EditSession の構造 (backend の EditSession シリアライズ形式)。
 * participants は backend では Map だが、WS serialization 後は Record<string, ParticipantInfo>。
 */
export interface EditSessionData {
  id: string;
  resourceType: DraftResourceType;
  resourceId: string;
  state: "Active" | "Discarded";
  participants: Record<string, ParticipantInfo>;
  payload: unknown;
  sequence: number;
  createdAt: string;
  expiresAt: string;
  saveHistory: Array<{ savedBy: string; savedAt: string; sequence: number }>;
  lastActivityAt: string;
  discardedAt?: string;
}

/**
 * spec §15.2 の UseEditSessionResult に準拠した新 API インターフェース。
 *
 * このフックは EditSession の lifecycle を管理する。
 * - startEditing(): 新規 EditSession を作成し Edit role を取得する
 * - attach(editSessionId): 既存 EditSession に View role で join する
 * - takeOver(): View → Edit に昇格 (atomic、prevEditor は View に降格)
 * - releaseEdit(): Edit → View に降格
 * - save(): 現在の payload を本体ファイルに確定保存する
 * - discard(): EditSession を Discarded に遷移する
 * - detach(): EditSession から完全離脱する
 */
export interface UseEditSessionResult {
  editSession: EditSessionData | null;
  myRole: "Edit" | "View" | null;
  participants: ParticipantInfo[];
  payload: unknown;
  loading: boolean;
  error: Error | null;
  startEditing(): Promise<void>;
  attach(editSessionId: string): Promise<void>;
  takeOver(): Promise<void>;
  releaseEdit(): Promise<void>;
  save(): Promise<void>;
  discard(): Promise<void>;
  detach(): Promise<void>;
}

// ── 新 API 実装 (spec §15.2 準拠) ─────────────────────────────────────────────

/**
 * spec §15.2 UseEditSessionResult に準拠した EditSession 管理 hook。
 *
 * 旧 API (useEditSessionLegacy) に代わる正規 API。
 *
 * 重要実装ポイント:
 * - attach() 時に editSession.fetchPayload を呼び initial state を取得 (= §13.3 根本欠陥の解消)
 * - broadcast editSession.update 受信時は sequence を比較して reorder 破棄
 * - payload は opaque (unknown 型) で扱う (Forward-Compat 原則 ①)
 */
export function useEditSession(opts: UseEditSessionOptions): UseEditSessionResult {
  const { resourceType, resourceId, editSessionId: initialEditSessionId } = opts;

  const [editSession, setEditSession] = useState<EditSessionData | null>(null);
  const [myRole, setMyRole] = useState<"Edit" | "View" | null>(null);
  const [payload, setPayload] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // sequence tracking for reorder detection (§14.1 / useResourceEditor のパターンと同様)
  const lastSeqRef = useRef(0);
  const editSessionRef = useRef<EditSessionData | null>(null);
  editSessionRef.current = editSession;

  // ── パーティシパント一覧を editSession から導出 ────────────────────────────
  const participants: ParticipantInfo[] = editSession
    ? Object.values(editSession.participants)
    : [];

  // ── broadcast listener ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!editSession?.id) return;
    const targetEditSessionId = editSession.id;

    // editSession.update — payload 更新 (reorder 検出)
    const unsubUpdate = mcpBridge.onBroadcast("editSession.update", (data) => {
      const d = data as {
        editSessionId: string;
        sequence: number;
        payload: unknown;
        senderSessionId: string;
      };
      if (d.editSessionId !== targetEditSessionId) return;
      if (typeof d.sequence === "number" && d.sequence <= lastSeqRef.current) {
        // reorder: 古い sequence は無視 (spec §14.1)
        return;
      }
      lastSeqRef.current = d.sequence ?? lastSeqRef.current;
      setPayload(d.payload);
    });

    // editSession.roleChanged — myRole が変わる可能性がある
    const unsubRoleChanged = mcpBridge.onBroadcast("editSession.roleChanged", (data) => {
      const d = data as {
        editSessionId: string;
        sessionId: string;
        oldRole: string;
        newRole: "Edit" | "View";
        op?: string;
        transferTo?: string;
      };
      if (d.editSessionId !== targetEditSessionId) return;
      // 自分の role が変わった場合のみ状態を更新 (自分の sessionId は mcpBridge から取れない)
      // 全員に broadcast されるので editSession.participants から自分の role を取り直す
      // Phase 3 では refreshEditSession を呼ぶシンプル実装
      void refreshEditSessionState(targetEditSessionId);
    });

    // editSession.attached — 新しい participant が join
    const unsubAttached = mcpBridge.onBroadcast("editSession.attached", (data) => {
      const d = data as { editSessionId: string; participant: ParticipantInfo };
      if (d.editSessionId !== targetEditSessionId) return;
      void refreshEditSessionState(targetEditSessionId);
    });

    // editSession.detached — participant が離脱
    const unsubDetached = mcpBridge.onBroadcast("editSession.detached", (data) => {
      const d = data as { editSessionId: string; sessionId: string };
      if (d.editSessionId !== targetEditSessionId) return;
      void refreshEditSessionState(targetEditSessionId);
    });

    // editSession.saved — save 完了
    const unsubSaved = mcpBridge.onBroadcast("editSession.saved", (data) => {
      const d = data as { editSessionId: string; savedBy: string; savedAt: string; sequence: number };
      if (d.editSessionId !== targetEditSessionId) return;
      // saveHistory を更新するため refreshEditSessionState を呼ぶ
      void refreshEditSessionState(targetEditSessionId);
    });

    // editSession.discarded — Discarded 遷移
    const unsubDiscarded = mcpBridge.onBroadcast("editSession.discarded", (data) => {
      const d = data as { editSessionId: string; reason: "manual" | "ttl" };
      if (d.editSessionId !== targetEditSessionId) return;
      setEditSession((prev) => {
        if (!prev || prev.id !== targetEditSessionId) return prev;
        return { ...prev, state: "Discarded" };
      });
    });

    // editSession.expired — 完全削除
    const unsubExpired = mcpBridge.onBroadcast("editSession.expired", (data) => {
      const d = data as { editSessionId: string };
      if (d.editSessionId !== targetEditSessionId) return;
      setEditSession(null);
      setMyRole(null);
      setPayload(null);
    });

    return () => {
      unsubUpdate();
      unsubRoleChanged();
      unsubAttached();
      unsubDetached();
      unsubSaved();
      unsubDiscarded();
      unsubExpired();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editSession?.id]);

  // ── helper: EditSession state を fetch して states を更新 ──────────────────

  const refreshEditSessionState = useCallback(async (esId: string) => {
    try {
      const result = await mcpBridge.request("editSession.list", {
        resourceType,
        resourceId,
      }) as { sessions: EditSessionData[] };
      const found = result.sessions?.find((s) => s.id === esId) ?? null;
      if (found) {
        setEditSession(found);
        // payload は別途 fetchPayload で取るか、update broadcast で維持する
        // myRole は参加時のメモリから取るのが本来だが、list には含まれていない
        // (sessionId は mcpBridge 経由で取れないため、参加/切替時に myRole を別途記録する)
      }
    } catch (e) {
      console.warn("[useEditSession] refreshEditSessionState failed:", e);
    }
  }, [resourceType, resourceId]);

  // ── startEditing ────────────────────────────────────────────────────────────

  const startEditing = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await mcpBridge.request("editSession.create", {
        resourceType,
        resourceId,
      }) as { editSession: EditSessionData };
      const es = result.editSession;
      setEditSession(es);
      setMyRole("Edit");
      // 新規作成時は payload は null (まだ編集していない)
      setPayload(es.payload ?? null);
      lastSeqRef.current = es.sequence ?? 0;
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [resourceType, resourceId]);

  // ── attach ──────────────────────────────────────────────────────────────────

  /**
   * 既存 EditSession に View role で join する (spec §5 step 2 / §13.3)。
   *
   * §13.3 の根本欠陥解消: attachAsView の response に payload + sequence が含まれる。
   * これにより「後から接続した viewer」も最新 state を即座に取得できる。
   */
  const attach = useCallback(async (esId: string) => {
    setError(null);
    setLoading(true);
    try {
      // spec §13.3: attachAsView の response に payload + sequence が含まれる
      // (backend wsBridge が fetchCurrentPayload を自動的に呼び、response に含める)
      const result = await mcpBridge.request("editSession.attachAsView", {
        editSessionId: esId,
      }) as {
        participant: ParticipantInfo;
        payload: unknown;
        sequence: number;
      };

      // initial payload を即座に表示 (broadcast 待ちでない — §13.3 根本欠陥の解消)
      setPayload(result.payload);
      lastSeqRef.current = result.sequence ?? 0;
      setMyRole("View");

      // EditSession の最新情報を取得して editSession state を更新
      await refreshEditSessionState(esId);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [refreshEditSessionState]);

  // ── takeOver ─────────────────────────────────────────────────────────────────

  const takeOver = useCallback(async () => {
    setError(null);
    const es = editSessionRef.current;
    if (!es) {
      setError(new Error("EditSession がアクティブでありません"));
      return;
    }
    setLoading(true);
    try {
      // transferEdit: 現在の Edit participant から自分 (View) へ atomic に移譲
      await mcpBridge.request("editSession.transferEdit", {
        editSessionId: es.id,
        toSessionId: "", // server 側が clientId を使うため空で良い (handler 実装上、fromSessionId は clientId から自動判定)
      });
      setMyRole("Edit");
      await refreshEditSessionState(es.id);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [refreshEditSessionState]);

  // ── releaseEdit ───────────────────────────────────────────────────────────────

  const releaseEdit = useCallback(async () => {
    setError(null);
    const es = editSessionRef.current;
    if (!es) {
      setError(new Error("EditSession がアクティブでありません"));
      return;
    }
    setLoading(true);
    try {
      await mcpBridge.request("editSession.setRole", {
        editSessionId: es.id,
        role: "View",
      });
      setMyRole("View");
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  // ── save ─────────────────────────────────────────────────────────────────────

  const save = useCallback(async () => {
    setError(null);
    const es = editSessionRef.current;
    if (!es) {
      setError(new Error("EditSession がアクティブでありません"));
      return;
    }
    setLoading(true);
    try {
      await mcpBridge.request("editSession.save", {
        editSessionId: es.id,
      });
      // saveHistory は broadcast editSession.saved で refreshEditSessionState が呼ばれる
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  // ── discard ───────────────────────────────────────────────────────────────────

  const discard = useCallback(async () => {
    setError(null);
    const es = editSessionRef.current;
    if (!es) {
      setError(new Error("EditSession がアクティブでありません"));
      return;
    }
    setLoading(true);
    try {
      await mcpBridge.request("editSession.discard", {
        editSessionId: es.id,
      });
      setEditSession((prev) => prev ? { ...prev, state: "Discarded" } : null);
      setMyRole(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  // ── detach ────────────────────────────────────────────────────────────────────

  const detach = useCallback(async () => {
    setError(null);
    const es = editSessionRef.current;
    if (!es) {
      setError(new Error("EditSession がアクティブでありません"));
      return;
    }
    setLoading(true);
    try {
      await mcpBridge.request("editSession.detach", {
        editSessionId: es.id,
      });
      setEditSession(null);
      setMyRole(null);
      setPayload(null);
      lastSeqRef.current = 0;
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  // ── URL ?session= からの自動 attach ───────────────────────────────────────────

  useEffect(() => {
    if (!initialEditSessionId) return;
    // 既に同じ editSession に attach 済みなら再 attach しない
    if (editSessionRef.current?.id === initialEditSessionId) return;
    attach(initialEditSessionId).catch(console.error);
  // attach は useCallback で安定しているので initialEditSessionId の変化のみ追跡
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEditSessionId]);

  return {
    editSession,
    myRole,
    participants,
    payload,
    loading,
    error,
    startEditing,
    attach,
    takeOver,
    releaseEdit,
    save,
    discard,
    detach,
  };
}
