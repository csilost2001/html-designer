/**
 * EditSessionDropdown.tsx (#882 Phase 4)
 *
 * エディタヘッダ用セッション切替プルダウン UI。
 * docs/spec/collab-presence.md § 5 (lock 状態遷移) / § 8 (Take-over フロー) に準拠。
 *
 * - 集約バッジ (closed): "📄 正規版" / "✏️ 編集中" / "👁 観察中"
 * - 展開: 各 PresenceEntry を 1 行表示 + アクションボタン
 * - [↪引継] は Phase 6 (#884) でアクティブ化予定 — 本 Phase では disabled + tooltip のみ
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { usePresenceFor, type PresenceEntry } from "../../hooks/usePresenceRegistry";
import { mcpBridge } from "../../mcp/mcpBridge";
import type { DraftResourceType } from "../../types/draft";
import type { EditMode } from "../../hooks/useEditSession";
import "../../styles/editSessionDropdown.css";

// ── 型 ──────────────────────────────────────────────────────────────────────

export interface EditSessionDropdownProps {
  resourceType: DraftResourceType;
  resourceId: string;
  currentMode: EditMode;
  currentSessionId: string;
  /** viewer として attach 後の callback (URL 更新等) */
  onViewerAttached?: (sessionId: string) => void;
  /** 新規 draft 作成 (startEditing 相当) */
  onStartEditing?: () => void;
}

// ── 相対時間 ─────────────────────────────────────────────────────────────────

function relativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec} 秒前`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} 分前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 時間前`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay} 日前`;
}

// ── role アイコン ─────────────────────────────────────────────────────────────

function RoleIcon({ entry }: { entry: PresenceEntry }) {
  if (entry.ownerLabel) {
    return <span title="AI 借受" className="esd-role-icon">🤖</span>;
  }
  if (entry.role === "editor") {
    return <span title="編集中" className="esd-role-icon">✏️</span>;
  }
  return <span title="観察中" className="esd-role-icon">👁</span>;
}

// ── 集約バッジ ────────────────────────────────────────────────────────────────

function AggregateBadge({ mode }: { mode: EditMode }) {
  if (mode.kind === "editing") {
    return <><span className="esd-badge-icon">✏️</span><span className="esd-badge-label">編集中</span></>;
  }
  if (mode.kind === "viewer") {
    return <><span className="esd-badge-icon">👁</span><span className="esd-badge-label">観察中</span></>;
  }
  return <><span className="esd-badge-icon">📄</span><span className="esd-badge-label">正規版</span></>;
}

// ── メインコンポーネント ───────────────────────────────────────────────────────

export function EditSessionDropdown({
  resourceType,
  resourceId,
  currentMode,
  currentSessionId,
  onViewerAttached,
  onStartEditing,
}: EditSessionDropdownProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const entries = usePresenceFor(resourceType, resourceId);

  // ── クリックアウトサイドで閉じる ───────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // ── [👁 観察] — viewer として attach ─────────────────────────────────────
  const handleViewerAttach = useCallback(
    async (entry: PresenceEntry) => {
      try {
        await mcpBridge.request("lock.subscribeAsViewer", {
          resourceType,
          resourceId,
        });
        onViewerAttached?.(entry.sessionId);
        setOpen(false);
      } catch (e) {
        console.error("[EditSessionDropdown] subscribeAsViewer failed:", e);
      }
    },
    [resourceType, resourceId, onViewerAttached],
  );

  // ── [▶ 再開] — 自分の前回 draft session に attach ────────────────────────
  const handleResume = useCallback(async () => {
    if (onStartEditing) {
      onStartEditing();
    }
    setOpen(false);
  }, [onStartEditing]);

  // ── [+ 新規 draft を作成] ─────────────────────────────────────────────────
  const handleNewDraft = useCallback(async () => {
    if (onStartEditing) {
      onStartEditing();
    }
    setOpen(false);
  }, [onStartEditing]);

  return (
    <div className="esd-root" ref={dropdownRef} data-testid="edit-session-dropdown">
      {/* 集約バッジ (closed 状態) */}
      <button
        type="button"
        className="esd-toggle btn btn-sm btn-outline-secondary"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        data-testid="esd-toggle-btn"
      >
        <AggregateBadge mode={currentMode} />
        <i className={`bi bi-chevron-${open ? "up" : "down"} ms-1 esd-chevron`} />
      </button>

      {/* 展開ドロップダウン */}
      {open && (
        <div className="esd-dropdown" role="listbox" data-testid="esd-dropdown">
          {/* 現在の正規版 */}
          <div className="esd-section-row esd-current-row" role="option">
            <span className="esd-status-dot esd-dot-active" />
            <span className="esd-row-icon">📄</span>
            <span className="esd-row-label">正規版</span>
            {currentMode.kind === "readonly" && (
              <span className="badge bg-secondary ms-auto esd-current-badge">現在</span>
            )}
          </div>

          {entries.length > 0 && <hr className="esd-divider" />}

          {/* 各 PresenceEntry */}
          {entries.map((entry) => {
            const isMe = entry.sessionId === currentSessionId;
            const isCurrentViewing =
              currentMode.kind === "viewer" && entry.sessionId === currentSessionId;
            const isEditor = entry.role === "editor";

            return (
              <div
                key={entry.sessionId}
                className={`esd-entry-row ${isMe ? "esd-entry-me" : ""}`}
                role="option"
                data-testid={`esd-entry-${entry.sessionId}`}
              >
                {/* ステータスドット: editor は緑、viewer は黄、自分は黒 */}
                {isMe ? (
                  <span className="esd-status-dot esd-dot-self" />
                ) : isEditor ? (
                  <span className="esd-status-dot esd-dot-editing" />
                ) : (
                  <span className="esd-status-dot esd-dot-viewer" />
                )}

                {/* role アイコン */}
                <RoleIcon entry={entry} />

                {/* ラベル (ownerLabel or sessionId 短縮) */}
                <span className="esd-row-owner-label" title={entry.sessionId}>
                  {entry.ownerLabel ?? `@${entry.sessionId.slice(0, 8)}`}
                </span>

                {/* 経過時間 */}
                <span className="esd-row-time text-muted ms-1">
                  {relativeTime(entry.lastActivityAt)}
                </span>

                {/* アクションボタン群 */}
                <div className="esd-actions ms-auto">
                  {/* [👁 観察]: viewer として attach — 自分以外の editor entry に表示 */}
                  {!isMe && isEditor && currentMode.kind !== "viewer" && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary esd-action-btn"
                      onClick={() => void handleViewerAttach(entry)}
                      title="観察モードで閲覧"
                      data-testid={`esd-viewer-btn-${entry.sessionId}`}
                    >
                      👁
                    </button>
                  )}

                  {/* [↪ 引継]: Phase 6 (#884) で活性化予定 — 現在は disabled */}
                  {!isMe && isEditor && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-warning esd-action-btn ms-1"
                      disabled
                      title="Phase 6 で実装予定"
                      data-testid={`esd-takeover-btn-${entry.sessionId}`}
                    >
                      ↪
                    </button>
                  )}

                  {/* [▶ 再開]: 自分の前回 draft */}
                  {isMe && !isCurrentViewing && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary esd-action-btn"
                      onClick={() => void handleResume()}
                      title="前回の編集を再開"
                      data-testid={`esd-resume-btn-${entry.sessionId}`}
                    >
                      ▶
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          <hr className="esd-divider" />

          {/* + 新規 draft を作成 */}
          <button
            type="button"
            className="esd-new-draft-btn btn btn-sm btn-link w-100 text-start"
            onClick={() => void handleNewDraft()}
            data-testid="esd-new-draft-btn"
          >
            <i className="bi bi-plus-circle me-1" />
            新規 draft を作成
          </button>
        </div>
      )}
    </div>
  );
}
