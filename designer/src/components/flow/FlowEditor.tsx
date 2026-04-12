import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  MiniMap,
  addEdge as rfAddEdge,
  reconnectEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ConnectionMode,
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
import { EdgeEditModal, type EdgeFormData, type HandlePosition } from "./EdgeEditModal";
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
    reconnectable: true,
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

function FlowEditorInner() {
  const navigate = useNavigate();
  const projectRef = useRef<FlowProject | null>(null);
  const { fitView, zoomTo } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [projectName, setProjectName] = useState("読み込み中...");
  const [isLoading, setIsLoading] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const needsFitViewRef = useRef(false);

  // プロジェクトを読み込んで UI に反映
  const reloadProject = useCallback(async () => {
    const project = await loadProject();
    projectRef.current = project;
    setNodes(toRFNodes(project.screens));
    setEdges(toRFEdges(project.edges));
    setProjectName(project.name);
    needsFitViewRef.current = project.screens.length > 0;
    setIsLoading(false);
  }, [setNodes, setEdges]);

  // ロード完了 or ノード変更後に全体フィット
  useEffect(() => {
    if (!isLoading && needsFitViewRef.current && nodes.length > 0) {
      needsFitViewRef.current = false;
      requestAnimationFrame(() => {
        fitView({ padding: 0.3, maxZoom: 1, duration: 200 });
      });
    }
  }, [isLoading, nodes, fitView]);

  // MCP bridge + 初回ロード + ブロードキャスト受信
  useEffect(() => {
    let mounted = true;

    mcpBridge.setNavigateHandler((path) => navigate(path));

    // MCP 経由でフローが変更されたとき（addScreen 等）
    mcpBridge.setFlowChangeHandler(() => {
      if (mounted) reloadProject().catch(console.error);
    });

    // 他タブ/ブラウザでプロジェクトが変更されたとき
    const unsubProject = mcpBridge.onBroadcast("projectChanged", () => {
      if (mounted) reloadProject().catch(console.error);
    });

    // WS 接続完了時にファイルから再ロード（初回ロード時にバックエンドが未設定だった場合の補完）
    const unsubStatus = mcpBridge.onStatusChange((status) => {
      if (status === "connected" && mounted) {
        reloadProject().catch(console.error);
      }
    });

    // エディターなしで WebSocket 接続を維持
    mcpBridge.startWithoutEditor();

    // 初回ロード（WS 未接続時は localStorage フォールバック）
    reloadProject().catch(console.error);

    return () => {
      mounted = false;
      mcpBridge.setNavigateHandler(null);
      mcpBridge.setFlowChangeHandler(null);
      unsubProject();
      unsubStatus();
    };
  }, [navigate, reloadProject]);

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

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [contextMenu]);

  // ノード位置変更時の保存デバウンス
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncAndSave = useCallback(() => {
    if (!projectRef.current) return;
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = setTimeout(() => {
      if (projectRef.current) {
        saveProject(projectRef.current).catch(console.error);
      }
    }, 300);
  }, []);

  const onNodeDragStop = useCallback((_: unknown, node: RFNode) => {
    if (!projectRef.current) return;
    const screen = projectRef.current.screens.find((s) => s.id === node.id);
    if (screen) {
      screen.position = node.position;
      syncAndSave();
    }
  }, [syncAndSave]);

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || !projectRef.current) return;
    storeAddEdge(
      projectRef.current,
      connection.source,
      connection.target,
      "",
      "click",
      connection.sourceHandle ?? undefined,
      connection.targetHandle ?? undefined,
    ).then((edge) => {
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
    }).catch(console.error);
  }, [setEdges]);

  const onNodeDoubleClick: NodeMouseHandler = useCallback((_event, node) => {
    navigate(`/design/${node.id}`);
  }, [navigate]);

  const onNodeContextMenu: NodeMouseHandler = useCallback((event, node) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, type: "node", targetId: node.id });
  }, []);

  const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: RFEdge) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, type: "edge", targetId: edge.id });
  }, []);

  const onEdgeClick = useCallback((_event: React.MouseEvent, edge: RFEdge) => {
    if (!projectRef.current) return;
    const storeEdge = projectRef.current.edges.find((e) => e.id === edge.id);
    if (storeEdge) {
      setEdgeModal({
        open: true,
        editId: edge.id,
        initial: {
          label: storeEdge.label,
          trigger: storeEdge.trigger,
          sourceHandle: (storeEdge.sourceHandle ?? "bottom") as HandlePosition,
          targetHandle: (storeEdge.targetHandle ?? "top") as HandlePosition,
        },
      });
    }
  }, []);

  // ── Screen Modal Actions ──

  const handleOpenAddScreen = useCallback(() => {
    setScreenModal({ open: true });
  }, []);

  const handleScreenSave = useCallback(async (data: ScreenFormData) => {
    if (!projectRef.current) return;
    if (screenModal.editId) {
      await updateScreen(projectRef.current, screenModal.editId, {
        name: data.name,
        type: data.type,
        path: data.path,
        description: data.description,
      });
      setNodes((nds) => nds.map((n) => {
        if (n.id !== screenModal.editId || !projectRef.current) return n;
        const screen = projectRef.current.screens.find((s) => s.id === n.id)!;
        return { ...n, data: { ...screen } };
      }));
    } else {
      const screen = await addScreen(projectRef.current, data.name, data.type, data.path);
      screen.description = data.description;
      await saveProject(projectRef.current);
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

  const handleEdgeSave = useCallback(async (data: EdgeFormData) => {
    if (!edgeModal.editId || !projectRef.current) return;
    await storeUpdateEdge(projectRef.current, edgeModal.editId, {
      label: data.label,
      trigger: data.trigger,
      sourceHandle: data.sourceHandle,
      targetHandle: data.targetHandle,
    });
    setEdges((eds) => eds.map((e) => {
      if (e.id !== edgeModal.editId) return e;
      return {
        ...e,
        label: data.label || (TRIGGER_LABELS[data.trigger] ?? ""),
        sourceHandle: data.sourceHandle,
        targetHandle: data.targetHandle,
      };
    }));
    setEdgeModal({ open: false });
  }, [edgeModal.editId, setEdges]);

  const handleEdgeDeleteFromModal = useCallback(async () => {
    if (!edgeModal.editId || !projectRef.current) return;
    await storeRemoveEdge(projectRef.current, edgeModal.editId);
    setEdges((eds) => eds.filter((e) => e.id !== edgeModal.editId));
    setEdgeModal({ open: false });
  }, [edgeModal.editId, setEdges]);

  // ── Context Menu Actions ──

  const handleEditNode = useCallback(() => {
    if (!contextMenu || !projectRef.current) return;
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

  const handleDuplicateNode = useCallback(async () => {
    if (!contextMenu || !projectRef.current) return;
    const screen = projectRef.current.screens.find((s) => s.id === contextMenu.targetId);
    if (screen) {
      const dup = await addScreen(
        projectRef.current,
        `${screen.name} (コピー)`,
        screen.type,
        screen.path,
        { x: screen.position.x + 30, y: screen.position.y + 30 },
      );
      dup.description = screen.description;
      await saveProject(projectRef.current);
      setNodes((nds) => [...nds, {
        id: dup.id,
        type: "screenNode" as const,
        position: dup.position,
        data: dup,
      }]);
    }
    setContextMenu(null);
  }, [contextMenu, setNodes]);

  const handleDeleteNode = useCallback(async () => {
    if (!contextMenu || !projectRef.current) return;
    const screen = projectRef.current.screens.find((s) => s.id === contextMenu.targetId);
    if (screen && confirm(`「${screen.name}」を削除しますか？\nデザインデータも削除されます。`)) {
      await removeScreen(projectRef.current, contextMenu.targetId);
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
    if (!contextMenu || contextMenu.type !== "edge" || !projectRef.current) return;
    const storeEdge = projectRef.current.edges.find((e) => e.id === contextMenu.targetId);
    if (storeEdge) {
      setEdgeModal({
        open: true,
        editId: storeEdge.id,
        initial: {
          label: storeEdge.label,
          trigger: storeEdge.trigger,
          sourceHandle: (storeEdge.sourceHandle ?? "bottom") as HandlePosition,
          targetHandle: (storeEdge.targetHandle ?? "top") as HandlePosition,
        },
      });
    }
    setContextMenu(null);
  }, [contextMenu]);

  const handleDeleteEdge = useCallback(async () => {
    if (!contextMenu || contextMenu.type !== "edge" || !projectRef.current) return;
    await storeRemoveEdge(projectRef.current, contextMenu.targetId);
    setEdges((eds) => eds.filter((e) => e.id !== contextMenu.targetId));
    setContextMenu(null);
  }, [contextMenu, setEdges]);

  // ドラッグによるエッジ端点の付け替え
  const onReconnect = useCallback((oldEdge: RFEdge, newConnection: Connection) => {
    setEdges((eds) => reconnectEdge(oldEdge, newConnection, eds));
    if (!projectRef.current) return;
    storeUpdateEdge(projectRef.current, oldEdge.id, {
      sourceHandle: (newConnection.sourceHandle ?? oldEdge.sourceHandle ?? "bottom") as HandlePosition,
      targetHandle: (newConnection.targetHandle ?? oldEdge.targetHandle ?? "top") as HandlePosition,
    }).catch(console.error);
  }, [setEdges]);

  const onEdgesDelete = useCallback((deletedEdges: RFEdge[]) => {
    if (!projectRef.current) return;
    Promise.all(deletedEdges.map((e) => storeRemoveEdge(projectRef.current!, e.id)))
      .catch(console.error);
  }, []);

  const onNodesDelete = useCallback((deletedNodes: RFNode[]) => {
    if (!projectRef.current) return;
    Promise.all(deletedNodes.map((n) => removeScreen(projectRef.current!, n.id)))
      .catch(console.error);
  }, []);

  // ── Project-level Actions ──

  const handleRenameProject = useCallback(async (name: string) => {
    if (!projectRef.current) return;
    projectRef.current.name = name;
    await saveProject(projectRef.current);
    setProjectName(name);
  }, []);

  const handleClearAll = useCallback(async () => {
    if (!projectRef.current) return;
    if (!confirm("すべての画面と遷移を削除しますか？\n各画面のデザインデータも削除されます。")) return;
    // スナップショットを取ってから削除（removeScreen が配列を変更するため）
    for (const s of [...projectRef.current.screens]) {
      await removeScreen(projectRef.current, s.id).catch(console.error);
    }
    setNodes([]);
    setEdges([]);
  }, [setNodes, setEdges]);

  // ── ファイル操作 ──

  const handleExportJSON = useCallback(() => {
    if (!projectRef.current) return;
    const json = exportProjectJSON(projectRef.current);
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectRef.current.name || "flow-project"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleImportJSON = useCallback(async (json: string) => {
    try {
      const imported = await importProjectJSON(json);
      projectRef.current = imported;
      setNodes(toRFNodes(imported.screens));
      setEdges(toRFEdges(imported.edges));
      setProjectName(imported.name);
      needsFitViewRef.current = imported.screens.length > 0;
    } catch (e) {
      alert(`インポートに失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [setNodes, setEdges]);

  const handleZoomChange = useCallback((zoom: number) => {
    const clamped = Math.min(2, Math.max(0.25, zoom));
    zoomTo(clamped, { duration: 150 });
  }, [zoomTo]);

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.3, maxZoom: 1, duration: 200 });
  }, [fitView]);

  const handleCopyMermaid = useCallback(() => {
    if (!projectRef.current) return;
    const mermaid = generateMermaid(projectRef.current);
    navigator.clipboard.writeText(mermaid).then(
      () => alert("Mermaid 記法をクリップボードにコピーしました"),
      () => alert("クリップボードへのコピーに失敗しました"),
    );
  }, []);

  const handleExportMarkdown = useCallback(() => {
    if (!projectRef.current) return;
    const md = generateFlowMarkdown(projectRef.current);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectRef.current.name || "flow-project"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const isEmpty = !isLoading && nodes.length === 0;
  const screenCount = nodes.length;

  return (
    <div className="flow-root">
      <FlowTopbar
        projectName={projectName}
        screenCount={screenCount}
        zoomLevel={zoomLevel}
        onAddScreen={handleOpenAddScreen}
        onRenameProject={(name) => { handleRenameProject(name).catch(console.error); }}
        onClearAll={() => { handleClearAll().catch(console.error); }}
        onExportJSON={handleExportJSON}
        onImportJSON={(json) => { handleImportJSON(json).catch(console.error); }}
        onCopyMermaid={handleCopyMermaid}
        onExportMarkdown={handleExportMarkdown}
        onZoomChange={handleZoomChange}
        onFitView={handleFitView}
      />

      <div className="flow-canvas">
        {isLoading ? (
          <div className="flow-loading">
            <div className="spinner" />
            <p>プロジェクトを読み込み中...</p>
          </div>
        ) : (
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
            onReconnect={onReconnect}
            onEdgesDelete={onEdgesDelete}
            onNodesDelete={onNodesDelete}
            onViewportChange={(vp) => setZoomLevel(vp.zoom)}
            nodeTypes={nodeTypes}
            connectionMode={ConnectionMode.Loose}
            deleteKeyCode={["Backspace", "Delete"]}
            defaultEdgeOptions={{
              markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
              style: { strokeWidth: 2, stroke: "#94a3b8" },
            }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#cbd5e1" />
            <MiniMap
              nodeColor="#6366f1"
              maskColor="rgba(241,245,249,0.7)"
              style={{ borderRadius: 8 }}
            />
          </ReactFlow>
        )}

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
              <button className="flow-context-menu-item" onClick={() => { handleDuplicateNode().catch(console.error); }}>
                <i className="bi bi-copy" /> 複製
              </button>
              <div className="flow-context-menu-separator" />
              <button className="flow-context-menu-item danger" onClick={() => { handleDeleteNode().catch(console.error); }}>
                <i className="bi bi-trash" /> 削除
              </button>
            </>
          ) : (
            <>
              <button className="flow-context-menu-item" onClick={handleEditEdge}>
                <i className="bi bi-pencil" /> 遷移を編集
              </button>
              <div className="flow-context-menu-separator" />
              <button className="flow-context-menu-item danger" onClick={() => { handleDeleteEdge().catch(console.error); }}>
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
        onSave={(data) => { handleScreenSave(data).catch(console.error); }}
        onClose={() => setScreenModal({ open: false })}
      />

      {/* Edge Modal */}
      <EdgeEditModal
        open={edgeModal.open}
        initial={edgeModal.initial}
        onSave={(data) => { handleEdgeSave(data).catch(console.error); }}
        onDelete={edgeModal.editId ? () => { handleEdgeDeleteFromModal().catch(console.error); } : undefined}
        onClose={() => setEdgeModal({ open: false })}
      />
    </div>
  );
}

export function FlowEditor() {
  return (
    <ReactFlowProvider>
      <FlowEditorInner />
    </ReactFlowProvider>
  );
}
