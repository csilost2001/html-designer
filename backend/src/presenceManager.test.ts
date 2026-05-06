import { describe, it, expect, beforeEach } from "vitest";
import {
  registerEditor,
  registerViewer,
  unregister,
  heartbeat,
  list,
  cleanupStale,
  _resetForTest,
} from "./presenceManager.js";

beforeEach(() => {
  _resetForTest();
});

// ── registerEditor ──────────────────────────────────────────────────────────

describe("registerEditor", () => {
  it("editor エントリを登録できる", () => {
    const entry = registerEditor("ws-1", "sess-A", "table", "tbl-1");
    expect(entry.sessionId).toBe("sess-A");
    expect(entry.resourceType).toBe("table");
    expect(entry.resourceId).toBe("tbl-1");
    expect(entry.role).toBe("editor");
    expect(typeof entry.lastActivityAt).toBe("string");
    expect(entry.lastEditAt).toBeNull();
    expect(entry.focusAt).not.toBeNull();
    expect(entry.ownerLabel).toBeNull();
  });

  it("ownerLabel を指定できる (AI 借受)", () => {
    const entry = registerEditor("ws-1", "sess-AI", "table", "tbl-1", "@ai (alice 代行)");
    expect(entry.ownerLabel).toBe("@ai (alice 代行)");
  });

  it("重複登録は既存エントリを update する (新規追加ではない)", () => {
    registerEditor("ws-1", "sess-A", "table", "tbl-1");
    const second = registerEditor("ws-1", "sess-A", "table", "tbl-1", "@ai");
    expect(second.role).toBe("editor");
    expect(second.ownerLabel).toBe("@ai");
    // list に 1 件のみ
    const entries = list("ws-1", "table", "tbl-1");
    expect(entries).toHaveLength(1);
  });

  it("viewer から editor に role を更新できる", () => {
    registerViewer("ws-1", "sess-A", "table", "tbl-1");
    const updated = registerEditor("ws-1", "sess-A", "table", "tbl-1");
    expect(updated.role).toBe("editor");
    expect(list("ws-1", "table", "tbl-1")).toHaveLength(1);
  });
});

// ── registerViewer ──────────────────────────────────────────────────────────

describe("registerViewer", () => {
  it("viewer エントリを登録できる", () => {
    const entry = registerViewer("ws-1", "sess-B", "screen", "scr-1");
    expect(entry.role).toBe("viewer");
    expect(entry.sessionId).toBe("sess-B");
    expect(entry.resourceType).toBe("screen");
    expect(entry.resourceId).toBe("scr-1");
    expect(entry.ownerLabel).toBeNull();
  });

  it("重複登録は既存エントリを update する", () => {
    registerViewer("ws-1", "sess-B", "screen", "scr-1");
    registerViewer("ws-1", "sess-B", "screen", "scr-1");
    expect(list("ws-1", "screen", "scr-1")).toHaveLength(1);
  });
});

// ── unregister ──────────────────────────────────────────────────────────────

describe("unregister", () => {
  it("登録済みエントリを解除できる", () => {
    registerEditor("ws-1", "sess-A", "table", "tbl-1");
    unregister("ws-1", "sess-A", "table", "tbl-1");
    expect(list("ws-1", "table", "tbl-1")).toHaveLength(0);
  });

  it("存在しないエントリの unregister はエラーにならない", () => {
    expect(() => unregister("ws-1", "sess-X", "table", "tbl-1")).not.toThrow();
  });

  it("unregister は同一 wsId + resource のみ削除する", () => {
    registerEditor("ws-1", "sess-A", "table", "tbl-1");
    registerEditor("ws-1", "sess-B", "table", "tbl-1");
    unregister("ws-1", "sess-A", "table", "tbl-1");
    const remaining = list("ws-1", "table", "tbl-1");
    expect(remaining).toHaveLength(1);
    expect(remaining[0].sessionId).toBe("sess-B");
  });
});

// ── heartbeat ───────────────────────────────────────────────────────────────

describe("heartbeat", () => {
  it("kind=activity で lastActivityAt を更新する", async () => {
    registerEditor("ws-1", "sess-A", "process-flow", "pf-1");
    const before = list("ws-1", "process-flow", "pf-1")[0].lastActivityAt;
    // 1ms 待機して時刻を確実にずらす
    await new Promise((r) => setTimeout(r, 2));
    const result = heartbeat("ws-1", "sess-A", "process-flow", "pf-1", "activity");
    expect(result.entry.lastActivityAt >= before).toBe(true);
    expect(result.entry.lastEditAt).toBeNull();
  });

  it("kind=edit で lastEditAt も更新する", async () => {
    registerEditor("ws-1", "sess-A", "process-flow", "pf-1");
    await new Promise((r) => setTimeout(r, 2));
    const result = heartbeat("ws-1", "sess-A", "process-flow", "pf-1", "edit");
    expect(result.entry.lastEditAt).not.toBeNull();
    expect(result.entry.lastActivityAt).toBe(result.entry.lastEditAt);
  });

  it("kind=edit は lastEditAt を now に設定し、kind=activity は lastEditAt を変更しない", async () => {
    registerEditor("ws-1", "sess-A", "table", "tbl-1");
    const editResult = heartbeat("ws-1", "sess-A", "table", "tbl-1", "edit");
    const editAt = editResult.entry.lastEditAt;
    expect(editAt).not.toBeNull();
    await new Promise((r) => setTimeout(r, 2));
    const actResult = heartbeat("ws-1", "sess-A", "table", "tbl-1", "activity");
    // activity は lastEditAt を変えない
    expect(actResult.entry.lastEditAt).toBe(editAt);
    // lastActivityAt は更新される
    expect(actResult.entry.lastActivityAt > actResult.entry.lastEditAt!).toBe(true);
  });

  it("未登録セッションの heartbeat は auto-register (viewer として)", () => {
    const result = heartbeat("ws-1", "sess-new", "screen", "scr-1", "activity");
    expect(result.entry.role).toBe("viewer");
    expect(list("ws-1", "screen", "scr-1")).toHaveLength(1);
  });

  it("changed フラグが返される", () => {
    registerEditor("ws-1", "sess-A", "table", "tbl-1");
    const result = heartbeat("ws-1", "sess-A", "table", "tbl-1", "activity");
    expect(typeof result.changed).toBe("boolean");
  });
});

// ── list ────────────────────────────────────────────────────────────────────

describe("list", () => {
  it("wsId + resource scope でフィルタする", () => {
    // ws-1 に 2 件 (tbl-1 / tbl-2)
    registerEditor("ws-1", "sess-A", "table", "tbl-1");
    registerViewer("ws-1", "sess-B", "table", "tbl-2");
    // ws-2 に 1 件
    registerEditor("ws-2", "sess-C", "table", "tbl-1");

    const result = list("ws-1", "table", "tbl-1");
    expect(result).toHaveLength(1);
    expect(result[0].sessionId).toBe("sess-A");
  });

  it("エントリが無い場合は空配列を返す", () => {
    expect(list("ws-999", "table", "tbl-none")).toEqual([]);
  });

  it("複数 session が同一リソースを参照している場合は全件返す", () => {
    registerEditor("ws-1", "sess-A", "table", "tbl-1");
    registerViewer("ws-1", "sess-B", "table", "tbl-1");
    registerViewer("ws-1", "sess-C", "table", "tbl-1");
    expect(list("ws-1", "table", "tbl-1")).toHaveLength(3);
  });

  it("resourceType の違いは独立してフィルタされる", () => {
    registerEditor("ws-1", "sess-A", "table", "res-1");
    registerViewer("ws-1", "sess-B", "screen", "res-1");
    expect(list("ws-1", "table", "res-1")).toHaveLength(1);
    expect(list("ws-1", "screen", "res-1")).toHaveLength(1);
  });
});

// ── cleanupStale ─────────────────────────────────────────────────────────────

describe("cleanupStale", () => {
  it("threshold を超えた entry のみ削除する", async () => {
    registerEditor("ws-1", "sess-A", "table", "tbl-1");
    registerViewer("ws-1", "sess-B", "table", "tbl-2");

    // 1000 秒 threshold → どちらも残る
    const removedLong = cleanupStale(1000);
    expect(removedLong).toHaveLength(0);
    expect(list("ws-1", "table", "tbl-1")).toHaveLength(1);

    // 登録から少し時間を置いてから threshold=0 (負値) で全削除
    await new Promise((r) => setTimeout(r, 5));
    // threshold=-1 は cutoff = now + 1000ms → 全エントリが cutoff より古い
    const removedAll = cleanupStale(-1);
    expect(removedAll).toHaveLength(2);
    expect(list("ws-1", "table", "tbl-1")).toHaveLength(0);
    expect(list("ws-1", "table", "tbl-2")).toHaveLength(0);
  });

  it("削除された entry の配列を返す", async () => {
    registerEditor("ws-1", "sess-A", "table", "tbl-1");
    await new Promise((r) => setTimeout(r, 5));
    // threshold=-1: cutoff = now + 1s → 全エントリが cutoff より古い
    const removed = cleanupStale(-1);
    expect(removed.length).toBeGreaterThan(0);
    expect(removed[0].sessionId).toBe("sess-A");
  });

  it("stale でないエントリは残す", async () => {
    registerEditor("ws-1", "sess-A", "table", "tbl-1");
    await new Promise((r) => setTimeout(r, 2));
    registerViewer("ws-1", "sess-B", "table", "tbl-2");
    // threshold 1 秒: どちらも 1 秒以内なので残る
    const removed = cleanupStale(1);
    expect(removed).toHaveLength(0);
  });
});
