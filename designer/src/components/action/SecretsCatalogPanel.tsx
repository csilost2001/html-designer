/**
 * ActionGroup.secretsCatalog 編集パネル (#278)
 */
import { useState } from "react";
import type { ActionGroup, SecretRef } from "../../types/action";

interface Props {
  group: ActionGroup;
  onChange: (group: ActionGroup) => void;
}

export function SecretsCatalogPanel({ group, onChange }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [newKey, setNewKey] = useState("");
  const catalog = group.secretsCatalog ?? {};
  const keys = Object.keys(catalog);

  const updateEntry = (key: string, patch: Partial<SecretRef>) => {
    const next = { ...catalog, [key]: { ...catalog[key], ...patch } };
    onChange({ ...group, secretsCatalog: next });
  };

  const removeEntry = (key: string) => {
    const next = { ...catalog };
    delete next[key];
    onChange({ ...group, secretsCatalog: Object.keys(next).length > 0 ? next : undefined });
  };

  const addEntry = () => {
    const key = newKey.trim();
    if (!key || catalog[key]) return;
    onChange({ ...group, secretsCatalog: { ...catalog, [key]: { source: "env", name: "" } } });
    setNewKey("");
  };

  return (
    <div className="catalog-panel secrets-catalog-panel">
      <button
        type="button"
        className="catalog-panel-toggle"
        onClick={() => setExpanded((v) => !v)}
      >
        <i className={`bi bi-chevron-${expanded ? "down" : "right"}`} />
        <i className="bi bi-key" />
        {" "}Secrets (secretsCatalog: {keys.length} 件)
      </button>
      {expanded && (
        <div className="catalog-panel-body">
          <div className="catalog-help">
            秘匿値のメタデータのみ管理。値そのものは含まない。
            ExternalAuth.tokenRef から @secret.&lt;key&gt; で参照。
          </div>
          {keys.length === 0 && <div className="catalog-empty">まだエントリがありません。</div>}
          {keys.map((k) => {
            const e = catalog[k];
            return (
              <div className="catalog-row" key={k}>
                <div className="catalog-row-header">
                  <span className="catalog-key-badge">{k}</span>
                  <button
                    type="button"
                    className="btn btn-sm btn-link text-danger ms-auto"
                    onClick={() => removeEntry(k)}
                    title="削除"
                  >
                    <i className="bi bi-trash" />
                  </button>
                </div>
                <div className="catalog-row-fields">
                  <label>
                    source
                    <select
                      className="form-select form-select-sm"
                      value={e.source}
                      onChange={(ev) => updateEntry(k, { source: ev.target.value as SecretRef["source"] })}
                    >
                      <option value="env">env (環境変数)</option>
                      <option value="vault">vault (secret store)</option>
                      <option value="file">file (ファイル、開発用)</option>
                    </select>
                  </label>
                  <label>
                    name / path
                    <input
                      className="form-control form-control-sm"
                      value={e.name}
                      onChange={(ev) => updateEntry(k, { name: ev.target.value })}
                      placeholder={e.source === "env" ? "STRIPE_SECRET_KEY" : e.source === "vault" ? "secret/stripe/api-key" : "/etc/secrets/dev.pem"}
                    />
                  </label>
                  <label>
                    rotationDays
                    <input
                      type="number"
                      className="form-control form-control-sm"
                      value={e.rotationDays ?? ""}
                      min={1}
                      onChange={(ev) => updateEntry(k, { rotationDays: ev.target.value === "" ? undefined : Number(ev.target.value) })}
                    />
                  </label>
                  <label>
                    lastRotatedAt
                    <input
                      type="datetime-local"
                      className="form-control form-control-sm"
                      value={e.lastRotatedAt ? e.lastRotatedAt.slice(0, 16) : ""}
                      onChange={(ev) => updateEntry(k, { lastRotatedAt: ev.target.value ? new Date(ev.target.value).toISOString() : undefined })}
                    />
                  </label>
                  <label className="catalog-wide">
                    description
                    <input
                      className="form-control form-control-sm"
                      value={e.description ?? ""}
                      onChange={(ev) => updateEntry(k, { description: ev.target.value || undefined })}
                    />
                  </label>
                </div>
              </div>
            );
          })}
          <div className="catalog-row catalog-row-add">
            <input
              className="form-control form-control-sm catalog-new-key"
              placeholder="新規 secret id (例: stripeApiKey)"
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
