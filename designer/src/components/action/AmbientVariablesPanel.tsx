/**
 * ActionGroup.ambientVariables 編集パネル (#278)
 *
 * middleware 由来の自動注入変数 (@requestId, @traceId, @fieldErrors 等) を
 * StructuredField[] として宣言する UI。
 */
import { useState } from "react";
import type { ActionGroup, StructuredField, FieldType } from "../../types/action";

interface Props {
  group: ActionGroup;
  onChange: (group: ActionGroup) => void;
}

const PRIMITIVE_TYPES: Array<FieldType & string> = ["string", "number", "boolean", "date"];

export function AmbientVariablesPanel({ group, onChange }: Props) {
  const [expanded, setExpanded] = useState(false);
  const vars = group.ambientVariables ?? [];

  const update = (idx: number, patch: Partial<StructuredField>) => {
    const next = vars.map((v, i) => (i === idx ? { ...v, ...patch } : v));
    onChange({ ...group, ambientVariables: next });
  };

  const add = () => {
    const next: StructuredField[] = [...vars, { name: "", type: "string" }];
    onChange({ ...group, ambientVariables: next });
  };

  const remove = (idx: number) => {
    const next = vars.filter((_, i) => i !== idx);
    onChange({ ...group, ambientVariables: next.length > 0 ? next : undefined });
  };

  return (
    <div className="catalog-panel ambient-variables-panel">
      <button
        type="button"
        className="catalog-panel-toggle"
        onClick={() => setExpanded((v) => !v)}
      >
        <i className={`bi bi-chevron-${expanded ? "down" : "right"}`} />
        <i className="bi bi-box-arrow-in-down-left" />
        {" "}Ambient 変数 (ambientVariables: {vars.length} 件)
      </button>
      {expanded && (
        <div className="catalog-panel-body">
          <div className="catalog-help">
            ミドルウェア / フレームワーク由来の自動注入変数を宣言。@requestId / @traceId /
            @fieldErrors 等、inputs にも outputBinding にも無い @ 参照を valid 化。
          </div>
          {vars.length === 0 && <div className="catalog-empty">まだエントリがありません。</div>}
          {vars.map((v, i) => {
            const isPrimitive = typeof v.type === "string";
            return (
              <div className="catalog-row" key={i}>
                <div className="catalog-row-header">
                  <span className="catalog-key-badge">{v.name || "(名前未設定)"}</span>
                  <label className="ms-auto me-2 small d-flex align-items-center gap-1">
                    <input
                      type="checkbox"
                      checked={!!v.required}
                      onChange={(ev) => update(i, { required: ev.target.checked || undefined })}
                    />
                    必須
                  </label>
                  <button
                    type="button"
                    className="btn btn-sm btn-link text-danger"
                    onClick={() => remove(i)}
                    title="削除"
                  >
                    <i className="bi bi-trash" />
                  </button>
                </div>
                <div className="catalog-row-fields">
                  <label>
                    name
                    <input
                      className="form-control form-control-sm"
                      value={v.name}
                      onChange={(ev) => update(i, { name: ev.target.value })}
                    />
                  </label>
                  <label>
                    type
                    <select
                      className="form-select form-select-sm"
                      value={isPrimitive ? (v.type as string) : "custom"}
                      onChange={(ev) => {
                        const t = ev.target.value;
                        if (PRIMITIVE_TYPES.includes(t as never)) {
                          update(i, { type: t as FieldType });
                        } else {
                          update(i, { type: { kind: "custom", label: "" } });
                        }
                      }}
                    >
                      {PRIMITIVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      <option value="custom">custom (label 指定)</option>
                    </select>
                  </label>
                  {!isPrimitive && typeof v.type === "object" && v.type.kind === "custom" && (
                    <label className="catalog-wide">
                      custom label
                      <input
                        className="form-control form-control-sm"
                        value={v.type.label}
                        onChange={(ev) => update(i, { type: { kind: "custom", label: ev.target.value } })}
                      />
                    </label>
                  )}
                  <label className="catalog-wide">
                    description
                    <input
                      className="form-control form-control-sm"
                      value={v.description ?? ""}
                      onChange={(ev) => update(i, { description: ev.target.value || undefined })}
                      placeholder="例: X-Request-Id 注入"
                    />
                  </label>
                </div>
              </div>
            );
          })}
          <div className="catalog-row catalog-row-add">
            <button type="button" className="btn btn-sm btn-outline-primary" onClick={add}>
              <i className="bi bi-plus-lg" /> 追加
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
