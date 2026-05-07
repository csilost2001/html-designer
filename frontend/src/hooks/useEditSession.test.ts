/**
 * useEditSession.test.ts (#900 Phase 3)
 *
 * テスト構成:
 * - describe "useEditSession (新 API)" — spec §15.2 準拠の 8+ ケース
 * - describe "useEditSessionLegacy (@deprecated)" — 旧 API の regression テスト
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useEditSession } from "./useEditSession";
import { useEditSessionLegacy } from "./useEditSession";

const broadcastHandlers = new Map<string, Set<(data: unknown) => void>>();

vi.mock("../mcp/mcpBridge", () => {
  const bridge = {
    getLock: vi.fn(),
    hasDraft: vi.fn(),
    acquireLock: vi.fn(),
    releaseLock: vi.fn(),
    forceReleaseLock: vi.fn(),
    createDraft: vi.fn(),
    commitDraft: vi.fn(),
    discardDraft: vi.fn(),
    request: vi.fn(),
    onBroadcast: vi.fn((event: string, handler: (data: unknown) => void) => {
      if (!broadcastHandlers.has(event)) {
        broadcastHandlers.set(event, new Set());
      }
      broadcastHandlers.get(event)!.add(handler);
      return () => broadcastHandlers.get(event)?.delete(handler);
    }),
  };
  return { mcpBridge: bridge };
});

function fireBroadcast(event: string, data: unknown) {
  broadcastHandlers.get(event)?.forEach((h) => h(data));
}

import { mcpBridge } from "../mcp/mcpBridge";

// ── 旧 API 用の定数 ────────────────────────────────────────────────────────────

const SESSION_ID = "session-abc";
const LEGACY_OPTS = {
  resourceType: "table" as const,
  resourceId: "tbl-001",
  sessionId: SESSION_ID,
};

// ── 新 API 用の定数 ────────────────────────────────────────────────────────────

const NEW_OPTS = {
  resourceType: "table" as const,
  resourceId: "tbl-001",
};

const MOCK_EDIT_SESSION = {
  id: "es-test-001",
  resourceType: "table" as const,
  resourceId: "tbl-001",
  state: "Active" as const,
  participants: {
    "session-abc": {
      sessionId: "session-abc",
      role: "Edit" as const,
      joinedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      displayLabel: "@alice",
    },
  },
  payload: { data: "initial" },
  sequence: 1,
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  saveHistory: [],
  lastActivityAt: new Date().toISOString(),
};

const MOCK_EDIT_SESSION_WITH_VIEW = {
  ...MOCK_EDIT_SESSION,
  participants: {
    "session-abc": {
      sessionId: "session-abc",
      role: "View" as const,
      joinedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      displayLabel: "@alice",
    },
    "session-editor": {
      sessionId: "session-editor",
      role: "Edit" as const,
      joinedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      displayLabel: "@bob",
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  broadcastHandlers.clear();
  // 旧 API デフォルト mock
  (mcpBridge.getLock as ReturnType<typeof vi.fn>).mockResolvedValue({ entry: null });
  (mcpBridge.hasDraft as ReturnType<typeof vi.fn>).mockResolvedValue({ exists: false });
  (mcpBridge.acquireLock as ReturnType<typeof vi.fn>).mockResolvedValue({ entry: { ownerSessionId: SESSION_ID } });
  (mcpBridge.releaseLock as ReturnType<typeof vi.fn>).mockResolvedValue({ released: true });
  (mcpBridge.forceReleaseLock as ReturnType<typeof vi.fn>).mockResolvedValue({ released: true, previousOwner: "other-session" });
  (mcpBridge.createDraft as ReturnType<typeof vi.fn>).mockResolvedValue({ created: true });
  (mcpBridge.commitDraft as ReturnType<typeof vi.fn>).mockResolvedValue({ committed: true });
  (mcpBridge.discardDraft as ReturnType<typeof vi.fn>).mockResolvedValue({ discarded: true });
  // 新 API デフォルト mock
  (mcpBridge.request as ReturnType<typeof vi.fn>).mockResolvedValue({});
});

afterEach(() => {
  broadcastHandlers.clear();
});

// ══════════════════════════════════════════════════════════════════════════════
// 新 API テスト (spec §15.2)
// ══════════════════════════════════════════════════════════════════════════════

describe("useEditSession (新 API, spec §15.2)", () => {
  // ── ケース 1: startEditing → editSession.create 呼び出し、myRole === "Edit" ──

  it("1. startEditing: editSession.create を呼び myRole が Edit になる", async () => {
    (mcpBridge.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      editSession: MOCK_EDIT_SESSION,
    });

    const { result } = renderHook(() => useEditSession(NEW_OPTS));
    expect(result.current.myRole).toBeNull();

    await act(async () => {
      await result.current.startEditing();
    });

    expect(mcpBridge.request).toHaveBeenCalledWith("editSession.create", {
      resourceType: "table",
      resourceId: "tbl-001",
    });
    expect(result.current.myRole).toBe("Edit");
    expect(result.current.editSession?.id).toBe("es-test-001");
  });

  // ── ケース 2: attach(editSessionId) → attachAsView + fetchPayload (§13.3) ──

  it("2. attach: attachAsView を呼び initial payload を即座に取得する (§13.3 根本欠陥の解消)", async () => {
    // attachAsView response に payload + sequence が含まれる (backend が fetchCurrentPayload を自動実行)
    (mcpBridge.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      participant: { sessionId: SESSION_ID, role: "View" },
      payload: { data: "latest-state" },
      sequence: 5,
    });
    // refreshEditSessionState (editSession.list) mock
    (mcpBridge.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      sessions: [MOCK_EDIT_SESSION_WITH_VIEW],
    });

    const { result } = renderHook(() => useEditSession(NEW_OPTS));

    await act(async () => {
      await result.current.attach("es-test-001");
    });

    // editSession.attachAsView が呼ばれたことを確認
    expect(mcpBridge.request).toHaveBeenCalledWith("editSession.attachAsView", {
      editSessionId: "es-test-001",
    });

    // initial payload が即座に反映されること (= §13.3 根本欠陥の解消)
    expect(result.current.payload).toEqual({ data: "latest-state" });
    expect(result.current.myRole).toBe("View");
  });

  // ── ケース 3: takeOver → editSession.transferEdit 呼び出し、myRole が View → Edit ──

  it("3. takeOver: transferEdit を呼び myRole が Edit になる", async () => {
    // 先に attach して View 状態を作る
    (mcpBridge.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      participant: { sessionId: SESSION_ID, role: "View" },
      payload: null,
      sequence: 0,
    });
    (mcpBridge.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      sessions: [{ ...MOCK_EDIT_SESSION, id: "es-test-001", participants: { [SESSION_ID]: { role: "View", sessionId: SESSION_ID, displayLabel: "@alice", joinedAt: new Date().toISOString(), lastActivityAt: new Date().toISOString() } } }],
    });
    // takeOver の transferEdit mock
    (mcpBridge.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      from: { sessionId: "session-editor", role: "View" },
      to: { sessionId: SESSION_ID, role: "Edit" },
    });
    // refreshEditSessionState
    (mcpBridge.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      sessions: [MOCK_EDIT_SESSION],
    });

    const { result } = renderHook(() => useEditSession(NEW_OPTS));

    await act(async () => {
      await result.current.attach("es-test-001");
    });

    expect(result.current.myRole).toBe("View");

    await act(async () => {
      await result.current.takeOver();
    });

    expect(mcpBridge.request).toHaveBeenCalledWith("editSession.transferEdit", expect.objectContaining({
      editSessionId: "es-test-001",
    }));
    expect(result.current.myRole).toBe("Edit");
  });

  // ── ケース 4: releaseEdit → setRole("View") 呼び出し、myRole が Edit → View ──

  it("4. releaseEdit: editSession.setRole(View) を呼び myRole が View になる", async () => {
    // startEditing で Edit 状態を作る
    (mcpBridge.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      editSession: MOCK_EDIT_SESSION,
    });

    const { result } = renderHook(() => useEditSession(NEW_OPTS));

    await act(async () => {
      await result.current.startEditing();
    });

    expect(result.current.myRole).toBe("Edit");

    // setRole mock
    (mcpBridge.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      participant: { sessionId: SESSION_ID, role: "View" },
    });

    await act(async () => {
      await result.current.releaseEdit();
    });

    expect(mcpBridge.request).toHaveBeenCalledWith("editSession.setRole", {
      editSessionId: "es-test-001",
      role: "View",
    });
    expect(result.current.myRole).toBe("View");
  });

  // ── ケース 5: save → editSession.save 呼び出し ──

  it("5. save: editSession.save を呼ぶ", async () => {
    // startEditing
    (mcpBridge.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      editSession: MOCK_EDIT_SESSION,
    });

    const { result } = renderHook(() => useEditSession(NEW_OPTS));

    await act(async () => {
      await result.current.startEditing();
    });

    // save mock
    (mcpBridge.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      saveEvent: { savedBy: SESSION_ID, savedAt: new Date().toISOString(), sequence: 1 },
    });
    // refreshEditSessionState for saved broadcast
    (mcpBridge.request as ReturnType<typeof vi.fn>).mockResolvedValue({ sessions: [MOCK_EDIT_SESSION] });

    await act(async () => {
      await result.current.save();
    });

    expect(mcpBridge.request).toHaveBeenCalledWith("editSession.save", {
      editSessionId: "es-test-001",
    });
  });

  // ── ケース 6: discard → editSession.discard 呼び出し、state === "Discarded" ──

  it("6. discard: editSession.discard を呼び editSession.state が Discarded になる", async () => {
    // startEditing
    (mcpBridge.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      editSession: MOCK_EDIT_SESSION,
    });

    const { result } = renderHook(() => useEditSession(NEW_OPTS));

    await act(async () => {
      await result.current.startEditing();
    });

    // discard mock
    (mcpBridge.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      discarded: true,
    });

    await act(async () => {
      await result.current.discard();
    });

    expect(mcpBridge.request).toHaveBeenCalledWith("editSession.discard", {
      editSessionId: "es-test-001",
    });
    expect(result.current.editSession?.state).toBe("Discarded");
    expect(result.current.myRole).toBeNull();
  });

  // ── ケース 7: broadcast editSession.update — 古い sequence は無視 ──

  it("7. broadcast editSession.update: 古い sequence は無視し、新しい sequence で payload 更新", async () => {
    // startEditing
    (mcpBridge.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      editSession: MOCK_EDIT_SESSION,
    });

    const { result } = renderHook(() => useEditSession(NEW_OPTS));

    await act(async () => {
      await result.current.startEditing();
    });

    // sequence=1 からスタート (MOCK_EDIT_SESSION.sequence = 1)
    // sequence=2 の broadcast: 受け入れる
    await act(async () => {
      fireBroadcast("editSession.update", {
        editSessionId: "es-test-001",
        sequence: 2,
        payload: { data: "update-v2" },
        senderSessionId: "other-session",
      });
    });

    expect(result.current.payload).toEqual({ data: "update-v2" });

    // sequence=1 の broadcast (古い): 無視する
    await act(async () => {
      fireBroadcast("editSession.update", {
        editSessionId: "es-test-001",
        sequence: 1,
        payload: { data: "old-data" },
        senderSessionId: "other-session",
      });
    });

    // payload は更新されない (古い sequence は無視)
    expect(result.current.payload).toEqual({ data: "update-v2" });
  });

  // ── ケース 8: broadcast editSession.roleChanged → myRole が反映 ──

  it("8. broadcast editSession.roleChanged: refreshEditSessionState が呼ばれる", async () => {
    // startEditing
    (mcpBridge.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      editSession: MOCK_EDIT_SESSION,
    });

    const { result } = renderHook(() => useEditSession(NEW_OPTS));

    await act(async () => {
      await result.current.startEditing();
    });

    // roleChanged broadcast を受信 (editSession.list で state を refresh)
    (mcpBridge.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      sessions: [MOCK_EDIT_SESSION_WITH_VIEW],
    });

    await act(async () => {
      fireBroadcast("editSession.roleChanged", {
        editSessionId: "es-test-001",
        sessionId: SESSION_ID,
        oldRole: "Edit",
        newRole: "View",
      });
    });

    // refreshEditSessionState が呼ばれたことを確認 (editSession.list)
    expect(mcpBridge.request).toHaveBeenCalledWith("editSession.list", {
      resourceType: "table",
      resourceId: "tbl-001",
    });
  });

  // ── ケース: editSession.update の editSessionId フィルタ ──

  it("異なる editSessionId の broadcast は無視される", async () => {
    // startEditing
    (mcpBridge.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      editSession: MOCK_EDIT_SESSION,
    });

    const { result } = renderHook(() => useEditSession(NEW_OPTS));

    await act(async () => {
      await result.current.startEditing();
    });

    const initialPayload = result.current.payload;

    // 別 editSessionId の broadcast: 無視される
    await act(async () => {
      fireBroadcast("editSession.update", {
        editSessionId: "es-other-session",
        sequence: 100,
        payload: { data: "should-be-ignored" },
        senderSessionId: "other-session",
      });
    });

    // payload は変わらない
    expect(result.current.payload).toEqual(initialPayload);
  });

  // ── ケース: editSession.discarded broadcast → state が Discarded ──

  it("broadcast editSession.discarded: editSession.state が Discarded になる", async () => {
    (mcpBridge.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      editSession: MOCK_EDIT_SESSION,
    });

    const { result } = renderHook(() => useEditSession(NEW_OPTS));

    await act(async () => {
      await result.current.startEditing();
    });

    expect(result.current.editSession?.state).toBe("Active");

    await act(async () => {
      fireBroadcast("editSession.discarded", {
        editSessionId: "es-test-001",
        reason: "manual",
      });
    });

    expect(result.current.editSession?.state).toBe("Discarded");
  });

  // ── ケース: editSession.expired broadcast → editSession が null になる ──

  it("broadcast editSession.expired: editSession が null になる", async () => {
    (mcpBridge.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      editSession: MOCK_EDIT_SESSION,
    });

    const { result } = renderHook(() => useEditSession(NEW_OPTS));

    await act(async () => {
      await result.current.startEditing();
    });

    expect(result.current.editSession).not.toBeNull();

    await act(async () => {
      fireBroadcast("editSession.expired", {
        editSessionId: "es-test-001",
      });
    });

    expect(result.current.editSession).toBeNull();
    expect(result.current.myRole).toBeNull();
    expect(result.current.payload).toBeNull();
  });

  // ── ケース: initialEditSessionId が指定された場合は自動 attach ──

  it("initialEditSessionId が指定された場合、自動 attach が実行される", async () => {
    (mcpBridge.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      participant: { sessionId: SESSION_ID, role: "View" },
      payload: { data: "auto-attached" },
      sequence: 3,
    });
    (mcpBridge.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      sessions: [MOCK_EDIT_SESSION_WITH_VIEW],
    });

    const { result } = renderHook(() =>
      useEditSession({ ...NEW_OPTS, editSessionId: "es-test-001" }),
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mcpBridge.request).toHaveBeenCalledWith("editSession.attachAsView", {
      editSessionId: "es-test-001",
    });
    // initial payload が取得されること
    expect(result.current.payload).toEqual({ data: "auto-attached" });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 旧 API テスト (useEditSessionLegacy / @deprecated, regression)
// ══════════════════════════════════════════════════════════════════════════════

describe("useEditSessionLegacy (@deprecated, regression)", () => {
  it("初期状態: ロックなし → readonly", async () => {
    const { result } = renderHook(() => useEditSessionLegacy(LEGACY_OPTS));

    expect(result.current.loading).toBe(true);

    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    expect(result.current.loading).toBe(false);
    expect(result.current.mode.kind).toBe("readonly");
  });

  it("初期状態: 他セッションがロック中 → locked-by-other", async () => {
    (mcpBridge.getLock as ReturnType<typeof vi.fn>).mockResolvedValue({ entry: { ownerSessionId: "other-session" } });

    const { result } = renderHook(() => useEditSessionLegacy(LEGACY_OPTS));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    expect(result.current.mode.kind).toBe("locked-by-other");
    if (result.current.mode.kind === "locked-by-other") {
      expect(result.current.mode.ownerSessionId).toBe("other-session");
    }
  });

  it("初期状態: 自分がロック中 → editing", async () => {
    (mcpBridge.getLock as ReturnType<typeof vi.fn>).mockResolvedValue({ entry: { ownerSessionId: SESSION_ID } });

    const { result } = renderHook(() => useEditSessionLegacy(LEGACY_OPTS));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    expect(result.current.mode.kind).toBe("editing");
  });

  it("startEditing: readonly → editing", async () => {
    const { result } = renderHook(() => useEditSessionLegacy(LEGACY_OPTS));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      await result.current.actions.startEditing();
    });

    expect(mcpBridge.acquireLock).toHaveBeenCalledWith("table", "tbl-001", SESSION_ID);
    expect(mcpBridge.createDraft).toHaveBeenCalledWith("table", "tbl-001");
    expect(result.current.mode.kind).toBe("editing");
  });

  it("save: editing → readonly", async () => {
    (mcpBridge.getLock as ReturnType<typeof vi.fn>).mockResolvedValue({ entry: { ownerSessionId: SESSION_ID } });

    const { result } = renderHook(() => useEditSessionLegacy(LEGACY_OPTS));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      await result.current.actions.save();
    });

    expect(mcpBridge.commitDraft).toHaveBeenCalledWith("table", "tbl-001");
    expect(mcpBridge.releaseLock).toHaveBeenCalledWith("table", "tbl-001", SESSION_ID);
    expect(result.current.mode.kind).toBe("readonly");
  });

  it("discard: editing → readonly", async () => {
    (mcpBridge.getLock as ReturnType<typeof vi.fn>).mockResolvedValue({ entry: { ownerSessionId: SESSION_ID } });

    const { result } = renderHook(() => useEditSessionLegacy(LEGACY_OPTS));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      await result.current.actions.discard();
    });

    expect(mcpBridge.discardDraft).toHaveBeenCalledWith("table", "tbl-001");
    expect(mcpBridge.releaseLock).toHaveBeenCalledWith("table", "tbl-001", SESSION_ID);
    expect(result.current.mode.kind).toBe("readonly");
  });

  it("broadcast lock.changed acquired: mode → locked-by-other", async () => {
    const { result } = renderHook(() => useEditSessionLegacy(LEGACY_OPTS));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    act(() => {
      fireBroadcast("lock.changed", {
        resourceType: "table",
        resourceId: "tbl-001",
        op: "acquired",
        ownerSessionId: "other-session",
        by: "other-session",
      });
    });

    expect(result.current.mode.kind).toBe("locked-by-other");
  });

  it("broadcast lock.changed acquired: 自分がオーナー → editing", async () => {
    const { result } = renderHook(() => useEditSessionLegacy(LEGACY_OPTS));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    act(() => {
      fireBroadcast("lock.changed", {
        resourceType: "table",
        resourceId: "tbl-001",
        op: "acquired",
        ownerSessionId: SESSION_ID,
        by: SESSION_ID,
      });
    });

    expect(result.current.mode.kind).toBe("editing");
  });

  it("broadcast lock.changed force-released: 自分がオーナー → force-released-pending", async () => {
    (mcpBridge.getLock as ReturnType<typeof vi.fn>).mockResolvedValue({ entry: { ownerSessionId: SESSION_ID } });

    const { result } = renderHook(() => useEditSessionLegacy(LEGACY_OPTS));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    act(() => {
      fireBroadcast("lock.changed", {
        resourceType: "table",
        resourceId: "tbl-001",
        op: "force-released",
        ownerSessionId: SESSION_ID,
        by: "other-session",
        previousOwner: SESSION_ID,
      });
    });

    expect(result.current.mode.kind).toBe("force-released-pending");
  });

  it("handleForcedOut discard: draft を破棄して readonly", async () => {
    (mcpBridge.getLock as ReturnType<typeof vi.fn>).mockResolvedValue({ entry: { ownerSessionId: SESSION_ID } });

    const { result } = renderHook(() => useEditSessionLegacy(LEGACY_OPTS));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    act(() => {
      fireBroadcast("lock.changed", {
        resourceType: "table",
        resourceId: "tbl-001",
        op: "force-released",
        ownerSessionId: SESSION_ID,
        by: "other-session",
        previousOwner: SESSION_ID,
      });
    });

    await act(async () => {
      await result.current.actions.handleForcedOut("discard");
    });

    expect(mcpBridge.discardDraft).toHaveBeenCalledWith("table", "tbl-001");
    expect(result.current.mode.kind).toBe("readonly");
  });

  it("broadcast lock.changed force-released: 自分が解除者 → after-force-unlock", async () => {
    const { result } = renderHook(() => useEditSessionLegacy(LEGACY_OPTS));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    act(() => {
      fireBroadcast("lock.changed", {
        resourceType: "table",
        resourceId: "tbl-001",
        op: "force-released",
        ownerSessionId: "other-session",
        by: SESSION_ID,
        previousOwner: "other-session",
      });
    });

    expect(result.current.mode.kind).toBe("after-force-unlock");
    if (result.current.mode.kind === "after-force-unlock") {
      expect(result.current.mode.previousOwner).toBe("other-session");
    }
  });

  it("handleAfterForceUnlock adopt: lock 取得して editing へ", async () => {
    const { result } = renderHook(() => useEditSessionLegacy(LEGACY_OPTS));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    act(() => {
      fireBroadcast("lock.changed", {
        resourceType: "table",
        resourceId: "tbl-001",
        op: "force-released",
        ownerSessionId: "other-session",
        by: SESSION_ID,
        previousOwner: "other-session",
      });
    });

    await act(async () => {
      await result.current.actions.handleAfterForceUnlock("adopt");
    });

    expect(mcpBridge.acquireLock).toHaveBeenCalledWith("table", "tbl-001", SESSION_ID);
    expect(result.current.mode.kind).toBe("editing");
  });

  it("handleAfterForceUnlock discard: draft 削除して readonly へ", async () => {
    const { result } = renderHook(() => useEditSessionLegacy(LEGACY_OPTS));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    act(() => {
      fireBroadcast("lock.changed", {
        resourceType: "table",
        resourceId: "tbl-001",
        op: "force-released",
        ownerSessionId: "other-session",
        by: SESSION_ID,
        previousOwner: "other-session",
      });
    });

    await act(async () => {
      await result.current.actions.handleAfterForceUnlock("discard");
    });

    expect(mcpBridge.discardDraft).toHaveBeenCalledWith("table", "tbl-001");
    expect(result.current.mode.kind).toBe("readonly");
  });

  it("broadcast の resourceType / resourceId が異なる場合は無視", async () => {
    const { result } = renderHook(() => useEditSessionLegacy(LEGACY_OPTS));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    act(() => {
      fireBroadcast("lock.changed", {
        resourceType: "screen",
        resourceId: "other-resource",
        op: "acquired",
        ownerSessionId: "other-session",
        by: "other-session",
      });
    });

    expect(result.current.mode.kind).toBe("readonly");
  });

  describe("isDirtyForTab", () => {
    it("readonly モードでは false", async () => {
      const { result } = renderHook(() => useEditSessionLegacy(LEGACY_OPTS));
      await act(async () => { await Promise.resolve(); });
      await act(async () => { await Promise.resolve(); });

      expect(result.current.mode.kind).toBe("readonly");
      expect(result.current.isDirtyForTab).toBe(false);
    });

    it("editing モードでは true", async () => {
      (mcpBridge.getLock as ReturnType<typeof vi.fn>).mockResolvedValue({ entry: { ownerSessionId: SESSION_ID } });

      const { result } = renderHook(() => useEditSessionLegacy(LEGACY_OPTS));
      await act(async () => { await Promise.resolve(); });
      await act(async () => { await Promise.resolve(); });

      expect(result.current.mode.kind).toBe("editing");
      expect(result.current.isDirtyForTab).toBe(true);
    });
  });

  // ── Phase 2 / Phase 6 追加テスト (#886 Phase 8) ────────────────────────────

  describe("LockConflictError → viewer fallback (#878 Phase 2)", () => {
    it("startEditing: ロック競合エラー → subscribeAsViewer 成功 → mode viewer", async () => {
      (mcpBridge.acquireLock as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("既に他のセッションがロック中"),
      );
      (mcpBridge.request as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const { result } = renderHook(() => useEditSessionLegacy(LEGACY_OPTS));
      await act(async () => { await Promise.resolve(); });
      await act(async () => { await Promise.resolve(); });

      await act(async () => {
        await result.current.actions.startEditing();
      });

      expect(mcpBridge.request).toHaveBeenCalledWith("lock.subscribeAsViewer", {
        resourceType: "table",
        resourceId: "tbl-001",
      });
      expect(result.current.mode.kind).toBe("viewer");
    });

    it("startEditing: ロック競合エラー → subscribeAsViewer も失敗 → mode locked-by-other", async () => {
      (mcpBridge.getLock as ReturnType<typeof vi.fn>).mockResolvedValue({
        entry: { ownerSessionId: "other-session" },
      });
      (mcpBridge.acquireLock as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("既に他のセッションがロック中"),
      );
      (mcpBridge.request as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("subscribeAsViewer failed"),
      );

      const { result } = renderHook(() => useEditSessionLegacy(LEGACY_OPTS));
      await act(async () => { await Promise.resolve(); });
      await act(async () => { await Promise.resolve(); });

      expect(result.current.mode.kind).toBe("locked-by-other");

      await act(async () => {
        await result.current.actions.startEditing();
      });

      expect(result.current.mode.kind).toBe("locked-by-other");
    });

    it("viewer mode の unmount cleanup で unsubscribeViewer が呼ばれる", async () => {
      (mcpBridge.acquireLock as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("既に他のセッションがロック中"),
      );
      (mcpBridge.request as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const { result, unmount } = renderHook(() => useEditSessionLegacy(LEGACY_OPTS));
      await act(async () => { await Promise.resolve(); });
      await act(async () => { await Promise.resolve(); });

      await act(async () => {
        await result.current.actions.startEditing();
      });

      expect(result.current.mode.kind).toBe("viewer");

      unmount();

      const requestCalls = (mcpBridge.request as ReturnType<typeof vi.fn>).mock.calls;
      const unsubCall = requestCalls.find(
        (args: unknown[]) => args[0] === "lock.unsubscribeViewer",
      );
      expect(unsubCall).toBeDefined();
    });
  });

  describe("lock.changed transferred — mode 自動切替 (#884 Phase 6)", () => {
    it("transferred: previousOwner = self → mode viewer に自動 fallback + subscribeAsViewer 呼び出し", async () => {
      (mcpBridge.getLock as ReturnType<typeof vi.fn>).mockResolvedValue({
        entry: { ownerSessionId: SESSION_ID },
      });

      const { result } = renderHook(() => useEditSessionLegacy(LEGACY_OPTS));
      await act(async () => { await Promise.resolve(); });
      await act(async () => { await Promise.resolve(); });

      expect(result.current.mode.kind).toBe("editing");

      act(() => {
        fireBroadcast("lock.changed", {
          resourceType: "table",
          resourceId: "tbl-001",
          op: "transferred",
          ownerSessionId: "new-owner-session",
          by: "new-owner-session",
          previousOwner: SESSION_ID,
        });
      });

      expect(result.current.mode.kind).toBe("viewer");
      expect(mcpBridge.request).toHaveBeenCalledWith("lock.subscribeAsViewer", {
        resourceType: "table",
        resourceId: "tbl-001",
      });
    });

    it("transferred: newOwner = self → mode editing に自動 promote", async () => {
      (mcpBridge.acquireLock as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("既に他のセッションがロック中"),
      );
      (mcpBridge.request as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const { result } = renderHook(() => useEditSessionLegacy(LEGACY_OPTS));
      await act(async () => { await Promise.resolve(); });
      await act(async () => { await Promise.resolve(); });

      await act(async () => {
        await result.current.actions.startEditing();
      });

      expect(result.current.mode.kind).toBe("viewer");

      act(() => {
        fireBroadcast("lock.changed", {
          resourceType: "table",
          resourceId: "tbl-001",
          op: "transferred",
          ownerSessionId: SESSION_ID,
          by: SESSION_ID,
          previousOwner: "old-owner-session",
        });
      });

      expect(result.current.mode.kind).toBe("editing");
    });

    it("transferred: 自分と無関係な場合は mode 変更なし", async () => {
      const { result } = renderHook(() => useEditSessionLegacy(LEGACY_OPTS));
      await act(async () => { await Promise.resolve(); });
      await act(async () => { await Promise.resolve(); });

      expect(result.current.mode.kind).toBe("readonly");

      act(() => {
        fireBroadcast("lock.changed", {
          resourceType: "table",
          resourceId: "tbl-001",
          op: "transferred",
          ownerSessionId: "bob-session",
          by: "bob-session",
          previousOwner: "alice-session",
        });
      });

      expect(result.current.mode.kind).toBe("readonly");
    });
  });
});
