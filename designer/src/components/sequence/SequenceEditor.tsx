import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Sequence, TableColumnRef, TableId, LocalId, Maturity, SemVer } from "../../types/v3";
import { loadSequence, saveSequence } from "../../store/sequenceStore";
import { loadConventions } from "../../store/conventionsStore";
import { listTables, loadTable } from "../../store/tableStore";
import { mcpBridge } from "../../mcp/mcpBridge";
import { useResourceEditor } from "../../hooks/useResourceEditor";
import { useSaveShortcut } from "../../hooks/useSaveShortcut";
import { EditorHeader, type EditorHeaderSaveReset, type EditorHeaderBackLink } from "../common/EditorHeader";
import { ServerChangeBanner } from "../common/ServerChangeBanner";
import { generateSequenceDdl } from "./generateSequenceDdl";
import type { TableDefinition } from "../../types/table";
import type { NumberingEntry } from "../../types/conventions";

interface TableColumnOption {
  tableId: string;
  tableName: string;
  /** v1 TableColumn (id + name) を v3 TableColumnRef.columnId (LocalId) として保存。 */
  columns: Array<{ id: string; name: string }>;
}

export function SequenceEditor() {
  const { sequenceId: rawId } = useParams<{ sequenceId: string }>();
  const sequenceId = rawId ? decodeURIComponent(rawId) : rawId;
  const navigate = useNavigate();

  const [ddlOpen, setDdlOpen] = useState(false);
  const [numberingKeys, setNumberingKeys] = useState<Array<{ key: string; entry: NumberingEntry }>>([]);
  const [tableOptions, setTableOptions] = useState<TableColumnOption[]>([]);
  const [addUsedByTableId, setAddUsedByTableId] = useState("");
  const [addUsedByColumnId, setAddUsedByColumnId] = useState("");
  const [addingUsedBy, setAddingUsedBy] = useState(false);

  const handleNotFound = useCallback(() => navigate("/sequence/list"), [navigate]);

  const {
    state: seq,
    isDirty, isSaving, serverChanged,
    update, handleSave, handleReset, dismissServerBanner,
  } = useResourceEditor<Sequence>({
    tabType: "sequence",
    mtimeKind: "sequence",
    draftKind: "sequence",
    id: sequenceId,
    load: loadSequence,
    save: saveSequence,
    broadcastName: "sequenceChanged",
    broadcastIdField: "sequenceId",
    onNotFound: handleNotFound,
  });

  useSaveShortcut(() => {
    if (isDirty && !isSaving) handleSave();
  });

  useEffect(() => {
    mcpBridge.startWithoutEditor();
    (async () => {
      const catalog = await loadConventions();
      if (catalog?.numbering) {
        const entries = Object.entries(catalog.numbering).map(([k, v]) => ({
          key: `@conv.numbering.${k}`,
          entry: v,
        }));
        setNumberingKeys(entries);
      }

      const metas = await listTables();
      const opts: TableColumnOption[] = [];
      for (const m of metas) {
        const td: TableDefinition | null = await loadTable(m.id);
        if (td) {
          opts.push({
            tableId: td.id,
            tableName: td.logicalName || td.name,
            columns: td.columns.map((c) => ({ id: c.id, name: c.name })),
          });
        }
      }
      setTableOptions(opts);
    })();
  }, [sequenceId]);

  if (!seq) {
    return <div className="table-editor-loading"><i className="bi bi-hourglass-split" /> 読み込み中...</div>;
  }

  const selectedConvEntry = numberingKeys.find((k) => k.key === seq.conventionRef)?.entry ?? null;
  const ddl = generateSequenceDdl(seq);

  const addUsedBy = () => {
    if (!addUsedByTableId || !addUsedByColumnId) return;
    const entry: TableColumnRef = {
      tableId: addUsedByTableId as TableId,
      columnId: addUsedByColumnId as LocalId,
    };
    update((prev) => ({
      ...prev,
      usedBy: [...(prev.usedBy ?? []), entry],
    }));
    setAddUsedByTableId("");
    setAddUsedByColumnId("");
    setAddingUsedBy(false);
  };

  const removeUsedBy = (idx: number) => {
    update((prev) => ({
      ...prev,
      usedBy: (prev.usedBy ?? []).filter((_, i) => i !== idx),
    }));
  };

  const selectedTable = tableOptions.find((t) => t.tableId === addUsedByTableId);
  const selectedTableColumns = selectedTable?.columns ?? [];

  const columnNameOf = (tableId: string, columnId: string): string => {
    const tbl = tableOptions.find((t) => t.tableId === tableId);
    return tbl?.columns.find((c) => c.id === columnId)?.name ?? columnId;
  };

  return (
    <div className="table-editor-page">
      {serverChanged && (
        <ServerChangeBanner onReload={handleReset} onDismiss={dismissServerBanner} />
      )}
      <EditorHeader
        title={<><i className="bi bi-arrow-repeat" /> シーケンス編集: <code>{seq.physicalName}</code></>}
        backLink={{
          label: "シーケンス一覧",
          onClick: () => navigate("/sequence/list"),
        } satisfies EditorHeaderBackLink}
        saveReset={{
          isDirty,
          isSaving,
          onSave: handleSave,
          onReset: handleReset,
        } satisfies EditorHeaderSaveReset}
      />

      <div className="seq-editor-body">
        {/* 4K: 左カラム（基本設定・値設定・規約・使用先） */}
        <div className="seq-editor-left-col">
        {/* 基本設定 */}
        <section className="seq-editor-section">
          <h3 className="seq-editor-section-title">基本設定</h3>
          <div className="seq-editor-grid">
            <label className="tbl-field">
              <span>物理名</span>
              <input
                type="text"
                value={seq.physicalName}
                readOnly
                className="seq-readonly"
                title="物理名は作成後変更できません"
              />
            </label>
            <label className="tbl-field">
              <span>表示名</span>
              <input
                type="text"
                value={seq.name}
                onChange={(e) => update((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="発注番号採番"
              />
            </label>
            <label className="tbl-field">
              <span>説明</span>
              <input
                type="text"
                value={seq.description ?? ""}
                onChange={(e) => update((prev) => ({ ...prev, description: e.target.value || undefined }))}
                placeholder="発注番号の採番 (ORD-YYYY-NNNN)"
              />
            </label>
            <label className="tbl-field">
              <span>成熟度</span>
              <select
                value={seq.maturity ?? ""}
                onChange={(e) =>
                  update((prev) => ({
                    ...prev,
                    maturity: (e.target.value || undefined) as Maturity | undefined,
                  }))
                }
              >
                <option value="">（未指定）</option>
                <option value="draft">draft（下書き）</option>
                <option value="provisional">provisional（暫定）</option>
                <option value="committed">committed（確定）</option>
              </select>
            </label>
            <label className="tbl-field">
              <span>バージョン</span>
              <input
                type="text"
                value={seq.version ?? ""}
                onChange={(e) =>
                  update((prev) => ({
                    ...prev,
                    version: (e.target.value || undefined) as SemVer | undefined,
                  }))
                }
                placeholder="1.0.0"
                pattern="^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$"
              />
            </label>
          </div>
        </section>

        {/* 値設定 */}
        <section className="seq-editor-section">
          <h3 className="seq-editor-section-title">値設定</h3>
          <div className="seq-editor-grid seq-editor-grid-4">
            <label className="tbl-field">
              <span>開始値</span>
              <input
                type="number"
                value={seq.startValue ?? 1}
                onChange={(e) => update((prev) => ({ ...prev, startValue: Number(e.target.value) }))}
              />
            </label>
            <label className="tbl-field">
              <span>増分</span>
              <input
                type="number"
                value={seq.increment ?? 1}
                onChange={(e) => update((prev) => ({ ...prev, increment: Number(e.target.value) }))}
              />
            </label>
            <label className="tbl-field">
              <span>最小値</span>
              <input
                type="number"
                value={seq.minValue ?? ""}
                placeholder="（省略可）"
                onChange={(e) => update((prev) => ({
                  ...prev,
                  minValue: e.target.value === "" ? undefined : Number(e.target.value),
                }))}
              />
            </label>
            <label className="tbl-field">
              <span>最大値</span>
              <input
                type="number"
                value={seq.maxValue ?? ""}
                placeholder="（省略可）"
                onChange={(e) => update((prev) => ({
                  ...prev,
                  maxValue: e.target.value === "" ? undefined : Number(e.target.value),
                }))}
              />
            </label>
            <label className="tbl-field">
              <span>キャッシュ</span>
              <input
                type="number"
                value={seq.cache ?? 1}
                min={1}
                onChange={(e) => update((prev) => ({ ...prev, cache: Number(e.target.value) }))}
              />
            </label>
            <label className="tbl-field seq-field-checkbox">
              <span>CYCLE</span>
              <label className="seq-checkbox-label">
                <input
                  type="checkbox"
                  checked={seq.cycle ?? false}
                  onChange={(e) => update((prev) => ({ ...prev, cycle: e.target.checked }))}
                />
                最大値到達後に最小値に戻る
              </label>
            </label>
          </div>
        </section>

        {/* 規約カタログ連携 */}
        <section className="seq-editor-section">
          <h3 className="seq-editor-section-title">規約カタログ連携</h3>
          <label className="tbl-field">
            <span>対応する規約</span>
            <input
              type="text"
              list="numbering-keys"
              value={seq.conventionRef ?? ""}
              onChange={(e) => update((prev) => ({ ...prev, conventionRef: e.target.value || undefined }))}
              placeholder="@conv.numbering.orderNumber"
            />
            <datalist id="numbering-keys">
              {numberingKeys.map((k) => (
                <option key={k.key} value={k.key}>{k.entry.description ?? k.entry.format}</option>
              ))}
            </datalist>
          </label>
          {selectedConvEntry && (
            <div className="seq-conv-preview">
              <div className="seq-conv-preview-key">{seq.conventionRef}</div>
              <div className="seq-conv-preview-format">
                <span className="seq-conv-preview-label">format:</span> {selectedConvEntry.format}
              </div>
              {selectedConvEntry.description && (
                <div className="seq-conv-preview-desc">{selectedConvEntry.description}</div>
              )}
              {selectedConvEntry.implementation && (
                <div className="seq-conv-preview-impl">
                  <span className="seq-conv-preview-label">implementation:</span> {selectedConvEntry.implementation}
                </div>
              )}
            </div>
          )}
        </section>

        {/* 使用先 */}
        <section className="seq-editor-section">
          <h3 className="seq-editor-section-title">使用先</h3>
          {(seq.usedBy ?? []).length > 0 && (
            <div className="seq-used-by-list">
              {(seq.usedBy ?? []).map((u, i) => {
                const tbl = tableOptions.find((t) => t.tableId === u.tableId);
                return (
                  <div key={`${u.tableId}.${u.columnId}`} className="seq-used-by-row">
                    <span className="seq-used-by-text">
                      <i className="bi bi-table" /> {tbl?.tableName ?? u.tableId}
                      <span className="seq-used-by-sep">.</span>
                      <code>{columnNameOf(u.tableId, u.columnId)}</code>
                    </span>
                    <button
                      className="seq-used-by-del"
                      onClick={() => removeUsedBy(i)}
                      title="削除"
                    >
                      <i className="bi bi-x" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {addingUsedBy ? (
            <div className="seq-used-by-add-form">
              <select
                value={addUsedByTableId}
                onChange={(e) => { setAddUsedByTableId(e.target.value); setAddUsedByColumnId(""); }}
              >
                <option value="">テーブルを選択...</option>
                {tableOptions.map((t) => (
                  <option key={t.tableId} value={t.tableId}>{t.tableName}</option>
                ))}
              </select>
              <select
                value={addUsedByColumnId}
                onChange={(e) => setAddUsedByColumnId(e.target.value)}
                disabled={!addUsedByTableId}
              >
                <option value="">列を選択...</option>
                {selectedTableColumns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button
                className="tbl-btn tbl-btn-primary"
                onClick={addUsedBy}
                disabled={!addUsedByTableId || !addUsedByColumnId}
              >
                追加
              </button>
              <button
                className="tbl-btn tbl-btn-ghost"
                onClick={() => { setAddingUsedBy(false); setAddUsedByTableId(""); setAddUsedByColumnId(""); }}
              >
                キャンセル
              </button>
            </div>
          ) : (
            <button
              className="tbl-btn tbl-btn-ghost seq-add-used-by-btn"
              onClick={() => setAddingUsedBy(true)}
            >
              <i className="bi bi-plus-lg" /> 使用先を追加
            </button>
          )}
        </section>

        </div>{/* seq-editor-left-col */}

        {/* DDL プレビュー（4K: 右カラムに常時表示） */}
        <section className="seq-editor-section seq-editor-ddl-section">
          <button
            className="seq-ddl-toggle"
            onClick={() => setDdlOpen((v) => !v)}
          >
            <i className={`bi bi-chevron-${ddlOpen ? "down" : "right"}`} />
            DDL プレビュー (CREATE SEQUENCE)
          </button>
          {ddlOpen && (
            <pre className="seq-ddl-preview">{ddl}</pre>
          )}
        </section>
      </div>
    </div>
  );
}
