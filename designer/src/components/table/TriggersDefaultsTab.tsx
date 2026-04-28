import { useState, useEffect, useMemo } from "react";
import type {
  TableDefinition,
  DefaultDefinition,
  DefaultKind,
  TriggerDefinition,
  TriggerTiming,
  TriggerEvent,
} from "../../types/table";
import { addDefault, removeDefault, addTrigger, removeTrigger } from "../../store/tableStore";
import { listSequences } from "../../store/sequenceStore";
import { loadConventions } from "../../store/conventionsStore";
import type { SequenceEntry } from "../../types/v3";
import type { ConventionsCatalog } from "../../schemas/conventionsValidator";

const DEFAULT_KIND_LABELS: Record<DefaultKind, string> = {
  literal: "リテラル (例: 0, 'active')",
  function: "関数 (例: NOW(), UUID())",
  sequence: "シーケンス (nextval)",
  conventionRef: "規約参照 (@conv.numbering.*)",
};

const TRIGGER_TIMINGS: TriggerTiming[] = ["BEFORE", "AFTER"];
const TRIGGER_EVENTS: TriggerEvent[] = ["INSERT", "UPDATE", "DELETE"];

interface Props {
  table: TableDefinition;
  update: (fn: (t: TableDefinition) => void) => void;
}

export function TriggersDefaultsTab({ table, update }: Props) {
  const [editingDefaultCol, setEditingDefaultCol] = useState<string | null>(null);
  const [editingTriggerId, setEditingTriggerId] = useState<string | null>(null);
  const [sequences, setSequences] = useState<SequenceEntry[]>([]);
  const [conventions, setConventions] = useState<ConventionsCatalog | null>(null);

  useEffect(() => {
    listSequences().then(setSequences).catch(console.error);
    loadConventions().then(setConventions).catch(console.error);
  }, []);

  const numberingKeys = useMemo(() => {
    if (!conventions?.numbering) return [];
    return Object.keys(conventions.numbering).map((k) => `@conv.numbering.${k}`);
  }, [conventions]);

  const defaults = table.defaults ?? [];
  const triggers = table.triggers ?? [];
  const colNames = table.columns.map((c) => c.name);

  // ── DEFAULT 値 ──────────────────────────────────────────────────────────

  const handleAddDefault = () => {
    const availableCols = colNames.filter((n) => !defaults.some((d) => d.column === n));
    const col = availableCols[0] ?? colNames[0] ?? "";
    if (!col) return;
    const def: DefaultDefinition = { column: col, kind: "literal", value: "" };
    update((t) => addDefault(t, def));
    setEditingDefaultCol(col);
  };

  const handleDeleteDefault = (col: string) => {
    update((t) => removeDefault(t, col));
    if (editingDefaultCol === col) setEditingDefaultCol(null);
  };

  const handleUpdateDefault = (col: string, patch: Partial<DefaultDefinition>) => {
    update((t) => {
      const d = (t.defaults ?? []).find((x) => x.column === col);
      if (d) Object.assign(d, patch);
    });
    // if column name changed, update editing key
    if (patch.column && patch.column !== col) {
      setEditingDefaultCol(patch.column);
    }
  };

  // ── トリガー ─────────────────────────────────────────────────────────────

  const handleAddTrigger = () => {
    let newId = "";
    update((t) => {
      const trg = addTrigger(t);
      newId = trg.id;
    });
    setTimeout(() => setEditingTriggerId(newId), 0);
  };

  const handleDeleteTrigger = (id: string) => {
    update((t) => removeTrigger(t, id));
    if (editingTriggerId === id) setEditingTriggerId(null);
  };

  const handleUpdateTrigger = (id: string, patch: Partial<TriggerDefinition>) => {
    update((t) => {
      const trg = (t.triggers ?? []).find((x) => x.id === id);
      if (trg) Object.assign(trg, patch);
    });
  };

  return (
    <div className="triggers-defaults-tab">
      {/* ── DEFAULT 値セクション ───────────────────────────────── */}
      <div className="td-section">
        <div className="td-section-header">
          <span className="td-section-title">
            <i className="bi bi-database-fill-gear" /> DEFAULT 値
          </span>
          <button
            className="tbl-btn tbl-btn-primary tbl-btn-sm"
            onClick={handleAddDefault}
            disabled={colNames.length === 0}
            title={colNames.length === 0 ? "列を先に追加してください" : undefined}
          >
            <i className="bi bi-plus-lg" /> 追加
          </button>
        </div>

        {defaults.length === 0 ? (
          <div className="td-empty">
            <i className="bi bi-database-fill-gear td-empty-icon" />
            <p>DEFAULT 値定義を追加すると <code>ALTER TABLE ... ALTER COLUMN ... SET DEFAULT</code> として DDL に出力されます。</p>
            <p className="td-empty-hint">規約参照 (<code>@conv.numbering.*</code>) を選ぶと採番規約との連携を明示できます。</p>
          </div>
        ) : (
          <div className="td-list">
            {defaults.map((def) =>
              editingDefaultCol === def.column ? (
                <DefaultEditorCard
                  key={def.column}
                  def={def}
                  colNames={colNames}
                  usedCols={new Set(defaults.map((d) => d.column).filter((c) => c !== def.column))}
                  sequences={sequences}
                  numberingKeys={numberingKeys}
                  onUpdate={(patch) => handleUpdateDefault(def.column, patch)}
                  onClose={() => setEditingDefaultCol(null)}
                  onDelete={() => handleDeleteDefault(def.column)}
                />
              ) : (
                <DefaultRow
                  key={def.column}
                  def={def}
                  onEdit={() => setEditingDefaultCol(def.column)}
                  onDelete={() => handleDeleteDefault(def.column)}
                />
              ),
            )}
          </div>
        )}
      </div>

      {/* ── トリガーセクション ─────────────────────────────────── */}
      <div className="td-section">
        <div className="td-section-header">
          <span className="td-section-title">
            <i className="bi bi-play-btn-fill" /> トリガー
          </span>
          <button className="tbl-btn tbl-btn-primary tbl-btn-sm" onClick={handleAddTrigger}>
            <i className="bi bi-plus-lg" /> 追加
          </button>
        </div>

        {triggers.length === 0 ? (
          <div className="td-empty">
            <i className="bi bi-play-btn td-empty-icon" />
            <p>トリガーを追加すると <code>CREATE TRIGGER</code> として DDL に出力されます。</p>
          </div>
        ) : (
          <div className="td-list">
            {triggers.map((trg) =>
              editingTriggerId === trg.id ? (
                <TriggerEditorCard
                  key={trg.id}
                  trg={trg}
                  onUpdate={(patch) => handleUpdateTrigger(trg.id, patch)}
                  onClose={() => setEditingTriggerId(null)}
                  onDelete={() => handleDeleteTrigger(trg.id)}
                />
              ) : (
                <TriggerRow
                  key={trg.id}
                  trg={trg}
                  onEdit={() => setEditingTriggerId(trg.id)}
                  onDelete={() => handleDeleteTrigger(trg.id)}
                />
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── DEFAULT 値 一覧行 ────────────────────────────────────────────────────────

function DefaultRow({
  def, onEdit, onDelete,
}: {
  def: DefaultDefinition;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="td-row">
      <div className="td-row-main">
        <span className={`td-kind-badge td-kind-badge--${def.kind}`}>
          {def.kind === "conventionRef" ? "規約参照" : def.kind}
        </span>
        <code className="td-row-col">{def.column}</code>
        {def.description && <span className="td-row-desc">{def.description}</span>}
      </div>
      <div className="td-row-summary">
        <code>{def.value || "(未設定)"}</code>
      </div>
      <div className="td-row-actions">
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

// ── DEFAULT 値 編集カード ─────────────────────────────────────────────────────

function DefaultEditorCard({
  def, colNames, usedCols, sequences, numberingKeys, onUpdate, onClose, onDelete,
}: {
  def: DefaultDefinition;
  colNames: string[];
  usedCols: Set<string>;
  sequences: SequenceEntry[];
  numberingKeys: string[];
  onUpdate: (patch: Partial<DefaultDefinition>) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const isConventionRef = def.kind === "conventionRef";

  return (
    <div className="td-editor-card">
      <div className="td-editor-header">
        <span className="td-editor-title">DEFAULT 値を編集</span>
        <button className="tbl-btn-icon" onClick={onClose} title="閉じる">
          <i className="bi bi-x-lg" />
        </button>
      </div>

      <div className="td-editor-body">
        <label className="td-editor-field">
          <span>対象列</span>
          <select
            value={def.column}
            onChange={(e) => onUpdate({ column: e.target.value })}
          >
            {colNames.map((n) => (
              <option key={n} value={n} disabled={usedCols.has(n)}>
                {n}{usedCols.has(n) ? " (使用中)" : ""}
              </option>
            ))}
          </select>
        </label>

        <div className="td-editor-field">
          <span>種別</span>
          <div className="td-kind-radios">
            {(["literal", "function", "sequence", "conventionRef"] as DefaultKind[]).map((k) => (
              <label key={k} className="td-kind-radio">
                <input
                  type="radio"
                  name={`default-kind-${def.column}`}
                  value={k}
                  checked={def.kind === k}
                  onChange={() => onUpdate({ kind: k, value: k === "conventionRef" ? "@conv.numbering." : "" })}
                />
                {DEFAULT_KIND_LABELS[k]}
              </label>
            ))}
          </div>
        </div>

        <label className="td-editor-field">
          <span>{isConventionRef ? "規約参照キー" : "値"}</span>
          {isConventionRef ? (
            <>
              <input
                type="text"
                list="conv-numbering-list"
                value={def.value}
                onChange={(e) => onUpdate({ value: e.target.value })}
                placeholder="@conv.numbering.orderNumber"
                className="td-value-input"
              />
              <datalist id="conv-numbering-list">
                {numberingKeys.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <span className="td-hint">
                <i className="bi bi-info-circle" /> DDL では <code>DEFAULT NULL /* @conv.numbering.xxx */</code> として出力されます。採番の実装は sequence + trigger で行います。
              </span>
            </>
          ) : (
            <>
              <input
                type="text"
                list={def.kind === "sequence" ? "td-sequence-list" : undefined}
                value={def.value}
                onChange={(e) => onUpdate({ value: e.target.value })}
                placeholder={def.kind === "literal" ? "0 または 'active'" : def.kind === "sequence" ? "seq_name" : "NOW()"}
                className="td-value-input"
              />
              {def.kind === "sequence" && (
                <datalist id="td-sequence-list">
                  {sequences
                    .filter((s) => !!s.physicalName)
                    .map((s) => (
                      <option key={s.id} value={s.physicalName as string}>{s.name}</option>
                    ))}
                </datalist>
              )}
            </>
          )}
        </label>

        <label className="td-editor-field">
          <span>説明 (任意)</span>
          <input
            type="text"
            value={def.description ?? ""}
            onChange={(e) => onUpdate({ description: e.target.value || undefined })}
            placeholder="この DEFAULT 値の目的・理由"
          />
        </label>
      </div>

      <div className="td-editor-footer">
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

// ── トリガー 一覧行 ────────────────────────────────────────────────────────────

function TriggerRow({
  trg, onEdit, onDelete,
}: {
  trg: TriggerDefinition;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="td-row">
      <div className="td-row-main">
        <span className="td-timing-badge">{trg.timing}</span>
        <span className="td-events-badge">{trg.events.join(" | ")}</span>
        <code className="td-row-col">{trg.id}</code>
        {trg.description && <span className="td-row-desc">{trg.description}</span>}
      </div>
      {trg.body && (
        <div className="td-row-summary">
          <code className="td-body-preview">{trg.body.split("\n")[0]}{trg.body.includes("\n") ? "…" : ""}</code>
        </div>
      )}
      <div className="td-row-actions">
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

// ── トリガー 編集カード ────────────────────────────────────────────────────────

function TriggerEditorCard({
  trg, onUpdate, onClose, onDelete,
}: {
  trg: TriggerDefinition;
  onUpdate: (patch: Partial<TriggerDefinition>) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const toggleEvent = (ev: TriggerEvent) => {
    const next = trg.events.includes(ev)
      ? trg.events.filter((e) => e !== ev)
      : [...trg.events, ev];
    if (next.length > 0) onUpdate({ events: next });
  };

  return (
    <div className="td-editor-card">
      <div className="td-editor-header">
        <span className="td-editor-title">トリガーを編集</span>
        <button className="tbl-btn-icon" onClick={onClose} title="閉じる">
          <i className="bi bi-x-lg" />
        </button>
      </div>

      <div className="td-editor-body">
        <label className="td-editor-field">
          <span>トリガー名</span>
          <input
            type="text"
            value={trg.id}
            onChange={(e) => onUpdate({ id: e.target.value })}
            placeholder="trg_tablename_action"
            className="td-trigger-name-input"
          />
        </label>

        <div className="td-editor-field">
          <span>タイミング</span>
          <div className="td-timing-radios">
            {TRIGGER_TIMINGS.map((t) => (
              <label key={t} className="td-timing-radio">
                <input
                  type="radio"
                  name={`timing-${trg.id}`}
                  value={t}
                  checked={trg.timing === t}
                  onChange={() => onUpdate({ timing: t })}
                />
                {t}
              </label>
            ))}
          </div>
        </div>

        <div className="td-editor-field">
          <span>イベント (複数選択可)</span>
          <div className="td-events-checks">
            {TRIGGER_EVENTS.map((ev) => (
              <label key={ev} className="column-flag-label">
                <input
                  type="checkbox"
                  checked={trg.events.includes(ev)}
                  onChange={() => toggleEvent(ev)}
                />
                {ev}
              </label>
            ))}
          </div>
        </div>

        <label className="td-editor-field">
          <span>WHEN 句 (省略可)</span>
          <input
            type="text"
            value={trg.whenCondition ?? ""}
            onChange={(e) => onUpdate({ whenCondition: e.target.value || undefined })}
            placeholder="NEW.status = 'active'"
            className="td-value-input"
          />
        </label>

        <label className="td-editor-field">
          <span>本体 (SQL / PL/pgSQL)</span>
          <textarea
            className="td-body-textarea"
            value={trg.body}
            onChange={(e) => onUpdate({ body: e.target.value })}
            placeholder={"NEW.po_number := 'ORD-' || TO_CHAR(NOW(), 'YYYY') || '-' ||\n  LPAD(nextval('po_number_seq')::text, 4, '0');"}
            rows={6}
          />
        </label>

        <label className="td-editor-field">
          <span>説明 (任意)</span>
          <input
            type="text"
            value={trg.description ?? ""}
            onChange={(e) => onUpdate({ description: e.target.value || undefined })}
            placeholder="このトリガーの目的・処理内容"
          />
        </label>
      </div>

      <div className="td-editor-footer">
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
