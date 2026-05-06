/**
 * classifyActivity.test.ts (#883 Phase 5)
 *
 * classifyActivity helper の境界値テスト。
 * docs/spec/collab-presence.md § 9 (Activity taxonomy) に準拠。
 */
import { describe, it, expect } from "vitest";
import { classifyActivity } from "./usePresenceRegistry";
import type { PresenceEntry } from "./usePresenceRegistry";

function makeEntry(overrides: Partial<PresenceEntry> = {}): PresenceEntry {
  return {
    sessionId: "sess-001",
    resourceType: "process-flow",
    resourceId: "pf-001",
    role: "editor",
    lastActivityAt: new Date().toISOString(),
    lastEditAt: null,
    focusAt: new Date().toISOString(),
    ownerLabel: null,
    ...overrides,
  };
}

function ago(seconds: number): string {
  return new Date(Date.now() - seconds * 1000).toISOString();
}

describe("classifyActivity", () => {
  describe("live — focusAt 非 null かつ lastEditAt が 60 秒以内", () => {
    it("lastEditAt が 59 秒前 → live", () => {
      const entry = makeEntry({ lastEditAt: ago(59), focusAt: new Date().toISOString() });
      expect(classifyActivity(entry)).toBe("live");
    });

    it("lastEditAt がちょうど 60 秒 → live ではなく active", () => {
      const entry = makeEntry({ lastEditAt: ago(60), focusAt: new Date().toISOString() });
      // editAge = 60 → live 条件 (< 60) を外れる
      expect(classifyActivity(entry)).toBe("active");
    });
  });

  describe("active — focusAt 非 null かつ lastActivityAt が 300 秒 (5 分) 以内", () => {
    it("lastActivityAt が 299 秒前、lastEditAt null → active", () => {
      const entry = makeEntry({ lastActivityAt: ago(299), lastEditAt: null, focusAt: new Date().toISOString() });
      expect(classifyActivity(entry)).toBe("active");
    });

    it("lastActivityAt がちょうど 300 秒 → idle", () => {
      const entry = makeEntry({ lastActivityAt: ago(300), lastEditAt: null, focusAt: new Date().toISOString() });
      expect(classifyActivity(entry)).toBe("idle");
    });
  });

  describe("idle — lastActivityAt が 86400 秒 (24h) 以内 (ws alive/dead 問わず)", () => {
    it("focusAt null、lastActivityAt が 1 時間前 → idle", () => {
      const entry = makeEntry({ lastActivityAt: ago(3600), lastEditAt: null, focusAt: null });
      expect(classifyActivity(entry)).toBe("idle");
    });

    it("lastActivityAt が 86399 秒 (23:59:59) 前 → idle", () => {
      const entry = makeEntry({ lastActivityAt: ago(86399), lastEditAt: null, focusAt: null });
      expect(classifyActivity(entry)).toBe("idle");
    });

    it("lastActivityAt がちょうど 86400 秒 (24h) → stale または abandoned", () => {
      // actAge >= 86400 なので idle 条件を外れる
      const entryAlive = makeEntry({ lastActivityAt: ago(86400), lastEditAt: null, focusAt: new Date().toISOString() });
      const entryDead = makeEntry({ lastActivityAt: ago(86400), lastEditAt: null, focusAt: null });
      expect(classifyActivity(entryAlive)).toBe("stale");
      expect(classifyActivity(entryDead)).toBe("abandoned");
    });
  });

  describe("stale — focusAt 非 null かつ actAge >= 86400", () => {
    it("focusAt 非 null、lastActivityAt が 2 日前 → stale", () => {
      const entry = makeEntry({ lastActivityAt: ago(172800), lastEditAt: null, focusAt: new Date().toISOString() });
      expect(classifyActivity(entry)).toBe("stale");
    });
  });

  describe("abandoned — focusAt null かつ actAge >= 86400", () => {
    it("focusAt null、lastActivityAt が 2 日前 → abandoned", () => {
      const entry = makeEntry({ lastActivityAt: ago(172800), lastEditAt: null, focusAt: null });
      expect(classifyActivity(entry)).toBe("abandoned");
    });
  });

  describe("now パラメータ", () => {
    it("now を明示指定して判定できる", () => {
      const base = new Date("2026-01-01T12:00:00Z");
      const entry: PresenceEntry = {
        sessionId: "sess-002",
        resourceType: "table",
        resourceId: "tbl-001",
        role: "viewer",
        lastActivityAt: new Date("2026-01-01T11:59:05Z").toISOString(), // 55 秒前
        lastEditAt: null,
        focusAt: new Date("2026-01-01T11:59:00Z").toISOString(),
        ownerLabel: null,
      };
      expect(classifyActivity(entry, base)).toBe("active");
    });
  });
});
