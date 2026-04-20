/**
 * 未解決マーカー集計パネル (#261)
 *
 * 全 ActionGroup を走査して、未解決 marker の件数を kind 別に集計。
 * クリックで処理フロー一覧 (未解決 marker 有りでフィルタする想定、現状は単純遷移)。
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ActionGroup, MarkerKind } from "../../../types/action";
import { listActionGroups, loadActionGroup } from "../../../store/actionStore";
import { mcpBridge } from "../../../mcp/mcpBridge";

interface Summary {
  total: number;
  byKind: Record<MarkerKind, number>;
  perGroup: Array<{ id: string; name: string; count: number }>;
}

const INITIAL: Summary = {
  total: 0,
  byKind: { chat: 0, attention: 0, todo: 0, question: 0 },
  perGroup: [],
};

async function fetchSummary(): Promise<Summary> {
  const metas = await listActionGroups();
  const s: Summary = { total: 0, byKind: { chat: 0, attention: 0, todo: 0, question: 0 }, perGroup: [] };
  for (const meta of metas) {
    const g: ActionGroup | null = await loadActionGroup(meta.id);
    if (!g) continue;
    const unresolved = (g.markers ?? []).filter((m) => !m.resolvedAt);
    if (unresolved.length === 0) continue;
    for (const m of unresolved) {
      s.byKind[m.kind] = (s.byKind[m.kind] ?? 0) + 1;
      s.total++;
    }
    s.perGroup.push({ id: g.id, name: g.name, count: unresolved.length });
  }
  s.perGroup.sort((a, b) => b.count - a.count);
  return s;
}

const KIND_LABEL: Record<MarkerKind, string> = {
  chat: "チャット",
  attention: "注目",
  todo: "TODO",
  question: "質問",
};
const KIND_COLOR: Record<MarkerKind, string> = {
  chat: "#3b82f6",
  attention: "#f59e0b",
  todo: "#10b981",
  question: "#8b5cf6",
};

export function MarkersSummaryPanel() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<Summary>(INITIAL);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const reload = async () => {
      try {
        const s = await fetchSummary();
        if (!cancelled) { setSummary(s); setError(null); }
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    reload();
    const unsubProject = mcpBridge.onBroadcast("projectChanged", reload);
    const unsubAction = mcpBridge.onBroadcast("actionGroupChanged", reload);
    const unsubStatus = mcpBridge.onStatusChange((s) => { if (s === "connected") reload(); });
    return () => { cancelled = true; unsubProject(); unsubAction(); unsubStatus(); };
  }, []);

  if (error) return <div className="panel-error"><i className="bi bi-exclamation-triangle" /> 集計失敗: {error}</div>;

  return (
    <div className="markers-summary-panel" style={{ padding: 8 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: "1.5rem", fontWeight: 600 }}>
          {loading ? "…" : summary.total}
        </div>
        <div style={{ color: "#64748b", fontSize: "0.85rem" }}>未解決マーカー (AI 依頼)</div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8, fontSize: "0.78rem", flexWrap: "wrap" }}>
        {(Object.keys(summary.byKind) as MarkerKind[]).map((k) => {
          const count = summary.byKind[k];
          if (count === 0) return null;
          return (
            <span key={k} style={{ color: KIND_COLOR[k], fontWeight: 500 }}>
              <i className="bi bi-circle-fill me-1" />{KIND_LABEL[k]} {count}
            </span>
          );
        })}
      </div>
      {summary.perGroup.length > 0 && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, marginTop: 8, fontSize: "0.82rem" }}>
          {summary.perGroup.slice(0, 5).map((g) => (
            <li key={g.id} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
              <button
                type="button"
                className="btn btn-sm btn-link p-0"
                onClick={() => navigate(`/process-flow/edit/${g.id}`)}
                style={{ textAlign: "left", flex: 1, textDecoration: "none", color: "#334155" }}
                title="エディタを開く"
              >
                {g.name}
              </button>
              <span style={{ color: "#f97316", fontWeight: 600, marginLeft: 8 }}>{g.count}</span>
            </li>
          ))}
          {summary.perGroup.length > 5 && (
            <li style={{ fontSize: "0.75rem", color: "#94a3b8", padding: "2px 0" }}>
              他 {summary.perGroup.length - 5} フロー
            </li>
          )}
        </ul>
      )}
      {summary.total === 0 && !loading && (
        <div style={{ marginTop: 6, color: "#94a3b8", fontSize: "0.8rem" }}>
          未解決のマーカーはありません
        </div>
      )}
    </div>
  );
}
