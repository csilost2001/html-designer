/**
 * SessionBadge.test.tsx (#883 Phase 5)
 * RTL で各 level 表示 / 集計 / ホバー tooltip を検証する。
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SessionBadge } from "./SessionBadge";
import type { PresenceEntry } from "../../hooks/usePresenceRegistry";

// classifyActivity は実装をそのまま使う (pure function)
// usePresenceRegistry は SessionBadge が直接使わないのでモック不要

function makeEntry(overrides: Partial<PresenceEntry> = {}): PresenceEntry {
  return {
    sessionId: "sess-001",
    resourceType: "process-flow",
    resourceId: "pf-001",
    role: "editor",
    lastActivityAt: new Date().toISOString(),
    lastEditAt: new Date().toISOString(),
    focusAt: new Date().toISOString(),
    ownerLabel: null,
    ...overrides,
  };
}

function ago(seconds: number): string {
  return new Date(Date.now() - seconds * 1000).toISOString();
}

describe("SessionBadge", () => {
  it("entries が空なら何も描画しない", () => {
    const { container } = render(<SessionBadge entries={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("live entry 1 件 → 🟢 1 を表示", () => {
    const entry = makeEntry({ lastEditAt: ago(10), focusAt: new Date().toISOString() });
    render(<SessionBadge entries={[entry]} compact />);
    expect(screen.getByText(/🟢\s*1/u)).toBeDefined();
  });

  it("idle entry 1 件 → 🟡 1 を表示", () => {
    const entry = makeEntry({
      lastActivityAt: ago(3600), // 1h → idle
      lastEditAt: null,
      focusAt: null,
    });
    render(<SessionBadge entries={[entry]} compact />);
    expect(screen.getByText(/🟡\s*1/u)).toBeDefined();
  });

  it("abandoned entry 1 件 → ⚫ 1 を表示", () => {
    const entry = makeEntry({
      lastActivityAt: ago(172800), // 2 日 → abandoned
      lastEditAt: null,
      focusAt: null,
    });
    render(<SessionBadge entries={[entry]} compact />);
    expect(screen.getByText(/⚫\s*1/u)).toBeDefined();
  });

  it("live 1 件 + idle 1 件 → 合計 2、最活発が 🟢", () => {
    const liveEntry = makeEntry({
      sessionId: "sess-live",
      lastEditAt: ago(10),
      focusAt: new Date().toISOString(),
    });
    const idleEntry = makeEntry({
      sessionId: "sess-idle",
      lastActivityAt: ago(3600),
      lastEditAt: null,
      focusAt: null,
    });
    render(<SessionBadge entries={[liveEntry, idleEntry]} compact />);
    // 最活発 = live → 🟢、合計 2 件表示
    expect(screen.getByText(/🟢\s*2/u)).toBeDefined();
  });

  it("aria-label に件数が含まれる", () => {
    const entry = makeEntry({ lastEditAt: ago(10), focusAt: new Date().toISOString() });
    render(<SessionBadge entries={[entry]} />);
    const badge = screen.getByLabelText(/1 セッション/u);
    expect(badge).toBeDefined();
  });

  it("tooltip に ownerLabel が含まれる", () => {
    const entry = makeEntry({
      ownerLabel: "@ai (alice 代行)",
      lastEditAt: ago(10),
      focusAt: new Date().toISOString(),
    });
    render(<SessionBadge entries={[entry]} compact />);
    const badge = document.querySelector(".session-badge");
    expect(badge?.getAttribute("title")).toContain("@ai (alice 代行)");
  });

  it("ownerLabel がない場合は sessionId の短縮形が tooltip に含まれる", () => {
    const entry = makeEntry({
      sessionId: "abcdefghij",
      ownerLabel: null,
      lastEditAt: ago(10),
      focusAt: new Date().toISOString(),
    });
    render(<SessionBadge entries={[entry]} compact />);
    const badge = document.querySelector(".session-badge");
    // sessionId 最初の 8 文字
    expect(badge?.getAttribute("title")).toContain("abcdefgh");
  });

  it("compact=false では detail クラスが付く", () => {
    const entry = makeEntry({ lastEditAt: ago(10), focusAt: new Date().toISOString() });
    render(<SessionBadge entries={[entry]} compact={false} />);
    const badge = document.querySelector(".session-badge--detail");
    expect(badge).toBeDefined();
  });
});
