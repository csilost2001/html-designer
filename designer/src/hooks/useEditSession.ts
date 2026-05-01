import { useCallback, useEffect, useRef, useState } from "react";
import { mcpBridge } from "../mcp/mcpBridge";
import type { DraftResourceType } from "../types/draft";

export type EditMode =
  | { kind: "readonly" }
  | { kind: "editing" }
  | { kind: "locked-by-other"; ownerSessionId: string; ownerLabel?: string }
  | { kind: "force-released-pending"; previousDraftExists: boolean };

export interface UseEditSessionOptions {
  resourceType: DraftResourceType;
  resourceId: string;
  sessionId: string;
}

export interface UseEditSessionResult {
  mode: EditMode;
  loading: boolean;
  error: Error | null;
  actions: {
    startEditing: () => Promise<void>;
    save: () => Promise<void>;
    discard: () => Promise<void>;
    forceReleaseOther: () => Promise<void>;
    handleForcedOut: (choice: "adopt" | "discard" | "continue") => Promise<void>;
    refreshLockState: () => Promise<void>;
  };
}

export function useEditSession(opts: UseEditSessionOptions): UseEditSessionResult {
  const { resourceType, resourceId, sessionId } = opts;

  const [mode, setMode] = useState<EditMode>({ kind: "readonly" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const modeRef = useRef<EditMode>(mode);
  modeRef.current = mode;

  const refreshLockState = useCallback(async () => {
    try {
      const lockRes = await mcpBridge.getLock(resourceType, resourceId) as {
        entry: { ownerSessionId: string } | null;
      } | null;
      const entry = lockRes?.entry ?? null;

      if (!entry) {
        setMode({ kind: "readonly" });
        return;
      }

      if (entry.ownerSessionId === sessionId) {
        setMode({ kind: "editing" });
        return;
      }

      setMode({ kind: "locked-by-other", ownerSessionId: entry.ownerSessionId });
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, [resourceType, resourceId, sessionId]);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      setLoading(true);
      try {
        const lockRes = await mcpBridge.getLock(resourceType, resourceId) as {
          entry: { ownerSessionId: string } | null;
        } | null;
        const entry = lockRes?.entry ?? null;

        if (cancelled) return;

        if (!entry) {
          const draftRes = await mcpBridge.hasDraft(resourceType, resourceId) as { exists: boolean } | null;
          if (cancelled) return;
          if (draftRes?.exists) {
            setMode({ kind: "force-released-pending", previousDraftExists: true });
          } else {
            setMode({ kind: "readonly" });
          }
        } else if (entry.ownerSessionId === sessionId) {
          setMode({ kind: "editing" });
        } else {
          setMode({ kind: "locked-by-other", ownerSessionId: entry.ownerSessionId });
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    init().catch(console.error);

    return () => { cancelled = true; };
  }, [resourceType, resourceId, sessionId]);

  useEffect(() => {
    const unsubLock = mcpBridge.onBroadcast("lock.changed", (data) => {
      const d = data as {
        resourceType: string;
        resourceId: string;
        op: "acquired" | "released" | "force-released";
        ownerSessionId: string;
        by: string;
        previousOwner?: string;
      };

      if (d.resourceType !== resourceType || d.resourceId !== resourceId) return;

      const current = modeRef.current;

      if (d.op === "acquired") {
        if (d.ownerSessionId === sessionId) {
          setMode({ kind: "editing" });
        } else {
          setMode({ kind: "locked-by-other", ownerSessionId: d.ownerSessionId });
        }
        return;
      }

      if (d.op === "released") {
        if (current.kind === "editing") return;
        setMode({ kind: "readonly" });
        return;
      }

      if (d.op === "force-released") {
        if (d.previousOwner === sessionId) {
          setMode({ kind: "force-released-pending", previousDraftExists: true });
        } else {
          setMode({ kind: "readonly" });
        }
        return;
      }
    });

    const unsubDraft = mcpBridge.onBroadcast("draft.changed", (data) => {
      const d = data as {
        type: string;
        id: string;
        op: string;
      };

      if (d.type !== resourceType || d.id !== resourceId) return;
    });

    return () => {
      unsubLock();
      unsubDraft();
    };
  }, [resourceType, resourceId, sessionId]);

  const startEditing = useCallback(async () => {
    setError(null);
    try {
      await mcpBridge.acquireLock(resourceType, resourceId, sessionId);
      await mcpBridge.createDraft(resourceType, resourceId);
      setMode({ kind: "editing" });
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      await refreshLockState();
    }
  }, [resourceType, resourceId, sessionId, refreshLockState]);

  const save = useCallback(async () => {
    setError(null);
    try {
      await mcpBridge.commitDraft(resourceType, resourceId);
      await mcpBridge.releaseLock(resourceType, resourceId, sessionId);
      setMode({ kind: "readonly" });
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, [resourceType, resourceId, sessionId]);

  const discard = useCallback(async () => {
    setError(null);
    try {
      await mcpBridge.discardDraft(resourceType, resourceId);
      await mcpBridge.releaseLock(resourceType, resourceId, sessionId);
      setMode({ kind: "readonly" });
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, [resourceType, resourceId, sessionId]);

  const forceReleaseOther = useCallback(async () => {
    setError(null);
    try {
      await mcpBridge.forceReleaseLock(resourceType, resourceId, sessionId);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, [resourceType, resourceId, sessionId]);

  const handleForcedOut = useCallback(async (choice: "adopt" | "discard" | "continue") => {
    setError(null);
    try {
      if (choice === "discard") {
        await mcpBridge.discardDraft(resourceType, resourceId);
        setMode({ kind: "readonly" });
      } else if (choice === "continue") {
        await mcpBridge.acquireLock(resourceType, resourceId, sessionId);
        setMode({ kind: "editing" });
      } else {
        setMode({ kind: "readonly" });
      }
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, [resourceType, resourceId, sessionId]);

  return {
    mode,
    loading,
    error,
    actions: {
      startEditing,
      save,
      discard,
      forceReleaseOther,
      handleForcedOut,
      refreshLockState,
    },
  };
}
