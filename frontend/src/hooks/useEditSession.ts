/**
 * useEditSession.ts (#900 / meta #897 Phase 3, Phase 6 cleanup)
 *
 * docs/spec/edit-session-protocol.md §15.2 の UseEditSessionResult シグネチャに準拠した
 * 新 API を提供する。
 *
 * 旧 API (useEditSessionLegacy / lock + draft 直呼び出しモデル) は Phase 6 (#903) で削除済み。
 *
 * ## 変更履歴
 * - Phase 3 (#900): 新 API (useEditSession v2) を追加
 *   - attach 時 initial fetchPayload (= §13.3 根本欠陥の解消)
 *   - editSession.update broadcast で sequence reorder 検出
 *   - EditSessionDropdown / useResourceEditor の内部用に設計
 * - Phase 6 (#903): useEditSessionLegacy 削除、旧 lock/draft 依存を完全除去
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mcpBridge } from "../mcp/mcpBridge";
import type { DraftResourceType } from "../types/draft";

// ── 新 API 型定義 (spec §15.2) ─────────────────────────────────────────────────

/**
 * spec §15.2 の UseEditSessionOptions に準拠。
 */
export interface UseEditSessionOptions {
  resourceType: DraftResourceType;
  resourceId: string;
  /** URL ?session= 復元時に渡す EditSession ID。undefined の場合は新規作成 flow */
  editSessionId?: string;
  /**
   * Phase 6 互換: 旧 useEditSessionLegacy で必須だった sessionId。
   * 新 API では使用しない (mcpBridge が内部的に管理するため)。
   * consumer コードの互換性維持のために受け付けるが無視される。
   * @deprecated Phase 6 以降不要。将来削除予定。
   */
  sessionId?: string;
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
  /**
   * Phase 6 互換フィールド: 旧 useEditSessionLegacy の mode 相当を myRole から計算。
   * 旧 kind 文字列のうち "readonly" / "editing" / "viewer" は引き続き返す。
   * "locked-by-other" / "force-released-pending" / "after-force-unlock" は
   * 新 API では発生しない (EditSession モデルでは take-over / detach に置き換え)。
   */
  mode: EditMode;
  /** Phase 6 互換フィールド: myRole === "Edit" の場合に true */
  isDirtyForTab: boolean;
  /** Phase 6 互換フィールド: actions オブジェクトとして旧 API を提供 */
  actions: EditSessionActions;
}

/**
 * EditMode — Phase 6 互換型。旧 useEditSessionLegacy の EditMode と同一シグネチャ。
 * 旧 "locked-by-other" / "force-released-pending" / "after-force-unlock" は
 * 新モデルでは発生しないが型定義は残して consumer コードの型エラーを防ぐ。
 */
export type EditMode =
  | { kind: "readonly" }
  | { kind: "editing" }
  | { kind: "viewer" }
  | { kind: "locked-by-other"; ownerSessionId: string; ownerLabel?: string }
  | { kind: "force-released-pending"; previousDraftExists: boolean }
  | { kind: "after-force-unlock"; previousOwner: string };

/**
 * EditSessionActions — Phase 6 互換型。旧 useEditSessionLegacy の actions 相当。
 */
export interface EditSessionActions {
  startEditing(): Promise<void>;
  save(): Promise<void>;
  discard(): Promise<void>;
  /** 旧 lock model の強制解除。新 API では editSession.detach に相当 (forced=true 相当) */
  forceReleaseOther(): Promise<void>;
  /** force-released-pending 状態からの復帰。新 API では発生しないため no-op */
  handleForcedOut(choice: "discard" | "continue" | "adopt"): Promise<void>;
  /** after-force-unlock 状態からの復帰。新 API では発生しないため no-op */
  handleAfterForceUnlock(choice: "adopt" | "discard" | "continue"): Promise<void>;
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

  // ── Phase 6 互換: mode / isDirtyForTab / actions ───────────────────────────────

  const mode: EditMode = useMemo(() => {
    if (myRole === "Edit") return { kind: "editing" };
    if (myRole === "View") return { kind: "viewer" };
    return { kind: "readonly" };
  }, [myRole]);

  const isDirtyForTab = myRole === "Edit";

  const actions: EditSessionActions = useMemo(() => ({
    startEditing,
    save,
    discard,
    forceReleaseOther: detach,  // 新 API では force-release = detach 相当
    handleForcedOut: async (_choice: "discard" | "continue" | "adopt") => {
      // 新 API では force-released-pending は発生しない (no-op)
    },
    handleAfterForceUnlock: async (_choice: "adopt" | "discard" | "continue") => {
      // 新 API では after-force-unlock は発生しない (no-op)
    },
  }), [startEditing, save, discard, detach]);

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
    mode,
    isDirtyForTab,
    actions,
  };
}
