import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { TableDefinition, TableColumn, TableIndex, SqlDialect, ColumnTemplate } from "../../types/table";
import { DATA_TYPE_LABELS, COLUMN_TEMPLATES, SQL_DIALECT_LABELS, DATA_TYPES_WITH_LENGTH, DATA_TYPES_WITH_SCALE, TABLE_CATEGORIES } from "../../types/table";
import type { DataType } from "../../types/table";
import { loadTable, saveTable, addColumn, removeColumn, addIndex, removeIndex } from "../../store/tableStore";
import { listTables } from "../../store/tableStore";
import { generateDdl, generateTableMarkdown } from "../../utils/ddlGenerator";
import { mcpBridge } from "../../mcp/mcpBridge";
import { useResourceEditor } from "../../hooks/useResourceEditor";
import { useSaveShortcut } from "../../hooks/useSaveShortcut";
import { EditorHeader } from "../common/EditorHeader";
import { ServerChangeBanner } from "../common/ServerChangeBanner";
import "../../styles/table.css";

type TabId = "columns" | "indexes" | "ddl";

export function TableEditor() {
  const { tableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabId>("columns");
  const [ddlDialect, setDdlDialect] = useState<SqlDialect>("postgresql");
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
          <i className="bi bi-columns-gap" /> カラム <span className="tab-count">{table.columns.length}</span>
        </button>
        <button className={tab === "indexes" ? "active" : ""} onClick={() => setTab("indexes")}>
          <i className="bi bi-lightning" /> インデックス <span className="tab-count">{table.indexes.length}</span>
        </button>
        <button className={tab === "ddl" ? "active" : ""} onClick={() => setTab("ddl")}>
          <i className="bi bi-code-square" /> DDL
        </button>
      </div>

      {/* Content */}
      <div className="table-editor-body">
        {tab === "columns" && (
          <ColumnsTab table={table} update={update} allTables={allTables} />
        )}
        {tab === "indexes" && (
          <IndexesTab table={table} update={update} />
        )}
        {tab === "ddl" && (
          <DdlTab ddl={ddl} dialect={ddlDialect} onDialectChange={setDdlDialect} />
        )}
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  const handleAddBlank = () => {
    let newColId = "";
    update((t) => {
      const col = addColumn(t);
      newColId = col.id;
    });
    setEditingId(newColId);
  };

  const handleAddFromTemplate = (tpl: ColumnTemplate) => {
    let newColId = "";
    update((t) => {
      const col = addColumn(t, { ...tpl.column });
      newColId = col.id;
    });
    setEditingId(newColId);
    setShowTemplates(false);
  };

  const handleRemove = (colId: string) => {
    update((t) => removeColumn(t, colId));
    if (editingId === colId) setEditingId(null);
  };

  const handleUpdateCol = (colId: string, patch: Partial<TableColumn>) => {
    update((t) => {
      const col = t.columns.find((c) => c.id === colId);
      if (col) Object.assign(col, patch);
    });
  };

  const handleMoveUp = (colId: string) => {
    update((t) => {
      const idx = t.columns.findIndex((c) => c.id === colId);
      if (idx > 0) {
        [t.columns[idx - 1], t.columns[idx]] = [t.columns[idx], t.columns[idx - 1]];
      }
    });
  };

  const handleMoveDown = (colId: string) => {
    update((t) => {
      const idx = t.columns.findIndex((c) => c.id === colId);
      if (idx >= 0 && idx < t.columns.length - 1) {
        [t.columns[idx], t.columns[idx + 1]] = [t.columns[idx + 1], t.columns[idx]];
      }
    });
  };

  const handleDuplicate = (colId: string) => {
    let newColId = "";
    update((t) => {
      const src = t.columns.find((c) => c.id === colId);
      if (!src) return;
      const col = addColumn(t, { ...src, name: src.name + "_copy" });
      newColId = col.id;
    });
    if (newColId) setEditingId(newColId);
  };

  // Group templates by category
  const templateCategories = COLUMN_TEMPLATES.reduce<Record<string, ColumnTemplate[]>>((acc, tpl) => {
    (acc[tpl.category] ??= []).push(tpl);
    return acc;
  }, {});

  return (
    <div className="columns-tab">
      {/* Column list */}
      <div className="columns-table-wrap">
        <table className="columns-table">
          <thead>
            <tr>
              <th className="col-num">#</th>
              <th className="col-name">カラム名</th>
              <th className="col-logical">論理名</th>
              <th className="col-type">データ型</th>
              <th className="col-len">長さ</th>
              <th className="col-flag" title="NOT NULL">NN</th>
              <th className="col-flag" title="PRIMARY KEY">PK</th>
              <th className="col-flag" title="UNIQUE">UK</th>
              <th className="col-flag" title="AUTO INCREMENT">AI</th>
              <th className="col-default">デフォルト</th>
              <th className="col-actions" />
            </tr>
          </thead>
          <tbody>
            {table.columns.map((col, i) => (
              <ColumnRow
                key={col.id}
                col={col}
                index={i}
                isEditing={editingId === col.id}
                isFirst={i === 0}
                isLast={i === table.columns.length - 1}
                allTables={allTables}
                onEdit={() => setEditingId(editingId === col.id ? null : col.id)}
                onUpdate={(patch) => handleUpdateCol(col.id, patch)}
                onRemove={() => handleRemove(col.id)}
                onMoveUp={() => handleMoveUp(col.id)}
                onMoveDown={() => handleMoveDown(col.id)}
                onDuplicate={() => handleDuplicate(col.id)}
              />
            ))}
          </tbody>
        </table>
        {table.columns.length === 0 && (
          <div className="columns-empty">
            <p>カラムがまだありません。テンプレートから追加するか、空のカラムを追加してください。</p>
          </div>
        )}
      </div>

      {/* Add column actions */}
      <div className="columns-add-bar">
        <button className="tbl-btn tbl-btn-primary" onClick={handleAddBlank}>
          <i className="bi bi-plus-lg" /> カラム追加
        </button>
        <button
          className={`tbl-btn tbl-btn-secondary${showTemplates ? " active" : ""}`}
          onClick={() => setShowTemplates(!showTemplates)}
        >
          <i className="bi bi-collection" /> テンプレートから追加
        </button>
      </div>

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

// ── カラム行 ──────────────────────────────────────────────────────────────────

function ColumnRow({
  col, index, isEditing, isFirst, isLast, allTables,
  onEdit, onUpdate, onRemove, onMoveUp, onMoveDown, onDuplicate,
}: {
  col: TableColumn;
  index: number;
  isEditing: boolean;
  isFirst: boolean;
  isLast: boolean;
  allTables: TableDefinition[];
  onEdit: () => void;
  onUpdate: (patch: Partial<TableColumn>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
}) {
  const showLength = DATA_TYPES_WITH_LENGTH.includes(col.dataType);
  const showScale = DATA_TYPES_WITH_SCALE.includes(col.dataType);

  return (
    <>
      <tr className={`column-row${isEditing ? " editing" : ""}${col.primaryKey ? " pk" : ""}`} onClick={onEdit}>
        <td className="col-num">{index + 1}</td>
        <td className="col-name">
          <code>{col.name}</code>
          {col.foreignKey && <i className="bi bi-link-45deg col-fk-icon" title="外部キー" />}
        </td>
        <td className="col-logical">{col.logicalName}</td>
        <td className="col-type">
          <span className="col-type-badge">{col.dataType}</span>
        </td>
        <td className="col-len">
          {col.length != null ? col.length : ""}
          {col.scale != null ? `,${col.scale}` : ""}
        </td>
        <td className="col-flag">{col.notNull && <i className="bi bi-check-lg" />}</td>
        <td className="col-flag">{col.primaryKey && <i className="bi bi-key-fill col-pk-icon" />}</td>
        <td className="col-flag">{col.unique && <i className="bi bi-check-lg" />}</td>
        <td className="col-flag">{col.autoIncrement && <i className="bi bi-check-lg" />}</td>
        <td className="col-default"><code>{col.defaultValue ?? ""}</code></td>
        <td className="col-actions">
          <button className="tbl-btn-icon" onClick={(e) => { e.stopPropagation(); onMoveUp(); }} disabled={isFirst} title="上へ移動">
            <i className="bi bi-chevron-up" />
          </button>
          <button className="tbl-btn-icon" onClick={(e) => { e.stopPropagation(); onMoveDown(); }} disabled={isLast} title="下へ移動">
            <i className="bi bi-chevron-down" />
          </button>
          <button className="tbl-btn-icon" onClick={(e) => { e.stopPropagation(); onDuplicate(); }} title="複製">
            <i className="bi bi-copy" />
          </button>
          <button className="tbl-btn-icon danger" onClick={(e) => { e.stopPropagation(); onRemove(); }} title="削除">
            <i className="bi bi-trash" />
          </button>
        </td>
      </tr>
      {isEditing && (
        <tr className="column-detail-row">
          <td colSpan={11}>
            <ColumnDetailEditor col={col} onUpdate={onUpdate} allTables={allTables} showLength={showLength} showScale={showScale} />
          </td>
        </tr>
      )}
    </>
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

// ── インデックスタブ ──────────────────────────────────────────────────────────

function IndexesTab({
  table, update,
}: {
  table: TableDefinition;
  update: (fn: (t: TableDefinition) => void) => void;
}) {
  const handleAdd = () => {
    update((t) => addIndex(t));
  };

  const handleRemove = (idxId: string) => {
    update((t) => removeIndex(t, idxId));
  };

  const handleUpdate = (idxId: string, patch: Partial<TableIndex>) => {
    update((t) => {
      const idx = t.indexes.find((i) => i.id === idxId);
      if (idx) Object.assign(idx, patch);
    });
  };

  const toggleColumn = (idxId: string, colId: string) => {
    update((t) => {
      const idx = t.indexes.find((i) => i.id === idxId);
      if (!idx) return;
      if (idx.columns.includes(colId)) {
        idx.columns = idx.columns.filter((c) => c !== colId);
      } else {
        idx.columns.push(colId);
      }
    });
  };

  return (
    <div className="indexes-tab">
      {table.indexes.length === 0 ? (
        <div className="indexes-empty">
          <p>インデックスがまだありません</p>
        </div>
      ) : (
        <div className="indexes-list">
          {table.indexes.map((idx) => (
            <div key={idx.id} className="index-card">
              <div className="index-card-header">
                <input
                  type="text"
                  className="index-name-input"
                  value={idx.name}
                  onChange={(e) => handleUpdate(idx.id, { name: e.target.value })}
                  placeholder="インデックス名"
                />
                <label className="column-flag-label">
                  <input
                    type="checkbox"
                    checked={idx.unique}
                    onChange={(e) => handleUpdate(idx.id, { unique: e.target.checked })}
                  />
                  UNIQUE
                </label>
                <button className="tbl-btn-icon danger" onClick={() => handleRemove(idx.id)} title="削除">
                  <i className="bi bi-trash" />
                </button>
              </div>
              <div className="index-columns">
                <span className="index-columns-label">カラム:</span>
                {table.columns.map((col) => (
                  <label key={col.id} className={`index-col-chip${idx.columns.includes(col.id) ? " selected" : ""}`}>
                    <input
                      type="checkbox"
                      checked={idx.columns.includes(col.id)}
                      onChange={() => toggleColumn(idx.id, col.id)}
                    />
                    {col.name}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <button className="tbl-btn tbl-btn-primary" onClick={handleAdd}>
        <i className="bi bi-plus-lg" /> インデックス追加
      </button>
    </div>
  );
}

// ── DDLタブ ───────────────────────────────────────────────────────────────────

function DdlTab({
  ddl, dialect, onDialectChange,
}: {
  ddl: string;
  dialect: SqlDialect;
  onDialectChange: (d: SqlDialect) => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(ddl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="ddl-tab">
      <div className="ddl-toolbar">
        <select
          value={dialect}
          onChange={(e) => onDialectChange(e.target.value as SqlDialect)}
          className="ddl-dialect-select"
        >
          {Object.entries(SQL_DIALECT_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button className="tbl-btn tbl-btn-ghost" onClick={handleCopy}>
          <i className={`bi ${copied ? "bi-check-lg" : "bi-clipboard"}`} />
          {copied ? "コピーしました" : "コピー"}
        </button>
      </div>
      <pre className="ddl-preview"><code>{ddl}</code></pre>
    </div>
  );
}
