import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Edge as RFEdge,
  type Node as RFNode,
  type NodeMouseHandler,
  MarkerType,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import ErTableNodeComponent, { type ErTableNodeData } from "./ErTableNode";
import { TableTopbar } from "./TableTopbar";
import type { TableDefinition, ErLayout, ErLogicalRelation, ErCardinality, SqlDialect } from "../../types/table";
import { CARDINALITY_LABELS } from "../../types/table";
import { listTables, loadTable } from "../../store/tableStore";
import { loadErLayout, saveErLayout } from "../../store/erLayoutStore";
import { loadProject } from "../../store/flowStore";
import { getAllRelations, autoLayout, generateErMermaid } from "../../utils/erUtils";
import { mcpBridge } from "../../mcp/mcpBridge";
import { generateUUID } from "../../utils/uuid";
import html2canvas from "html2canvas";
import "../../styles/er.css";

const nodeTypes = { erTableNode: ErTableNodeComponent };

function ErDiagramInner() {
  const navigate = useNavigate();
  const { fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<RFEdge>([]);
  const [projectName, setProjectName] = useState("プロジェクト");
  const [tables, setTables] = useState<TableDefinition[]>([]);
  const [layout, setLayout] = useState<ErLayout | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddRelation, setShowAddRelation] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layoutRef = useRef<ErLayout | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Load data
  useEffect(() => {
    mcpBridge.startWithoutEditor();
    (async () => {
      const p = await loadProject();
      setProjectName(p.name);
      const metas = await listTables();
      const allTables: TableDefinition[] = [];
      for (const m of metas) {
        const td = await loadTable(m.id);
        if (td) allTables.push(td);
      }
      setTables(allTables);
      const ly = await loadErLayout();
      setLayout(ly);
      layoutRef.current = ly;
      setIsLoading(false);
    })();
  }, []);

  // Build nodes and edges when data changes
  useEffect(() => {
    if (isLoading || tables.length === 0) return;

    const positions = layout?.positions ?? {};
    const needsAutoLayout = tables.some((t) => !positions[t.id]);

    let finalPositions = positions;
    if (needsAutoLayout) {
      const relations = getAllRelations(tables, layout);
      const autoPos = autoLayout(tables, relations);
      finalPositions = { ...autoPos, ...positions };
    }

    const rfNodes: RFNode[] = tables.map((t) => ({
      id: t.id,
      type: "erTableNode",
      position: finalPositions[t.id] ?? { x: 0, y: 0 },
      data: {
        tableId: t.id,
        name: t.name,
        logicalName: t.logicalName,
        category: t.category,
        columns: t.columns,
      } satisfies ErTableNodeData,
    }));
    setNodes(rfNodes);

    const relations = getAllRelations(tables, layout);
    const rfEdges: RFEdge[] = relations.map((rel) => ({
      id: rel.id,
      source: rel.sourceTableId,
      target: rel.targetTableId,
      sourceHandle: "right",
      targetHandle: "left",
      label: rel.sourceColumnName,
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      style: {
        strokeWidth: 2,
        stroke: rel.physical ? "#64748b" : "#7c6bff",
        strokeDasharray: rel.physical ? undefined : "6 4",
      },
      labelStyle: { fontSize: 11, fill: rel.physical ? "#475569" : "#7c6bff" },
      labelBgStyle: { fill: "#fff", fillOpacity: 0.9 },
      labelBgPadding: [6, 4] as [number, number],
      labelBgBorderRadius: 4,
      data: { physical: rel.physical, cardinality: rel.cardinality },
    }));
    setEdges(rfEdges);

    // Fit view on first load
    setTimeout(() => fitView({ padding: 0.3, maxZoom: 1, duration: 200 }), 100);
  }, [isLoading, tables, layout, setNodes, setEdges, fitView]);

  // Save positions on node drag
  const debouncedSave = useCallback((ly: ErLayout) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveErLayout(ly), 300);
  }, []);

  const onNodeDragStop = useCallback((_: unknown, node: RFNode) => {
    const ly = layoutRef.current ?? { positions: {}, logicalRelations: [], updatedAt: "" };
    ly.positions[node.id] = { x: Math.round(node.position.x), y: Math.round(node.position.y) };
    layoutRef.current = ly;
    setLayout({ ...ly });
    debouncedSave(ly);
  }, [debouncedSave]);

  // Double click to navigate to table editor
  const onNodeDoubleClick: NodeMouseHandler = useCallback((_event, node) => {
    navigate(`/tables/${node.id}`);
  }, [navigate]);

  // Auto layout
  const handleAutoLayout = useCallback(() => {
    const relations = getAllRelations(tables, layout);
    const autoPos = autoLayout(tables, relations);
    const ly = layoutRef.current ?? { positions: {}, logicalRelations: [], updatedAt: "" };
    ly.positions = autoPos;
    layoutRef.current = ly;
    setLayout({ ...ly });
    debouncedSave(ly);

    setNodes((nds) => nds.map((n) => ({
      ...n,
      position: autoPos[n.id] ?? n.position,
    })));
    setTimeout(() => fitView({ padding: 0.3, maxZoom: 1, duration: 300 }), 50);
  }, [tables, layout, setNodes, fitView, debouncedSave]);

  // Add logical relation
  const handleAddLogicalRelation = useCallback((rel: Omit<ErLogicalRelation, "id">) => {
    const ly = layoutRef.current ?? { positions: {}, logicalRelations: [], updatedAt: "" };
    if (!ly.logicalRelations) ly.logicalRelations = [];
    ly.logicalRelations.push({ ...rel, id: `lr-${generateUUID()}` });
    layoutRef.current = ly;
    setLayout({ ...ly });
    debouncedSave(ly);
    setShowAddRelation(false);
  }, [debouncedSave]);

  // Remove logical relation
  const handleRemoveEdge = useCallback((edgeId: string) => {
    const ly = layoutRef.current;
    if (!ly?.logicalRelations) return;
    ly.logicalRelations = ly.logicalRelations.filter((r) => r.id !== edgeId);
    layoutRef.current = ly;
    setLayout({ ...ly });
    debouncedSave(ly);
  }, [debouncedSave]);

  // Export Mermaid
  const handleExportMermaid = useCallback(() => {
    const relations = getAllRelations(tables, layout);
    const mermaid = generateErMermaid(tables, relations);
    navigator.clipboard.writeText(mermaid);
    setShowExport(false);
  }, [tables, layout]);

  // Export PNG
  const handleExportPng = useCallback(async () => {
    setShowExport(false);
    const el = canvasRef.current?.querySelector(".react-flow__viewport") as HTMLElement | null;
    if (!el) return;
    const canvas = await html2canvas(el, { backgroundColor: "#1a1a2e", scale: 2, logging: false, useCORS: true });
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName}_er.png`;
    a.click();
  }, [projectName]);

  if (isLoading) {
    return (
      <div className="er-diagram-page">
        <TableTopbar projectName={projectName} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#888" }}>
          <i className="bi bi-hourglass-split" /> 読み込み中...
        </div>
      </div>
    );
  }

  return (
    <div className="er-diagram-page">
      <TableTopbar projectName={projectName} />

      <div className="er-diagram-canvas" ref={canvasRef}>
        {tables.length === 0 ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "#777", height: "100%" }}>
            <i className="bi bi-diagram-3" style={{ fontSize: 48, color: "#555" }} />
            <p>テーブル定義がまだありません</p>
            <button className="tbl-btn tbl-btn-primary" onClick={() => navigate("/tables")}>
              <i className="bi bi-table" /> テーブル設計へ
            </button>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            onNodeDragStop={onNodeDragStop}
            onNodeDoubleClick={onNodeDoubleClick}
            onEdgeDoubleClick={(_e, edge) => {
              if (!(edge.data as { physical?: boolean })?.physical) {
                if (confirm("この論理リレーションを削除しますか？")) {
                  handleRemoveEdge(edge.id);
                }
              }
            }}
            deleteKeyCode={[]}
            fitView
            fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
            defaultEdgeOptions={{
              markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
              style: { strokeWidth: 2, stroke: "#64748b" },
            }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#334155" />
            <MiniMap
              nodeColor="#7c6bff"
              maskColor="rgba(26,26,46,0.7)"
              style={{ borderRadius: 8 }}
            />
          </ReactFlow>
        )}
      </div>

      {/* Toolbar */}
      <div className="er-toolbar">
        <div className="er-toolbar-group">
          <button className="tbl-btn tbl-btn-ghost tbl-btn-sm" onClick={handleAutoLayout} title="自動配置">
            <i className="bi bi-grid-3x3-gap" /> 自動配置
          </button>
          <button className="tbl-btn tbl-btn-ghost tbl-btn-sm" onClick={() => fitView({ padding: 0.3, maxZoom: 1, duration: 300 })} title="全体表示">
            <i className="bi bi-arrows-fullscreen" /> 全体表示
          </button>
        </div>
        <div className="er-toolbar-sep" />
        <button
          className="tbl-btn tbl-btn-ghost tbl-btn-sm"
          onClick={() => setShowAddRelation(true)}
          title="論理リレーション追加"
        >
          <i className="bi bi-link-45deg" /> 論理リレーション追加
        </button>
        <div className="er-toolbar-sep" />
        <div style={{ position: "relative" }}>
          <button className="tbl-btn tbl-btn-ghost tbl-btn-sm" onClick={() => setShowExport(!showExport)}>
            <i className="bi bi-download" /> エクスポート
          </button>
          {showExport && (
            <div className="er-export-menu">
              <button onClick={handleExportMermaid}>
                <i className="bi bi-clipboard" /> Mermaid をコピー
              </button>
              <button onClick={handleExportPng}>
                <i className="bi bi-image" /> PNG ダウンロード
              </button>
            </div>
          )}
        </div>
        <span className="er-toolbar-info">
          {tables.length} テーブル / {edges.length} リレーション
          <span style={{ marginLeft: 8, fontSize: 11, color: "#666" }}>ダブルクリックでテーブル編集</span>
        </span>
      </div>

      {/* Add Logical Relation Modal */}
      {showAddRelation && (
        <AddRelationModal
          tables={tables}
          onAdd={handleAddLogicalRelation}
          onClose={() => setShowAddRelation(false)}
        />
      )}
    </div>
  );
}

export function ErDiagram() {
  return (
    <ReactFlowProvider>
      <ErDiagramInner />
    </ReactFlowProvider>
  );
}

// ── 論理リレーション追加モーダル ──────────────────────────────────────────

function AddRelationModal({
  tables, onAdd, onClose,
}: {
  tables: TableDefinition[];
  onAdd: (rel: Omit<ErLogicalRelation, "id">) => void;
  onClose: () => void;
}) {
  const [srcTableId, setSrcTableId] = useState("");
  const [srcCol, setSrcCol] = useState("");
  const [tgtTableId, setTgtTableId] = useState("");
  const [tgtCol, setTgtCol] = useState("");
  const [cardinality, setCardinality] = useState<ErCardinality>("one-to-many");

  const srcTable = tables.find((t) => t.id === srcTableId);
  const tgtTable = tables.find((t) => t.id === tgtTableId);

  const handleSubmit = () => {
    if (!srcTableId || !srcCol || !tgtTableId || !tgtCol) return;
    onAdd({
      sourceTableId: srcTableId,
      sourceColumnName: srcCol,
      targetTableId: tgtTableId,
      targetColumnName: tgtCol,
      cardinality,
    });
  };

  return (
    <div className="tbl-modal-overlay" onClick={onClose}>
      <div className="er-relation-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tbl-modal-title">
          <i className="bi bi-link-45deg" /> 論理リレーション追加
        </div>
        <p style={{ fontSize: 12, color: "#999", marginBottom: 16 }}>
          FK制約なしの論理的なリレーションをER図上に追加します（点線で表示）
        </p>

        <div className="er-relation-row">
          <div style={{ flex: 1 }}>
            <label className="tbl-field">
              <span>参照元テーブル（FK側）</span>
              <select value={srcTableId} onChange={(e) => { setSrcTableId(e.target.value); setSrcCol(""); }}>
                <option value="">選択...</option>
                {tables.map((t) => <option key={t.id} value={t.id}>{t.name}（{t.logicalName}）</option>)}
              </select>
            </label>
            <label className="tbl-field">
              <span>参照元カラム</span>
              <select value={srcCol} onChange={(e) => setSrcCol(e.target.value)} disabled={!srcTable}>
                <option value="">選択...</option>
                {srcTable?.columns.map((c) => <option key={c.id} value={c.name}>{c.name}（{c.logicalName}）</option>)}
              </select>
            </label>
          </div>
          <span className="er-relation-arrow">→</span>
          <div style={{ flex: 1 }}>
            <label className="tbl-field">
              <span>参照先テーブル</span>
              <select value={tgtTableId} onChange={(e) => { setTgtTableId(e.target.value); setTgtCol(""); }}>
                <option value="">選択...</option>
                {tables.map((t) => <option key={t.id} value={t.id}>{t.name}（{t.logicalName}）</option>)}
              </select>
            </label>
            <label className="tbl-field">
              <span>参照先カラム</span>
              <select value={tgtCol} onChange={(e) => setTgtCol(e.target.value)} disabled={!tgtTable}>
                <option value="">選択...</option>
                {tgtTable?.columns.map((c) => {
                  const icons = c.primaryKey ? "🔑 " : c.unique ? "🔗 " : "";
                  return <option key={c.id} value={c.name}>{icons}{c.name}（{c.logicalName}）</option>;
                })}
              </select>
            </label>
          </div>
        </div>

        <label className="tbl-field">
          <span>カーディナリティ</span>
          <select value={cardinality} onChange={(e) => setCardinality(e.target.value as ErCardinality)}>
            {Object.entries(CARDINALITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>

        <div className="tbl-modal-btns">
          <button className="tbl-btn tbl-btn-ghost" onClick={onClose}>キャンセル</button>
          <button
            className="tbl-btn tbl-btn-primary"
            onClick={handleSubmit}
            disabled={!srcTableId || !srcCol || !tgtTableId || !tgtCol}
          >
            追加
          </button>
        </div>
      </div>
    </div>
  );
}
