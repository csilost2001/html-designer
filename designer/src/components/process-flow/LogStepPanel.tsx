import type { LogStep } from "../../types/action";
import type { ConventionsCatalog } from "../../schemas/conventionsValidator";
import { ConvCompletionInput } from "../common/ConvCompletionInput";

interface Props {
  step: LogStep;
  onChange: (patch: Partial<LogStep>) => void;
  onCommit?: () => void;
  conventions?: ConventionsCatalog | null;
}

const LOG_LEVELS: Array<{ value: LogStep["level"]; label: string }> = [
  { value: "trace", label: "trace (詳細追跡)" },
  { value: "debug", label: "debug (デバッグ)" },
  { value: "info", label: "info (情報)" },
  { value: "warn", label: "warn (警告)" },
  { value: "error", label: "error (エラー)" },
];

export function LogStepPanel({ step, onChange, onCommit, conventions }: Props) {
  const entries = Object.entries(step.structuredData ?? {});

  const updateEntry = (idx: number, key: string, value: string) => {
    const next = entries.slice();
    next[idx] = [key, value];
    const map: Record<string, string> = {};
    for (const [k, v] of next) {
      if (k.trim()) map[k.trim()] = v;
    }
    onChange({ structuredData: Object.keys(map).length > 0 ? map : undefined });
  };

  const removeEntry = (idx: number) => {
    const next = entries.filter((_, i) => i !== idx);
    const map: Record<string, string> = {};
    for (const [k, v] of next) {
      if (k.trim()) map[k.trim()] = v;
    }
    onChange({ structuredData: Object.keys(map).length > 0 ? map : undefined });
    onCommit?.();
  };

  const addEntry = () => {
    const map: Record<string, string> = { ...(step.structuredData ?? {}) };
    let key = "key";
    let i = 1;
    while (key in map) key = `key${++i}`;
    map[key] = "";
    onChange({ structuredData: map });
  };

  return (
    <>
      <div className="row g-2 mb-2">
        <div className="col-4" data-field-path="level">
          <label className="form-label">
            <i className="bi bi-bar-chart-steps me-1" />
            ログレベル (level)
          </label>
          <select
            className="form-select form-select-sm"
            value={step.level}
            onChange={(e) => {
              onChange({ level: e.target.value as LogStep["level"] });
              onCommit?.();
            }}
          >
            {LOG_LEVELS.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </div>
        <div className="col-8" data-field-path="category">
          <label className="form-label">
            <i className="bi bi-tag me-1" />
            カテゴリ (category、任意)
          </label>
          <input
            type="text"
            className="form-control form-control-sm"
            value={step.category ?? ""}
            onChange={(e) => onChange({ category: e.target.value || undefined })}
            onBlur={onCommit}
            placeholder="例: order.lifecycle / payment.audit"
          />
        </div>
      </div>

      <div className="row g-2 mb-2" data-field-path="message">
        <div className="col-12">
          <label className="form-label">
            <i className="bi bi-chat-left-text me-1" />
            メッセージ (message)
          </label>
          <ConvCompletionInput
            className="form-control form-control-sm"
            value={step.message}
            onValueChange={(v) => onChange({ message: v })}
            onCommit={onCommit}
            conventions={conventions ?? null}
            placeholder={"例: 注文 @orderId 受付完了 (顧客 @customerId)"}
            style={{ fontFamily: "monospace" }}
          />
        </div>
      </div>

      <div className="row g-2 mb-2" data-field-path="structuredData">
        <div className="col-12">
          <div className="d-flex align-items-center gap-2 mb-1">
            <label className="form-label small mb-0">
              <i className="bi bi-list-columns me-1" />
              構造化データ (structuredData、key=式、任意)
            </label>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary py-0"
              onClick={addEntry}
              style={{ fontSize: "0.75rem" }}
            >
              <i className="bi bi-plus-lg" /> 項目を追加
            </button>
          </div>
          {entries.length === 0 && (
            <div className="text-muted" style={{ fontSize: "0.78rem" }}>
              ログ集計・検索しやすいよう構造化値を残す場合に追加 (例: orderId / amount)
            </div>
          )}
          {entries.map(([k, v], i) => (
            <div key={i} className="d-flex align-items-center gap-1 mb-1">
              <input
                type="text"
                className="form-control form-control-sm"
                value={k}
                onChange={(e) => updateEntry(i, e.target.value, v)}
                onBlur={onCommit}
                placeholder="key"
                style={{ width: 160, fontFamily: "monospace", fontSize: "0.8rem" }}
              />
              <span className="text-muted">=</span>
              <ConvCompletionInput
                className="form-control form-control-sm"
                value={v}
                onValueChange={(nv) => updateEntry(i, k, nv)}
                onCommit={onCommit}
                conventions={conventions ?? null}
                placeholder="例: @orderId / @subtotal + @tax"
                style={{ fontFamily: "monospace", fontSize: "0.8rem", flex: 1 }}
              />
              <button
                type="button"
                className="btn btn-sm btn-link text-danger p-0"
                onClick={() => removeEntry(i)}
                title="項目を削除"
              >
                <i className="bi bi-x" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
