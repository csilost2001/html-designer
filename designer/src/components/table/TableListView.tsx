import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { TableMeta } from "../../types/flow";
import type { TableDefinition, SqlDialect } from "../../types/table";
import { SQL_DIALECT_LABELS } from "../../types/table";
import { listTables, createTable, deleteTable, loadTable } from "../../store/tableStore";
import { loadProject } from "../../store/flowStore";
import { generateAllDdl, generateAllTableMarkdown } from "../../utils/ddlGenerator";
import { mcpBridge } from "../../mcp/mcpBridge";
import { TableSubToolbar } from "./TableSubToolbar";
import "../../styles/table.css";

export function TableListView() {
  const navigate = useNavigate();
  const [tables, setTables] = useState<TableMeta[]>([]);
  const [projectName, setProjectName] = useState("プロジェクト");
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addLogical, setAddLogical] = useState("");
  const [addCategory, setAddCategory] = useState("");
  const [exportDialect, setExportDialect] = useState<SqlDialect>("postgresql");
  const [showExport, setShowExport] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCardClick = (id: string) => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      navigate(`/table/edit/${id}`);
    } else {
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null;
        setSelectedId((prev) => (prev === id ? null : id));
      }, 250);
    }
  };

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

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("このテーブル定義を削除しますか？")) return;
    await deleteTable(id);
    await reload();
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

  return (
    <div className="table-list-page">
      <TableSubToolbar />

      <div className="table-list-content" onClick={() => setSelectedId(null)}>
        <div className="table-list-header">
          <h2 className="table-list-title">
            <i className="bi bi-table" /> テーブル設計書
            <span className="table-list-count">{tables.length} テーブル</span>
          </h2>
          <div className="table-list-actions">
            {tables.length > 0 && (
              <>
                <button
                  className="tbl-btn tbl-btn-ghost"
                  onClick={handleExportMarkdown}
                  title="Markdown エクスポート"
                >
                  <i className="bi bi-file-earmark-text" /> Markdown
                </button>
                <button
                  className="tbl-btn tbl-btn-ghost"
                  onClick={() => setShowExport(true)}
                  title="DDL エクスポート"
                >
                  <i className="bi bi-code-square" /> DDL
                </button>
              </>
            )}
            <button
              className="tbl-btn tbl-btn-primary"
              onClick={() => setShowAdd(true)}
            >
              <i className="bi bi-plus-lg" /> テーブル追加
            </button>
          </div>
        </div>

        {tables.length === 0 && !showAdd ? (
          <div className="table-list-empty">
            <i className="bi bi-table" />
            <p>テーブル定義がまだありません</p>
            <button
              className="tbl-btn tbl-btn-primary"
              onClick={() => setShowAdd(true)}
            >
              <i className="bi bi-plus-lg" /> 最初のテーブルを追加
            </button>
          </div>
        ) : (
          <div className="table-list-grid">
            {tables.map((t) => (
              <div
                key={t.id}
                className={`table-list-card${selectedId === t.id ? " selected" : ""}`}
                onClick={(e) => { e.stopPropagation(); handleCardClick(t.id); }}
              >
                <div className="table-card-header">
                  <span className="table-card-name">{t.name}</span>
                  {t.category && (
                    <span className="table-card-category">{t.category}</span>
                  )}
                </div>
                <div className="table-card-logical">{t.logicalName}</div>
                <div className="table-card-meta">
                  <span>
                    <i className="bi bi-columns-gap" /> {t.columnCount} カラム
                  </span>
                  <span className="table-card-date">
                    {new Date(t.updatedAt).toLocaleDateString("ja-JP")}
                  </span>
                </div>
                <button
                  className="table-card-delete"
                  onClick={(e) => handleDelete(t.id, e)}
                  title="削除"
                >
                  <i className="bi bi-trash" />
                </button>
              </div>
            ))}
          </div>
        )}

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
