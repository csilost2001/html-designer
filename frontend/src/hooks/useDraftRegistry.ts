/**
 * useDraftRegistry.ts — Phase 6 (#903) リファクタ
 *
 * 旧 draft.list / draft.changed ベースから editSession.list / editSession.* broadcast ベースに移行済み。
 * "active EditSession が存在するリソース" を "draft あり" として扱う互換レイヤー。
 *
 * consumers: ScreenListView / SequenceListView / ViewListView / TableListView /
 *            ProcessFlowListView / ViewDefinitionListView
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { mcpBridge } from "../mcp/mcpBridge";
import type { DraftResourceType } from "../types/draft";

export type DraftKey = `${DraftResourceType}:${string}`;

export interface UseDraftRegistryResult {
  hasDraft: (resourceType: DraftResourceType, resourceId: string) => boolean;
  drafts: Map<DraftKey, true>;
  refresh: () => Promise<void>;
}

interface EditSessionEntry {
  id: string;
  resourceType: DraftResourceType;
  resourceId: string;
  state: "Active" | "Discarded";
}

interface EditSessionListResponse {
  sessions: EditSessionEntry[];
}

export function useDraftRegistry(): UseDraftRegistryResult {
  const [drafts, setDrafts] = useState<Map<DraftKey, true>>(new Map());
  const draftsRef = useRef<Map<DraftKey, true>>(new Map());

  const applySessionList = useCallback(async (onLoaded: (next: Map<DraftKey, true>) => void) => {
    try {
      const res = await mcpBridge.request("editSession.list", {}) as EditSessionListResponse | null;
      const sessions = res?.sessions ?? [];
      const next = new Map<DraftKey, true>();
      for (const session of sessions) {
        if (session.state === "Active") {
          const key = `${session.resourceType}:${session.resourceId}` as DraftKey;
          next.set(key, true);
        }
      }
      draftsRef.current = next;
      onLoaded(new Map(next));
    } catch {
      // MCP 未接続時は空 Map のまま
    }
  }, []);

  const refresh = useCallback(async () => {
    await applySessionList(setDrafts);
  }, [applySessionList]);

  useEffect(() => {
    void applySessionList(setDrafts);
  }, [applySessionList]);

  // editSession.* broadcast を購読して map をインクリメンタル更新
  useEffect(() => {
    const refreshMap = () => { void applySessionList(setDrafts); };

    const unsubCreated = mcpBridge.onBroadcast("editSession.created", refreshMap);
    const unsubDiscarded = mcpBridge.onBroadcast("editSession.discarded", refreshMap);
    const unsubSaved = mcpBridge.onBroadcast("editSession.saved", refreshMap);
    const unsubExpired = mcpBridge.onBroadcast("editSession.expired", refreshMap);

    return () => {
      unsubCreated();
      unsubDiscarded();
      unsubSaved();
      unsubExpired();
    };
  }, [applySessionList]);

  const hasDraft = useCallback(
    (resourceType: DraftResourceType, resourceId: string): boolean => {
      const key = `${resourceType}:${resourceId}` as DraftKey;
      return draftsRef.current.has(key);
    },
    [],
  );

  return { hasDraft, drafts, refresh };
}
