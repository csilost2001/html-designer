/**
 * SessionBadge.tsx (#883 Phase 5)
 *
 * リソース一覧画面で presence entry を集約表示するバッジ。
 * docs/spec/collab-presence.md § 9 (Activity taxonomy) に基づき、
 * classifyActivity で 5 段階 level に分類し最活発 level を表示する。
 *
 * Phase 7 (#885) で threshold が env config 化されるまで hardcode 値を使用。
 */
import { useMemo } from "react";
import { classifyActivity, type ActivityLevel, type PresenceEntry } from "../../hooks/usePresenceRegistry";

// ── level → 絵文字マッピング ─────────────────────────────────────────────────

const LEVEL_EMOJI: Record<ActivityLevel, string> = {
  live: "🟢",
  active: "🟢",
  idle: "🟡",
  stale: "⚫",
  abandoned: "⚫",
};

/** 最活発 level を優先するための順序 (小さいほど高優先) */
const LEVEL_ORDER: Record<ActivityLevel, number> = {
  live: 0,
  active: 1,
  idle: 2,
  stale: 3,
  abandoned: 4,
};

// ── SessionBadge ─────────────────────────────────────────────────────────────

export interface SessionBadgeProps {
  /** 該当リソースの全 PresenceEntry (editor + viewer 含む) */
  entries: PresenceEntry[];
  /** true なら "🟢 3" だけ、false なら詳細 tooltip のみ */
  compact?: boolean;
}

interface LevelSummary {
  level: ActivityLevel;
  count: number;
}

function summarize(entries: PresenceEntry[], now: Date): LevelSummary[] {
  const counts = new Map<ActivityLevel, number>();
  for (const entry of entries) {
    const level = classifyActivity(entry, now);
    counts.set(level, (counts.get(level) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([level, count]) => ({ level, count }))
    .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}

function relativeTime(isoString: string, now: Date): string {
  const diffMs = now.getTime() - new Date(isoString).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec} 秒前`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} 分前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 時間前`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay} 日前`;
}

function buildTooltip(entries: PresenceEntry[], now: Date): string {
  if (entries.length === 0) return "";
  return entries
    .map((e) => {
      const label = e.ownerLabel ?? e.sessionId.slice(0, 8) + "...";
      const ago = relativeTime(e.lastActivityAt, now);
      const roleLabel = e.role === "editor" ? "編集" : "閲覧";
      return `${label} (${roleLabel}、${ago})`;
    })
    .join("\n");
}

export function SessionBadge({ entries, compact = true }: SessionBadgeProps) {
  const now = useMemo(() => new Date(), []);
  const summary = useMemo(() => summarize(entries, now), [entries, now]);
  const totalCount = entries.length;
  const tooltip = useMemo(() => buildTooltip(entries, now), [entries, now]);

  if (entries.length === 0) return null;

  // 最活発 level を代表として使用
  const topLevel = summary[0]?.level ?? "idle";
  const emoji = LEVEL_EMOJI[topLevel];

  const ariaLabel = `編集中 ${totalCount} セッション`;

  if (compact) {
    return (
      <span
        className="session-badge session-badge--compact"
        title={tooltip}
        aria-label={ariaLabel}
      >
        {emoji} {totalCount}
      </span>
    );
  }

  // 詳細表示: level 別件数を列挙
  return (
    <span
      className="session-badge session-badge--detail"
      title={tooltip}
      aria-label={ariaLabel}
    >
      {summary.map(({ level, count }) => (
        <span key={level} className={`session-badge-level session-badge-level--${level}`}>
          {LEVEL_EMOJI[level]} {count}
        </span>
      ))}
    </span>
  );
}
