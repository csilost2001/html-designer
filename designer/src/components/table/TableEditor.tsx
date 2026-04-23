import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { TableDefinition, TableColumn, SqlDialect, ColumnTemplate } from "../../types/table";
import { DATA_TYPE_LABELS, COLUMN_TEMPLATES, DATA_TYPES_WITH_LENGTH, DATA_TYPES_WITH_SCALE, TABLE_CATEGORIES } from "../../types/table";
import type { DataType } from "../../types/table";
import { loadTable, saveTable, addColumn, removeColumn } from "../../store/tableStore";
import { listTables } from "../../store/tableStore";
import { generateDdl, generateTableMarkdown } from "../../utils/ddlGenerator";
import { mcpBridge } from "../../mcp/mcpBridge";
import { useResourceEditor } from "../../hooks/useResourceEditor";
import { useSaveShortcut } from "../../hooks/useSaveShortcut";
import { useListSelection } from "../../hooks/useListSelection";
import { useListClipboard } from "../../hooks/useListClipboard";
import { useListKeyboard } from "../../hooks/useListKeyboard";
import { useListSort } from "../../hooks/useListSort";
import { EditorHeader } from "../common/EditorHeader";
import { ServerChangeBanner } from "../common/ServerChangeBanner";
import { DataList, type DataListColumn } from "../common/DataList";
import { SortBar } from "../common/SortBar";
import { ListContextMenu, type ContextMenuItem } from "../common/ListContextMenu";
import { DdlPreviewDrawer } from "./DdlPreviewDrawer";
import { ConstraintsTab } from "./ConstraintsTab";
import { IndexesTab } from "./IndexesTab";
import { generateUUID } from "../../utils/uuid";
import { renumber } from "../../utils/listOrder";
import "../../styles/table.css";

type TabId = "columns" | "constraints" | "indexes" | "triggers" | "comment";

export function TableEditor() {
  const { tableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabId>("columns");
  const [ddlDialect, setDdlDialect] = useState<SqlDialect>("postgresql");
  // FHD (≤1920) は閉じた状態、WQHD (2560+) は開いた状態で初期化
  const [ddlOpen, setDdlOpen] = useState(() => window.innerWidth >= 2560);
  const [editingMeta, setEditingMeta] = useState(false);
  const [allTables, setAllTables] = useState<TableDefinition[]>([]);

  const handleNotFound = useCallback(() => navigate("/table/list"), [navigate]);

  const {
    state: table,
    isDirty, isSaving, serverChanged,
    update, undo, redo, canUndo, canRedo,
    handleSave, handleReset, dismissServerBanner,
  } = useResourceEditor<TableDefinition>({
    tabType: "table",
    mtimeKind: "table",
    draftKind: "table",
    id: tableId,
    load: loadTable,
    save: saveTable,
    broadcastName: "tableChanged",
    broadcastIdField: "tableId",
    onNotFound: handleNotFound,
  });

  useSaveShortcut(() => {
    if (isDirty && !isSaving) handleSave();
  });

  // FK 選択用に他テーブル一覧を別途ロード
  useEffect(() => {
    mcpBridge.startWithoutEditor();
    (async () => {
      const tl = await listTables();
      const allTds: TableDefinition[] = [];
      for (const m of tl) {
        const td = await loadTable(m.id);
        if (td) allTds.push(td);
      }
      setAllTables(allTds);
    })();
  }, [tableId]);

  if (!table) {
    return <div className="table-editor-loading"><i className="bi bi-hourglass-split" /> 読み込み中...</div>;
  }

  const ddl = generateDdl(table, ddlDialect);

  return (
    <div className="table-editor-page">
      {serverChanged && (
        <ServerChangeBanner onReload={handleReset} onDismiss={dismissServerBanner} />
      )}

      <EditorHeader
        variant="dark"
        backLink={{ label: "テーブル一覧", onClick: () => navigate("/table/list") }}
        title={
          editingMeta ? (
            <TableMetaEditor
              table={table}
              onSave={(patch) => {
                update((t) => Object.assign(t, patch));
                setEditingMeta(false);
              }}
              onCancel={() => setEditingMeta(false)}
            />
          ) : (
            <div className="table-editor-title" onClick={() => setEditingMeta(true)} title="クリックして編集">
              <span className="table-name-display">{table.name}</span>
              <span className="table-logical-display">{table.logicalName}</span>
              {table.category && <span className="table-category-badge">{table.category}</span>}
              <i className="bi bi-pencil table-edit-icon" />
            </div>
          )
        }
        undoRedo={{ onUndo: undo, onRedo: redo, canUndo, canRedo }}
        extraRight={
          <button
            className="editor-header-undo-btn"
            onClick={() => {
              const md = generateTableMarkdown(table);
              navigator.clipboard.writeText(md);
            }}
            title="Markdown をコピー"
          >
            <i className="bi bi-clipboard" />
          </button>
        }
        saveReset={{ isDirty, isSaving, onSave: handleSave, onReset: handleReset }}
      />

      {/* Tabs */}
      <div className="table-editor-tabs">
        <button className={tab === "columns" ? "active" : ""} onClick={() => setTab("columns")}>
          <i className="bi bi-columns-gap" /> 列 <span className="tab-count">{table.columns.length}</span>
        </button>
        <button className={tab === "constraints" ? "active" : ""} onClick={() => setTab("constraints")}>
          <i className="bi bi-shield-check" /> 制約
          {(table.constraints?.length ?? 0) > 0 && (
            <span className="tab-count">{table.constraints!.length}</span>
          )}
        </button>
        <button className={tab === "indexes" ? "active" : ""} onClick={() => setTab("indexes")}>
          <i className="bi bi-lightning" /> インデックス <span className="tab-count">{table.indexes.length}</span>
        </button>
        <button className={tab === "triggers" ? "active" : ""} onClick={() => setTab("triggers")}>
          <i className="bi bi-play-btn" /> トリガー
        </button>
        <button className={tab === "comment" ? "active" : ""} onClick={() => setTab("comment")}>
          <i className="bi bi-chat-left-text" /> コメント
        </button>
      </div>

      {/* Content + DDL drawer */}
      <div className="table-editor-content-area">
        <div className="table-editor-body">
          {tab === "columns" && (
            <ColumnsTab table={table} update={update} allTables={allTables} />
          )}
          {tab === "constraints" && (
            <ConstraintsTab table={table} update={update} allTables={allTables} />
          )}
          {tab === "indexes" && (
            <IndexesTab key="indexes" table={table} update={update} />
          )}
          {tab === "triggers" && (
            <PlaceholderTab
              icon="bi-play-btn"
              title="トリガー (β-4 で実装予定)"
              description="BEFORE/AFTER INSERT/UPDATE/DELETE トリガーを一覧・編集します。"
            />
          )}
          {tab === "comment" && (
            <CommentTab table={table} update={update} />
          )}
        </div>

        <DdlPreviewDrawer
          ddl={ddl}
          dialect={ddlDialect}
          onDialectChange={setDdlDialect}
          defaultOpen={ddlOpen}
          key={`ddl-drawer-${ddlOpen}`}
        />
      </div>
    </div>
  );
}

// ── メタ情報編集 ──────────────────────────────────────────────────────────────

function TableMetaEditor({
  table, onSave, onCancel,
}: {
  table: TableDefinition;
  onSave: (patch: Partial<TableDefinition>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(table.name);
  const [logicalName, setLogicalName] = useState(table.logicalName);
  const [description, setDescription] = useState(table.description);
  const [category, setCategory] = useState(table.category ?? "");

  return (
    <div className="table-meta-editor">
      <input
        className="table-meta-input name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="テーブル名"
        autoFocus
      />
      <input
        className="table-meta-input"
        value={logicalName}
        onChange={(e) => setLogicalName(e.target.value)}
        placeholder="論理名"
      />
      <input
        className="table-meta-input"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="説明"
      />
      <select className="table-meta-input" value={category} onChange={(e) => setCategory(e.target.value)}>
        <option value="">カテゴリなし</option>
        {TABLE_CATEGORIES.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <div className="table-meta-btns">
        <button className="tbl-btn tbl-btn-ghost tbl-btn-sm" onClick={onCancel}>キャンセル</button>
        <button
          className="tbl-btn tbl-btn-primary tbl-btn-sm"
          onClick={() => onSave({ name: name.trim(), logicalName: logicalName.trim(), description, category: category || undefined })}
          disabled={!name.trim() || !logicalName.trim()}
        >
          保存
        </button>
      </div>
    </div>
  );
}

// ── カラムタブ ────────────────────────────────────────────────────────────────

function ColumnsTab({
  table, update, allTables,
}: {
  table: TableDefinition;
  update: (fn: (t: TableDefinition) => void) => void;
  allTables: TableDefinition[];
}) {
  const [showTemplates, setShowTemplates] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const [activeColId, setActiveColId] = useState<string | null>(null);

  const sortAccessor = useCallback((col: TableColumn, key: string): string | number => {
    switch (key) {
      case "name": return col.name;
      case "logicalName": return col.logicalName;
      case "dataType": return col.dataType;
      case "length": return col.length ?? 0;
      case "notNull": return col.notNull ? 1 : 0;
      case "primaryKey": return col.primaryKey ? 1 : 0;
      case "unique": return col.unique ? 1 : 0;
      case "autoIncrement": return col.autoIncrement ? 1 : 0;
      case "defaultValue": return col.defaultValue ?? "";
      default: return "";
    }
  }, []);

  const sort = useListSort(table.columns, sortAccessor);
  const selection = useListSelection(sort.sorted, (c) => c.id);
  const clipboard = useListClipboard<TableColumn>((c) => c.id);

  const handleUpdateCol = useCallback((colId: string, patch: Partial<TableColumn>) => {
    update((t) => {
      const col = t.columns.find((c) => c.id === colId);
      if (col) Object.assign(col, patch);
    });
  }, [update]);

  const handleAddBlank = () => {
    // docs/spec/list-common.md §3.9: ソート中は新規作成ボタン disabled 済
    let newColId = "";
    update((t) => { newColId = addColumn(t).id; });
    selection.setSelectedIds(new Set([newColId]));
    setActiveColId(newColId);
  };

  const handleAddFromTemplate = (tpl: ColumnTemplate) => {
    let newColId = "";
    update((t) => { newColId = addColumn(t, { ...tpl.column }).id; });
    selection.setSelectedIds(new Set([newColId]));
    setActiveColId(newColId);
    setShowTemplates(false);
  };

  const handleDelete = (cols: TableColumn[]) => {
    const ids = new Set(cols.map((c) => c.id));
    update((t) => {
      for (const id of ids) removeColumn(t, id);
    });
    selection.clearSelection();
    if (activeColId && ids.has(activeColId)) setActiveColId(null);
  };

  const handleDuplicate = (cols: TableColumn[]) => {
    // docs/spec/list-common.md §3.9: ソート中は useListKeyboard 側で Ctrl+D が無効化される
    const newIds: string[] = [];
    update((t) => {
      for (const src of cols) {
        const cur = t.columns.find((c) => c.id === src.id);
        if (!cur) continue;
        newIds.push(addColumn(t, { ...cur, name: cur.name + "_copy" }).id);
      }
    });
    selection.setSelectedIds(new Set(newIds));
  };

  const moveBlock = (cols: TableColumn[], direction: "up" | "down") => {
    // docs/spec/list-common.md §3.9: ソート中は useListKeyboard 側で Alt+↑↓ が無効化される
    const ids = new Set(cols.map((c) => c.id));
    update((t) => {
      const idxs = t.columns
        .map((c, i) => (ids.has(c.id) ? i : -1))
        .filter((i) => i >= 0)
        .sort((a, b) => a - b);
      if (idxs.length === 0) return;
      if (direction === "up") {
        if (idxs[0] === 0) return;
        const [moved] = t.columns.splice(idxs[0] - 1, 1);
        t.columns.splice(idxs[idxs.length - 1], 0, moved);
      } else {
        if (idxs[idxs.length - 1] === t.columns.length - 1) return;
        const [moved] = t.columns.splice(idxs[idxs.length - 1] + 1, 1);
        t.columns.splice(idxs[0], 0, moved);
      }
      t.columns = renumber(t.columns);
    });
  };

  const handleReorder = (fromIdx: number, toIdx: number) => {
    // docs/spec/list-common.md §3.9: ソート中は DataList 側で D&D が無効化される
    update((t) => {
      const [moved] = t.columns.splice(fromIdx, 1);
      t.columns.splice(toIdx, 0, moved);
      t.columns = renumber(t.columns);
    });
  };

  const handlePaste = (insertIdx: number | null) => {
    const mode = clipboard.clipboard.mode;
    const clipItems = clipboard.clipboard.items;
    if (!clipItems.length) return;

    // No-op: 貼り付け対象自身が選択中
    if (mode === "cut") {
      const cutIds = new Set(clipItems.map((c) => c.id));
      const selIds = selection.selectedIds;
      const sameSet = selIds.size === cutIds.size &&
        [...selIds].every((id) => cutIds.has(id));
      if (sameSet) return;
    }

    // docs/spec/list-common.md §3.9: ソート中は useListKeyboard 側で Ctrl+V が無効化される
    const consumed = clipboard.consume();
    const newIds: string[] = [];

    update((t) => {
      if (mode === "cut") {
        const cutIds = new Set(consumed.map((c) => c.id));
        const pos0 = insertIdx ?? t.columns.length;
        const removedBefore = t.columns.slice(0, pos0).filter((c) => cutIds.has(c.id)).length;
        t.columns = t.columns.filter((c) => !cutIds.has(c.id));
        const pos = Math.min(t.columns.length, pos0 - removedBefore);
        t.columns.splice(pos, 0, ...consumed);
        newIds.push(...consumed.map((c) => c.id));
      } else {
        const copies = consumed.map((c) => ({ ...c, id: generateUUID() }));
        const pos = Math.min(t.columns.length, insertIdx ?? t.columns.length);
        t.columns.splice(pos, 0, ...copies);
        newIds.push(...copies.map((c) => c.id));
      }
      t.columns = renumber(t.columns);
    });
    selection.setSelectedIds(new Set(newIds));
  };

  const sortActive = sort.sortKeys.length > 0;

  // docs/spec/list-common.md §3.11: 右クリックメニュー項目を構築 (カラム一覧は上へ/下へも含む)
  const buildMenuItems = (target: TableColumn | null): ContextMenuItem[] => {
    const hasSelection = selection.selectedIds.size > 0 || target !== null;
    const pasteBlocked = sortActive || !clipboard.hasContent;
    const pasteReason = sortActive ? "ソート中は無効 (ソート解除で利用可能)" : "クリップボードが空";
    const sortReason = "ソート中は無効 (ソート解除で利用可能)";

    if (target === null && selection.selectedIds.size === 0) {
      return [
        {
          key: "addCol", label: "カラム追加", icon: "bi-plus-lg",
          disabled: sortActive, disabledReason: sortReason,
          onClick: handleAddBlank,
        },
        {
          key: "addTpl", label: "テンプレートから追加", icon: "bi-collection",
          disabled: sortActive, disabledReason: sortReason,
          onClick: () => setShowTemplates(true),
        },
      ];
    }

    const items = target && !selection.isSelected(target.id)
      ? [target]
      : selection.selectedItems;

    return [
      {
        key: "addCol", label: "カラム追加", icon: "bi-plus-lg",
        disabled: sortActive, disabledReason: sortReason,
        onClick: handleAddBlank,
      },
      {
        key: "addTpl", label: "テンプレートから追加", icon: "bi-collection",
        disabled: sortActive, disabledReason: sortReason,
        onClick: () => setShowTemplates(true),
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
          const allIds = (table?.columns ?? []).map((c) => c.id);
          const insertIndex = ids.length > 0
            ? Math.max(...ids.map((id) => allIds.indexOf(id))) + 1
            : null;
          handlePaste(insertIndex);
        },
      },
      { key: "sep2", separator: true },
      // docs/spec/list-common.md §4.6: [移動] | [複製] | [削除] のグルーピング
      {
        key: "moveUp", label: "上へ移動", icon: "bi-chevron-up", shortcut: "Alt+↑",
        disabled: !hasSelection || sortActive,
        disabledReason: sortActive ? sortReason : undefined,
        onClick: () => { if (items.length > 0) moveBlock(items, "up"); },
      },
      {
        key: "moveDown", label: "下へ移動", icon: "bi-chevron-down", shortcut: "Alt+↓",
        disabled: !hasSelection || sortActive,
        disabledReason: sortActive ? sortReason : undefined,
        onClick: () => { if (items.length > 0) moveBlock(items, "down"); },
      },
      { key: "sep3", separator: true },
      {
        key: "duplicate", label: "複製", icon: "bi-copy", shortcut: "Ctrl+D",
        disabled: !hasSelection || sortActive,
        disabledReason: sortActive ? sortReason : undefined,
        onClick: () => { if (items.length > 0) handleDuplicate(items); },
      },
      { key: "sep4", separator: true },
      {
        key: "delete", label: "削除", icon: "bi-trash", shortcut: "Delete",
        disabled: !hasSelection, danger: true,
        onClick: () => { if (items.length > 0) handleDelete(items); },
      },
    ];
  };

  const handleContextMenu = (e: React.MouseEvent, target: TableColumn | null) => {
    setContextMenu({ x: e.clientX, y: e.clientY, items: buildMenuItems(target) });
  };

  const handleContextMenuKey = (first: TableColumn | null, rect: DOMRect | null) => {
    if (first && !selection.isSelected(first.id)) {
      selection.setSelectedIds(new Set([first.id]));
    }
    const x = rect ? rect.left : 100;
    const y = rect ? rect.bottom : 100;
    setContextMenu({ x, y, items: buildMenuItems(first) });
  };

  const handleRowDelete = (c: TableColumn) => {
    handleDelete([c]);
  };

  useListKeyboard({
    items: sort.sorted,
    getId: (c) => c.id,
    selection,
    clipboard,
    sort,
    layout: "list",
    onActivate: (c) => setActiveColId(c.id),
    onDelete: handleDelete,
    onDuplicate: handleDuplicate,
    onMoveUp: (cols) => moveBlock(cols, "up"),
    onMoveDown: (cols) => moveBlock(cols, "down"),
    onPaste: handlePaste,
    onContextMenuKey: handleContextMenuKey,
  });

  const columnLabels = useMemo<Record<string, string>>(() => ({
    name: "カラム名",
    logicalName: "論理名",
    dataType: "データ型",
    length: "長さ",
    notNull: "NN",
    primaryKey: "PK",
    unique: "UK",
    autoIncrement: "AI",
    defaultValue: "デフォルト",
  }), []);

  // Esc で詳細パネルを閉じる (開いていれば選択解除より優先)
  useEffect(() => {
    if (!activeColId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // docs/spec/list-common.md §3.11: コンテキストメニュー表示中はそちらの Esc を優先
      if (document.querySelector(".list-context-menu")) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (target?.isContentEditable) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setActiveColId(null);
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [activeColId]);

  // activeColId のカラムが消えたら閉じる
  useEffect(() => {
    if (activeColId && !table.columns.some((c) => c.id === activeColId)) {
      setActiveColId(null);
    }
  }, [activeColId, table.columns]);

  const detailCol = activeColId ? table.columns.find((c) => c.id === activeColId) ?? null : null;

  const columns = useMemo<DataListColumn<TableColumn>[]>(() => [
    {
      key: "name",
      header: "カラム名",
      width: "18%",
      sortable: true,
      sortAccessor: (c) => c.name,
      render: (c) => (
        <>
          <code className="col-name-code">{c.name}</code>
          {c.foreignKey && <i className="bi bi-link-45deg col-fk-icon" title="外部キー" />}
        </>
      ),
    },
    { key: "logicalName", header: "論理名", width: "18%", sortable: true, sortAccessor: (c) => c.logicalName, render: (c) => c.logicalName },
    {
      key: "dataType",
      header: "データ型",
      width: "10%",
      sortable: true,
      sortAccessor: (c) => c.dataType,
      render: (c) => <span className="col-type-badge">{c.dataType}</span>,
    },
    {
      key: "length",
      header: "長さ",
      width: "60px",
      align: "right",
      sortable: true,
      sortAccessor: (c) => c.length ?? 0,
      render: (c) => (c.length != null ? `${c.length}${c.scale != null ? `,${c.scale}` : ""}` : ""),
    },
    { key: "notNull", header: "NN", width: "44px", align: "center", sortable: true, sortAccessor: (c) => (c.notNull ? 1 : 0), render: (c) => (c.notNull ? <i className="bi bi-check-lg" /> : null) },
    { key: "primaryKey", header: "PK", width: "44px", align: "center", sortable: true, sortAccessor: (c) => (c.primaryKey ? 1 : 0), render: (c) => (c.primaryKey ? <i className="bi bi-key-fill col-pk-icon" /> : null) },
    { key: "unique", header: "UK", width: "44px", align: "center", sortable: true, sortAccessor: (c) => (c.unique ? 1 : 0), render: (c) => (c.unique ? <i className="bi bi-check-lg" /> : null) },
    { key: "autoIncrement", header: "AI", width: "44px", align: "center", sortable: true, sortAccessor: (c) => (c.autoIncrement ? 1 : 0), render: (c) => (c.autoIncrement ? <i className="bi bi-check-lg" /> : null) },
    { key: "defaultValue", header: "デフォルト", width: "14%", sortable: true, sortAccessor: (c) => c.defaultValue ?? "", render: (c) => <code className="col-default-code">{c.defaultValue ?? ""}</code> },
  ], []);

  // Group templates by category
  const templateCategories = COLUMN_TEMPLATES.reduce<Record<string, ColumnTemplate[]>>((acc, tpl) => {
    (acc[tpl.category] ??= []).push(tpl);
    return acc;
  }, {});

  const selectedCount = selection.selectedIds.size;
  const anySelected = selectedCount > 0;

  return (
    <div className="columns-tab">
      {/* 選択操作バー */}
      <div className="columns-selection-bar">
        <span className="columns-selection-count">
          {anySelected ? `${selectedCount} 件選択中 (ダブルクリック/Enter で編集)` : "クリックで選択、ダブルクリックで編集"}
        </span>
        <div className="columns-selection-actions">
          <button
            className="tbl-btn tbl-btn-ghost tbl-btn-sm"
            disabled={!anySelected || sortActive}
            onClick={() => moveBlock(selection.selectedItems, "up")}
            title={sortActive ? "ソート中は無効 (ソート解除で利用可能)" : "上へ移動 (Alt+↑)"}
          >
            <i className="bi bi-chevron-up" /> 上へ
          </button>
          <button
            className="tbl-btn tbl-btn-ghost tbl-btn-sm"
            disabled={!anySelected || sortActive}
            onClick={() => moveBlock(selection.selectedItems, "down")}
            title={sortActive ? "ソート中は無効 (ソート解除で利用可能)" : "下へ移動 (Alt+↓)"}
          >
            <i className="bi bi-chevron-down" /> 下へ
          </button>
          <button
            className="tbl-btn tbl-btn-ghost tbl-btn-sm"
            disabled={!anySelected || sortActive}
            onClick={() => handleDuplicate(selection.selectedItems)}
            title={sortActive ? "ソート中は無効 (ソート解除で利用可能)" : "複製 (Ctrl+D)"}
          >
            <i className="bi bi-copy" /> 複製
          </button>
          <button className="tbl-btn tbl-btn-ghost tbl-btn-sm danger" disabled={!anySelected} onClick={() => handleDelete(selection.selectedItems)} title="削除 (Delete)">
            <i className="bi bi-trash" /> 削除{anySelected ? ` (${selectedCount})` : ""}
          </button>
        </div>
      </div>

      <SortBar sort={sort} columnLabels={columnLabels} />

      {/* Column list */}
      <DataList
        items={sort.sorted}
        columns={columns}
        getId={(c) => c.id}
        getNo={(c) => c.no}
        onRowDelete={handleRowDelete}
        onContextMenu={handleContextMenu}
        selection={selection}
        clipboard={clipboard}
        sort={sort}
        onActivate={(c) => setActiveColId(c.id)}
        onReorder={handleReorder}
        showNumColumn
        variant="dark"
        className="columns-data-list"
        emptyMessage={<p>カラムがまだありません。テンプレートから追加するか、空のカラムを追加してください。</p>}
      />

      {/* Detail panel: ダブルクリック/Enter/F2 で開く。Esc または ✕ で閉じる */}
      {detailCol && (
        <div className="column-detail">
          <div className="column-detail-header">
            <span className="column-detail-title">
              <i className="bi bi-pencil-square" /> 編集中: <code>{detailCol.name}</code>
              <span className="column-detail-hint">(Esc で閉じる)</span>
            </span>
            <button className="tbl-btn-icon" onClick={() => setActiveColId(null)} title="閉じる">
              <i className="bi bi-x-lg" />
            </button>
          </div>
          <ColumnDetailEditor
            col={detailCol}
            onUpdate={(patch) => handleUpdateCol(detailCol.id, patch)}
            allTables={allTables}
            showLength={DATA_TYPES_WITH_LENGTH.includes(detailCol.dataType)}
            showScale={DATA_TYPES_WITH_SCALE.includes(detailCol.dataType)}
          />
        </div>
      )}

      {/* Add column actions */}
      <div className="columns-add-bar">
        <button
          className="tbl-btn tbl-btn-primary"
          onClick={handleAddBlank}
          disabled={sortActive}
          title={sortActive ? "ソート中は無効 (ソート解除で利用可能)" : undefined}
        >
          <i className="bi bi-plus-lg" /> カラム追加
        </button>
        <button
          className={`tbl-btn tbl-btn-secondary${showTemplates ? " active" : ""}`}
          onClick={() => setShowTemplates(!showTemplates)}
          disabled={sortActive}
          title={sortActive ? "ソート中は無効 (ソート解除で利用可能)" : undefined}
        >
          <i className="bi bi-collection" /> テンプレートから追加
        </button>
      </div>

      {contextMenu && (
        <ListContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Template panel */}
      {showTemplates && (
        <div className="column-templates">
          <div className="column-templates-title">
            <i className="bi bi-collection" /> カラムテンプレート
            <button className="tbl-btn-icon" onClick={() => setShowTemplates(false)} title="閉じる">
              <i className="bi bi-x-lg" />
            </button>
          </div>
          <div className="column-templates-grid">
            {Object.entries(templateCategories).map(([cat, tpls]) => (
              <div key={cat} className="template-category">
                <div className="template-category-name">{cat}</div>
                <div className="template-items">
                  {tpls.map((tpl) => (
                    <button
                      key={tpl.id}
                      className="template-item"
                      onClick={() => handleAddFromTemplate(tpl)}
                      title={`${tpl.column.name} (${tpl.column.dataType})`}
                    >
                      <i className={`bi ${tpl.icon}`} />
                      <span>{tpl.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── カラム詳細編集 ────────────────────────────────────────────────────────────

function ColumnDetailEditor({
  col, onUpdate, allTables, showLength, showScale,
}: {
  col: TableColumn;
  onUpdate: (patch: Partial<TableColumn>) => void;
  allTables: TableDefinition[];
  showLength: boolean;
  showScale: boolean;
}) {
  return (
    <div className="column-detail">
      <div className="column-detail-grid">
        <label className="tbl-field">
          <span>カラム名</span>
          <input
            type="text"
            value={col.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder="column_name"
          />
        </label>
        <label className="tbl-field">
          <span>論理名</span>
          <input
            type="text"
            value={col.logicalName}
            onChange={(e) => onUpdate({ logicalName: e.target.value })}
            placeholder="カラムの日本語名"
          />
        </label>
        <label className="tbl-field">
          <span>データ型</span>
          <select
            value={col.dataType}
            onChange={(e) => onUpdate({ dataType: e.target.value as DataType })}
          >
            {Object.entries(DATA_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        {showLength && (
          <label className="tbl-field">
            <span>長さ</span>
            <input
              type="number"
              value={col.length ?? ""}
              onChange={(e) => onUpdate({ length: e.target.value ? Number(e.target.value) : undefined })}
              placeholder="255"
              min={1}
            />
          </label>
        )}
        {showScale && (
          <label className="tbl-field">
            <span>スケール</span>
            <input
              type="number"
              value={col.scale ?? ""}
              onChange={(e) => onUpdate({ scale: e.target.value ? Number(e.target.value) : undefined })}
              placeholder="2"
              min={0}
            />
          </label>
        )}
        <label className="tbl-field">
          <span>デフォルト値</span>
          <input
            type="text"
            value={col.defaultValue ?? ""}
            onChange={(e) => onUpdate({ defaultValue: e.target.value || undefined })}
            placeholder="NULL"
          />
        </label>
      </div>

      <div className="column-detail-flags">
        <label className="column-flag-label">
          <input type="checkbox" checked={col.notNull} onChange={(e) => onUpdate({ notNull: e.target.checked })} />
          NOT NULL
        </label>
        <label className="column-flag-label">
          <input type="checkbox" checked={col.primaryKey} onChange={(e) => onUpdate({ primaryKey: e.target.checked, notNull: e.target.checked ? true : col.notNull })} />
          PRIMARY KEY
        </label>
        <label className="column-flag-label">
          <input type="checkbox" checked={col.unique} onChange={(e) => onUpdate({ unique: e.target.checked })} />
          UNIQUE
        </label>
        <label className="column-flag-label">
          <input type="checkbox" checked={col.autoIncrement ?? false} onChange={(e) => onUpdate({ autoIncrement: e.target.checked })} />
          AUTO INCREMENT
        </label>
      </div>

      <div className="column-detail-extra">
        <label className="tbl-field">
          <span>備考</span>
          <input
            type="text"
            value={col.comment ?? ""}
            onChange={(e) => onUpdate({ comment: e.target.value || undefined })}
            placeholder="カラムの補足説明"
          />
        </label>

        <ForeignKeyEditor col={col} allTables={allTables} onUpdate={onUpdate} />
      </div>
    </div>
  );
}

// ── FK入力コンポーネント ──────────────────────────────────────────────────────

function ForeignKeyEditor({
  col, allTables, onUpdate,
}: {
  col: TableColumn;
  allTables: TableDefinition[];
  onUpdate: (patch: Partial<TableColumn>) => void;
}) {
  const hasFk = !!col.foreignKey;
  const refTable = allTables.find((t) => t.name === col.foreignKey?.tableId);

  const handleTableChange = (tableName: string) => {
    const table = allTables.find((t) => t.name === tableName);
    // PKカラムを自動選択
    const pkCol = table?.columns.find((c) => c.primaryKey);
    onUpdate({
      foreignKey: {
        tableId: tableName,
        columnName: pkCol?.name ?? "",
      },
    });
  };

  return (
    <div className="column-fk-section">
      <label className="column-flag-label">
        <input
          type="checkbox"
          checked={hasFk}
          onChange={(e) => {
            if (e.target.checked) {
              onUpdate({ foreignKey: { tableId: "", columnName: "" } });
            } else {
              onUpdate({ foreignKey: undefined });
            }
          }}
        />
        外部キー (FK)
      </label>
      {hasFk && (
        <div className="column-fk-fields">
          <select
            value={col.foreignKey?.tableId ?? ""}
            onChange={(e) => handleTableChange(e.target.value)}
          >
            <option value="">参照先テーブル...</option>
            {allTables.map((t) => (
              <option key={t.id} value={t.name}>
                {t.name}（{t.logicalName}）
              </option>
            ))}
          </select>
          <select
            value={col.foreignKey?.columnName ?? ""}
            onChange={(e) => onUpdate({ foreignKey: { ...col.foreignKey!, columnName: e.target.value } })}
            disabled={!refTable}
          >
            <option value="">参照先カラム...</option>
            {refTable?.columns.map((c) => {
              const icon = c.primaryKey ? "🔑 " : c.unique ? "✦ " : "";
              return (
                <option key={c.id} value={c.name}>
                  {icon}{c.name}（{c.logicalName}）— {c.dataType}
                </option>
              );
            })}
          </select>
        </div>
      )}
      {hasFk && col.foreignKey?.tableId && (
        <label className="column-flag-label fk-no-constraint">
          <input
            type="checkbox"
            checked={col.foreignKey?.noConstraint ?? false}
            onChange={(e) => onUpdate({ foreignKey: { ...col.foreignKey!, noConstraint: e.target.checked } })}
          />
          論理FKのみ（DDLにFOREIGN KEY制約を出力しない）
        </label>
      )}
    </div>
  );
}

// ── プレースホルダータブ (β-4 実装前の仮表示) ─────────────────────────────────

function PlaceholderTab({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="placeholder-tab">
      <i className={`bi ${icon} placeholder-tab-icon`} />
      <p className="placeholder-tab-title">{title}</p>
      <p className="placeholder-tab-desc">{description}</p>
    </div>
  );
}

// ── コメントタブ ──────────────────────────────────────────────────────────────

function CommentTab({
  table, update,
}: {
  table: TableDefinition;
  update: (fn: (t: TableDefinition) => void) => void;
}) {
  return (
    <div className="comment-tab">
      <label className="tbl-field comment-tab-field">
        <span>テーブルコメント</span>
        <textarea
          className="comment-tab-textarea"
          value={table.comment ?? ""}
          onChange={(e) => update((t) => { t.comment = e.target.value || undefined; })}
          placeholder="テーブルの用途・概要を記載します（DDL の COMMENT ON TABLE に反映されます）"
          rows={4}
        />
      </label>
      <p className="comment-tab-hint">
        <i className="bi bi-info-circle" /> PostgreSQL では <code>COMMENT ON TABLE {table.name} IS &#39;...&#39;;</code> として DDL に出力されます。
      </p>
    </div>
  );
}
