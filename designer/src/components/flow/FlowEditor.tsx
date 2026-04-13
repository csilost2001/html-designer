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
import GroupNodeComponent from "./GroupNodeComponent";
import { FlowTopbar, type ViewMode } from "./FlowTopbar";
import { ScreenTableView } from "./ScreenTableView";
import { ScreenEditModal, type ScreenFormData } from "./ScreenEditModal";
import { EdgeEditModal, type EdgeFormData, type HandlePosition } from "./EdgeEditModal";
import type { FlowProject, ScreenNode, ScreenEdge, ScreenGroup } from "../../types/flow";
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
  addGroup as storeAddGroup,
  updateGroup as storeUpdateGroup,
  removeGroup as storeRemoveGroup,
  exportProjectJSON,
  importProjectJSON,
  generateMermaid,
  generateFlowMarkdown,
} from "../../store/flowStore";
import { mcpBridge } from "../../mcp/mcpBridge";
import { useUndoKeyboard } from "../../hooks/useUndoKeyboard";
import "../../styles/flow.css";

const nodeTypes = {
  screenNode: ScreenNodeComponent,
  groupNode: GroupNodeComponent,
};

function toRFNodesWithGroups(screens: ScreenNode[], groups: ScreenGroup[]): RFNode[] {
  // Group nodes must come first so ReactFlow knows about parents before children
  const groupNodes: RFNode[] = (groups ?? []).map((g) => ({
    id: g.id,
    type: "groupNode",
    position: g.position,
    style: { width: g.size.width, height: g.size.height },
    data: { ...g },
    zIndex: -1,
    selectable: true,
    draggable: true,
  }));

  const screenNodes: RFNode[] = screens.map((s) => {
    const node: RFNode = {
      id: s.id,
      type: "screenNode",
      position: s.position,
      data: { ...s },
    };
    if (s.groupId) {
      node.parentId = s.groupId;
      node.extent = "parent";
    }
    return node;
  });

  return [...groupNodes, ...screenNodes];
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
  type: "node" | "group" | "edge";
  targetId: string;
}

function FlowEditorInner() {
  const navigate = useNavigate();
  const projectRef = useRef<FlowProject | null>(null);
  const { fitView, zoomTo } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<RFEdge>([]);
  const [projectName, setProjectName] = useState("読み込み中...");
  const [isLoading, setIsLoading] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>("flow");
  const needsFitViewRef = useRef(false);

  // Undo/Redo スタック
  const undoStackRef = useRef<FlowProject[]>([]);
  const redoStackRef = useRef<FlowProject[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const pushUndoSnapshot = useCallback(() => {
    if (!projectRef.current) return;
    undoStackRef.current = [...undoStackRef.current, JSON.parse(JSON.stringify(projectRef.current))].slice(-50);
    redoStackRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, []);

  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length === 0 || !projectRef.current) return;
    redoStackRef.current = [...redoStackRef.current, JSON.parse(JSON.stringify(projectRef.current))];
    const prev = undoStackRef.current[undoStackRef.current.length - 1];
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    projectRef.current = prev;
    setNodes(toRFNodesWithGroups(prev.screens, prev.groups ?? []));
    setEdges(toRFEdges(prev.edges));
    setProjectName(prev.name);
    saveProject(prev).catch(console.error);
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(true);
  }, [setNodes, setEdges]);

  const handleRedo = useCallback(() => {
    if (redoStackRef.current.length === 0 || !projectRef.current) return;
    undoStackRef.current = [...undoStackRef.current, JSON.parse(JSON.stringify(projectRef.current))];
    const next = redoStackRef.current[redoStackRef.current.length - 1];
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    projectRef.current = next;
    setNodes(toRFNodesWithGroups(next.screens, next.groups ?? []));
    setEdges(toRFEdges(next.edges));
    setProjectName(next.name);
    saveProject(next).catch(console.error);
    setCanUndo(true);
    setCanRedo(redoStackRef.current.length > 0);
  }, [setNodes, setEdges]);

  useUndoKeyboard(handleUndo, handleRedo);

  // プロジェクトを読み込んで UI に反映
  const reloadProject = useCallback(async () => {
    const project = await loadProject();
    projectRef.current = project;
    setNodes(toRFNodesWithGroups(project.screens, project.groups ?? []));
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
      return;
    }
    const group = (projectRef.current.groups ?? []).find((g) => g.id === node.id);
    if (group) {
      group.position = node.position;
      syncAndSave();
    }
  }, [syncAndSave]);

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || !projectRef.current) return;
    pushUndoSnapshot();
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
    const type = node.type === "groupNode" ? "group" : "node";
    setContextMenu({ x: event.clientX, y: event.clientY, type, targetId: node.id });
  }, []);

  const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: RFEdge) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, type: "edge", targetId: edge.id });
  }, []);

  const onEdgeDoubleClick = useCallback((_event: React.MouseEvent, edge: RFEdge) => {
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
    pushUndoSnapshot();
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
        data: { ...screen },
      }]);
    }
    setScreenModal({ open: false });
  }, [screenModal.editId, setNodes]);

  // ── Edge Modal Actions ──

  const handleEdgeSave = useCallback(async (data: EdgeFormData) => {
    if (!edgeModal.editId || !projectRef.current) return;
    pushUndoSnapshot();
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
    pushUndoSnapshot();
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
        data: dup as unknown as RFNode["data"],
      }]);
    }
    setContextMenu(null);
  }, [contextMenu, setNodes]);

  const handleDeleteNode = useCallback(async () => {
    if (!contextMenu || !projectRef.current) return;
    pushUndoSnapshot();
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

  // ── Group Actions ──

  const handleAddGroup = useCallback(async () => {
    if (!projectRef.current) return;
    const name = prompt("グループ名を入力してください", "グループ");
    if (!name) return;
    const group = await storeAddGroup(projectRef.current, name.trim(), { x: 80, y: 80 });
    setNodes((nds) => [{
      id: group.id,
      type: "groupNode",
      position: group.position,
      style: { width: group.size.width, height: group.size.height },
      data: { ...group },
      zIndex: -1,
      selectable: true,
      draggable: true,
    }, ...nds]);
  }, [setNodes]);

  const handleRenameGroup = useCallback(async () => {
    if (!contextMenu || !projectRef.current) return;
    const group = (projectRef.current.groups ?? []).find((g) => g.id === contextMenu.targetId);
    if (!group) return;
    const name = prompt("新しいグループ名を入力してください", group.name);
    if (!name || name.trim() === group.name) { setContextMenu(null); return; }
    await storeUpdateGroup(projectRef.current, group.id, { name: name.trim() });
    setNodes((nds) => nds.map((n) =>
      n.id === group.id ? { ...n, data: { ...n.data, name: name.trim() } } : n
    ));
    setContextMenu(null);
  }, [contextMenu, setNodes]);

  const handleDeleteGroup = useCallback(async () => {
    if (!contextMenu || !projectRef.current) return;
    const group = (projectRef.current.groups ?? []).find((g) => g.id === contextMenu.targetId);
    if (!group) return;
    if (!confirm(`グループ「${group.name}」を削除しますか？\n（画面はグループから外れますが削除されません）`)) {
      setContextMenu(null);
      return;
    }
    await storeRemoveGroup(projectRef.current, contextMenu.targetId);
    setNodes(toRFNodesWithGroups(projectRef.current.screens, projectRef.current.groups ?? []));
    setContextMenu(null);
  }, [contextMenu, setNodes]);

  const handleAssignGroup = useCallback(async (groupId: string) => {
    if (!contextMenu || !projectRef.current) return;
    const screen = projectRef.current.screens.find((s) => s.id === contextMenu.targetId);
    const group = (projectRef.current.groups ?? []).find((g) => g.id === groupId);
    if (!screen || !group) return;
    // Convert absolute position to relative within the group
    const absPos = screen.groupId
      ? (() => {
          const cur = (projectRef.current!.groups ?? []).find((g) => g.id === screen.groupId);
          return cur
            ? { x: screen.position.x + cur.position.x, y: screen.position.y + cur.position.y }
            : screen.position;
        })()
      : screen.position;
    screen.position = {
      x: Math.max(10, absPos.x - group.position.x),
      y: Math.max(32, absPos.y - group.position.y),
    };
    screen.groupId = groupId;
    screen.updatedAt = new Date().toISOString();
    await saveProject(projectRef.current);
    setNodes(toRFNodesWithGroups(projectRef.current.screens, projectRef.current.groups ?? []));
    setContextMenu(null);
  }, [contextMenu, setNodes]);

  const handleUnassignGroup = useCallback(async () => {
    if (!contextMenu || !projectRef.current) return;
    const screen = projectRef.current.screens.find((s) => s.id === contextMenu.targetId);
    if (!screen || !screen.groupId) return;
    const group = (projectRef.current.groups ?? []).find((g) => g.id === screen.groupId);
    if (group) {
      screen.position = {
        x: screen.position.x + group.position.x,
        y: screen.position.y + group.position.y,
      };
    }
    screen.groupId = undefined;
    screen.updatedAt = new Date().toISOString();
    await saveProject(projectRef.current);
    setNodes(toRFNodesWithGroups(projectRef.current.screens, projectRef.current.groups ?? []));
    setContextMenu(null);
  }, [contextMenu, setNodes]);

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
    pushUndoSnapshot();
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
    const project = projectRef.current;
    const promises = deletedNodes.map((n) => {
      if (project.screens.find((s) => s.id === n.id)) {
        return removeScreen(project, n.id);
      }
      if ((project.groups ?? []).find((g) => g.id === n.id)) {
        return storeRemoveGroup(project, n.id).then(() => {
          // Rebuild nodes to reflect ungrouped screens
          if (projectRef.current) {
            setNodes(toRFNodesWithGroups(projectRef.current.screens, projectRef.current.groups ?? []));
          }
          return true;
        });
      }
      return Promise.resolve(false);
    });
    Promise.all(promises).catch(console.error);
  }, [setNodes]);

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
      setNodes(toRFNodesWithGroups(imported.screens, imported.groups ?? []));
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

  const isEmpty = !isLoading && nodes.filter((n) => n.type === "screenNode").length === 0;
  const screenCount = nodes.filter((n) => n.type === "screenNode").length;

  return (
    <div className="flow-root">
      <FlowTopbar
        projectName={projectName}
        screenCount={screenCount}
        zoomLevel={zoomLevel}
        viewMode={viewMode}
        onAddScreen={handleOpenAddScreen}
        onAddGroup={() => { handleAddGroup().catch(console.error); }}
        onRenameProject={(name) => { handleRenameProject(name).catch(console.error); }}
        onClearAll={() => { handleClearAll().catch(console.error); }}
        onExportJSON={handleExportJSON}
        onImportJSON={(json) => { handleImportJSON(json).catch(console.error); }}
        onCopyMermaid={handleCopyMermaid}
        onExportMarkdown={handleExportMarkdown}
        onZoomChange={handleZoomChange}
        onFitView={handleFitView}
        onViewModeChange={setViewMode}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={canUndo}
        canRedo={canRedo}
      />

      <div className="flow-canvas">
        {isLoading ? (
          <div className="flow-loading">
            <div className="spinner" />
            <p>プロジェクトを読み込み中...</p>
          </div>
        ) : viewMode === "table" ? (
          <ScreenTableView
            screens={projectRef.current?.screens ?? []}
            onAdd={handleOpenAddScreen}
            onEdit={(screenId) => {
              if (!projectRef.current) return;
              const s = projectRef.current.screens.find((sc) => sc.id === screenId);
              if (s) {
                setScreenModal({
                  open: true,
                  editId: screenId,
                  initial: { name: s.name, type: s.type, path: s.path, description: s.description },
                });
              }
            }}
            onDelete={async (screenId) => {
              if (!projectRef.current) return;
              const s = projectRef.current.screens.find((sc) => sc.id === screenId);
              if (s && confirm(`「${s.name}」を削除しますか？\nデザインデータも削除されます。`)) {
                await removeScreen(projectRef.current, screenId);
                setNodes((nds) => nds.filter((n) => n.id !== screenId));
                setEdges((eds) => eds.filter((e) => e.source !== screenId && e.target !== screenId));
              }
            }}
          />
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
            onEdgeDoubleClick={onEdgeDoubleClick}
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

        {isEmpty && viewMode === "flow" && (
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
          {contextMenu.type === "group" ? (
            <>
              <button className="flow-context-menu-item" onClick={() => { handleRenameGroup().catch(console.error); }}>
                <i className="bi bi-pencil" /> グループ名を変更
              </button>
              <div className="flow-context-menu-separator" />
              <button className="flow-context-menu-item danger" onClick={() => { handleDeleteGroup().catch(console.error); }}>
                <i className="bi bi-trash" /> グループを削除
              </button>
            </>
          ) : contextMenu.type === "node" ? (
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
              {(() => {
                const screen = projectRef.current?.screens.find((s) => s.id === contextMenu.targetId);
                const groups = projectRef.current?.groups ?? [];
                if (!screen) return null;
                if (screen.groupId) {
                  return (
                    <>
                      <div className="flow-context-menu-separator" />
                      <button className="flow-context-menu-item" onClick={() => { handleUnassignGroup().catch(console.error); }}>
                        <i className="bi bi-collection" /> グループから外す
                      </button>
                    </>
                  );
                }
                if (groups.length > 0) {
                  return (
                    <>
                      <div className="flow-context-menu-separator" />
                      {groups.map((g) => (
                        <button key={g.id} className="flow-context-menu-item" onClick={() => { handleAssignGroup(g.id).catch(console.error); }}>
                          <i className="bi bi-collection" /> 「{g.name}」に追加
                        </button>
                      ))}
                    </>
                  );
                }
                return null;
              })()}
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
