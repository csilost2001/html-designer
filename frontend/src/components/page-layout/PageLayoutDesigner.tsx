/**
 * PageLayoutDesigner — ページレイアウト ビジュアルデザイン画面 (pl-3, #1024)
 *
 * ScreenDesigner.tsx を base に editorKind で GrapesJS / Puck を分岐。
 * 本 ISSUE では region drop slot の足場のみ実装。
 * 実際の gadget composition は pl-5 (#1026) で実装。
 */

import { useParams, useNavigate } from "react-router-dom";
import { useWorkspacePath } from "../../hooks/useWorkspacePath";
import { useEffect, useState } from "react";
import { loadPageLayout } from "../../store/pageLayoutStore";
import type { PageLayout } from "../../store/pageLayoutStore";
import { mcpBridge } from "../../mcp/mcpBridge";
import { Designer } from "../Designer";

// Puck エディタ用 — editorKind='puck' かつ Puck が有効な場合のみ利用
// 足場のみなので実 Puck Editor は import せず placeholder を使う
// (pl-5 で実装)

export function PageLayoutDesigner() {
  const { pageLayoutId } = useParams<{ pageLayoutId: string }>();
  const navigate = useNavigate();
  const { wsPath } = useWorkspacePath();

  const [pl, setPl] = useState<PageLayout | null | undefined>(undefined); // undefined = loading

  useEffect(() => {
    if (!pageLayoutId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- route param absence immediately resolves the loading sentinel.
      setPl(null);
      return;
    }

    let mounted = true;

    const doLoad = () => {
      loadPageLayout(pageLayoutId).then((data) => {
        if (!mounted) return;
        setPl(data ?? null);
      }).catch(() => { if (mounted) setPl(null); });
    };

    const unsubStatus = mcpBridge.onStatusChange((status) => {
      if (status === "connected" && mounted) doLoad();
    });

    mcpBridge.startWithoutEditor();
    doLoad();

    return () => {
      mounted = false;
      unsubStatus();
    };
  }, [pageLayoutId]);

  if (pl === undefined) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", flexDirection: "column", gap: 16,
        fontFamily: "system-ui, sans-serif", color: "#64748b",
      }}>
        <div className="spinner" />
        <p>読み込み中...</p>
      </div>
    );
  }

  if (!pageLayoutId || !pl) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", flexDirection: "column", gap: 16,
        fontFamily: "system-ui, sans-serif", color: "#64748b",
      }}>
        <i className="bi bi-exclamation-triangle" style={{ fontSize: 48, color: "#f59e0b" }} />
        <h2 style={{ margin: 0, color: "#334155" }}>ページレイアウトが見つかりません</h2>
        <p>指定された ID のページレイアウトは存在しないか、削除されています。</p>
        <button
          onClick={() => navigate(wsPath("/page-layout/list"))}
          style={{
            padding: "8px 20px", border: "none", borderRadius: 6,
            background: "#6366f1", color: "#fff", cursor: "pointer", fontSize: 14,
          }}
        >
          <i className="bi bi-arrow-left" /> 一覧に戻る
        </button>
      </div>
    );
  }

  const editorKind = pl.design?.editorKind ?? "grapesjs";

  // editorKind='grapesjs': GrapesJS Designer に region drop slot ブロックを追加済み
  // (frontend/src/grapes/blocks.ts の CAT_REGIONS カテゴリ)
  if (editorKind === "grapesjs") {
    return (
      <Designer
        screenId={`page-layout:${pageLayoutId}`}
        screenName={pl.name}
        onBack={() => navigate(wsPath(`/page-layout/edit/${encodeURIComponent(pageLayoutId)}`))}
      />
    );
  }

  // editorKind='puck': Puck Editor 足場 (pl-5 で実装)
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      height: "100vh", flexDirection: "column", gap: 16,
      fontFamily: "system-ui, sans-serif", color: "#64748b",
    }}>
      <i className="bi bi-layout-wtf" style={{ fontSize: 48, color: "#6366f1" }} />
      <h2 style={{ margin: 0, color: "#334155" }}>{pl.name} — Puck レイアウトデザイン</h2>
      <p>Puck 版の region 配置デザイン機能は pl-5 (#1026) で実装予定です。</p>
      <div style={{
        border: "2px dashed #e2e8f0", borderRadius: 8, padding: "24px 40px",
        textAlign: "center", maxWidth: 480,
      }}>
        <p style={{ margin: "0 0 8px 0", fontWeight: 600 }}>Region 一覧 (足場)</p>
        {(pl.regions ?? []).map((r) => (
          <div key={r.name} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 12px", border: "1px dashed #cbd5e1",
            borderRadius: 4, marginBottom: 4, background: "#f8fafc",
          }}>
            <code style={{ fontSize: 12 }}>{r.name}</code>
            {r.description && <span style={{ fontSize: 12, color: "#94a3b8" }}>{r.description}</span>}
          </div>
        ))}
      </div>
      <button
        onClick={() => navigate(wsPath(`/page-layout/edit/${encodeURIComponent(pageLayoutId)}`))}
        style={{
          padding: "8px 20px", border: "none", borderRadius: 6,
          background: "#6366f1", color: "#fff", cursor: "pointer", fontSize: 14,
        }}
      >
        <i className="bi bi-arrow-left" /> 構造編集に戻る
      </button>
    </div>
  );
}
