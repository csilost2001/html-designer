/**
 * presenceConfig.test.ts (#885 Phase 7)
 *
 * loadPresenceConfig の env override / 不正値 fallback / デフォルト値を検証する。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadPresenceConfig } from "./presenceConfig.js";

const ENV_KEYS = [
  "HARMONY_PRESENCE_LIVE_SEC",
  "HARMONY_PRESENCE_ACTIVE_SEC",
  "HARMONY_PRESENCE_IDLE_SEC",
  "HARMONY_PRESENCE_CLEANUP_INTERVAL_MS",
] as const;

function clearEnv(): void {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

beforeEach(clearEnv);
afterEach(clearEnv);

describe("loadPresenceConfig", () => {
  it("デフォルト値が正しく設定される", () => {
    const cfg = loadPresenceConfig();
    expect(cfg.liveThresholdSec).toBe(60);
    expect(cfg.activeThresholdSec).toBe(300);
    expect(cfg.idleThresholdSec).toBe(86400);
    expect(cfg.cleanupIntervalMs).toBe(3600000);
  });

  it("env override: 全フィールドを上書きできる", () => {
    process.env.HARMONY_PRESENCE_LIVE_SEC = "30";
    process.env.HARMONY_PRESENCE_ACTIVE_SEC = "120";
    process.env.HARMONY_PRESENCE_IDLE_SEC = "43200";
    process.env.HARMONY_PRESENCE_CLEANUP_INTERVAL_MS = "1800000";

    const cfg = loadPresenceConfig();
    expect(cfg.liveThresholdSec).toBe(30);
    expect(cfg.activeThresholdSec).toBe(120);
    expect(cfg.idleThresholdSec).toBe(43200);
    expect(cfg.cleanupIntervalMs).toBe(1800000);
  });

  it("env override: 一部フィールドのみ上書き、残りはデフォルト", () => {
    process.env.HARMONY_PRESENCE_LIVE_SEC = "10";

    const cfg = loadPresenceConfig();
    expect(cfg.liveThresholdSec).toBe(10);
    expect(cfg.activeThresholdSec).toBe(300); // デフォルト
    expect(cfg.idleThresholdSec).toBe(86400); // デフォルト
    expect(cfg.cleanupIntervalMs).toBe(3600000); // デフォルト
  });

  it("不正値 (非数値) は fallback してデフォルト値を使う", () => {
    process.env.HARMONY_PRESENCE_LIVE_SEC = "abc";
    process.env.HARMONY_PRESENCE_ACTIVE_SEC = "NaN";

    const cfg = loadPresenceConfig();
    expect(cfg.liveThresholdSec).toBe(60);
    expect(cfg.activeThresholdSec).toBe(300);
  });

  it("不正値 (0 以下) は fallback してデフォルト値を使う", () => {
    process.env.HARMONY_PRESENCE_LIVE_SEC = "0";
    process.env.HARMONY_PRESENCE_ACTIVE_SEC = "-100";

    const cfg = loadPresenceConfig();
    expect(cfg.liveThresholdSec).toBe(60);
    expect(cfg.activeThresholdSec).toBe(300);
  });

  it("不正値 (空文字) は fallback してデフォルト値を使う", () => {
    process.env.HARMONY_PRESENCE_LIVE_SEC = "";

    const cfg = loadPresenceConfig();
    expect(cfg.liveThresholdSec).toBe(60);
  });

  it("浮動小数点値は Number() で正の有限数なので採用される", () => {
    process.env.HARMONY_PRESENCE_LIVE_SEC = "45.5";

    const cfg = loadPresenceConfig();
    expect(cfg.liveThresholdSec).toBe(45.5);
  });
});
