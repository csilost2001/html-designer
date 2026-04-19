import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { TableMeta } from "../../types/flow";
import type { TableDefinition, SqlDialect } from "../../types/table";
import { SQL_DIALECT_LABELS } from "../../types/table";
import { listTables, createTable, deleteTable, loadTable, saveTable } from "../../store/tableStore";
import { loadProject, saveProject } from "../../store/flowStore";
import { generateAllDdl, generateAllTableMarkdown } from "../../utils/ddlGenerator";
import { mcpBridge } from "../../mcp/mcpBridge";
import { makeTabId } from "../../store/tabStore";
import { TableSubToolbar } from "./TableSubToolbar";
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
import { generateUUID } from "../../utils/uuid";
import { renumber } from "../../utils/listOrder";
import "../../styles/table.css";

const STORAGE_KEY = "list-view-mode:table-list";
const TAB_ID = makeTabId("table-list", "main");

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ja-JP");
  } catch {
    return iso;
  }
}

export function TableListView() {
  const navigate = useNavigate();
  const [projectName, setProjectName] = useState("プロジェクト");
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = usePersistentState<ViewMode>(STORAGE_KEY, "card");
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addLogical, setAddLogical] = useState("");
  const [addCategory, setAddCategory] = useState("");
  const [exportDialect, setExportDialect] = useState<SqlDialect>("postgresql");
  const [showExport, setShowExport] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);

  const loadTables = useCallback(async () => {
    mcpBridge.startWithoutEditor();
    const p = await loadProject();
    setProjectName(p.name);
    return await listTables();
  }, []);

  const commitTables = useCallback(async ({ itemsInOrder, deletedIds }: { itemsInOrder: TableMeta[]; deletedIds: string[] }) => {
    // 1. 削除対象を削除
    for (const id of deletedIds) {
      await deleteTable(id);
    }
    // 2. 並び順を project.tables に反映
    const project = await loadProject();
    if (project.tables) {
      const deletedSet = new Set(deletedIds);
      const orderMap = new Map(itemsInOrder.map((t, i) => [t.id, i]));
      project.tables = project.tables
        .filter((t) => !deletedSet.has(t.id))
        .sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
      await saveProject(project);
    }
  }, []);

  const editor = useListEditor<TableMeta>({
    getId: (t) => t.id,
    load: loadTables,
    commit: commitTables,
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
    return () => { unsubStatus(); unsubProj(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allTables = editor.items;

  const filter = useListFilter(allTables);
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      filter.applyFilter(null);
      return;
    }
    filter.applyFilter((t) =>
      t.name.toLowerCase().includes(q) ||
      t.logicalName.toLowerCase().includes(q) ||
      (t.category ?? "").toLowerCase().includes(q),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const sortAccessor = useCallback((t: TableMeta, key: string): string | number => {
    switch (key) {
      case "name": return t.name;
      case "logicalName": return t.logicalName;
      case "category": return t.category ?? "";
      case "columnCount": return t.columnCount;
      case "updatedAt": return t.updatedAt;
      default: return "";
    }
  }, []);

  const sort = useListSort(filter.filtered, sortAccessor);
  const selection = useListSelection(sort.sorted, (t) => t.id);
  const clipboard = useListClipboard<TableMeta>((t) => t.id);

  const handleActivate = useCallback((t: TableMeta) => {
    if (editor.isDeleted(t.id)) return; // 削除マーク中は編集画面に遷移しない
    navigate(`/table/edit/${t.id}`);
  }, [navigate, editor]);

  const handleDelete = (items: TableMeta[]) => {
    // ghost 方式: マークするだけ
    editor.markDeleted(items.map((t) => t.id));
  };

  const handleReorder = (fromIdx: number, toIdx: number) => {
    // docs/spec/list-common.md §3.9: ソート中は DataList 側で D&D が無効化されており
    // ここには到達しない想定
    const visible = sort.sorted;
    const fromId = visible[fromIdx]?.id;
    const toId = visible[toIdx]?.id;
    if (!fromId || !toId) return;
    const realFrom = editor.items.findIndex((t) => t.id === fromId);
    const realTo = editor.items.findIndex((t) => t.id === toId);
    if (realFrom < 0 || realTo < 0) return;
    editor.reorder(realFrom, realTo);
  };

  const moveBlock = (items: TableMeta[], direction: "up" | "down") => {
    // docs/spec/list-common.md §3.9: ソート中は useListKeyboard 側で Alt+↑↓ が無効化されており
    // ここには到達しない想定
    const ids = new Set(items.map((t) => t.id));
    const idxs = editor.items
      .map((t, i) => (ids.has(t.id) ? i : -1))
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

  const handleDuplicate = async (items: TableMeta[]) => {
    // 複製は新規エンティティ生成 → 即永続化。Save フローには乗せない。
    const newIds: string[] = [];
    for (const t of items) {
      const full = await loadTable(t.id);
      if (!full) continue;
      const dup: TableDefinition = {
        ...full,
        id: generateUUID(),
        name: full.name + "_copy",
        logicalName: full.logicalName + " (コピー)",
        columns: full.columns.map((c) => ({ ...c, id: generateUUID() })),
        indexes: full.indexes.map((i) => ({ ...i, id: generateUUID() })),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveTable(dup);
      newIds.push(dup.id);
    }
    await editor.reload();
    if (newIds.length > 0) selection.setSelectedIds(new Set(newIds));
  };

  const handlePaste = async (insertIdx: number | null) => {
    const mode = clipboard.clipboard.mode;
    const clipItems = clipboard.clipboard.items;
    if (!clipItems.length) return;

    if (mode === "cut") {
      // No-op: 貼り付け対象自身が選択中
      const cutIds = new Set(clipItems.map((c) => c.id));
      const selIds = selection.selectedIds;
      const sameSet = selIds.size === cutIds.size && [...selIds].every((id) => cutIds.has(id));
      if (sameSet) return;

      // Cut → 並び替え (draft)
      // docs/spec/list-common.md §3.9: ソート中は useListKeyboard 側で Ctrl+V が無効化されており
      // ここには到達しない想定
      clipboard.consume();
      const moved = clipItems;
      const pos0 = insertIdx ?? editor.items.length;
      const removedBefore = editor.items.slice(0, pos0).filter((t) => cutIds.has(t.id)).length;
      const remaining = editor.items.filter((t) => !cutIds.has(t.id));
      const pos = Math.min(remaining.length, pos0 - removedBefore);
      editor.setItems(() => {
        const next = [...remaining];
        next.splice(pos, 0, ...moved);
        return renumber(next);
      });
      selection.setSelectedIds(new Set(moved.map((t) => t.id)));
    } else {
      // Copy → 新規エンティティ生成 (即永続化)
      const newIds: string[] = [];
      for (const t of clipItems) {
        const full = await loadTable(t.id);
        if (!full) continue;
        const dup: TableDefinition = {
          ...full,
          id: generateUUID(),
          name: full.name + "_copy",
          logicalName: full.logicalName + " (コピー)",
          columns: full.columns.map((c) => ({ ...c, id: generateUUID() })),
          indexes: full.indexes.map((i) => ({ ...i, id: generateUUID() })),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await saveTable(dup);
        newIds.push(dup.id);
      }
      clipboard.consume();
      await editor.reload();
      selection.setSelectedIds(new Set(newIds));
    }
  };

  useListKeyboard({
    items: sort.sorted,
    getId: (t) => t.id,
    selection,
    clipboard,
    sort,
    layout: viewMode === "card" ? "grid" : "list",
    onActivate: handleActivate,
    onDelete: handleDelete,
    onDuplicate: (items) => { handleDuplicate(items).catch(console.error); },
    onMoveUp: (items) => moveBlock(items, "up"),
    onMoveDown: (items) => moveBlock(items, "down"),
    onPaste: (idx) => { handlePaste(idx).catch(console.error); },
  });

  const sortActive = sort.sortKeys.length > 0;

  const columnLabels = useMemo<Record<string, string>>(() => ({
    name: "テーブル名",
    logicalName: "論理名",
    category: "カテゴリ",
    columnCount: "カラム",
    updatedAt: "更新日",
  }), []);

  const handleAdd = async () => {
    const name = addName.trim();
    const logical = addLogical.trim();
    if (!name || !logical) return;
    const table = await createTable(name, logical, "", addCategory || undefined);
    setShowAdd(false);
    setAddName("");
    setAddLogical("");
    setAddCategory("");
    navigate(`/table/edit/${table.id}`);
  };

  // docs/spec/list-common.md §3.11: 右クリックメニュー項目を構築
  const buildMenuItems = (target: TableMeta | null): ContextMenuItem[] => {
    const hasSelection = selection.selectedIds.size > 0 || target !== null;
    const pasteBlocked = sortActive || !clipboard.hasContent;
    const pasteReason = sortActive ? "ソート中は無効 (ソート解除で利用可能)" : "クリップボードが空";
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
      {
        key: "paste", label: "貼り付け", icon: "bi-clipboard", shortcut: "Ctrl+V",
        disabled: pasteBlocked, disabledReason: pasteBlocked && sortActive ? sortReason : pasteReason,
        onClick: () => {
          const ids = Array.from(selection.selectedIds);
          const allIds = editor.items.map((t) => t.id);
          const insertIndex = ids.length > 0
            ? Math.max(...ids.map((id) => allIds.indexOf(id))) + 1
            : null;
          handlePaste(insertIndex).catch(console.error);
        },
      },
      { key: "sep2", separator: true },
      {
        key: "duplicate", label: "複製", icon: "bi-copy", shortcut: "Ctrl+D",
        disabled: !hasSelection || sortActive,
        disabledReason: sortActive ? sortReason : undefined,
        onClick: () => { if (items.length > 0) handleDuplicate(items).catch(console.error); },
      },
      { key: "sep3", separator: true },
      {
        key: "delete", label: "削除", icon: "bi-trash", shortcut: "Delete",
        disabled: !hasSelection, danger: true,
        onClick: () => { if (items.length > 0) handleDelete(items); },
      },
    ];
  };

  const handleContextMenu = (e: React.MouseEvent, target: TableMeta | null) => {
    setContextMenu({ x: e.clientX, y: e.clientY, items: buildMenuItems(target) });
  };

  const handleRowDelete = (t: TableMeta) => {
    handleDelete([t]);
  };

  const handleExportDdl = async () => {
    const defs: TableDefinition[] = [];
    for (const t of allTables) {
      if (editor.isDeleted(t.id)) continue;
      const td = await loadTable(t.id);
      if (td) defs.push(td);
    }
    const ddl = generateAllDdl(defs, exportDialect);
    downloadText(`${projectName}_ddl.sql`, ddl);
    setShowExport(false);
  };

  const handleExportMarkdown = async () => {
    const defs: TableDefinition[] = [];
    for (const t of allTables) {
      if (editor.isDeleted(t.id)) continue;
      const td = await loadTable(t.id);
      if (td) defs.push(td);
    }
    const md = generateAllTableMarkdown(defs, projectName);
    downloadText(`${projectName}_tables.md`, md);
  };

  const handleSave = () => {
    editor.save().catch(console.error);
    selection.clearSelection();
  };

  const handleReset = () => {
    if (!confirm("未保存の変更を破棄してサーバの状態に戻しますか？")) return;
    editor.reset().catch(console.error);
    selection.clearSelection();
  };

  const columns = useMemo<DataListColumn<TableMeta>[]>(() => [
    {
      key: "name",
      header: "テーブル名",
      sortable: true,
      sortAccessor: (t) => t.name,
      render: (t) => <code className="table-list-name-code">{t.name}</code>,
    },
    {
      key: "logicalName",
      header: "論理名",
      sortable: true,
      sortAccessor: (t) => t.logicalName,
      render: (t) => t.logicalName,
    },
    {
      key: "category",
      header: "カテゴリ",
      width: "120px",
      sortable: true,
      sortAccessor: (t) => t.category ?? "",
      render: (t) => t.category ? <span className="table-card-category">{t.category}</span> : null,
    },
    {
      key: "columnCount",
      header: "カラム",
      width: "80px",
      align: "right",
      sortable: true,
      sortAccessor: (t) => t.columnCount,
      render: (t) => <span className="table-list-col-count">{t.columnCount}</span>,
    },
    {
      key: "updatedAt",
      header: "更新日",
      width: "120px",
      sortable: true,
      sortAccessor: (t) => t.updatedAt,
      render: (t) => <span className="table-list-date">{formatDate(t.updatedAt)}</span>,
    },
  ], []);

  const renderCard = (t: TableMeta) => (
    <div className="table-card-content">
      <div className="table-card-header">
        <span className="table-card-name">{t.name}</span>
        {t.category && <span className="table-card-category">{t.category}</span>}
      </div>
      <div className="table-card-logical">{t.logicalName}</div>
      <div className="table-card-meta">
        <span><i className="bi bi-columns-gap" /> {t.columnCount} カラム</span>
        <span className="table-card-date">{formatDate(t.updatedAt)}</span>
      </div>
    </div>
  );

  const selectedCount = selection.selectedIds.size;
  const deletedCount = editor.deletedIds.size;

  return (
    <div className="table-list-page">
      <TableSubToolbar />

      <div className="table-list-content">
        <div className="table-list-header">
          <h2 className="table-list-title">
            <i className="bi bi-table" /> テーブル設計書
            <span className="table-list-count">{allTables.length - deletedCount} テーブル{deletedCount > 0 ? ` (削除予定 ${deletedCount})` : ""}</span>
          </h2>
          <div className="table-list-actions">
            <div className="table-list-search">
              <i className="bi bi-search" />
              <input
                type="text"
                placeholder="名前・論理名・カテゴリで絞り込み..."
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
            {allTables.length > 0 && (
              <>
                <button className="tbl-btn tbl-btn-ghost" onClick={handleExportMarkdown} title="Markdown エクスポート">
                  <i className="bi bi-file-earmark-text" /> Markdown
                </button>
                <button className="tbl-btn tbl-btn-ghost" onClick={() => setShowExport(true)} title="DDL エクスポート">
                  <i className="bi bi-code-square" /> DDL
                </button>
              </>
            )}
            <button
              className="tbl-btn tbl-btn-primary"
              onClick={() => setShowAdd(true)}
              disabled={sortActive}
              title={sortActive ? "ソート中は無効 (ソート解除で利用可能)" : undefined}
            >
              <i className="bi bi-plus-lg" /> テーブル追加
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
          getId={(t) => t.id}
          getNo={(t) => t.no}
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
          className="tables-data-list"
          isItemGhost={(id) => editor.isDeleted(id)}
          emptyMessage={
            query
              ? <p>該当するテーブル定義がありません</p>
              : <p>テーブル定義がまだありません。「テーブル追加」から作成してください。</p>
          }
        />

        {/* テーブル追加モーダル */}
        {showAdd && (
          <div className="tbl-modal-overlay" onClick={() => setShowAdd(false)}>
            <div className="tbl-modal" onClick={(e) => e.stopPropagation()}>
              <div className="tbl-modal-title">テーブル追加</div>
              <label className="tbl-field">
                <span>テーブル名 <small>(snake_case)</small></span>
                <input
                  type="text"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="customers"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                />
              </label>
              <label className="tbl-field">
                <span>論理名</span>
                <input
                  type="text"
                  value={addLogical}
                  onChange={(e) => setAddLogical(e.target.value)}
                  placeholder="顧客マスタ"
                  onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                />
              </label>
              <label className="tbl-field">
                <span>カテゴリ</span>
                <select value={addCategory} onChange={(e) => setAddCategory(e.target.value)}>
                  <option value="">（なし）</option>
                  <option value="マスタ">マスタ</option>
                  <option value="トランザクション">トランザクション</option>
                  <option value="中間テーブル">中間テーブル</option>
                  <option value="ログ">ログ</option>
                  <option value="設定">設定</option>
                  <option value="その他">その他</option>
                </select>
              </label>
              <div className="tbl-modal-btns">
                <button className="tbl-btn tbl-btn-ghost" onClick={() => setShowAdd(false)}>
                  キャンセル
                </button>
                <button
                  className="tbl-btn tbl-btn-primary"
                  onClick={handleAdd}
                  disabled={!addName.trim() || !addLogical.trim()}
                >
                  作成して編集
                </button>
              </div>
            </div>
          </div>
        )}

        {/* DDL エクスポートモーダル */}
        {showExport && (
          <div className="tbl-modal-overlay" onClick={() => setShowExport(false)}>
            <div className="tbl-modal" onClick={(e) => e.stopPropagation()}>
              <div className="tbl-modal-title">DDL エクスポート</div>
              <label className="tbl-field">
                <span>SQL ダイアレクト</span>
                <select
                  value={exportDialect}
                  onChange={(e) => setExportDialect(e.target.value as SqlDialect)}
                >
                  {Object.entries(SQL_DIALECT_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </label>
              <div className="tbl-modal-btns">
                <button className="tbl-btn tbl-btn-ghost" onClick={() => setShowExport(false)}>
                  キャンセル
                </button>
                <button className="tbl-btn tbl-btn-primary" onClick={handleExportDdl}>
                  <i className="bi bi-download" /> ダウンロード
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

function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
