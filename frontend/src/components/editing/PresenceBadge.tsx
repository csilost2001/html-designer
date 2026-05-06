/**
 * PresenceBadge.tsx (#885 Phase 7)
 *
 * activity level を色 + テキストの二重表現で示す共通 badge component。
 * docs/spec/collab-presence.md § 9 (Activity taxonomy 5 段階) に準拠。
 *
 * - live / active → 🟢 操作中 (緑)
 * - idle          → 🟡 操作なし (黄)
 * - stale / abandoned → ⚫ 放置 (グレー)
 *
 * 色覚配慮: 色 + テキストの二重表現。
 * screen reader 対応: aria-label で "操作中、3 セッション" 等を通知。
 */
import type { ActivityLevel } from "../../hooks/usePresenceRegistry";

// ── level → 表示マッピング ────────────────────────────────────────────────────

const LEVEL_EMOJI: Record<ActivityLevel, string> = {
  live: "🟢",
  active: "🟢",
  idle: "🟡",
  stale: "⚫",
  abandoned: "⚫",
};

const LEVEL_TEXT: Record<ActivityLevel, string> = {
  live: "操作中",
  active: "操作中",
  idle: "操作なし",
  stale: "放置",
  abandoned: "放置",
};

const LEVEL_CSS_CLASS: Record<ActivityLevel, string> = {
  live: "presence-badge--live",
  active: "presence-badge--active",
  idle: "presence-badge--idle",
  stale: "presence-badge--stale",
  abandoned: "presence-badge--abandoned",
};

// ── Props ─────────────────────────────────────────────────────────────────────

export interface PresenceBadgeProps {
  level: ActivityLevel;
  /** 件数表示 (省略時は件数を表示しない) */
  count?: number;
  /** 補足テキスト表示の有無 (デフォルト true) */
  showText?: boolean;
  /** size variant (デフォルト "md") */
  size?: "sm" | "md";
}

// ── PresenceBadge ─────────────────────────────────────────────────────────────

export function PresenceBadge({
  level,
  count,
  showText = true,
  size = "md",
}: PresenceBadgeProps) {
  const emoji = LEVEL_EMOJI[level];
  const text = LEVEL_TEXT[level];
  const levelClass = LEVEL_CSS_CLASS[level];

  // aria-label の構築: "操作中、3 セッション" or "操作なし"
  const countPart = count !== undefined ? `、${count} セッション` : "";
  const ariaLabel = `${text}${countPart}`;

  return (
    <span
      className={`presence-badge ${levelClass} presence-badge--${size}`}
      aria-label={ariaLabel}
    >
      <span className="presence-badge__emoji" aria-hidden="true">
        {emoji}
      </span>
      {showText && (
        <span className="presence-badge__text">{text}</span>
      )}
      {count !== undefined && (
        <span className="presence-badge__count">{count}</span>
      )}
    </span>
  );
}
