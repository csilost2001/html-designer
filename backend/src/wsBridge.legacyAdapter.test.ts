/**
 * wsBridge.legacyAdapter.test.ts (#901 / meta #897 Phase 4)
 *
 * 旧 lock.* / draft.* API の deprecation 経路で並行運用するための adapter 層の検証。
 *
 * テスト方針:
 * - WsBridge は WebSocket/HTTP サーバを起動するため直接テストしない
 * - EditSessionStore + legacyLockToEditSession マッピングの動作を直接検証
 * - "2 つの真実点を持たない" ことの確認:
 *   旧 lock.acquire 後に editSession.list が同 EditSession を返す (最重要)
 *
 * 6+ 新規テストケース:
 * 1. lock.acquire adapter → editSessionStore.create が裏で呼ばれ EditSession が作られる + legacy key 登録
 * 2. lock.acquire adapter → console.warn deprecation log が呼ばれる
 * 3. lock.transferLock adapter → editSessionStore.transferEdit が裏で呼ばれる (Edit/View 交換)
 * 4. draft.update adapter → editSessionStore.update が裏で呼ばれる (sequence 増加)
 * 5. draft.commit adapter → editSessionStore.save が裏で呼ばれる (saveHistory 追加)
 * 6. draft.read adapter → editSessionStore.fetchCurrentPayload で取得した payload が response に含まれる
 * 7. 整合性: 旧 lock.acquire で acquire したリソースに、新 editSession.list が同 EditSession を返す
 *    (= 2 つの真実点を持たない確認、最重要)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  EditSessionStore,
} from "./editSessionStore.js";
import { _resetForTest as lockResetForTest } from "./lockManager.js";

// ── テスト共通セットアップ ──────────────────────────────────────────────────────

let tmpDir: string;
let store: EditSessionStore;

// legacyLockToEditSession マップ (WsBridge.legacyLockToEditSession 相当)
let legacyLockToEditSession: Map<string, string>;

// adapter ヘルパー関数 (WsBridge._legacyKey / _resolveEditSessionId 相当)
function _legacyKey(sessionId: string, resourceType: string, resourceId: string): string {
  return `${sessionId}::${resourceType}::${resourceId}`;
}

function _resolveEditSessionId(sessionId: string, resourceType: string, resourceId: string): string | null {
  return legacyLockToEditSession.get(_legacyKey(sessionId, resourceType, resourceId)) ?? null;
}

// broadcast イベントキャプチャ用
const capturedBroadcasts: Array<{ event: string; data: unknown }> = [];
function captureBroadcast(event: string, data: unknown): void {
  capturedBroadcasts.push({ event, data });
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ws-legacy-adapter-test-"));
  store = new EditSessionStore(tmpDir);
  legacyLockToEditSession = new Map();
  capturedBroadcasts.length = 0;
  lockResetForTest();
});

afterEach(async () => {
  vi.restoreAllMocks();
  try {
    await fs.rm(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

// ── adapter layer シミュレータ ──────────────────────────────────────────────────

/**
 * WsBridge.lock.acquire handler の adapter 部分をシミュレート。
 * WebSocket サーバに依存しない純粋ロジックのみ。
 */
async function simulateLockAcquire(
  clientId: string,
  resourceType: string,
  resourceId: string,
): Promise<{ entry: unknown; editSessionId: string | null; broadcastEvent: string | null }> {
  console.warn(`[Deprecated] lock.acquire is deprecated. Use editSession.create instead. Will be removed in Phase 6 (#903).`);

  // conflict チェック
  const existingSessions = store.listByResource(resourceType as never, resourceId).filter((s) => s.state === "Active");
  const editConflict = existingSessions.find((s) =>
    Array.from(s.participants.values()).some((p) => p.role === "Edit")
  );
  if (editConflict) {
    throw new Error(`${resourceType}:${resourceId} は既に Edit session が存在します`);
  }

  // EditSession 作成
  const session = store.create(clientId, resourceType as never, resourceId, clientId);
  legacyLockToEditSession.set(_legacyKey(clientId, resourceType, resourceId), session.id);

  const legacyEntry = {
    resourceType,
    resourceId,
    ownerSessionId: clientId,
    actorSessionId: clientId,
    acquiredAt: session.createdAt,
  };

  // 旧 broadcast (シミュレート)
  captureBroadcast("lock.changed", { resourceType, resourceId, op: "acquired", ownerSessionId: clientId, by: clientId });

  return { entry: legacyEntry, editSessionId: session.id, broadcastEvent: "lock.changed" };
}

/**
 * WsBridge.lock.transferLock handler の adapter 部分をシミュレート。
 */
async function simulateLockTransferLock(
  fromSessionId: string,
  toSessionId: string,
  resourceType: string,
  resourceId: string,
): Promise<{ transferred: boolean; editSessionId: string | null }> {
  console.warn(`[Deprecated] lock.transferLock is deprecated. Use editSession.transferEdit instead. Will be removed in Phase 6 (#903).`);

  const editSessionId = _resolveEditSessionId(fromSessionId, resourceType, resourceId);
  if (!editSessionId) {
    throw new Error(`lock.transferLock: EditSession が見つかりません`);
  }

  // attachAsView して transferEdit
  const session = store.get(editSessionId);
  if (session && !session.participants.has(toSessionId)) {
    store.attachAsView(editSessionId, toSessionId, toSessionId);
  }
  store.transferEdit(fromSessionId, toSessionId, editSessionId);

  // マッピング更新
  legacyLockToEditSession.delete(_legacyKey(fromSessionId, resourceType, resourceId));
  legacyLockToEditSession.set(_legacyKey(toSessionId, resourceType, resourceId), editSessionId);

  // 旧 broadcast
  captureBroadcast("lock.changed", { resourceType, resourceId, op: "transferred", ownerSessionId: toSessionId, by: toSessionId, previousOwner: fromSessionId });

  return { transferred: true, editSessionId };
}

/**
 * WsBridge.draft.update handler の adapter 部分をシミュレート。
 */
function simulateDraftUpdate(
  clientId: string,
  resourceType: string,
  resourceId: string,
  payload: unknown,
): { updated: boolean; sequence: number } {
  console.warn(`[Deprecated] draft.update is deprecated. Use editSession.update instead. Will be removed in Phase 6 (#903).`);

  const editSessionId = _resolveEditSessionId(clientId, resourceType, resourceId);
  if (!editSessionId) {
    throw new Error(`draft.update: EditSession が見つかりません (clientId=${clientId}, ${resourceType}:${resourceId})`);
  }

  const { sequence } = store.update(editSessionId, payload, clientId);

  // 旧 broadcast (opaque envelope 透過)
  captureBroadcast("draft.changed", { type: resourceType, id: resourceId, op: "updated", sequence, payload, senderSessionId: clientId });

  return { updated: true, sequence };
}

/**
 * WsBridge.draft.commit handler の adapter 部分をシミュレート。
 */
async function simulateDraftCommit(
  clientId: string,
  resourceType: string,
  resourceId: string,
): Promise<{ committed: boolean; saveEvent: unknown }> {
  console.warn(`[Deprecated] draft.commit is deprecated. Use editSession.save instead. Will be removed in Phase 6 (#903).`);

  const editSessionId = _resolveEditSessionId(clientId, resourceType, resourceId);
  if (!editSessionId) {
    throw new Error(`draft.commit: EditSession が見つかりません`);
  }

  const saveEvent = await store.save(editSessionId, clientId);

  // 旧 broadcast
  captureBroadcast("draft.changed", { type: resourceType, id: resourceId, op: "committed" });

  return { committed: true, saveEvent };
}

/**
 * WsBridge.draft.read handler の adapter 部分をシミュレート。
 */
function simulateDraftRead(
  clientId: string,
  resourceType: string,
  resourceId: string,
): { payload: unknown; exists: boolean } {
  console.warn(`[Deprecated] draft.read is deprecated. Use editSession.fetchPayload instead. Will be removed in Phase 6 (#903).`);

  const editSessionId = _resolveEditSessionId(clientId, resourceType, resourceId);
  if (!editSessionId) {
    return { payload: null, exists: false };
  }

  const result = store.fetchCurrentPayload(editSessionId);
  return { payload: result?.payload ?? null, exists: result?.payload !== null && result !== null };
}

// ── テストケース ────────────────────────────────────────────────────────────────

// ── 1. lock.acquire adapter → EditSession 作成 + legacy key 登録 ───────────────

describe("lock.acquire adapter", () => {
  it("EditSession が作成され legacyLockToEditSession に登録される", async () => {
    const result = await simulateLockAcquire("client-A", "process-flow", "pf-1");

    // EditSession が作成されていることを確認
    expect(result.editSessionId).not.toBeNull();
    const session = store.get(result.editSessionId!);
    expect(session).not.toBeNull();
    expect(session?.resourceType).toBe("process-flow");
    expect(session?.resourceId).toBe("pf-1");
    expect(session?.state).toBe("Active");

    // initial Edit participant が登録されている
    const participants = Array.from(session!.participants.values());
    expect(participants).toHaveLength(1);
    expect(participants[0].sessionId).toBe("client-A");
    expect(participants[0].role).toBe("Edit");

    // legacyLockToEditSession に登録されている
    const key = _legacyKey("client-A", "process-flow", "pf-1");
    expect(legacyLockToEditSession.has(key)).toBe(true);
    expect(legacyLockToEditSession.get(key)).toBe(result.editSessionId);
  });

  it("旧 lock.changed op:'acquired' broadcast が発火される", async () => {
    await simulateLockAcquire("client-A", "process-flow", "pf-1");

    const lockChangedBroadcast = capturedBroadcasts.find((b) => b.event === "lock.changed");
    expect(lockChangedBroadcast).not.toBeUndefined();
    expect((lockChangedBroadcast!.data as Record<string, unknown>).op).toBe("acquired");
    expect((lockChangedBroadcast!.data as Record<string, unknown>).resourceType).toBe("process-flow");
    expect((lockChangedBroadcast!.data as Record<string, unknown>).ownerSessionId).toBe("client-A");
  });

  it("legacy entry の response shape が旧 lock.acquire と互換 (resourceType / resourceId / ownerSessionId / acquiredAt)", async () => {
    const result = await simulateLockAcquire("client-A", "process-flow", "pf-1");
    const entry = result.entry as Record<string, unknown>;

    expect(entry.resourceType).toBe("process-flow");
    expect(entry.resourceId).toBe("pf-1");
    expect(entry.ownerSessionId).toBe("client-A");
    expect(typeof entry.acquiredAt).toBe("string");
  });
});

// ── 2. console.warn deprecation log ──────────────────────────────────────────

describe("deprecation log (console.warn)", () => {
  it("lock.acquire は console.warn deprecation log を呼ぶ", async () => {
    const warnSpy = vi.spyOn(console, "warn");
    await simulateLockAcquire("client-A", "table", "tbl-1");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[Deprecated] lock.acquire is deprecated"),
    );
  });

  it("draft.update は console.warn deprecation log を呼ぶ", async () => {
    const warnSpy = vi.spyOn(console, "warn");
    await simulateLockAcquire("client-A", "table", "tbl-1");
    warnSpy.mockClear();
    simulateDraftUpdate("client-A", "table", "tbl-1", { v: 1 });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[Deprecated] draft.update is deprecated"),
    );
  });
});

// ── 3. lock.transferLock adapter → editSessionStore.transferEdit ─────────────

describe("lock.transferLock adapter", () => {
  it("EditSession の Edit/View が atomic に交換される + 旧 lock.changed op:'transferred' 発火", async () => {
    // まず lock.acquire で EditSession を作成
    await simulateLockAcquire("client-A", "process-flow", "pf-1");
    const editSessionId = _resolveEditSessionId("client-A", "process-flow", "pf-1");
    expect(editSessionId).not.toBeNull();

    capturedBroadcasts.length = 0; // broadcast をリセット

    // lock.transferLock で client-B に転送
    const result = await simulateLockTransferLock("client-A", "client-B", "process-flow", "pf-1");
    expect(result.transferred).toBe(true);

    // EditSession で role が交換されている
    const session = store.get(editSessionId!);
    expect(session).not.toBeNull();
    const aParticipant = session!.participants.get("client-A");
    const bParticipant = session!.participants.get("client-B");
    expect(aParticipant?.role).toBe("View"); // client-A: Edit → View
    expect(bParticipant?.role).toBe("Edit"); // client-B: View → Edit (take-over)

    // マッピングが更新されている
    expect(_resolveEditSessionId("client-A", "process-flow", "pf-1")).toBeNull();
    expect(_resolveEditSessionId("client-B", "process-flow", "pf-1")).toBe(editSessionId);

    // 旧 broadcast event が発火されている
    const broadcast = capturedBroadcasts.find((b) => b.event === "lock.changed");
    expect(broadcast).not.toBeUndefined();
    expect((broadcast!.data as Record<string, unknown>).op).toBe("transferred");
    expect((broadcast!.data as Record<string, unknown>).ownerSessionId).toBe("client-B");
    expect((broadcast!.data as Record<string, unknown>).previousOwner).toBe("client-A");
  });
});

// ── 4. draft.update adapter → editSessionStore.update (sequence 増加) ─────────

describe("draft.update adapter", () => {
  it("EditSession の payload と sequence が更新される + 旧 draft.changed op:'updated' 発火", async () => {
    await simulateLockAcquire("client-A", "screen", "scr-1");

    capturedBroadcasts.length = 0;
    const opaquePayload = { componentTree: { root: "div", children: [] } };
    const result = simulateDraftUpdate("client-A", "screen", "scr-1", opaquePayload);

    expect(result.updated).toBe(true);
    expect(result.sequence).toBe(1);

    // EditSession の payload と sequence が更新されている
    const editSessionId = _resolveEditSessionId("client-A", "screen", "scr-1");
    const fetched = store.fetchCurrentPayload(editSessionId!);
    expect(fetched?.payload).toEqual(opaquePayload); // opaque: そのまま透過
    expect(fetched?.sequence).toBe(1);

    // 旧 broadcast event が発火されている
    const broadcast = capturedBroadcasts.find((b) => b.event === "draft.changed");
    expect(broadcast).not.toBeUndefined();
    const broadcastData = broadcast!.data as Record<string, unknown>;
    expect(broadcastData.op).toBe("updated");
    expect(broadcastData.sequence).toBe(1);
    expect(broadcastData.payload).toEqual(opaquePayload); // opaque 透過確認
    expect(broadcastData.senderSessionId).toBe("client-A");
  });

  it("update のたびに sequence が増加する", async () => {
    await simulateLockAcquire("client-A", "table", "tbl-1");

    const r1 = simulateDraftUpdate("client-A", "table", "tbl-1", { v: 1 });
    const r2 = simulateDraftUpdate("client-A", "table", "tbl-1", { v: 2 });
    expect(r1.sequence).toBe(1);
    expect(r2.sequence).toBe(2);
  });
});

// ── 5. draft.commit adapter → editSessionStore.save (saveHistory 追加) ─────────

describe("draft.commit adapter", () => {
  it("saveHistory に SaveEvent が追加される + 旧 draft.changed op:'committed' 発火", async () => {
    await simulateLockAcquire("client-A", "process-flow", "pf-2");
    simulateDraftUpdate("client-A", "process-flow", "pf-2", { steps: [] });

    capturedBroadcasts.length = 0;
    const result = await simulateDraftCommit("client-A", "process-flow", "pf-2");

    expect(result.committed).toBe(true);
    const saveEvent = result.saveEvent as Record<string, unknown>;
    expect(saveEvent.savedBy).toBe("client-A");
    expect(typeof saveEvent.savedAt).toBe("string");
    expect(saveEvent.sequence).toBe(1);

    // EditSession の saveHistory に追加されている
    const editSessionId = _resolveEditSessionId("client-A", "process-flow", "pf-2");
    const session = store.get(editSessionId!);
    expect(session?.saveHistory).toHaveLength(1);
    expect(session?.saveHistory[0].savedBy).toBe("client-A");

    // 旧 broadcast event が発火されている
    const broadcast = capturedBroadcasts.find((b) => b.event === "draft.changed");
    expect(broadcast).not.toBeUndefined();
    expect((broadcast!.data as Record<string, unknown>).op).toBe("committed");
  });
});

// ── 6. draft.read adapter → fetchCurrentPayload で payload を返す ──────────────

describe("draft.read adapter", () => {
  it("EditSession の最新 payload が response に含まれる", async () => {
    await simulateLockAcquire("client-A", "table", "tbl-2");
    const expectedPayload = { columns: ["id", "name"], rows: [] };
    simulateDraftUpdate("client-A", "table", "tbl-2", expectedPayload);

    const result = simulateDraftRead("client-A", "table", "tbl-2");
    expect(result.exists).toBe(true);
    expect(result.payload).toEqual(expectedPayload); // opaque: そのまま透過
  });

  it("EditSession が存在しない場合は payload: null, exists: false を返す", () => {
    const result = simulateDraftRead("client-X", "table", "unknown");
    expect(result.exists).toBe(false);
    expect(result.payload).toBeNull();
  });
});

// ── 7. 整合性: 旧 lock.acquire で取得したリソースが editSession.list で見える ─────

describe("整合性: 旧 lock.acquire と新 editSession.list の一致 (2 つの真実点を持たない確認)", () => {
  it("旧 lock.acquire で acquire したリソースの EditSession が listByResource / listAll で確認できる", async () => {
    // 旧 API 経由で acquire
    await simulateLockAcquire("client-A", "process-flow", "pf-100");

    // 新 API 相当の editSession.list (listByResource / listAll) で同 EditSession が返される
    const byResource = store.listByResource("process-flow", "pf-100");
    expect(byResource).toHaveLength(1);
    expect(byResource[0].state).toBe("Active");
    expect(byResource[0].resourceType).toBe("process-flow");
    expect(byResource[0].resourceId).toBe("pf-100");

    // Edit role の participant が client-A
    const editParticipant = Array.from(byResource[0].participants.values()).find((p) => p.role === "Edit");
    expect(editParticipant?.sessionId).toBe("client-A");

    // listAll にも含まれる (editSession.list 全件取得相当)
    const allSessions = store.listAll();
    const found = allSessions.find((s) => s.resourceType === "process-flow" && s.resourceId === "pf-100");
    expect(found).not.toBeUndefined();

    // 2 つの真実点がない: legacyLockToEditSession のマッピングが一意に解決される
    const resolvedId = _resolveEditSessionId("client-A", "process-flow", "pf-100");
    expect(resolvedId).toBe(byResource[0].id);
  });

  it("旧 lock.acquire → draft.update → draft.commit の全操作が同一 EditSession 上で完結する", async () => {
    await simulateLockAcquire("client-A", "screen", "scr-main");
    simulateDraftUpdate("client-A", "screen", "scr-main", { layout: "grid" });
    await simulateDraftCommit("client-A", "screen", "scr-main");

    // 同一 EditSession の saveHistory に記録されている
    const editSessionId = _resolveEditSessionId("client-A", "screen", "scr-main");
    const session = store.get(editSessionId!);
    expect(session).not.toBeNull();
    expect(session?.saveHistory).toHaveLength(1);
    expect(session?.saveHistory[0].sequence).toBe(1); // update 後の sequence

    // payload も同一 EditSession に存在する
    const fetched = store.fetchCurrentPayload(editSessionId!);
    expect(fetched?.payload).toEqual({ layout: "grid" });
  });

  it("同一リソースへの 2 回目の lock.acquire は Edit conflict で拒否される", async () => {
    await simulateLockAcquire("client-A", "process-flow", "pf-conflict");

    // 2 回目 acquire は conflict
    await expect(simulateLockAcquire("client-B", "process-flow", "pf-conflict")).rejects.toThrow();

    // EditSession はまだ 1 つ (client-A のもの) だけ
    const sessions = store.listByResource("process-flow", "pf-conflict");
    expect(sessions.filter((s) => s.state === "Active")).toHaveLength(1);
  });
});
