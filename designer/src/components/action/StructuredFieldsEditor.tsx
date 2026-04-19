import { useState } from "react";
import type { ActionFields, FieldType, StructuredField } from "../../types/action";
import { fieldsToText, isStructuredFields, textToStructuredFields } from "../../utils/actionFields";

interface Props {
  label: string;
  fields: ActionFields | undefined;
  onChange: (fields: ActionFields | undefined) => void;
  onCommit?: () => void;
  placeholder?: string;
}

const PRIMITIVE_TYPES: Array<"string" | "number" | "boolean" | "date"> = ["string", "number", "boolean", "date"];

/**
 * ActionDefinition.inputs / outputs の編集 UI (#226)。
 * 自由記述モード (textarea) と表形式モード (StructuredField[]) を切替可能。
 * 表形式では name / type / required / description を編集。
 * FieldType は primitive + custom のみ対応、tableRow/tableList/screenInput は将来。
 */
export function StructuredFieldsEditor({ label, fields, onChange, onCommit, placeholder }: Props) {
  const isStructured = isStructuredFields(fields);
  const [mode, setMode] = useState<"text" | "table">(isStructured ? "table" : "text");

  const switchToTable = () => {
    if (!isStructured) {
      const text = typeof fields === "string" ? fields : "";
      onChange(textToStructuredFields(text));
    }
    setMode("table");
  };

  const switchToText = () => {
    if (isStructured) {
      onChange(fieldsToText(fields));
    }
    setMode("text");
  };

  const addField = () => {
    const curr = isStructured ? fields : [];
    const newField: StructuredField = { name: "", type: "string" };
    onChange([...curr, newField]);
  };

  const updateField = (idx: number, patch: Partial<StructuredField>) => {
    if (!isStructured) return;
    const next = fields.map((f, i) => (i === idx ? { ...f, ...patch } : f));
    onChange(next);
  };

  const removeField = (idx: number) => {
    if (!isStructured) return;
    const next = fields.filter((_, i) => i !== idx);
    onChange(next.length > 0 ? next : undefined);
  };

  return (
    <div className="structured-fields-editor">
      <div className="d-flex align-items-center gap-2 mb-1">
        <label className="form-label mb-0">{label}</label>
        <div className="btn-group btn-group-sm" role="group" aria-label="表示モード">
          <button
            type="button"
            className={`btn btn-outline-secondary${mode === "text" ? " active" : ""}`}
            onClick={switchToText}
            style={{ fontSize: "0.7rem", padding: "0 6px" }}
            title="自由記述モード (改行区切り)"
          >
            <i className="bi bi-text-paragraph" />
          </button>
          <button
            type="button"
            className={`btn btn-outline-secondary${mode === "table" ? " active" : ""}`}
            onClick={switchToTable}
            style={{ fontSize: "0.7rem", padding: "0 6px" }}
            title="表形式モード (構造化)"
          >
            <i className="bi bi-table" />
          </button>
        </div>
      </div>

      {mode === "text" ? (
        <textarea
          className="form-control form-control-sm"
          rows={2}
          value={fieldsToText(fields)}
          onChange={(e) => onChange(e.target.value || undefined)}
          onBlur={() => onCommit?.()}
          placeholder={placeholder}
        />
      ) : (
        <div style={{ fontSize: "0.8rem" }}>
          {isStructured && fields.length === 0 && (
            <div className="text-muted small mb-1">フィールドなし</div>
          )}
          {isStructured && fields.map((f, i) => (
            <div key={i} className="row g-1 mb-1 align-items-center">
              <div className="col-3">
                <input
                  type="text"
                  className="form-control form-control-sm"
                  value={f.name}
                  onChange={(e) => updateField(i, { name: e.target.value })}
                  onBlur={() => onCommit?.()}
                  placeholder="name"
                  style={{ fontSize: "0.8rem" }}
                />
              </div>
              <div className="col-2">
                <input
                  type="text"
                  className="form-control form-control-sm"
                  value={f.label ?? ""}
                  onChange={(e) => updateField(i, { label: e.target.value || undefined })}
                  onBlur={() => onCommit?.()}
                  placeholder="label"
                  style={{ fontSize: "0.8rem" }}
                />
              </div>
              <div className="col-2">
                <select
                  className="form-select form-select-sm"
                  value={typeof f.type === "string" ? f.type : "custom"}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (PRIMITIVE_TYPES.includes(v as "string" | "number" | "boolean" | "date")) {
                      updateField(i, { type: v as FieldType });
                    } else {
                      updateField(i, { type: { kind: "custom", label: "" } });
                    }
                  }}
                  style={{ fontSize: "0.8rem" }}
                >
                  {PRIMITIVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  <option value="custom">custom</option>
                </select>
              </div>
              <div className="col-auto" style={{ width: 70 }}>
                <label className="form-check-label small">
                  <input
                    type="checkbox"
                    className="form-check-input me-1"
                    checked={!!f.required}
                    onChange={(e) => updateField(i, { required: e.target.checked || undefined })}
                  />
                  必須
                </label>
              </div>
              <div className="col">
                <input
                  type="text"
                  className="form-control form-control-sm"
                  value={f.description ?? ""}
                  onChange={(e) => updateField(i, { description: e.target.value || undefined })}
                  onBlur={() => onCommit?.()}
                  placeholder="description"
                  style={{ fontSize: "0.8rem" }}
                />
              </div>
              <div className="col-auto">
                <button
                  type="button"
                  className="btn btn-sm btn-link text-danger p-0"
                  onClick={() => removeField(i)}
                  title="削除"
                >
                  <i className="bi bi-x" />
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary py-0"
            onClick={() => { addField(); onCommit?.(); }}
            style={{ fontSize: "0.75rem" }}
          >
            <i className="bi bi-plus-lg" /> フィールド追加
          </button>
        </div>
      )}
    </div>
  );
}
