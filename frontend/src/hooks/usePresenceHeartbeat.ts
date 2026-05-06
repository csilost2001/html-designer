/**
 * usePresenceHeartbeat.ts (#878 Phase 1)
 *
 * 30 秒間隔で presence.heartbeat を送信するフック。
 * docs/spec/collab-presence.md § 6 (Heartbeat 仕様) に準拠。
 *
 * - document.visibilityState === "visible" の時のみ送信
 * - document.visibilitychange イベントでタイマー開始/停止
 * - editor mode は kind="edit" 編集 push 直後 + kind="activity" 30s 毎
 * - viewer mode は kind="activity" 30s 毎のみ
 */
import { useCallback, useEffect, useRef } from "react";
import { mcpBridge } from "../mcp/mcpBridge";
import type { DraftResourceType } from "../types/draft";

const HEARTBEAT_INTERVAL_MS = 30_000; // 30 秒

export interface UsePresenceHeartbeatOptions {
  resourceType: DraftResourceType;
  resourceId: string;
  role: "editor" | "viewer";
  /** false にするとタイマーを完全に停止する (リソースが未確定の場合等) */
  enabled: boolean;
}

export interface UsePresenceHeartbeatResult {
  /** editor mode が編集 push 直後に呼ぶ — kind="edit" heartbeat を即時送信する */
  sendEditHeartbeat: () => void;
}

export function usePresenceHeartbeat({
  resourceType,
  resourceId,
  role,
  enabled,
}: UsePresenceHeartbeatOptions): UsePresenceHeartbeatResult {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sendHeartbeat = useCallback(
    async (kind: "activity" | "edit") => {
      if (!enabled) return;
      if (document.visibilityState !== "visible") return;
      try {
        await mcpBridge.request("presence.heartbeat", { resourceType, resourceId, kind });
      } catch {
        // WS 未接続時はサイレントに無視
      }
    },
    [enabled, resourceType, resourceId],
  );

  const startTimer = useCallback(() => {
    if (timerRef.current !== null) return;
    timerRef.current = setInterval(() => {
      void sendHeartbeat("activity");
    }, HEARTBEAT_INTERVAL_MS);
  }, [sendHeartbeat]);

  const stopTimer = useCallback(() => {
    if (timerRef.current === null) return;
    clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  useEffect(() => {
    if (!enabled) {
      stopTimer();
      return;
    }

    // 初回送信 (マウント直後、visible の場合のみ)
    if (document.visibilityState === "visible") {
      void sendHeartbeat("activity");
      startTimer();
    }

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === "visible") {
        void sendHeartbeat("activity");
        startTimer();
      } else {
        stopTimer();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stopTimer();
    };
  }, [enabled, sendHeartbeat, startTimer, stopTimer]);

  /** editor mode が編集 push 後に呼ぶ即時 kind="edit" 送信 */
  const sendEditHeartbeat = useCallback(() => {
    if (role !== "editor") return;
    void sendHeartbeat("edit");
  }, [role, sendHeartbeat]);

  return { sendEditHeartbeat };
}
