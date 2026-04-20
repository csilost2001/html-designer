/**
 * ActionGroup.externalSystemCatalog 編集パネル (#278)
 */
import { useState } from "react";
import type { ActionGroup, ExternalSystemCatalogEntry, ExternalAuthKind } from "../../types/action";

interface Props {
  group: ActionGroup;
  onChange: (group: ActionGroup) => void;
}

const AUTH_KINDS: ExternalAuthKind[] = ["bearer", "basic", "apiKey", "oauth2", "none"];

export function ExternalSystemCatalogPanel({ group, onChange }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [newKey, setNewKey] = useState("");
  const catalog = group.externalSystemCatalog ?? {};
  const keys = Object.keys(catalog);

  // secretsCatalog のキー一覧 (tokenRef ドロップダウン用)
  const secretKeys = Object.keys(group.secretsCatalog ?? {});

  const updateEntry = (key: string, patch: Partial<ExternalSystemCatalogEntry>) => {
    const next = { ...catalog, [key]: { ...catalog[key], ...patch } };
    onChange({ ...group, externalSystemCatalog: next });
  };

  const removeEntry = (key: string) => {
    const next = { ...catalog };
    delete next[key];
    onChange({ ...group, externalSystemCatalog: Object.keys(next).length > 0 ? next : undefined });
  };

  const addEntry = () => {
    const key = newKey.trim();
    if (!key || catalog[key]) return;
    onChange({ ...group, externalSystemCatalog: { ...catalog, [key]: { name: key } } });
    setNewKey("");
  };

  return (
    <div className="catalog-panel external-system-catalog-panel">
      <button
        type="button"
        className="catalog-panel-toggle"
        onClick={() => setExpanded((v) => !v)}
      >
        <i className={`bi bi-chevron-${expanded ? "down" : "right"}`} />
        <i className="bi bi-cloud" />
        {" "}外部システム (externalSystemCatalog: {keys.length} 件)
      </button>
      {expanded && (
        <div className="catalog-panel-body">
          <div className="catalog-help">
            同じ外部システム (Stripe 等) を複数 step で使う場合の共通設定。
            ExternalSystemStep.systemRef から参照。
          </div>
          {keys.length === 0 && <div className="catalog-empty">まだエントリがありません。</div>}
          {keys.map((k) => {
            const e = catalog[k];
            const auth = e.auth ?? { kind: "none" as ExternalAuthKind };
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
                  <label className="catalog-wide">
                    name
                    <input
                      className="form-control form-control-sm"
                      value={e.name}
                      onChange={(ev) => updateEntry(k, { name: ev.target.value })}
                      placeholder="Stripe Japan"
                    />
                  </label>
                  <label className="catalog-wide">
                    baseUrl
                    <input
                      className="form-control form-control-sm"
                      value={e.baseUrl ?? ""}
                      onChange={(ev) => updateEntry(k, { baseUrl: ev.target.value || undefined })}
                      placeholder="https://api.stripe.com"
                    />
                  </label>
                  <label>
                    auth.kind
                    <select
                      className="form-select form-select-sm"
                      value={auth.kind}
                      onChange={(ev) => updateEntry(k, { auth: { ...auth, kind: ev.target.value as ExternalAuthKind } })}
                    >
                      {AUTH_KINDS.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </label>
                  <label>
                    auth.tokenRef
                    {secretKeys.length > 0 ? (
                      <select
                        className="form-select form-select-sm"
                        value={auth.tokenRef ?? ""}
                        onChange={(ev) => updateEntry(k, { auth: { ...auth, tokenRef: ev.target.value || undefined } })}
                      >
                        <option value="">—</option>
                        {secretKeys.map((s) => <option key={s} value={`@secret.${s}`}>@secret.{s}</option>)}
                      </select>
                    ) : (
                      <input
                        className="form-control form-control-sm"
                        value={auth.tokenRef ?? ""}
                        onChange={(ev) => updateEntry(k, { auth: { ...auth, tokenRef: ev.target.value || undefined } })}
                        placeholder="ENV:STRIPE_SECRET_KEY or @secret.X"
                      />
                    )}
                  </label>
                  <label>
                    timeoutMs
                    <input
                      type="number"
                      className="form-control form-control-sm"
                      value={e.timeoutMs ?? ""}
                      min={0}
                      onChange={(ev) => updateEntry(k, { timeoutMs: ev.target.value === "" ? undefined : Number(ev.target.value) })}
                    />
                  </label>
                  <label>
                    retry.maxAttempts
                    <input
                      type="number"
                      className="form-control form-control-sm"
                      value={e.retryPolicy?.maxAttempts ?? ""}
                      min={1}
                      onChange={(ev) => {
                        const n = ev.target.value === "" ? undefined : Number(ev.target.value);
                        if (n === undefined) {
                          updateEntry(k, { retryPolicy: undefined });
                        } else {
                          updateEntry(k, { retryPolicy: { ...(e.retryPolicy ?? { maxAttempts: 1 }), maxAttempts: n } });
                        }
                      }}
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
              placeholder="新規 system id (例: stripe)"
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
