import { useState } from "react";
import type {
  TableDefinition,
  ConstraintDefinition,
  UniqueConstraint,
  CheckConstraint,
  ForeignKeyConstraint,
  FkAction,
} from "../../types/table";
import { addConstraint, removeConstraint } from "../../store/tableStore";

const FK_ACTIONS: FkAction[] = ["CASCADE", "SET NULL", "SET DEFAULT", "RESTRICT", "NO ACTION"];

interface Props {
  table: TableDefinition;
  update: (fn: (t: TableDefinition) => void) => void;
  allTables: TableDefinition[];
}

type ConstraintKind = "unique" | "check" | "foreignKey";

export function ConstraintsTab({ table, update, allTables }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const constraints = table.constraints ?? [];

  const handleAdd = (kind: ConstraintKind) => {
    setAddMenuOpen(false);
    let newId = "";
    update((t) => {
      const base = buildDefault(kind, t.name);
      const c = addConstraint(t, base);
      newId = c.id;
    });
    // Open editor for the new constraint
    setTimeout(() => setEditingId(newId), 0);
  };

  const handleDelete = (id: string) => {
    update((t) => removeConstraint(t, id));
    if (editingId === id) setEditingId(null);
  };

  const handleUpdate = (id: string, patch: Partial<ConstraintDefinition>) => {
    update((t) => {
      const c = (t.constraints ?? []).find((x) => x.id === id);
      if (c) Object.assign(c, patch);
    });
  };

  return (
    <div className="constraints-tab">
      <div className="constraints-toolbar">
        <span className="constraints-count">
          {constraints.length === 0
            ? "制約がまだありません"
            : `${constraints.length} 件`}
        </span>
        <div className="constraints-add-wrap">
          <button
            className="tbl-btn tbl-btn-primary"
            onClick={() => setAddMenuOpen((v) => !v)}
          >
            <i className="bi bi-plus-lg" /> 制約を追加
            <i className="bi bi-chevron-down" style={{ marginLeft: 4, fontSize: 11 }} />
          </button>
          {addMenuOpen && (
            <div className="constraints-add-menu" onMouseLeave={() => setAddMenuOpen(false)}>
              <button onClick={() => handleAdd("unique")}>
                <i className="bi bi-check2-square" /> UNIQUE
              </button>
              <button onClick={() => handleAdd("check")}>
                <i className="bi bi-shield-check" /> CHECK
              </button>
              <button onClick={() => handleAdd("foreignKey")}>
                <i className="bi bi-link-45deg" /> FOREIGN KEY
              </button>
            </div>
          )}
        </div>
      </div>

      {constraints.length === 0 ? (
        <div className="constraints-empty">
          <i className="bi bi-shield-check constraints-empty-icon" />
          <p>制約を追加すると DDL プレビューに <code>ALTER TABLE ... ADD CONSTRAINT</code> として出力されます。</p>
        </div>
      ) : (
        <div className="constraints-list">
          {constraints.map((c) =>
            editingId === c.id ? (
              <ConstraintEditor
                key={c.id}
                constraint={c}
                table={table}
                allTables={allTables}
                onUpdate={(patch) => handleUpdate(c.id, patch)}
                onClose={() => setEditingId(null)}
                onDelete={() => handleDelete(c.id)}
              />
            ) : (
              <ConstraintRow
                key={c.id}
                constraint={c}
                table={table}
                onEdit={() => setEditingId(c.id)}
                onDelete={() => handleDelete(c.id)}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

// ── 一覧行（折りたたみ状態） ─────────────────────────────────────────────────

function ConstraintRow({
  constraint, table, onEdit, onDelete,
}: {
  constraint: ConstraintDefinition;
  table: TableDefinition;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const badge = kindBadge(constraint.kind);
  const summary = constraintSummary(constraint, table);

  return (
    <div className="constraint-row">
      <div className="constraint-row-main">
        <span className={`constraint-kind-badge constraint-kind-badge--${constraint.kind}`}>{badge}</span>
        <code className="constraint-id">{constraint.id}</code>
        {constraint.description && (
          <span className="constraint-desc-inline">{constraint.description}</span>
        )}
      </div>
      <div className="constraint-row-summary">{summary}</div>
      <div className="constraint-row-actions">
        <button className="tbl-btn tbl-btn-ghost tbl-btn-sm" onClick={onEdit}>
          <i className="bi bi-pencil" /> 編集
        </button>
        <button className="tbl-btn tbl-btn-ghost tbl-btn-sm danger" onClick={onDelete}>
          <i className="bi bi-trash" />
        </button>
      </div>
    </div>
  );
}

// ── インライン編集カード ──────────────────────────────────────────────────────

function ConstraintEditor({
  constraint, table, allTables, onUpdate, onClose, onDelete,
}: {
  constraint: ConstraintDefinition;
  table: TableDefinition;
  allTables: TableDefinition[];
  onUpdate: (patch: Partial<ConstraintDefinition>) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="constraint-editor-card">
      <div className="constraint-editor-header">
        <span className={`constraint-kind-badge constraint-kind-badge--${constraint.kind}`}>
          {kindBadge(constraint.kind)}
        </span>
        <div className="constraint-editor-id-wrap">
          <label className="constraint-editor-label">制約名</label>
          <input
            className="constraint-id-input"
            value={constraint.id}
            onChange={(e) => onUpdate({ id: e.target.value } as Partial<ConstraintDefinition>)}
            placeholder="constraint_name"
          />
        </div>
        <button className="tbl-btn-icon" onClick={onClose} title="閉じる">
          <i className="bi bi-x-lg" />
        </button>
      </div>

      <div className="constraint-editor-body">
        {constraint.kind === "unique" && (
          <UniqueEditor c={constraint} table={table} onUpdate={onUpdate} />
        )}
        {constraint.kind === "check" && (
          <CheckEditor c={constraint} onUpdate={onUpdate} />
        )}
        {constraint.kind === "foreignKey" && (
          <FkEditor c={constraint} table={table} allTables={allTables} onUpdate={onUpdate} />
        )}

        <label className="constraint-editor-field">
          <span>説明 (任意)</span>
          <input
            type="text"
            value={constraint.description ?? ""}
            onChange={(e) =>
              onUpdate({ description: e.target.value || undefined } as Partial<ConstraintDefinition>)
            }
            placeholder="制約の目的・理由"
          />
        </label>
      </div>

      <div className="constraint-editor-footer">
        <button className="tbl-btn tbl-btn-ghost tbl-btn-sm danger" onClick={onDelete}>
          <i className="bi bi-trash" /> 削除
        </button>
        <button className="tbl-btn tbl-btn-primary tbl-btn-sm" onClick={onClose}>
          完了
        </button>
      </div>
    </div>
  );
}

// ── UNIQUE 編集 ───────────────────────────────────────────────────────────────

function UniqueEditor({
  c, table, onUpdate,
}: {
  c: UniqueConstraint;
  table: TableDefinition;
  onUpdate: (patch: Partial<ConstraintDefinition>) => void;
}) {
  const toggle = (colName: string) => {
    const cols = c.columns.includes(colName)
      ? c.columns.filter((x) => x !== colName)
      : [...c.columns, colName];
    onUpdate({ columns: cols } as Partial<UniqueConstraint>);
  };

  return (
    <div className="constraint-editor-field">
      <span>対象列 (1 つ以上選択)</span>
      <div className="constraint-col-chips">
        {table.columns.map((col) => (
          <label
            key={col.id}
            className={`constraint-col-chip${c.columns.includes(col.name) ? " selected" : ""}`}
          >
            <input
              type="checkbox"
              checked={c.columns.includes(col.name)}
              onChange={() => toggle(col.name)}
            />
            {col.name}
          </label>
        ))}
      </div>
    </div>
  );
}

// ── CHECK 編集 ────────────────────────────────────────────────────────────────

function CheckEditor({
  c, onUpdate,
}: {
  c: CheckConstraint;
  onUpdate: (patch: Partial<ConstraintDefinition>) => void;
}) {
  return (
    <label className="constraint-editor-field">
      <span>SQL 式</span>
      <input
        type="text"
        value={c.expression}
        onChange={(e) => onUpdate({ expression: e.target.value } as Partial<CheckConstraint>)}
        placeholder="amount > 0"
        className="constraint-expr-input"
      />
    </label>
  );
}

// ── FOREIGN KEY 編集 ──────────────────────────────────────────────────────────

function FkEditor({
  c, table, allTables, onUpdate,
}: {
  c: ForeignKeyConstraint;
  table: TableDefinition;
  allTables: TableDefinition[];
  onUpdate: (patch: Partial<ConstraintDefinition>) => void;
}) {
  const refTable = allTables.find((t) => t.name === c.referencedTable);

  const toggleSrcCol = (colName: string) => {
    const cols = c.columns.includes(colName)
      ? c.columns.filter((x) => x !== colName)
      : [...c.columns, colName];
    onUpdate({ columns: cols } as Partial<ForeignKeyConstraint>);
  };

  const toggleRefCol = (colName: string) => {
    const cols = c.referencedColumns.includes(colName)
      ? c.referencedColumns.filter((x) => x !== colName)
      : [...c.referencedColumns, colName];
    onUpdate({ referencedColumns: cols } as Partial<ForeignKeyConstraint>);
  };

  return (
    <>
      <div className="constraint-editor-field">
        <span>自テーブルの列</span>
        <div className="constraint-col-chips">
          {table.columns.map((col) => (
            <label
              key={col.id}
              className={`constraint-col-chip${c.columns.includes(col.name) ? " selected" : ""}`}
            >
              <input
                type="checkbox"
                checked={c.columns.includes(col.name)}
                onChange={() => toggleSrcCol(col.name)}
              />
              {col.name}
            </label>
          ))}
        </div>
      </div>

      <label className="constraint-editor-field">
        <span>参照先テーブル</span>
        <select
          value={c.referencedTable}
          onChange={(e) =>
            onUpdate({ referencedTable: e.target.value, referencedColumns: [] } as Partial<ForeignKeyConstraint>)
          }
        >
          <option value="">テーブルを選択...</option>
          {allTables.map((t) => (
            <option key={t.id} value={t.name}>
              {t.name}（{t.logicalName}）
            </option>
          ))}
        </select>
      </label>

      {refTable && (
        <div className="constraint-editor-field">
          <span>参照先列</span>
          <div className="constraint-col-chips">
            {refTable.columns.map((col) => (
              <label
                key={col.id}
                className={`constraint-col-chip${c.referencedColumns.includes(col.name) ? " selected" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={c.referencedColumns.includes(col.name)}
                  onChange={() => toggleRefCol(col.name)}
                />
                {col.name}
                {col.primaryKey && <i className="bi bi-key-fill" style={{ marginLeft: 3, fontSize: 10 }} />}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="constraint-fk-actions-row">
        <label className="constraint-editor-field">
          <span>ON DELETE</span>
          <select
            value={c.onDelete ?? ""}
            onChange={(e) =>
              onUpdate({ onDelete: (e.target.value as FkAction) || undefined } as Partial<ForeignKeyConstraint>)
            }
          >
            <option value="">(指定なし)</option>
            {FK_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="constraint-editor-field">
          <span>ON UPDATE</span>
          <select
            value={c.onUpdate ?? ""}
            onChange={(e) =>
              onUpdate({ onUpdate: (e.target.value as FkAction) || undefined } as Partial<ForeignKeyConstraint>)
            }
          >
            <option value="">(指定なし)</option>
            {FK_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
      </div>
    </>
  );
}

// ── ヘルパー ──────────────────────────────────────────────────────────────────

function buildDefault(kind: ConstraintKind, _tableName: string): Omit<ConstraintDefinition, "id"> {
  switch (kind) {
    case "unique":
      return { kind, columns: [], description: "" } as Omit<UniqueConstraint, "id">;
    case "check":
      return { kind, expression: "", description: "" } as Omit<CheckConstraint, "id">;
    case "foreignKey":
      return {
        kind,
        columns: [],
        referencedTable: "",
        referencedColumns: [],
        description: "",
      } as Omit<ForeignKeyConstraint, "id">;
  }
  // unreachable — satisfies exhaustiveness check
  const _never: never = kind;
  return _never;
}

function kindBadge(kind: ConstraintDefinition["kind"]): string {
  switch (kind) {
    case "unique": return "UNIQUE";
    case "check": return "CHECK";
    case "foreignKey": return "FK";
  }
}

function constraintSummary(c: ConstraintDefinition, table: TableDefinition): string {
  switch (c.kind) {
    case "unique":
      return c.columns.length > 0 ? `列: ${c.columns.join(", ")}` : "(列未選択)";
    case "check":
      return c.expression ? `式: ${c.expression}` : "(式未設定)";
    case "foreignKey": {
      const srcCols = c.columns.join(", ") || "(列未選択)";
      const refCols = c.referencedColumns.join(", ") || "?";
      const ref = c.referencedTable ? `${c.referencedTable}(${refCols})` : "(参照先未設定)";
      return `${srcCols} → ${ref}${c.onDelete ? ` ON DELETE ${c.onDelete}` : ""}`;
    }
  }
}

