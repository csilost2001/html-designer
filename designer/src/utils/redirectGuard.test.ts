import { describe, it, expect, beforeEach } from "vitest";
import { checkRedirect, isRedirectGuardTripped, resetRedirectGuard } from "./redirectGuard";

describe("redirectGuard", () => {
  beforeEach(() => resetRedirectGuard());

  it("通常使用 (1 navigation) は allow=true", () => {
    const r = checkRedirect("/foo");
    expect(r.allow).toBe(true);
    expect(r.tripped).toBe(false);
    expect(r.recentCount).toBe(1);
  });

  it("MAX_REDIRECTS (20) 以下なら全て allow", () => {
    for (let i = 0; i < 20; i++) {
      const r = checkRedirect(`/p${i}`);
      expect(r.allow).toBe(true);
      expect(r.tripped).toBe(false);
    }
  });

  it("MAX_REDIRECTS を超えると trip して block", () => {
    for (let i = 0; i < 20; i++) checkRedirect(`/p${i}`);
    const r21 = checkRedirect("/p21");
    expect(r21.allow).toBe(false);
    expect(r21.tripped).toBe(true);
    expect(isRedirectGuardTripped()).toBe(true);
  });

  it("trip 後は以降の navigation を全て block", () => {
    for (let i = 0; i < 25; i++) checkRedirect(`/p${i}`);
    const r = checkRedirect("/extra");
    expect(r.allow).toBe(false);
    expect(r.tripped).toBe(false); // 既に trip 済 (今回が初 trip ではない)
  });

  it("WINDOW_MS 以上の間隔があれば古いイベントは廃棄", async () => {
    // 19 件積む
    for (let i = 0; i < 19; i++) checkRedirect(`/p${i}`);
    // 2 秒経過させる
    await new Promise((r) => setTimeout(r, 2100));
    // 古い 19 件は廃棄、新規 1 件のみ
    const r = checkRedirect("/fresh");
    expect(r.allow).toBe(true);
    expect(r.recentCount).toBe(1);
  });

  it("resetRedirectGuard() で完全リセット", () => {
    for (let i = 0; i < 25; i++) checkRedirect(`/p${i}`);
    expect(isRedirectGuardTripped()).toBe(true);
    resetRedirectGuard();
    expect(isRedirectGuardTripped()).toBe(false);
    const r = checkRedirect("/after-reset");
    expect(r.allow).toBe(true);
  });
});
