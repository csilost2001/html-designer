/**
 * useSessionUrlSync.ts (#882 Phase 4)
 *
 * URL `?session=<sid>` の切替時反映 + ロード時復元 hook。
 * docs/spec/collab-presence.md § 5.4 (viewer mode) に準拠。
 *
 * - 切替時: history.replaceState で URL を `?session=<sid>` に更新
 * - ロード時: URLSearchParams で `?session=<sid>` を解釈 → 該当 session に attach (viewer)
 */
import { useEffect, useCallback } from "react";
import { mcpBridge } from "../mcp/mcpBridge";
import type { DraftResourceType } from "../types/draft";

// ── 型 ──────────────────────────────────────────────────────────────────────

export interface UseSessionUrlSyncOptions {
  resourceType: DraftResourceType;
  resourceId: string;
  /** viewer mode に遷移した後の callback */
  onViewerAttached?: (sessionId: string) => void;
}

export interface UseSessionUrlSyncResult {
  /** 指定 sessionId を URL に反映する */
  syncSessionToUrl: (sessionId: string) => void;
  /** URL の ?session= を削除する */
  clearSessionFromUrl: () => void;
}

// ── 実装 ─────────────────────────────────────────────────────────────────────

export function useSessionUrlSync({
  resourceType,
  resourceId,
  onViewerAttached,
}: UseSessionUrlSyncOptions): UseSessionUrlSyncResult {
  // ロード時: URL に ?session= がある場合は viewer として attach
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session");
    if (!sessionId) return;

    // 非同期で viewer attach を試みる
    mcpBridge
      .request("lock.subscribeAsViewer", { resourceType, resourceId })
      .then(() => {
        onViewerAttached?.(sessionId);
      })
      .catch((e: unknown) => {
        console.warn(
          `[useSessionUrlSync] failed to attach as viewer for session ${sessionId}:`,
          e,
        );
      });
  }, [resourceType, resourceId, onViewerAttached]);

  // 切替時: URL を `?session=<sid>` に更新
  const syncSessionToUrl = useCallback((sessionId: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("session", sessionId);
    history.replaceState(null, "", url.toString());
  }, []);

  // URL の ?session= を削除
  const clearSessionFromUrl = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("session");
    history.replaceState(null, "", url.toString());
  }, []);

  return { syncSessionToUrl, clearSessionFromUrl };
}
