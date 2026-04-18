import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { FlowProject, ScreenNode } from "../../types/flow";
import { SCREEN_TYPE_LABELS, SCREEN_TYPE_ICONS } from "../../types/flow";
import { loadProject, saveProject, addScreen, removeScreen } from "../../store/flowStore";
import { mcpBridge } from "../../mcp/mcpBridge";
import { DataList, type DataListColumn } from "../common/DataList";
import { FilterBar } from "../common/FilterBar";
import { ViewModeToggle, type ViewMode } from "../common/ViewModeToggle";
import { useListSelection } from "../../hooks/useListSelection";
import { useListClipboard } from "../../hooks/useListClipboard";
import { useListKeyboard } from "../../hooks/useListKeyboard";
import { useListFilter } from "../../hooks/useListFilter";
import { useListSort } from "../../hooks/useListSort";
import { usePersistentState } from "../../hooks/usePersistentState";
import { ScreenEditModal, type ScreenFormData } from "./ScreenEditModal";
import "../../styles/flow.css";
import "../../styles/screenList.css";

const STORAGE_KEY = "list-view-mode:screen-list";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ja-JP", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function ScreenListView() {
  const navigate = useNavigate();
  const [project, setProject] = useState<FlowProject | null>(null);
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = usePersistentState<ViewMode>(STORAGE_KEY, "card");
  const [screenModal, setScreenModal] = useState<{ open: boolean; editId?: string; initial?: Partial<ScreenFormData> }>({ open: false });

  const reload = useCallback(async () => {
    const p = await loadProject();
    setProject(p);
  }, []);

  useEffect(() => {
    mcpBridge.startWithoutEditor();
    reload();
    const unsub = mcpBridge.onStatusChange((s) => { if (s === "connected") reload(); });
    const unsubProj = mcpBridge.onBroadcast("projectChanged", () => { reload(); });
    return () => { unsub(); unsubProj(); };
  }, [reload]);

  const screens = project?.screens ?? [];

  const filter = useListFilter(screens);

  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      filter.applyFilter(null);
      return;
    }
    filter.applyFilter((s) =>
      s.name.toLowerCase().includes(q) ||
      (s.path || "").toLowerCase().includes(q) ||
      (SCREEN_TYPE_LABELS[s.type] || "").toLowerCase().includes(q),
    );
    // filter は安定 API
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const sortAccessor = useCallback((s: ScreenNode, key: string): string | number => {
    switch (key) {
      case "name": return s.name;
      case "type": return SCREEN_TYPE_LABELS[s.type] ?? "";
      case "path": return s.path ?? "";
      case "hasDesign": return s.hasDesign ? 1 : 0;
      case "updatedAt": return s.updatedAt;
      default: return "";
    }
  }, []);

  const sort = useListSort(filter.filtered, sortAccessor);
  const selection = useListSelection(sort.sorted, (s) => s.id);
  const clipboard = useListClipboard<ScreenNode>((s) => s.id);

  const handleActivate = useCallback((s: ScreenNode) => {
    navigate(`/screen/design/${s.id}`);
  }, [navigate]);

  const handleDelete = async (items: ScreenNode[]) => {
    if (!project) return;
    if (!confirm(`${items.length} 件の画面を削除しますか？\nデザインデータも削除されます。`)) return;
    for (const s of items) {
      await removeScreen(project, s.id);
    }
    await reload();
    selection.clearSelection();
  };

  const handleReorder = (fromIdx: number, toIdx: number) => {
    if (!project) return;
    if (sort.sortKeys.length > 0) sort.clearSort();
    const visible = filter.filtered;
    const fromId = visible[fromIdx]?.id;
    const toId = visible[toIdx]?.id;
    if (!fromId || !toId) return;
    const realFrom = project.screens.findIndex((s) => s.id === fromId);
    const realTo = project.screens.findIndex((s) => s.id === toId);
    if (realFrom < 0 || realTo < 0) return;
    const [moved] = project.screens.splice(realFrom, 1);
    project.screens.splice(realTo, 0, moved);
    saveProject(project).then(reload).catch(console.error);
  };

  const handleAddNew = () => {
    setScreenModal({ open: true });
  };

  const handleScreenSave = async (data: ScreenFormData) => {
    if (!project) return;
    if (screenModal.editId) {
      const s = project.screens.find((sc) => sc.id === screenModal.editId);
      if (s) {
        s.name = data.name;
        s.type = data.type;
        s.path = data.path;
        s.description = data.description;
        s.updatedAt = new Date().toISOString();
        await saveProject(project);
      }
    } else {
      const screen = await addScreen(project, data.name, data.type, data.path);
      screen.description = data.description;
      await saveProject(project);
    }
    setScreenModal({ open: false });
    await reload();
  };

  useListKeyboard({
    items: sort.sorted,
    getId: (s) => s.id,
    selection,
    clipboard,
    layout: viewMode === "card" ? "grid" : "list",
    onActivate: handleActivate,
    onDelete: handleDelete,
  });

  const columns = useMemo<DataListColumn<ScreenNode>[]>(() => [
    {
      key: "name",
      header: "画面名",
      sortable: true,
      sortAccessor: (s) => s.name,
      render: (s) => (
        <span className="screen-table-name">
          <i className={`bi ${SCREEN_TYPE_ICONS[s.type] ?? "bi-circle"} screen-table-icon`} />
          {s.name}
        </span>
      ),
    },
    {
      key: "type",
      header: "種別",
      width: "120px",
      sortable: true,
      sortAccessor: (s) => SCREEN_TYPE_LABELS[s.type] ?? "",
      render: (s) => <span className="screen-type-badge">{SCREEN_TYPE_LABELS[s.type] ?? s.type}</span>,
    },
    {
      key: "path",
      header: "URL",
      sortable: true,
      sortAccessor: (s) => s.path ?? "",
      render: (s) => s.path || <span className="screen-table-empty-cell">—</span>,
    },
    {
      key: "hasDesign",
      header: "デザイン",
      width: "130px",
      sortable: true,
      sortAccessor: (s) => (s.hasDesign ? 1 : 0),
      render: (s) => (
        <span className={`screen-design-badge${s.hasDesign ? "" : " empty"}`}>
          <i className={`bi ${s.hasDesign ? "bi-brush-fill" : "bi-brush"}`} />
          {s.hasDesign ? "デザイン済" : "未デザイン"}
        </span>
      ),
    },
    {
      key: "updatedAt",
      header: "更新日時",
      width: "160px",
      sortable: true,
      sortAccessor: (s) => s.updatedAt,
      render: (s) => <span className="screen-table-date">{formatDate(s.updatedAt)}</span>,
    },
  ], []);

  const renderCard = (s: ScreenNode) => (
    <div className="screen-card-content">
      <div className="screen-card-head">
        <i className={`bi ${SCREEN_TYPE_ICONS[s.type] ?? "bi-circle"} screen-card-icon`} />
        <span className="screen-card-name">{s.name}</span>
        <span className="screen-type-badge">{SCREEN_TYPE_LABELS[s.type] ?? s.type}</span>
      </div>
      {s.path && <div className="screen-card-path">{s.path}</div>}
      <div className="screen-card-meta">
        <span className={`screen-design-badge${s.hasDesign ? "" : " empty"}`}>
          <i className={`bi ${s.hasDesign ? "bi-brush-fill" : "bi-brush"}`} />
          {s.hasDesign ? "デザイン済" : "未デザイン"}
        </span>
        <span className="screen-card-date">{formatDate(s.updatedAt)}</span>
      </div>
    </div>
  );

  return (
    <div className="screen-list-page">
      <div className="screen-list-header">
        <h2 className="screen-list-title">
          <i className="bi bi-list-ul" /> 画面一覧
          <span className="screen-list-count">{screens.length} 画面</span>
        </h2>
        <div className="screen-list-header-tools">
          <div className="screen-list-search">
            <i className="bi bi-search" />
            <input
              type="text"
              placeholder="画面名・URL・種別で絞り込み..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button className="clear-btn" onClick={() => setQuery("")} title="クリア">
                <i className="bi bi-x-circle-fill" />
              </button>
            )}
          </div>
          <ViewModeToggle mode={viewMode} onChange={setViewMode} storageKey={STORAGE_KEY} />
          <button className="flow-btn flow-btn-primary" onClick={handleAddNew}>
            <i className="bi bi-plus-lg" /> 画面を追加
          </button>
        </div>
      </div>

      <FilterBar
        isActive={filter.isActive}
        totalCount={filter.totalCount}
        visibleCount={filter.visibleCount}
        label={query ? `検索: "${query}"` : undefined}
        onClear={() => { setQuery(""); filter.clearFilter(); }}
      />

      <div className="screen-list-body">
        <DataList
          items={sort.sorted}
          columns={columns}
          getId={(s) => s.id}
          selection={selection}
          clipboard={clipboard}
          sort={sort}
          onActivate={handleActivate}
          onReorder={handleReorder}
          layout={viewMode === "card" ? "grid" : "list"}
          renderCard={renderCard}
          showNumColumn={viewMode === "table"}
          emptyMessage={
            query
              ? <p>該当する画面がありません</p>
              : <p>画面がまだありません。「画面を追加」から作成してください。</p>
          }
        />
      </div>

      <ScreenEditModal
        open={screenModal.open}
        initial={screenModal.initial}
        title={screenModal.editId ? "画面の編集" : "画面の追加"}
        onSave={(data) => { handleScreenSave(data).catch(console.error); }}
        onClose={() => setScreenModal({ open: false })}
      />
    </div>
  );
}
