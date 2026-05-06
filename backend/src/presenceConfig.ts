/**
 * presenceConfig.ts (#885 Phase 7)
 *
 * presence activity threshold を環境変数 (HARMONY_PRESENCE_*) で上書き可能にする設定モジュール。
 * docs/spec/collab-presence.md § 9 (Activity taxonomy) の threshold に対応。
 */

export interface PresenceConfig {
  /** "live" 判定: lastEditAt からの経過秒数 (デフォルト 60s) */
  liveThresholdSec: number;
  /** "active" 判定: lastActivityAt からの経過秒数 (デフォルト 300s = 5min) */
  activeThresholdSec: number;
  /** "idle" 判定: lastActivityAt からの経過秒数 (デフォルト 86400s = 24h) */
  idleThresholdSec: number;
  /** cleanupAbandoned の定期実行間隔 ms (デフォルト 3600000ms = 1h) */
  cleanupIntervalMs: number;
}

const DEFAULTS: PresenceConfig = {
  liveThresholdSec: 60,
  activeThresholdSec: 300,
  idleThresholdSec: 86400,
  cleanupIntervalMs: 60 * 60 * 1000, // 1h
};

function readEnvNumber(name: string, def: number): number {
  const raw = process.env[name];
  if (!raw) return def;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return def;
  return n;
}

export function loadPresenceConfig(): PresenceConfig {
  return {
    liveThresholdSec: readEnvNumber("HARMONY_PRESENCE_LIVE_SEC", DEFAULTS.liveThresholdSec),
    activeThresholdSec: readEnvNumber("HARMONY_PRESENCE_ACTIVE_SEC", DEFAULTS.activeThresholdSec),
    idleThresholdSec: readEnvNumber("HARMONY_PRESENCE_IDLE_SEC", DEFAULTS.idleThresholdSec),
    cleanupIntervalMs: readEnvNumber("HARMONY_PRESENCE_CLEANUP_INTERVAL_MS", DEFAULTS.cleanupIntervalMs),
  };
}

export const presenceConfig = loadPresenceConfig();
