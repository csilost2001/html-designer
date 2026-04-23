import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { SequenceMeta } from "../../types/sequence";
import { listSequences, createSequence, deleteSequence } from "../../store/sequenceStore";
import { loadProject, saveProject } from "../../store/flowStore";
import { mcpBridge } from "../../mcp/mcpBridge";
import { makeTabId } from "../../store/tabStore";
import { DataList, type DataListColumn } from "../common/DataList";
import { FilterBar } from "../common/FilterBar";
import { SortBar } from "../common/SortBar";
import { ListContextMenu, type ContextMenuItem } from "../common/ListContextMenu";
import { ViewModeToggle, type ViewMode } from "../common/ViewModeToggle";
import { useListSelection } from "../../hooks/useListSelection";
import { useListClipboard } from "../../hooks/useListClipboard";
import { useListKeyboard } from "../../hooks/useListKeyboard";
import { useListFilter } from "../../hooks/useListFilter";
import { useListSort } from "../../hooks/useListSort";
import { useListEditor } from "../../hooks/useListEditor";
import { usePersistentState } from "../../hooks/usePersistentState";
import { renumber } from "../../utils/listOrder";

const STORAGE_KEY = "list-view-mode:sequence-list";
const TAB_ID = makeTabId("sequence-list", "main");

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ja-JP");
  } catch {
    return iso;
  }
}

export function SequenceListView() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = usePersistentState<ViewMode>(STORAGE_KEY, "card");
  const [showAdd, setShowAdd] = useState(false);
  const [addId, setAddId] = useState("");
  const [addDescription, setAddDescription] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);

  const loadSequences = useCallback(async () => {
    mcpBridge.startWithoutEditor();
    await loadProject();
    return await listSequences();
  }, []);

  const commitSequences = useCallback(async ({ itemsInOrder, deletedIds }: { itemsInOrder: SequenceMeta[]; deletedIds: string[] }) => {
    for (const id of deletedIds) {
      await deleteSequence(id);
    }
    const project = await loadProject();
    if (project.sequences) {
      const deletedSet = new Set(deletedIds);
      const orderMap = new Map(itemsInOrder.map((s, i) => [s.id, i]));
      project.sequences = project.sequences
        .filter((s) => !deletedSet.has(s.id))
        .sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
      await saveProject(project);
    }
  }, []);

  const editor = useListEditor<SequenceMeta>({
    getId: (s) => s.id,
    load: loadSequences,
    commit: commitSequences,
    tabId: TAB_ID,
    renumber,
  });

  useEffect(() => {
    editor.reload();
    const unsubStatus = mcpBridge.onStatusChange((s) => {
      if (s === "connected" && !editor.isDirty) editor.reload();
    });
    const unsubProj = mcpBridge.onBroadcast("projectChanged", () => {
      if (!editor.isDirty) editor.reload();
    });
    const unsubSeq = mcpBridge.onBroadcast("sequenceChanged", () => {
      if (!editor.isDirty) editor.reload();
    });
    return () => { unsubStatus(); unsubProj(); unsubSeq(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allSequences = editor.items;

  const filter = useListFilter(allSequences);
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      filter.applyFilter(null);
      return;
    }
    filter.applyFilter((s) =>
      s.id.toLowerCase().includes(q) ||
      (s.conventionRef ?? "").toLowerCase().includes(q) ||
      (s.description ?? "").toLowerCase().includes(q),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const sortAccessor = useCallback((s: SequenceMeta, key: string): string | number => {
    switch (key) {
      case "id": return s.id;
      case "conventionRef": return s.conventionRef ?? "";
      case "description": return s.description ?? "";
      case "updatedAt": return s.updatedAt;
      default: return "";
    }
  }, []);

  const sort = useListSort(filter.filtered, sortAccessor);
  const selection = useListSelection(sort.sorted, (s) => s.id);
  const clipboard = useListClipboard<SequenceMeta>((s) => s.id);

  const handleActivate = useCallback((s: SequenceMeta) => {
    if (editor.isDeleted(s.id)) return;
    navigate(`/sequence/edit/${encodeURIComponent(s.id)}`);
  }, [navigate, editor]);

  const handleDelete = (items: SequenceMeta[]) => {
    editor.markDeleted(items.map((s) => s.id));
  };

  const handleReorder = (fromIdx: number, toIdx: number) => {
    const visible = sort.sorted;
    const fromId = visible[fromIdx]?.id;
    const toId = visible[toIdx]?.id;
    if (!fromId || !toId) return;
    const realFrom = editor.items.findIndex((s) => s.id === fromId);
    const realTo = editor.items.findIndex((s) => s.id === toId);
    if (realFrom < 0 || realTo < 0) return;
    editor.reorder(realFrom, realTo);
  };

  const moveBlock = (items: SequenceMeta[], direction: "up" | "down") => {
    const ids = new Set(items.map((s) => s.id));
    const idxs = editor.items
      .map((s, i) => (ids.has(s.id) ? i : -1))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b);
    if (idxs.length === 0) return;
    if (direction === "up") {
      if (idxs[0] === 0) return;
      editor.setItems((prev) => {
        const next = [...prev];
        const [moved] = next.splice(idxs[0] - 1, 1);
        next.splice(idxs[idxs.length - 1], 0, moved);
        return renumber(next);
      });
    } else {
      if (idxs[idxs.length - 1] === editor.items.length - 1) return;
      editor.setItems((prev) => {
        const next = [...prev];
        const [moved] = next.splice(idxs[idxs.length - 1] + 1, 1);
        next.splice(idxs[0], 0, moved);
        return renumber(next);
      });
    }
  };

  const sortActive = sort.sortKeys.length > 0;

  const columnLabels = useMemo<Record<string, string>>(() => ({
    id: "シーケンス名",
    conventionRef: "規約参照",
    description: "説明",
    updatedAt: "更新日",
  }), []);

  const handleAdd = async () => {
    const id = addId.trim();
    if (!id) return;
    const seq = await createSequence(id, addDescription.trim() || undefined);
    setShowAdd(false);
    setAddId("");
    setAddDescription("");
    navigate(`/sequence/edit/${encodeURIComponent(seq.id)}`);
  };

  const buildMenuItems = (target: SequenceMeta | null): ContextMenuItem[] => {
    const hasSelection = selection.selectedIds.size > 0 || target !== null;
    const sortReason = "ソート中は無効 (ソート解除で利用可能)";

    if (target === null && selection.selectedIds.size === 0) {
      return [
        {
          key: "new", label: "新規作成", icon: "bi-plus-lg",
          disabled: sortActive, disabledReason: sortReason,
          onClick: () => setShowAdd(true),
        },
      ];
    }

    const items = target && !selection.isSelected(target.id)
      ? [target]
      : selection.selectedItems;

    return [
      {
        key: "new", label: "新規作成", icon: "bi-plus-lg",
        disabled: sortActive, disabledReason: sortReason,
        onClick: () => setShowAdd(true),
      },
      { key: "sep1", separator: true },
      {
        key: "copy", label: "コピー", icon: "bi-files", shortcut: "Ctrl+C",
        disabled: !hasSelection,
        onClick: () => { if (items.length > 0) clipboard.copy(items); },
      },
      {
        key: "cut", label: "切り取り", icon: "bi-scissors", shortcut: "Ctrl+X",
        disabled: !hasSelection,
        onClick: () => { if (items.length > 0) clipboard.cut(items); },
      },
      { key: "sep2", separator: true },
      {
        key: "delete", label: "削除", icon: "bi-trash", shortcut: "Delete",
        disabled: !hasSelection, danger: true,
        onClick: () => { if (items.length > 0) handleDelete(items); },
      },
    ];
  };

  const handleContextMenu = (e: React.MouseEvent, target: SequenceMeta | null) => {
    setContextMenu({ x: e.clientX, y: e.clientY, items: buildMenuItems(target) });
  };

  const handleContextMenuKey = (first: SequenceMeta | null, rect: DOMRect | null) => {
    if (first && !selection.isSelected(first.id)) {
      selection.setSelectedIds(new Set([first.id]));
    }
    const x = rect ? rect.left : 100;
    const y = rect ? rect.bottom : 100;
    setContextMenu({ x, y, items: buildMenuItems(first) });
  };

  const handleRowDelete = (s: SequenceMeta) => {
    handleDelete([s]);
  };

  useListKeyboard({
    items: sort.sorted,
    getId: (s) => s.id,
    selection,
    clipboard,
    sort,
    layout: viewMode === "card" ? "grid" : "list",
    onActivate: handleActivate,
    onDelete: handleDelete,
    onMoveUp: (items) => moveBlock(items, "up"),
    onMoveDown: (items) => moveBlock(items, "down"),
    onContextMenuKey: handleContextMenuKey,
  });

  const handleSave = () => {
    editor.save().catch(console.error);
    selection.clearSelection();
  };

  const handleReset = () => {
    if (!confirm("未保存の変更を破棄してサーバの状態に戻しますか？")) return;
    editor.reset().catch(console.error);
    selection.clearSelection();
  };

  const columns = useMemo<DataListColumn<SequenceMeta>[]>(() => [
    {
      key: "id",
      header: "シーケンス名",
      sortable: true,
      sortAccessor: (s) => s.id,
      render: (s) => <code className="seq-list-name-code">{s.id}</code>,
    },
    {
      key: "conventionRef",
      header: "規約参照",
      sortable: true,
      sortAccessor: (s) => s.conventionRef ?? "",
      render: (s) => s.conventionRef
        ? <span className="seq-list-conv-ref">{s.conventionRef}</span>
        : null,
    },
    {
      key: "description",
      header: "説明",
      sortable: true,
      sortAccessor: (s) => s.description ?? "",
      render: (s) => <span className="seq-list-description">{s.description ?? ""}</span>,
    },
    {
      key: "updatedAt",
      header: "更新日",
      width: "120px",
      sortable: true,
      sortAccessor: (s) => s.updatedAt,
      render: (s) => <span className="seq-list-date">{formatDate(s.updatedAt)}</span>,
    },
  ], []);

  const renderCard = (s: SequenceMeta) => (
    <div className="seq-card-content">
      <div className="seq-card-header">
        <code className="seq-card-name">{s.id}</code>
      </div>
      {s.description && (
        <div className="seq-card-description">{s.description}</div>
      )}
      {s.conventionRef && (
        <div className="seq-card-conv-ref">
          <i className="bi bi-link-45deg" /> {s.conventionRef}
        </div>
      )}
      <div className="seq-card-meta">
        <span className="seq-card-date">{formatDate(s.updatedAt)}</span>
      </div>
    </div>
  );

  const selectedCount = selection.selectedIds.size;
  const deletedCount = editor.deletedIds.size;

  return (
    <div className="table-list-page">
      <div className="table-list-content">
        <div className="table-list-header">
          <h2 className="table-list-title">
            <i className="bi bi-arrow-repeat" /> シーケンス定義
            <span className="table-list-count">
              {allSequences.length - deletedCount} 件{deletedCount > 0 ? ` (削除予定 ${deletedCount})` : ""}
            </span>
          </h2>
          <div className="table-list-actions">
            <div className="table-list-search">
              <i className="bi bi-search" />
              <input
                type="text"
                placeholder="名前・規約参照・説明で絞り込み..."
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
            <button
              className="tbl-btn tbl-btn-primary"
              onClick={() => setShowAdd(true)}
              disabled={sortActive}
              title={sortActive ? "ソート中は無効 (ソート解除で利用可能)" : undefined}
            >
              <i className="bi bi-plus-lg" /> シーケンス追加
            </button>
            <button
              className="tbl-btn tbl-btn-ghost danger"
              onClick={() => handleDelete(selection.selectedItems)}
              disabled={selectedCount === 0}
              title="削除 (Delete)"
            >
              <i className="bi bi-trash" /> 削除{selectedCount > 0 ? ` (${selectedCount})` : ""}
            </button>
            <span className="tbl-saveline-sep" />
            <button
              className="tbl-btn tbl-btn-ghost"
              data-testid="list-reset-btn"
              onClick={handleReset}
              disabled={!editor.isDirty || editor.isSaving}
              title="変更を破棄"
            >
              <i className="bi bi-arrow-counterclockwise" /> リセット
            </button>
            <button
              className="tbl-btn tbl-btn-primary"
              data-testid="list-save-btn"
              onClick={handleSave}
              disabled={!editor.isDirty || editor.isSaving}
              title="変更を保存"
            >
              <i className="bi bi-save" /> {editor.isSaving ? "保存中..." : "保存"}
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

        <SortBar sort={sort} columnLabels={columnLabels} />

        <DataList
          items={sort.sorted}
          columns={columns}
          getId={(s) => s.id}
          getNo={(s) => s.no}
          onRowDelete={handleRowDelete}
          onContextMenu={handleContextMenu}
          selection={selection}
          clipboard={clipboard}
          sort={sort}
          onActivate={handleActivate}
          onReorder={handleReorder}
          layout={viewMode === "card" ? "grid" : "list"}
          renderCard={renderCard}
          showNumColumn={viewMode === "table"}
          variant="dark"
          className="sequences-data-list"
          isItemGhost={(id) => editor.isDeleted(id)}
          emptyMessage={
            query
              ? <p>該当するシーケンス定義がありません</p>
              : <p>シーケンス定義がまだありません。「シーケンス追加」から作成してください。</p>
          }
        />

        {showAdd && (
          <div className="tbl-modal-overlay" onClick={() => setShowAdd(false)}>
            <div className="tbl-modal" onClick={(e) => e.stopPropagation()}>
              <div className="tbl-modal-title">シーケンス追加</div>
              <label className="tbl-field">
                <span>シーケンス名 <small>(snake_case、例: po_number_seq)</small></span>
                <input
                  type="text"
                  value={addId}
                  onChange={(e) => setAddId(e.target.value)}
                  placeholder="po_number_seq"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                />
              </label>
              <label className="tbl-field">
                <span>説明</span>
                <input
                  type="text"
                  value={addDescription}
                  onChange={(e) => setAddDescription(e.target.value)}
                  placeholder="発注番号の採番"
                  onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                />
              </label>
              <div className="tbl-modal-btns">
                <button className="tbl-btn tbl-btn-ghost" onClick={() => setShowAdd(false)}>
                  キャンセル
                </button>
                <button
                  className="tbl-btn tbl-btn-primary"
                  onClick={handleAdd}
                  disabled={!addId.trim()}
                >
                  作成して編集
                </button>
              </div>
            </div>
          </div>
        )}

        {contextMenu && (
          <ListContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={contextMenu.items}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
    </div>
  );
}
