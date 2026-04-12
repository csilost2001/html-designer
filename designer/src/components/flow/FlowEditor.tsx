import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge as rfAddEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge as RFEdge,
  type Node as RFNode,
  type NodeMouseHandler,
  MarkerType,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import ScreenNodeComponent from "./ScreenNode";
import { FlowTopbar } from "./FlowTopbar";
import { ScreenEditModal, type ScreenFormData } from "./ScreenEditModal";
import { EdgeEditModal, type EdgeFormData } from "./EdgeEditModal";
import type { FlowProject, ScreenNode, ScreenEdge, TransitionTrigger } from "../../types/flow";
import { TRIGGER_LABELS } from "../../types/flow";
import {
  loadProject,
  saveProject,
  addScreen,
  updateScreen,
  removeScreen,
  addEdge as storeAddEdge,
  updateEdge as storeUpdateEdge,
  removeEdge as storeRemoveEdge,
  exportProjectJSON,
  importProjectJSON,
  generateMermaid,
  generateFlowMarkdown,
} from "../../store/flowStore";
import { mcpBridge } from "../../mcp/mcpBridge";
import "../../styles/flow.css";

const nodeTypes = { screenNode: ScreenNodeComponent };

function toRFNodes(screens: ScreenNode[]): RFNode[] {
  return screens.map((s) => ({
    id: s.id,
    type: "screenNode",
    position: s.position,
    data: s,
  }));
}

function toRFEdges(edges: ScreenEdge[]): RFEdge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    label: e.label || (TRIGGER_LABELS[e.trigger] ?? ""),
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
    style: { strokeWidth: 2, stroke: "#94a3b8" },
    labelStyle: { fontSize: 11, fill: "#475569" },
    labelBgStyle: { fill: "#fff", fillOpacity: 0.9 },
    labelBgPadding: [6, 4] as [number, number],
    labelBgBorderRadius: 4,
  }));
}

interface ContextMenu {
  x: number;
  y: number;
  type: "node" | "edge";
  targetId: string;
}

export function FlowEditor() {
  const navigate = useNavigate();
  const projectRef = useRef<FlowProject>(loadProject());

  const [nodes, setNodes, onNodesChange] = useNodesState(toRFNodes(projectRef.current.screens));
  const [edges, setEdges, onEdgesChange] = useEdgesState(toRFEdges(projectRef.current.edges));

  // MCP bridge: フロー画面でもWebSocket接続を維持
  useEffect(() => {
    mcpBridge.setNavigateHandler((path) => navigate(path));
    mcpBridge.setFlowChangeHandler(() => {
      // MCP経由でフローが変更されたらUIを再読み込み
      const fresh = loadProject();
      projectRef.current = fresh;
      setNodes(toRFNodes(fresh.screens));
      setEdges(toRFEdges(fresh.edges));
    });
    // エディター無しでもWebSocketだけ起動（フロー操作用）
    mcpBridge.startWithoutEditor();
    return () => {
      mcpBridge.setNavigateHandler(null);
      mcpBridge.setFlowChangeHandler(null);
    };
  }, [navigate, setNodes, setEdges]);

  // Modals
  const [screenModal, setScreenModal] = useState<{
    open: boolean;
    editId?: string;
    initial?: Partial<ScreenFormData>;
  }>({ open: false });
  const [edgeModal, setEdgeModal] = useState<{
    open: boolean;
    editId?: string;
    initial?: Partial<EdgeFormData>;
  }>({ open: false });

  // Context menu
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);

  // Close context menu on any click
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [contextMenu]);

  // Sync project → localStorage on node position changes
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncAndSave = useCallback(() => {
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = setTimeout(() => {
      saveProject(projectRef.current);
    }, 300);
  }, []);

  // Handle node drag end → save new positions
  const onNodeDragStop = useCallback((_: unknown, node: RFNode) => {
    const screen = projectRef.current.screens.find((s) => s.id === node.id);
    if (screen) {
      screen.position = node.position;
      syncAndSave();
    }
  }, [syncAndSave]);

  // Handle new connection
  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;
    const edge = storeAddEdge(
      projectRef.current,
      connection.source,
      connection.target,
      "",
      "click",
      connection.sourceHandle ?? undefined,
      connection.targetHandle ?? undefined,
    );
    setEdges((eds) => rfAddEdge({
      ...connection,
      id: edge.id,
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      style: { strokeWidth: 2, stroke: "#94a3b8" },
      labelStyle: { fontSize: 11, fill: "#475569" },
      labelBgStyle: { fill: "#fff", fillOpacity: 0.9 },
      labelBgPadding: [6, 4] as [number, number],
      labelBgBorderRadius: 4,
    }, eds));
  }, [setEdges]);

  // Double click → navigate to designer
  const onNodeDoubleClick: NodeMouseHandler = useCallback((_event, node) => {
    navigate(`/design/${node.id}`);
  }, [navigate]);

  // Right-click context menu (node)
  const onNodeContextMenu: NodeMouseHandler = useCallback((event, node) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, type: "node", targetId: node.id });
  }, []);

  // Right-click context menu (edge)
  const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: RFEdge) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, type: "edge", targetId: edge.id });
  }, []);

  // Edge click → edit modal
  const onEdgeClick = useCallback((_event: React.MouseEvent, edge: RFEdge) => {
    const storeEdge = projectRef.current.edges.find((e) => e.id === edge.id);
    if (storeEdge) {
      setEdgeModal({
        open: true,
        editId: edge.id,
        initial: { label: storeEdge.label, trigger: storeEdge.trigger },
      });
    }
  }, []);

  // ── Screen Modal Actions ──
  const handleOpenAddScreen = useCallback(() => {
    setScreenModal({ open: true });
  }, []);

  const handleScreenSave = useCallback((data: ScreenFormData) => {
    if (screenModal.editId) {
      // Edit existing
      updateScreen(projectRef.current, screenModal.editId, {
        name: data.name,
        type: data.type,
        path: data.path,
        description: data.description,
      });
      setNodes((nds) => nds.map((n) => {
        if (n.id !== screenModal.editId) return n;
        const screen = projectRef.current.screens.find((s) => s.id === n.id)!;
        return { ...n, data: { ...screen } };
      }));
    } else {
      // Add new
      const screen = addScreen(projectRef.current, data.name, data.type, data.path);
      screen.description = data.description;
      saveProject(projectRef.current);
      setNodes((nds) => [...nds, {
        id: screen.id,
        type: "screenNode" as const,
        position: screen.position,
        data: screen,
      }]);
    }
    setScreenModal({ open: false });
  }, [screenModal.editId, setNodes]);

  // ── Edge Modal Actions ──
  const handleEdgeSave = useCallback((data: EdgeFormData) => {
    if (!edgeModal.editId) return;
    storeUpdateEdge(projectRef.current, edgeModal.editId, {
      label: data.label,
      trigger: data.trigger,
    });
    setEdges((eds) => eds.map((e) => {
      if (e.id !== edgeModal.editId) return e;
      return {
        ...e,
        label: data.label || (TRIGGER_LABELS[data.trigger] ?? ""),
      };
    }));
    setEdgeModal({ open: false });
  }, [edgeModal.editId, setEdges]);

  const handleEdgeDeleteFromModal = useCallback(() => {
    if (!edgeModal.editId) return;
    storeRemoveEdge(projectRef.current, edgeModal.editId);
    setEdges((eds) => eds.filter((e) => e.id !== edgeModal.editId));
    setEdgeModal({ open: false });
  }, [edgeModal.editId, setEdges]);

  // ── Context Menu Actions ──
  const handleEditNode = useCallback(() => {
    if (!contextMenu) return;
    const screen = projectRef.current.screens.find((s) => s.id === contextMenu.targetId);
    if (screen) {
      setScreenModal({
        open: true,
        editId: screen.id,
        initial: { name: screen.name, type: screen.type, path: screen.path, description: screen.description },
      });
    }
    setContextMenu(null);
  }, [contextMenu]);

  const handleDuplicateNode = useCallback(() => {
    if (!contextMenu) return;
    const screen = projectRef.current.screens.find((s) => s.id === contextMenu.targetId);
    if (screen) {
      const dup = addScreen(
        projectRef.current,
        `${screen.name} (コピー)`,
        screen.type,
        screen.path,
        { x: screen.position.x + 30, y: screen.position.y + 30 },
      );
      dup.description = screen.description;
      saveProject(projectRef.current);
      setNodes((nds) => [...nds, {
        id: dup.id,
        type: "screenNode" as const,
        position: dup.position,
        data: dup,
      }]);
    }
    setContextMenu(null);
  }, [contextMenu, setNodes]);

  const handleDeleteNode = useCallback(() => {
    if (!contextMenu) return;
    const screen = projectRef.current.screens.find((s) => s.id === contextMenu.targetId);
    if (screen && confirm(`「${screen.name}」を削除しますか？\nデザインデータも削除されます。`)) {
      removeScreen(projectRef.current, contextMenu.targetId);
      setNodes((nds) => nds.filter((n) => n.id !== contextMenu.targetId));
      setEdges((eds) => eds.filter(
        (e) => e.source !== contextMenu.targetId && e.target !== contextMenu.targetId
      ));
    }
    setContextMenu(null);
  }, [contextMenu, setNodes, setEdges]);

  const handleDesignNode = useCallback(() => {
    if (!contextMenu) return;
    navigate(`/design/${contextMenu.targetId}`);
    setContextMenu(null);
  }, [contextMenu, navigate]);

  // ── Edge Context Menu Actions ──
  const handleEditEdge = useCallback(() => {
    if (!contextMenu || contextMenu.type !== "edge") return;
    const storeEdge = projectRef.current.edges.find((e) => e.id === contextMenu.targetId);
    if (storeEdge) {
      setEdgeModal({
        open: true,
        editId: storeEdge.id,
        initial: { label: storeEdge.label, trigger: storeEdge.trigger },
      });
    }
    setContextMenu(null);
  }, [contextMenu]);

  const handleDeleteEdge = useCallback(() => {
    if (!contextMenu || contextMenu.type !== "edge") return;
    storeRemoveEdge(projectRef.current, contextMenu.targetId);
    setEdges((eds) => eds.filter((e) => e.id !== contextMenu.targetId));
    setContextMenu(null);
  }, [contextMenu, setEdges]);

  // Handle edge deletion via keyboard
  const onEdgesDelete = useCallback((deletedEdges: RFEdge[]) => {
    for (const e of deletedEdges) {
      storeRemoveEdge(projectRef.current, e.id);
    }
  }, []);

  // Handle nodes deletion via keyboard
  const onNodesDelete = useCallback((deletedNodes: RFNode[]) => {
    for (const n of deletedNodes) {
      removeScreen(projectRef.current, n.id);
    }
  }, []);

  // ── Project-level Actions ──
  const [projectName, setProjectName] = useState(() => projectRef.current.name);

  const handleRenameProject = useCallback((name: string) => {
    projectRef.current.name = name;
    saveProject(projectRef.current);
    setProjectName(name);
  }, []);

  const handleClearAll = useCallback(() => {
    if (!confirm("すべての画面と遷移を削除しますか？\n各画面のデザインデータも削除されます。")) return;
    for (const s of projectRef.current.screens) {
      localStorage.removeItem(`gjs-screen-${s.id}`);
    }
    projectRef.current.screens = [];
    projectRef.current.edges = [];
    saveProject(projectRef.current);
    setNodes([]);
    setEdges([]);
  }, [setNodes, setEdges]);

  // ── ファイル操作 ──
  const handleExportJSON = useCallback(() => {
    const json = exportProjectJSON(projectRef.current);
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectRef.current.name || "flow-project"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleImportJSON = useCallback((json: string) => {
    try {
      const imported = importProjectJSON(json);
      projectRef.current = imported;
      setNodes(toRFNodes(imported.screens));
      setEdges(toRFEdges(imported.edges));
      setProjectName(imported.name);
    } catch (e) {
      alert(`インポートに失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [setNodes, setEdges]);

  const handleCopyMermaid = useCallback(() => {
    const mermaid = generateMermaid(projectRef.current);
    navigator.clipboard.writeText(mermaid).then(
      () => alert("Mermaid 記法をクリップボードにコピーしました"),
      () => alert("クリップボードへのコピーに失敗しました"),
    );
  }, []);

  const handleExportMarkdown = useCallback(() => {
    const md = generateFlowMarkdown(projectRef.current);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectRef.current.name || "flow-project"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const isEmpty = nodes.length === 0;
  const screenCount = nodes.length;

  return (
    <div className="flow-root">
      <FlowTopbar
        projectName={projectName}
        screenCount={screenCount}
        onAddScreen={handleOpenAddScreen}
        onRenameProject={handleRenameProject}
        onClearAll={handleClearAll}
        onExportJSON={handleExportJSON}
        onImportJSON={handleImportJSON}
        onCopyMermaid={handleCopyMermaid}
        onExportMarkdown={handleExportMarkdown}
      />

      <div className="flow-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStop={onNodeDragStop}
          onNodeDoubleClick={onNodeDoubleClick}
          onNodeContextMenu={onNodeContextMenu}
          onEdgeClick={onEdgeClick}
          onEdgeContextMenu={onEdgeContextMenu}
          onEdgesDelete={onEdgesDelete}
          onNodesDelete={onNodesDelete}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          deleteKeyCode={["Backspace", "Delete"]}
          defaultEdgeOptions={{
            markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
            style: { strokeWidth: 2, stroke: "#94a3b8" },
          }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#cbd5e1" />
          <Controls showInteractive={false} />
          <MiniMap
            nodeColor="#6366f1"
            maskColor="rgba(241,245,249,0.7)"
            style={{ borderRadius: 8 }}
          />
        </ReactFlow>

        {isEmpty && (
          <div className="flow-empty-state">
            <i className="bi bi-diagram-3" />
            <p>画面がまだありません</p>
            <button className="flow-btn flow-btn-primary" onClick={handleOpenAddScreen}>
              <i className="bi bi-plus-lg" /> 最初の画面を追加
            </button>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="flow-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.type === "node" ? (
            <>
              <button className="flow-context-menu-item" onClick={handleDesignNode}>
                <i className="bi bi-pencil-square" /> デザインを開く
              </button>
              <button className="flow-context-menu-item" onClick={handleEditNode}>
                <i className="bi bi-gear" /> プロパティ編集
              </button>
              <button className="flow-context-menu-item" onClick={handleDuplicateNode}>
                <i className="bi bi-copy" /> 複製
              </button>
              <div className="flow-context-menu-separator" />
              <button className="flow-context-menu-item danger" onClick={handleDeleteNode}>
                <i className="bi bi-trash" /> 削除
              </button>
            </>
          ) : (
            <>
              <button className="flow-context-menu-item" onClick={handleEditEdge}>
                <i className="bi bi-pencil" /> 遷移を編集
              </button>
              <div className="flow-context-menu-separator" />
              <button className="flow-context-menu-item danger" onClick={handleDeleteEdge}>
                <i className="bi bi-trash" /> 遷移を削除
              </button>
            </>
          )}
        </div>
      )}

      {/* Screen Modal */}
      <ScreenEditModal
        open={screenModal.open}
        initial={screenModal.initial}
        title={screenModal.editId ? "画面の編集" : "画面の追加"}
        onSave={handleScreenSave}
        onClose={() => setScreenModal({ open: false })}
      />

      {/* Edge Modal */}
      <EdgeEditModal
        open={edgeModal.open}
        initial={edgeModal.initial}
        onSave={handleEdgeSave}
        onDelete={edgeModal.editId ? handleEdgeDeleteFromModal : undefined}
        onClose={() => setEdgeModal({ open: false })}
      />
    </div>
  );
}
