/**
 * ProcessFlow.typeCatalog 編集パネル (#278)
 *
 * JSON Schema は複雑なので、エントリごとに description + schema (JSON textarea)
 * での編集に留める。JSON パースエラーはローカル state で表示、parseable なら onChange。
 */
import { useState, useEffect } from "react";
import type { ProcessFlow } from "../../types/action";

interface TypeCatalogEntry {
  description?: string;
  schema: Record<string, unknown>;
}

interface Props {
  group: ProcessFlow;
  onChange: (group: ProcessFlow) => void;
  expanded?: boolean;
  onExpandedChange?: (next: boolean) => void;
  render?: "full" | "toggleOnly" | "bodyOnly";
}

interface EntryEditorProps {
  entryKey: string;
  entry: TypeCatalogEntry;
  onChange: (patch: Partial<TypeCatalogEntry>) => void;
  onRemove: () => void;
}

function EntryEditor({ entryKey, entry, onChange, onRemove }: EntryEditorProps) {
  const [jsonText, setJsonText] = useState(() => JSON.stringify(entry.schema, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  // entry.schema が外部から変わったら textarea を同期 (props drift 対策)
  useEffect(() => {
    setJsonText(JSON.stringify(entry.schema, null, 2));
  }, [entry.schema]);

  const commitJson = (text: string) => {
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        setJsonError("schema は object である必要があります");
        return;
      }
      setJsonError(null);
      onChange({ schema: parsed as Record<string, unknown> });
    } catch (e) {
      setJsonError(`JSON パース失敗: ${(e as Error).message}`);
    }
  };

  return (
    <div className="catalog-row">
      <div className="catalog-row-header">
        <span className="catalog-key-badge">{entryKey}</span>
        <button type="button" className="btn btn-sm btn-link text-danger ms-auto" onClick={onRemove} title="削除">
          <i className="bi bi-trash" />
        </button>
      </div>
      <div className="catalog-row-fields">
        <label className="catalog-wide">
          description
          <input
            className="form-control form-control-sm"
            value={entry.description ?? ""}
            onChange={(ev) => onChange({ description: ev.target.value || undefined })}
          />
        </label>
        <label className="catalog-wide">
          schema (JSON Schema draft 2020-12)
          <textarea
            className="form-control form-control-sm type-catalog-schema"
            value={jsonText}
            rows={6}
            onChange={(ev) => { setJsonText(ev.target.value); commitJson(ev.target.value); }}
            spellCheck={false}
          />
          {jsonError && <span className="text-danger small">{jsonError}</span>}
        </label>
      </div>
    </div>
  );
}

export function TypeCatalogPanel({ group, onChange, expanded: expandedProp, onExpandedChange, render = "full" }: Props) {
  const [expandedState, setExpandedState] = useState(false);
  const isControlled = expandedProp !== undefined;
  const expanded = isControlled ? expandedProp : expandedState;
  const setExpanded = (next: boolean) => {
    if (!isControlled) setExpandedState(next);
    onExpandedChange?.(next);
  };
  const [newKey, setNewKey] = useState("");
  const catalog = (group.typeCatalog ?? {}) as Record<string, TypeCatalogEntry>;
  const keys = Object.keys(catalog);

  const updateEntry = (key: string, patch: Partial<TypeCatalogEntry>) => {
    const next = { ...catalog, [key]: { ...catalog[key], ...patch } };
    onChange({ ...group, typeCatalog: next });
  };

  const removeEntry = (key: string) => {
    const next = { ...catalog };
    delete next[key];
    onChange({ ...group, typeCatalog: Object.keys(next).length > 0 ? next : undefined });
  };

  const addEntry = () => {
    const key = newKey.trim();
    if (!key || catalog[key]) return;
    onChange({
      ...group,
      typeCatalog: { ...catalog, [key]: { schema: { type: "object", properties: {} } } },
    });
    setNewKey("");
  };

  const showToggle = render !== "bodyOnly";
  const showBody = render === "bodyOnly" || (render !== "toggleOnly" && expanded);
  return (
    <div className="catalog-panel type-catalog-panel">
      {showToggle && (
        <button
          type="button"
          className="catalog-panel-toggle"
          onClick={() => setExpanded(!expanded)}
        >
          <i className={`bi bi-chevron-${expanded ? "down" : "right"}`} />
          <i className="bi bi-braces" />
          {" "}型カタログ (typeCatalog: {keys.length} 件)
        </button>
      )}
      {showBody && (
        <div className="catalog-panel-body">
          <div className="catalog-help">
            HttpResponseSpec.bodySchema = {"{"} typeRef: &lt;key&gt; {"}"} の解決先。
            JSON Schema draft 2020-12 で記述。
          </div>
          {keys.length === 0 && <div className="catalog-empty">まだエントリがありません。</div>}
          {keys.map((k) => (
            <EntryEditor
              key={k}
              entryKey={k}
              entry={catalog[k]}
              onChange={(p) => updateEntry(k, p)}
              onRemove={() => removeEntry(k)}
            />
          ))}
          <div className="catalog-row catalog-row-add">
            <input
              className="form-control form-control-sm catalog-new-key"
              placeholder="新規 type 名 (例: ApiError)"
              value={newKey}
              onChange={(ev) => setNewKey(ev.target.value)}
              onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); addEntry(); } }}
            />
            <button
              type="button"
              className="btn btn-sm btn-outline-primary"
              onClick={addEntry}
              disabled={!newKey.trim() || Object.hasOwn(catalog, newKey.trim())}
            >
              <i className="bi bi-plus-lg" /> 追加
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
