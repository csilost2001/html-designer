import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { ViewDefinition, ViewOutputColumn } from "../../types/view";
import { loadView, saveView } from "../../store/viewStore";
import { listTables } from "../../store/tableStore";
import { mcpBridge } from "../../mcp/mcpBridge";
import { useResourceEditor } from "../../hooks/useResourceEditor";
import { useSaveShortcut } from "../../hooks/useSaveShortcut";
import { EditorHeader, type EditorHeaderSaveReset, type EditorHeaderBackLink } from "../common/EditorHeader";
import { ServerChangeBanner } from "../common/ServerChangeBanner";
import { generateViewDdl } from "./generateViewDdl";

export function ViewEditor() {
  const { viewId: rawId } = useParams<{ viewId: string }>();
  const viewId = rawId ? decodeURIComponent(rawId) : rawId;
  const navigate = useNavigate();

  const [ddlOpen, setDdlOpen] = useState(false);
  const [tableIds, setTableIds] = useState<string[]>([]);
  const [addDepInput, setAddDepInput] = useState("");
  const [addColName, setAddColName] = useState("");
  const [addColType, setAddColType] = useState("");
  const [addColDesc, setAddColDesc] = useState("");
  const [addingCol, setAddingCol] = useState(false);

  const handleNotFound = useCallback(() => navigate("/view/list"), [navigate]);

  const {
    state: view,
    isDirty, isSaving, serverChanged,
    update, updateSilent, commit, handleSave, handleReset, dismissServerBanner,
  } = useResourceEditor<ViewDefinition>({
    tabType: "view",
    mtimeKind: "view",
    draftKind: "view",
    id: viewId,
    load: loadView,
    save: saveView,
    broadcastName: "viewChanged",
    broadcastIdField: "viewId",
    onNotFound: handleNotFound,
  });

  useSaveShortcut(() => {
    if (isDirty && !isSaving) handleSave();
  });

  useEffect(() => {
    mcpBridge.startWithoutEditor();
    listTables().then((metas) => {
      setTableIds(metas.map((m) => m.id));
    });
  }, [viewId]);

  if (!view) {
    return <div className="table-editor-loading"><i className="bi bi-hourglass-split" /> 読み込み中...</div>;
  }

  const ddl = generateViewDdl(view);

  const addDependency = () => {
    const dep = addDepInput.trim();
    if (!dep) return;
    if ((view.dependencies ?? []).includes(dep)) return;
    update((prev) => ({ ...prev, dependencies: [...(prev.dependencies ?? []), dep] }));
    setAddDepInput("");
  };

  const removeDependency = (dep: string) => {
    update((prev) => ({
      ...prev,
      dependencies: (prev.dependencies ?? []).filter((d) => d !== dep),
    }));
  };

  const addOutputColumn = () => {
    if (!addColName.trim() || !addColType.trim()) return;
    const col: ViewOutputColumn = {
      name: addColName.trim(),
      type: addColType.trim(),
      description: addColDesc.trim() || undefined,
    };
    update((prev) => ({ ...prev, outputColumns: [...prev.outputColumns, col] }));
    setAddColName("");
    setAddColType("");
    setAddColDesc("");
    setAddingCol(false);
  };

  const removeOutputColumn = (idx: number) => {
    update((prev) => ({
      ...prev,
      outputColumns: prev.outputColumns.filter((_, i) => i !== idx),
    }));
  };

  const updateOutputColumn = (idx: number, field: keyof ViewOutputColumn, value: string) => {
    update((prev) => ({
      ...prev,
      outputColumns: prev.outputColumns.map((c, i) =>
        i === idx ? { ...c, [field]: value || undefined } : c,
      ),
    }));
  };

  return (
    <div className="table-editor-page">
      {serverChanged && (
        <ServerChangeBanner onReload={handleReset} onDismiss={dismissServerBanner} />
      )}
      <EditorHeader
        title={<><i className="bi bi-eye" /> ビュー編集: <code>{view.id}</code></>}
        backLink={{
          label: "ビュー一覧",
          onClick: () => navigate("/view/list"),
        } satisfies EditorHeaderBackLink}
        saveReset={{
          isDirty,
          isSaving,
          onSave: handleSave,
          onReset: handleReset,
        } satisfies EditorHeaderSaveReset}
      />

      <div className="seq-editor-body">
        {/* 左カラム（基本設定・SELECT・依存テーブル・出力列） */}
        <div className="seq-editor-left-col">

          {/* 基本設定 */}
          <section className="seq-editor-section">
            <h3 className="seq-editor-section-title">基本設定</h3>
            <div className="seq-editor-grid">
              <label className="tbl-field">
                <span>ビュー名</span>
                <input
                  type="text"
                  value={view.id}
                  readOnly
                  className="seq-readonly"
                  title="ビュー名は作成後変更できません"
                />
              </label>
              <label className="tbl-field">
                <span>説明</span>
                <input
                  type="text"
                  value={view.description ?? ""}
                  onChange={(e) => update((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="顧客に最終購入日を結合した表示用ビュー"
                />
              </label>
            </div>
          </section>

          {/* SELECT 文 */}
          <section className="seq-editor-section">
            <h3 className="seq-editor-section-title">SELECT 文</h3>
            <textarea
              className="view-editor-select-stmt"
              value={view.selectStatement}
              onChange={(e) => updateSilent((prev) => ({ ...prev, selectStatement: e.target.value }))}
              onBlur={commit}
              rows={10}
              placeholder={`SELECT\n  c.customer_id,\n  c.customer_name,\n  MAX(o.created_at) AS last_order_at\nFROM customers c\nLEFT JOIN orders o ON c.customer_id = o.customer_id\nGROUP BY c.customer_id, c.customer_name`}
              spellCheck={false}
            />
          </section>

          {/* 依存テーブル */}
          <section className="seq-editor-section">
            <h3 className="seq-editor-section-title">依存テーブル</h3>
            {(view.dependencies ?? []).length > 0 && (
              <div className="seq-used-by-list">
                {(view.dependencies ?? []).map((dep) => (
                  <div key={dep} className="seq-used-by-row">
                    <span className="seq-used-by-text">
                      <i className="bi bi-table" /> {dep}
                    </span>
                    <button
                      className="seq-used-by-del"
                      onClick={() => removeDependency(dep)}
                      title="削除"
                    >
                      <i className="bi bi-x" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="view-editor-dep-add">
              <input
                type="text"
                list="dep-table-ids"
                value={addDepInput}
                onChange={(e) => setAddDepInput(e.target.value)}
                placeholder="テーブル名を入力..."
                onKeyDown={(e) => { if (e.key === "Enter") addDependency(); }}
                className="view-editor-dep-input"
              />
              <datalist id="dep-table-ids">
                {tableIds.map((id) => (
                  <option key={id} value={id} />
                ))}
              </datalist>
              <button
                className="tbl-btn tbl-btn-ghost"
                onClick={addDependency}
                disabled={!addDepInput.trim()}
              >
                <i className="bi bi-plus-lg" /> 追加
              </button>
            </div>
          </section>

          {/* 出力列 */}
          <section className="seq-editor-section">
            <h3 className="seq-editor-section-title">
              出力列
              <button
                className="tbl-btn tbl-btn-ghost view-editor-col-add-btn"
                onClick={() => setAddingCol(true)}
              >
                <i className="bi bi-plus-lg" /> 追加
              </button>
            </h3>

            {view.outputColumns.length > 0 && (
              <div className="view-editor-col-list">
                {view.outputColumns.map((col, i) => (
                  <div key={i} className="view-editor-col-row">
                    <input
                      type="text"
                      value={col.name}
                      onChange={(e) => updateOutputColumn(i, "name", e.target.value)}
                      placeholder="列名"
                      className="view-editor-col-name"
                    />
                    <input
                      type="text"
                      value={col.type}
                      onChange={(e) => updateOutputColumn(i, "type", e.target.value)}
                      placeholder="型"
                      className="view-editor-col-type"
                    />
                    <input
                      type="text"
                      value={col.description ?? ""}
                      onChange={(e) => updateOutputColumn(i, "description", e.target.value)}
                      placeholder="説明（省略可）"
                      className="view-editor-col-desc"
                    />
                    <button
                      className="seq-used-by-del"
                      onClick={() => removeOutputColumn(i)}
                      title="削除"
                    >
                      <i className="bi bi-x" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {addingCol && (
              <div className="view-editor-col-add-form">
                <input
                  type="text"
                  value={addColName}
                  onChange={(e) => setAddColName(e.target.value)}
                  placeholder="列名 (例: customer_id)"
                  autoFocus
                />
                <input
                  type="text"
                  value={addColType}
                  onChange={(e) => setAddColType(e.target.value)}
                  placeholder="型 (例: uuid, string, timestamp)"
                />
                <input
                  type="text"
                  value={addColDesc}
                  onChange={(e) => setAddColDesc(e.target.value)}
                  placeholder="説明（省略可）"
                />
                <button
                  className="tbl-btn tbl-btn-primary"
                  onClick={addOutputColumn}
                  disabled={!addColName.trim() || !addColType.trim()}
                >
                  追加
                </button>
                <button
                  className="tbl-btn tbl-btn-ghost"
                  onClick={() => { setAddingCol(false); setAddColName(""); setAddColType(""); setAddColDesc(""); }}
                >
                  キャンセル
                </button>
              </div>
            )}
          </section>

        </div>{/* seq-editor-left-col */}

        {/* DDL プレビュー */}
        <section className="seq-editor-section seq-editor-ddl-section">
          <button
            className="seq-ddl-toggle"
            onClick={() => setDdlOpen((v) => !v)}
          >
            <i className={`bi bi-chevron-${ddlOpen ? "down" : "right"}`} />
            DDL プレビュー (CREATE OR REPLACE VIEW)
          </button>
          {ddlOpen && (
            <pre className="seq-ddl-preview">{ddl}</pre>
          )}
        </section>
      </div>
    </div>
  );
}
