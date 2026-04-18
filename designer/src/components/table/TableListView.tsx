import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { TableMeta } from "../../types/flow";
import type { TableDefinition, SqlDialect } from "../../types/table";
import { SQL_DIALECT_LABELS } from "../../types/table";
import { listTables, createTable, deleteTable, loadTable } from "../../store/tableStore";
import { loadProject } from "../../store/flowStore";
import { generateAllDdl, generateAllTableMarkdown } from "../../utils/ddlGenerator";
import { mcpBridge } from "../../mcp/mcpBridge";
import { TableSubToolbar } from "./TableSubToolbar";
import { DataList, type DataListColumn } from "../common/DataList";
import { FilterBar } from "../common/FilterBar";
import { ViewModeToggle, type ViewMode } from "../common/ViewModeToggle";
import { useListSelection } from "../../hooks/useListSelection";
import { useListKeyboard } from "../../hooks/useListKeyboard";
import { useListFilter } from "../../hooks/useListFilter";
import { useListSort } from "../../hooks/useListSort";
import { usePersistentState } from "../../hooks/usePersistentState";
import "../../styles/table.css";

const STORAGE_KEY = "list-view-mode:table-list";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ja-JP");
  } catch {
    return iso;
  }
}

export function TableListView() {
  const navigate = useNavigate();
  const [tables, setTables] = useState<TableMeta[]>([]);
  const [projectName, setProjectName] = useState("プロジェクト");
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = usePersistentState<ViewMode>(STORAGE_KEY, "card");
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addLogical, setAddLogical] = useState("");
  const [addCategory, setAddCategory] = useState("");
  const [exportDialect, setExportDialect] = useState<SqlDialect>("postgresql");
  const [showExport, setShowExport] = useState(false);

  const reload = useCallback(async () => {
    const t = await listTables();
    setTables(t);
    const p = await loadProject();
    setProjectName(p.name);
  }, []);

  useEffect(() => {
    mcpBridge.startWithoutEditor();
    reload();
    const unsub = mcpBridge.onStatusChange((s) => {
      if (s === "connected") reload();
    });
    return unsub;
  }, [reload]);

  const filter = useListFilter(tables);

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

  const handleActivate = useCallback((t: TableMeta) => {
    navigate(`/table/edit/${t.id}`);
  }, [navigate]);

  const handleDelete = async (items: TableMeta[]) => {
    if (!confirm(`${items.length} 件のテーブル定義を削除しますか？`)) return;
    for (const t of items) {
      await deleteTable(t.id);
    }
    await reload();
    selection.clearSelection();
  };

  useListKeyboard({
    items: sort.sorted,
    getId: (t) => t.id,
    selection,
    layout: viewMode === "card" ? "grid" : "list",
    onActivate: handleActivate,
    onDelete: handleDelete,
  });

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

  const handleExportDdl = async () => {
    const allTables: TableDefinition[] = [];
    for (const t of tables) {
      const td = await loadTable(t.id);
      if (td) allTables.push(td);
    }
    const ddl = generateAllDdl(allTables, exportDialect);
    downloadText(`${projectName}_ddl.sql`, ddl);
    setShowExport(false);
  };

  const handleExportMarkdown = async () => {
    const allTables: TableDefinition[] = [];
    for (const t of tables) {
      const td = await loadTable(t.id);
      if (td) allTables.push(td);
    }
    const md = generateAllTableMarkdown(allTables, projectName);
    downloadText(`${projectName}_tables.md`, md);
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

  return (
    <div className="table-list-page">
      <TableSubToolbar />

      <div className="table-list-content">
        <div className="table-list-header">
          <h2 className="table-list-title">
            <i className="bi bi-table" /> テーブル設計書
            <span className="table-list-count">{tables.length} テーブル</span>
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
            {tables.length > 0 && (
              <>
                <button className="tbl-btn tbl-btn-ghost" onClick={handleExportMarkdown} title="Markdown エクスポート">
                  <i className="bi bi-file-earmark-text" /> Markdown
                </button>
                <button className="tbl-btn tbl-btn-ghost" onClick={() => setShowExport(true)} title="DDL エクスポート">
                  <i className="bi bi-code-square" /> DDL
                </button>
              </>
            )}
            {selectedCount > 0 && (
              <button className="tbl-btn tbl-btn-ghost danger" onClick={() => handleDelete(selection.selectedItems)}>
                <i className="bi bi-trash" /> {selectedCount} 件削除
              </button>
            )}
            <button className="tbl-btn tbl-btn-primary" onClick={() => setShowAdd(true)}>
              <i className="bi bi-plus-lg" /> テーブル追加
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

        <DataList
          items={sort.sorted}
          columns={columns}
          getId={(t) => t.id}
          selection={selection}
          sort={sort}
          onActivate={handleActivate}
          layout={viewMode === "card" ? "grid" : "list"}
          renderCard={renderCard}
          showNumColumn={viewMode === "table"}
          variant="dark"
          className="tables-data-list"
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
