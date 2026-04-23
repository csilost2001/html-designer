/**
 * 規約カタログ編集ビュー (#317, #347)
 *
 * 横断規約の機械可読カタログ (`data/conventions/catalog.json`) を designer 内で編集する
 * シングルトンタブ。カテゴリは 11 種、2 グループで表示:
 *   - 入力バリデーション: msg / regex / limit
 *   - プロダクト規約: scope / currency / tax / auth / db / numbering / tx / externalOutcomeDefaults
 */
import { useCallback, useState } from "react";
import { TableSubToolbar } from "../table/TableSubToolbar";
import { EditorHeader } from "../common/EditorHeader";
import { ServerChangeBanner } from "../common/ServerChangeBanner";
import { useResourceEditor } from "../../hooks/useResourceEditor";
import {
  loadConventions,
  saveConventions,
  createEmptyCatalog,
} from "../../store/conventionsStore";
import type { ConventionsCatalog } from "../../schemas/conventionsValidator";
import type {
  ScopeEntry,
  CurrencyEntry,
  TaxEntry,
  AuthEntry,
  DbEntry,
  NumberingEntry,
  TxEntry,
  ExternalOutcomeDefaultEntry,
} from "../../types/conventions";
import "../../styles/conventions.css";

type Category =
  | "msg" | "regex" | "limit"
  | "scope" | "currency" | "tax" | "auth"
  | "db" | "numbering" | "tx" | "externalOutcomeDefaults";

const VALIDATION_CATEGORIES: Category[] = ["msg", "regex", "limit"];
const PRODUCT_CATEGORIES: Category[] = [
  "scope", "currency", "tax", "auth", "db", "numbering", "tx", "externalOutcomeDefaults",
];

const CATEGORY_LABELS: Record<Category, string> = {
  msg: "メッセージ",
  regex: "正規表現",
  limit: "制限値",
  scope: "スコープ",
  currency: "通貨",
  tax: "税",
  auth: "認証",
  db: "DB",
  numbering: "採番",
  tx: "TX",
  externalOutcomeDefaults: "外部連携既定",
};

const CATEGORY_ICONS: Record<Category, string> = {
  msg: "bi-chat-left-text",
  regex: "bi-regex",
  limit: "bi-rulers",
  scope: "bi-globe",
  currency: "bi-currency-yen",
  tax: "bi-calculator",
  auth: "bi-lock",
  db: "bi-database",
  numbering: "bi-hash",
  tx: "bi-arrow-repeat",
  externalOutcomeDefaults: "bi-broadcast",
};

const RESOURCE_ID = "main";

async function loadCatalog(_id: string): Promise<ConventionsCatalog> {
  const cat = await loadConventions();
  return cat ?? createEmptyCatalog();
}

async function saveCatalog(data: ConventionsCatalog): Promise<void> {
  await saveConventions(data);
}

function countCategoryEntries(catalog: ConventionsCatalog, cat: Category): number {
  const v = catalog[cat as keyof ConventionsCatalog];
  return v ? Object.keys(v as object).length : 0;
}

export function ConventionsCatalogView() {
  const [activeCategory, setActiveCategory] = useState<Category>("msg");

  const {
    state: catalog,
    isDirty, isSaving, serverChanged,
    update, updateSilent, commit,
    undo, redo, canUndo, canRedo,
    handleSave, handleReset, dismissServerBanner,
  } = useResourceEditor<ConventionsCatalog>({
    tabType: "conventions-catalog",
    mtimeKind: "conventions",
    draftKind: "conventions-catalog",
    id: RESOURCE_ID,
    load: loadCatalog,
    save: saveCatalog,
    broadcastName: "conventionsChanged",
  });

  const addMsg = useCallback((key: string) => {
    update((c) => { if (!c.msg) c.msg = {}; if (!c.msg[key]) c.msg[key] = { template: "" }; });
  }, [update]);

  const addRegex = useCallback((key: string) => {
    update((c) => { if (!c.regex) c.regex = {}; if (!c.regex[key]) c.regex[key] = { pattern: "" }; });
  }, [update]);

  const addLimit = useCallback((key: string) => {
    update((c) => { if (!c.limit) c.limit = {}; if (!c.limit[key]) c.limit[key] = { value: 0 }; });
  }, [update]);

  const addScope = useCallback((key: string) => {
    update((c) => { if (!c.scope) c.scope = {}; if (!c.scope[key]) c.scope[key] = { value: "" }; });
  }, [update]);

  const addCurrency = useCallback((key: string) => {
    update((c) => { if (!c.currency) c.currency = {}; if (!c.currency[key]) c.currency[key] = { code: "" }; });
  }, [update]);

  const addTax = useCallback((key: string) => {
    update((c) => { if (!c.tax) c.tax = {}; if (!c.tax[key]) c.tax[key] = { kind: "exclusive", rate: 0 }; });
  }, [update]);

  const addAuth = useCallback((key: string) => {
    update((c) => { if (!c.auth) c.auth = {}; if (!c.auth[key]) c.auth[key] = { scheme: "" }; });
  }, [update]);

  const addDb = useCallback((key: string) => {
    update((c) => { if (!c.db) c.db = {}; if (!c.db[key]) c.db[key] = {}; });
  }, [update]);

  const addNumbering = useCallback((key: string) => {
    update((c) => { if (!c.numbering) c.numbering = {}; if (!c.numbering[key]) c.numbering[key] = { format: "" }; });
  }, [update]);

  const addTx = useCallback((key: string) => {
    update((c) => { if (!c.tx) c.tx = {}; if (!c.tx[key]) c.tx[key] = { policy: "" }; });
  }, [update]);

  const addExternalOutcomeDefault = useCallback((key: string) => {
    update((c) => {
      if (!c.externalOutcomeDefaults) c.externalOutcomeDefaults = {};
      if (!c.externalOutcomeDefaults[key]) c.externalOutcomeDefaults[key] = { outcome: "failure", action: "abort" };
    });
  }, [update]);

  if (!catalog) return null;

  const renderTabGroup = (label: string, categories: Category[]) => (
    <div className="conventions-tab-group">
      <span className="conventions-tab-group-label">{label}</span>
      <div className="conventions-category-tabs" role="tablist">
        {categories.map((cat) => {
          const count = countCategoryEntries(catalog, cat);
          return (
            <button
              key={cat}
              type="button"
              className={`conventions-category-tab ${activeCategory === cat ? "active" : ""}`}
              onClick={() => setActiveCategory(cat)}
              role="tab"
              aria-selected={activeCategory === cat}
            >
              <i className={`bi ${CATEGORY_ICONS[cat]}`} /> {CATEGORY_LABELS[cat]}
              {count > 0 && <span className="conventions-category-count">{count}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="conventions-catalog-view">
      <TableSubToolbar />

      {serverChanged && (
        <ServerChangeBanner onReload={handleReset} onDismiss={dismissServerBanner} />
      )}

      <EditorHeader
        title={<span className="fw-semibold">規約カタログ</span>}
        undoRedo={{ onUndo: undo, onRedo: redo, canUndo, canRedo }}
        saveReset={{ isDirty, isSaving, onSave: handleSave, onReset: handleReset }}
      />

      <div className="conventions-meta-bar">
        <label className="small text-muted">version</label>
        <input
          type="text"
          className="form-control form-control-sm conventions-version-input"
          value={catalog.version ?? ""}
          onChange={(e) => updateSilent((c) => { c.version = e.target.value; })}
          onBlur={commit}
          placeholder="1.0.0"
        />
        <label className="small text-muted">description</label>
        <input
          type="text"
          className="form-control form-control-sm conventions-description-input"
          value={catalog.description ?? ""}
          onChange={(e) => updateSilent((c) => { c.description = e.target.value || undefined; })}
          onBlur={commit}
          placeholder="カタログの用途 (任意)"
        />
      </div>

      <div className="conventions-tabs-area">
        {renderTabGroup("入力バリデーション", VALIDATION_CATEGORIES)}
        {renderTabGroup("プロダクト規約", PRODUCT_CATEGORIES)}
      </div>

      <div className="conventions-category-content">
        {activeCategory === "msg" && (
          <MsgEditor
            msg={catalog.msg ?? {}}
            onAdd={addMsg}
            onUpdate={(key, patch) => updateSilent((c) => { if (c.msg?.[key]) Object.assign(c.msg[key], patch); })}
            onCommit={commit}
            onRemove={(key) => update((c) => { if (c.msg) delete c.msg[key]; })}
          />
        )}
        {activeCategory === "regex" && (
          <RegexEditor
            regex={catalog.regex ?? {}}
            onAdd={addRegex}
            onUpdate={(key, patch) => updateSilent((c) => { if (c.regex?.[key]) Object.assign(c.regex[key], patch); })}
            onCommit={commit}
            onRemove={(key) => update((c) => { if (c.regex) delete c.regex[key]; })}
          />
        )}
        {activeCategory === "limit" && (
          <LimitEditor
            limit={catalog.limit ?? {}}
            onAdd={addLimit}
            onUpdate={(key, patch) => updateSilent((c) => { if (c.limit?.[key]) Object.assign(c.limit[key], patch); })}
            onCommit={commit}
            onRemove={(key) => update((c) => { if (c.limit) delete c.limit[key]; })}
          />
        )}
        {activeCategory === "scope" && (
          <ScopeEditor
            scope={catalog.scope ?? {}}
            onAdd={addScope}
            onUpdate={(key, patch) => updateSilent((c) => { if (c.scope?.[key]) Object.assign(c.scope[key], patch); })}
            onCommit={commit}
            onRemove={(key) => update((c) => { if (c.scope) delete c.scope[key]; })}
          />
        )}
        {activeCategory === "currency" && (
          <CurrencyEditor
            currency={catalog.currency ?? {}}
            onAdd={addCurrency}
            onUpdate={(key, patch) => updateSilent((c) => { if (c.currency?.[key]) Object.assign(c.currency[key], patch); })}
            onCommit={commit}
            onRemove={(key) => update((c) => { if (c.currency) delete c.currency[key]; })}
          />
        )}
        {activeCategory === "tax" && (
          <TaxEditor
            tax={catalog.tax ?? {}}
            onAdd={addTax}
            onUpdate={(key, patch) => updateSilent((c) => { if (c.tax?.[key]) Object.assign(c.tax[key], patch); })}
            onCommit={commit}
            onRemove={(key) => update((c) => { if (c.tax) delete c.tax[key]; })}
          />
        )}
        {activeCategory === "auth" && (
          <AuthEditor
            auth={catalog.auth ?? {}}
            onAdd={addAuth}
            onUpdate={(key, patch) => updateSilent((c) => { if (c.auth?.[key]) Object.assign(c.auth[key], patch); })}
            onCommit={commit}
            onRemove={(key) => update((c) => { if (c.auth) delete c.auth[key]; })}
          />
        )}
        {activeCategory === "db" && (
          <DbEditor
            db={catalog.db ?? {}}
            onAdd={addDb}
            onUpdate={(key, patch) => updateSilent((c) => { if (c.db?.[key]) Object.assign(c.db[key], patch); })}
            onCommit={commit}
            onRemove={(key) => update((c) => { if (c.db) delete c.db[key]; })}
          />
        )}
        {activeCategory === "numbering" && (
          <NumberingEditor
            numbering={catalog.numbering ?? {}}
            onAdd={addNumbering}
            onUpdate={(key, patch) => updateSilent((c) => { if (c.numbering?.[key]) Object.assign(c.numbering[key], patch); })}
            onCommit={commit}
            onRemove={(key) => update((c) => { if (c.numbering) delete c.numbering[key]; })}
          />
        )}
        {activeCategory === "tx" && (
          <TxEditor
            tx={catalog.tx ?? {}}
            onAdd={addTx}
            onUpdate={(key, patch) => updateSilent((c) => { if (c.tx?.[key]) Object.assign(c.tx[key], patch); })}
            onCommit={commit}
            onRemove={(key) => update((c) => { if (c.tx) delete c.tx[key]; })}
          />
        )}
        {activeCategory === "externalOutcomeDefaults" && (
          <ExternalOutcomeDefaultEditor
            entries={catalog.externalOutcomeDefaults ?? {}}
            onAdd={addExternalOutcomeDefault}
            onUpdate={(key, patch) => updateSilent((c) => {
              if (c.externalOutcomeDefaults?.[key]) Object.assign(c.externalOutcomeDefaults[key], patch);
            })}
            onCommit={commit}
            onRemove={(key) => update((c) => { if (c.externalOutcomeDefaults) delete c.externalOutcomeDefaults[key]; })}
          />
        )}
      </div>
    </div>
  );
}

// ── 共通部品 ────────────────────────────────────────────────────────────

function DeleteBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="btn btn-sm btn-link text-danger p-0"
      onClick={onClick}
      title="削除"
      aria-label="削除"
    >
      <i className="bi bi-x" />
    </button>
  );
}

function NewKeyRow({
  placeholder, value, setValue, onAdd, disabled,
}: {
  placeholder: string;
  value: string;
  setValue: (v: string) => void;
  onAdd: () => void;
  disabled: boolean;
}) {
  return (
    <div className="conventions-new-key-row">
      <input
        className="form-control form-control-sm conventions-new-key-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !disabled) { e.preventDefault(); onAdd(); } }}
      />
      <button
        type="button"
        className="btn btn-sm btn-outline-primary"
        onClick={onAdd}
        disabled={disabled}
      >
        <i className="bi bi-plus-lg" /> 追加
      </button>
    </div>
  );
}

function EntriesWrapper({ children, empty }: { children: React.ReactNode; empty: boolean }) {
  return (
    <div className="conventions-entries">
      {empty && <div className="conventions-empty">エントリがありません。下の入力欄から追加してください。</div>}
      {children}
    </div>
  );
}

// ── 既存 3 エディタ ─────────────────────────────────────────────────────

interface MsgEntryLocal {
  template: string;
  params?: string[];
  description?: string;
}

function MsgEditor({
  msg, onAdd, onUpdate, onCommit, onRemove,
}: {
  msg: Record<string, MsgEntryLocal>;
  onAdd: (key: string) => void;
  onUpdate: (key: string, patch: Partial<MsgEntryLocal>) => void;
  onCommit: () => void;
  onRemove: (key: string) => void;
}) {
  const [newKey, setNewKey] = useState("");
  const entries = Object.entries(msg);

  return (
    <EntriesWrapper empty={entries.length === 0}>
      <table className="conventions-table">
        <colgroup>
          <col style={{ width: "14em" }} />
          <col />
          <col style={{ width: "18em" }} />
          <col style={{ width: "18em" }} />
          <col style={{ width: 28 }} />
        </colgroup>
        <thead>
          <tr>
            <th>key (@conv.msg.xxx)</th>
            <th>template</th>
            <th>params (カンマ区切り)</th>
            <th>description</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([key, entry]) => (
            <tr key={key}>
              <td><code className="conventions-key-badge">{key}</code></td>
              <td>
                <input
                  className="form-control form-control-sm"
                  value={entry.template}
                  onChange={(e) => onUpdate(key, { template: e.target.value })}
                  onBlur={onCommit}
                  placeholder="{label}は必須入力です"
                />
              </td>
              <td>
                <input
                  className="form-control form-control-sm"
                  value={(entry.params ?? []).join(", ")}
                  onChange={(e) => {
                    const params = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                    onUpdate(key, { params: params.length > 0 ? params : undefined });
                  }}
                  onBlur={onCommit}
                  placeholder="label, max"
                />
              </td>
              <td>
                <input
                  className="form-control form-control-sm"
                  value={entry.description ?? ""}
                  onChange={(e) => onUpdate(key, { description: e.target.value || undefined })}
                  onBlur={onCommit}
                />
              </td>
              <td className="text-center"><DeleteBtn onClick={() => onRemove(key)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <NewKeyRow
        placeholder="新規 key (例: required)"
        value={newKey}
        setValue={setNewKey}
        onAdd={() => { const k = newKey.trim(); if (k && !msg[k]) { onAdd(k); setNewKey(""); } }}
        disabled={!newKey.trim() || Object.hasOwn(msg, newKey.trim())}
      />
    </EntriesWrapper>
  );
}

interface RegexEntryLocal {
  pattern: string;
  flags?: string;
  description?: string;
}

function RegexEditor({
  regex, onAdd, onUpdate, onCommit, onRemove,
}: {
  regex: Record<string, RegexEntryLocal>;
  onAdd: (key: string) => void;
  onUpdate: (key: string, patch: Partial<RegexEntryLocal>) => void;
  onCommit: () => void;
  onRemove: (key: string) => void;
}) {
  const [newKey, setNewKey] = useState("");
  const entries = Object.entries(regex);

  return (
    <EntriesWrapper empty={entries.length === 0}>
      <table className="conventions-table">
        <colgroup>
          <col style={{ width: "14em" }} />
          <col />
          <col style={{ width: "6em" }} />
          <col style={{ width: "18em" }} />
          <col style={{ width: 28 }} />
        </colgroup>
        <thead>
          <tr>
            <th>key (@conv.regex.xxx)</th>
            <th>pattern</th>
            <th>flags</th>
            <th>description</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([key, entry]) => (
            <tr key={key}>
              <td><code className="conventions-key-badge">{key}</code></td>
              <td>
                <input
                  className="form-control form-control-sm conventions-mono"
                  value={entry.pattern}
                  onChange={(e) => onUpdate(key, { pattern: e.target.value })}
                  onBlur={onCommit}
                  placeholder="^[A-Za-z0-9]+$"
                />
              </td>
              <td>
                <input
                  className="form-control form-control-sm conventions-mono"
                  value={entry.flags ?? ""}
                  onChange={(e) => onUpdate(key, { flags: e.target.value || undefined })}
                  onBlur={onCommit}
                  placeholder="i"
                />
              </td>
              <td>
                <input
                  className="form-control form-control-sm"
                  value={entry.description ?? ""}
                  onChange={(e) => onUpdate(key, { description: e.target.value || undefined })}
                  onBlur={onCommit}
                />
              </td>
              <td className="text-center"><DeleteBtn onClick={() => onRemove(key)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <NewKeyRow
        placeholder="新規 key (例: phone-jp)"
        value={newKey}
        setValue={setNewKey}
        onAdd={() => { const k = newKey.trim(); if (k && !regex[k]) { onAdd(k); setNewKey(""); } }}
        disabled={!newKey.trim() || Object.hasOwn(regex, newKey.trim())}
      />
    </EntriesWrapper>
  );
}

interface LimitEntryLocal {
  value: number;
  unit?: string;
  description?: string;
}

function LimitEditor({
  limit, onAdd, onUpdate, onCommit, onRemove,
}: {
  limit: Record<string, LimitEntryLocal>;
  onAdd: (key: string) => void;
  onUpdate: (key: string, patch: Partial<LimitEntryLocal>) => void;
  onCommit: () => void;
  onRemove: (key: string) => void;
}) {
  const [newKey, setNewKey] = useState("");
  const entries = Object.entries(limit);

  return (
    <EntriesWrapper empty={entries.length === 0}>
      <table className="conventions-table">
        <colgroup>
          <col style={{ width: "14em" }} />
          <col style={{ width: "10em" }} />
          <col style={{ width: "8em" }} />
          <col />
          <col style={{ width: 28 }} />
        </colgroup>
        <thead>
          <tr>
            <th>key (@conv.limit.xxx)</th>
            <th>value</th>
            <th>unit</th>
            <th>description</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([key, entry]) => (
            <tr key={key}>
              <td><code className="conventions-key-badge">{key}</code></td>
              <td>
                <input
                  type="number"
                  className="form-control form-control-sm"
                  value={entry.value}
                  onChange={(e) => onUpdate(key, { value: Number(e.target.value) })}
                  onBlur={onCommit}
                />
              </td>
              <td>
                <input
                  className="form-control form-control-sm"
                  value={entry.unit ?? ""}
                  onChange={(e) => onUpdate(key, { unit: e.target.value || undefined })}
                  onBlur={onCommit}
                  placeholder="char"
                />
              </td>
              <td>
                <input
                  className="form-control form-control-sm"
                  value={entry.description ?? ""}
                  onChange={(e) => onUpdate(key, { description: e.target.value || undefined })}
                  onBlur={onCommit}
                />
              </td>
              <td className="text-center"><DeleteBtn onClick={() => onRemove(key)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <NewKeyRow
        placeholder="新規 key (例: emailMax)"
        value={newKey}
        setValue={setNewKey}
        onAdd={() => { const k = newKey.trim(); if (k && !limit[k]) { onAdd(k); setNewKey(""); } }}
        disabled={!newKey.trim() || Object.hasOwn(limit, newKey.trim())}
      />
    </EntriesWrapper>
  );
}

// ── 新規 8 エディタ ─────────────────────────────────────────────────────

function ScopeEditor({
  scope, onAdd, onUpdate, onCommit, onRemove,
}: {
  scope: Record<string, ScopeEntry>;
  onAdd: (key: string) => void;
  onUpdate: (key: string, patch: Partial<ScopeEntry>) => void;
  onCommit: () => void;
  onRemove: (key: string) => void;
}) {
  const [newKey, setNewKey] = useState("");
  const entries = Object.entries(scope);

  return (
    <EntriesWrapper empty={entries.length === 0}>
      <table className="conventions-table">
        <colgroup>
          <col style={{ width: "14em" }} />
          <col style={{ width: "16em" }} />
          <col />
          <col style={{ width: 28 }} />
        </colgroup>
        <thead>
          <tr>
            <th>key (@conv.scope.xxx)</th>
            <th>value</th>
            <th>description</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([key, entry]) => (
            <tr key={key}>
              <td><code className="conventions-key-badge">{key}</code></td>
              <td>
                <input
                  className="form-control form-control-sm"
                  value={entry.value}
                  onChange={(e) => onUpdate(key, { value: e.target.value })}
                  onBlur={onCommit}
                  placeholder="domestic"
                />
              </td>
              <td>
                <input
                  className="form-control form-control-sm"
                  value={entry.description ?? ""}
                  onChange={(e) => onUpdate(key, { description: e.target.value || undefined })}
                  onBlur={onCommit}
                />
              </td>
              <td className="text-center"><DeleteBtn onClick={() => onRemove(key)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <NewKeyRow
        placeholder="新規 key (例: customerRegion)"
        value={newKey}
        setValue={setNewKey}
        onAdd={() => { const k = newKey.trim(); if (k && !scope[k]) { onAdd(k); setNewKey(""); } }}
        disabled={!newKey.trim() || Object.hasOwn(scope, newKey.trim())}
      />
    </EntriesWrapper>
  );
}

const ROUNDING_OPTIONS = ["", "floor", "ceil", "round"] as const;

function CurrencyEditor({
  currency, onAdd, onUpdate, onCommit, onRemove,
}: {
  currency: Record<string, CurrencyEntry>;
  onAdd: (key: string) => void;
  onUpdate: (key: string, patch: Partial<CurrencyEntry>) => void;
  onCommit: () => void;
  onRemove: (key: string) => void;
}) {
  const [newKey, setNewKey] = useState("");
  const entries = Object.entries(currency);

  return (
    <EntriesWrapper empty={entries.length === 0}>
      <table className="conventions-table">
        <colgroup>
          <col style={{ width: "12em" }} />
          <col style={{ width: "7em" }} />
          <col style={{ width: "8em" }} />
          <col style={{ width: "10em" }} />
          <col />
          <col style={{ width: 28 }} />
        </colgroup>
        <thead>
          <tr>
            <th>key (@conv.currency.xxx)</th>
            <th>code (ISO 4217)</th>
            <th>subunit</th>
            <th>roundingMode</th>
            <th>description</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([key, entry]) => (
            <tr key={key}>
              <td><code className="conventions-key-badge">{key}</code></td>
              <td>
                <input
                  className="form-control form-control-sm conventions-mono"
                  value={entry.code}
                  onChange={(e) => onUpdate(key, { code: e.target.value })}
                  onBlur={onCommit}
                  placeholder="JPY"
                />
              </td>
              <td>
                <input
                  type="number"
                  className="form-control form-control-sm"
                  value={entry.subunit ?? ""}
                  onChange={(e) => onUpdate(key, { subunit: e.target.value === "" ? undefined : Number(e.target.value) })}
                  onBlur={onCommit}
                  placeholder="0"
                  min={0}
                />
              </td>
              <td>
                <select
                  className="form-select form-select-sm"
                  value={entry.roundingMode ?? ""}
                  onChange={(e) => {
                    onUpdate(key, { roundingMode: (e.target.value || undefined) as CurrencyEntry["roundingMode"] });
                    onCommit();
                  }}
                >
                  {ROUNDING_OPTIONS.map((o) => <option key={o} value={o}>{o || "(未指定)"}</option>)}
                </select>
              </td>
              <td>
                <input
                  className="form-control form-control-sm"
                  value={entry.description ?? ""}
                  onChange={(e) => onUpdate(key, { description: e.target.value || undefined })}
                  onBlur={onCommit}
                />
              </td>
              <td className="text-center"><DeleteBtn onClick={() => onRemove(key)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <NewKeyRow
        placeholder="新規 key (例: jpy)"
        value={newKey}
        setValue={setNewKey}
        onAdd={() => { const k = newKey.trim(); if (k && !currency[k]) { onAdd(k); setNewKey(""); } }}
        disabled={!newKey.trim() || Object.hasOwn(currency, newKey.trim())}
      />
    </EntriesWrapper>
  );
}

function TaxEditor({
  tax, onAdd, onUpdate, onCommit, onRemove,
}: {
  tax: Record<string, TaxEntry>;
  onAdd: (key: string) => void;
  onUpdate: (key: string, patch: Partial<TaxEntry>) => void;
  onCommit: () => void;
  onRemove: (key: string) => void;
}) {
  const [newKey, setNewKey] = useState("");
  const entries = Object.entries(tax);

  return (
    <EntriesWrapper empty={entries.length === 0}>
      <table className="conventions-table">
        <colgroup>
          <col style={{ width: "12em" }} />
          <col style={{ width: "10em" }} />
          <col style={{ width: "10em" }} />
          <col style={{ width: "10em" }} />
          <col />
          <col style={{ width: 28 }} />
        </colgroup>
        <thead>
          <tr>
            <th>key (@conv.tax.xxx)</th>
            <th>kind</th>
            <th>rate (0〜1)</th>
            <th>roundingMode</th>
            <th>description</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([key, entry]) => (
            <tr key={key}>
              <td><code className="conventions-key-badge">{key}</code></td>
              <td>
                <select
                  className="form-select form-select-sm"
                  value={entry.kind}
                  onChange={(e) => { onUpdate(key, { kind: e.target.value as TaxEntry["kind"] }); onCommit(); }}
                >
                  <option value="exclusive">exclusive (外税)</option>
                  <option value="inclusive">inclusive (内税)</option>
                </select>
              </td>
              <td>
                <input
                  type="number"
                  className="form-control form-control-sm"
                  value={entry.rate}
                  onChange={(e) => onUpdate(key, { rate: Number(e.target.value) })}
                  onBlur={onCommit}
                  step={0.01}
                  min={0}
                  max={1}
                  placeholder="0.10"
                />
              </td>
              <td>
                <select
                  className="form-select form-select-sm"
                  value={entry.roundingMode ?? ""}
                  onChange={(e) => {
                    onUpdate(key, { roundingMode: (e.target.value || undefined) as TaxEntry["roundingMode"] });
                    onCommit();
                  }}
                >
                  {ROUNDING_OPTIONS.map((o) => <option key={o} value={o}>{o || "(未指定)"}</option>)}
                </select>
              </td>
              <td>
                <input
                  className="form-control form-control-sm"
                  value={entry.description ?? ""}
                  onChange={(e) => onUpdate(key, { description: e.target.value || undefined })}
                  onBlur={onCommit}
                />
              </td>
              <td className="text-center"><DeleteBtn onClick={() => onRemove(key)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <NewKeyRow
        placeholder="新規 key (例: standard)"
        value={newKey}
        setValue={setNewKey}
        onAdd={() => { const k = newKey.trim(); if (k && !tax[k]) { onAdd(k); setNewKey(""); } }}
        disabled={!newKey.trim() || Object.hasOwn(tax, newKey.trim())}
      />
    </EntriesWrapper>
  );
}

function AuthEditor({
  auth, onAdd, onUpdate, onCommit, onRemove,
}: {
  auth: Record<string, AuthEntry>;
  onAdd: (key: string) => void;
  onUpdate: (key: string, patch: Partial<AuthEntry>) => void;
  onCommit: () => void;
  onRemove: (key: string) => void;
}) {
  const [newKey, setNewKey] = useState("");
  const entries = Object.entries(auth);

  return (
    <EntriesWrapper empty={entries.length === 0}>
      <table className="conventions-table">
        <colgroup>
          <col style={{ width: "12em" }} />
          <col style={{ width: "14em" }} />
          <col style={{ width: "14em" }} />
          <col style={{ width: "14em" }} />
          <col />
          <col style={{ width: 28 }} />
        </colgroup>
        <thead>
          <tr>
            <th>key (@conv.auth.xxx)</th>
            <th>scheme</th>
            <th>sessionStorage</th>
            <th>passwordHash</th>
            <th>description</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([key, entry]) => (
            <tr key={key}>
              <td><code className="conventions-key-badge">{key}</code></td>
              <td>
                <input
                  className="form-control form-control-sm"
                  value={entry.scheme}
                  onChange={(e) => onUpdate(key, { scheme: e.target.value })}
                  onBlur={onCommit}
                  placeholder="session-cookie"
                />
              </td>
              <td>
                <input
                  className="form-control form-control-sm"
                  value={entry.sessionStorage ?? ""}
                  onChange={(e) => onUpdate(key, { sessionStorage: e.target.value || undefined })}
                  onBlur={onCommit}
                  placeholder="httpOnly-cookie"
                />
              </td>
              <td>
                <input
                  className="form-control form-control-sm"
                  value={entry.passwordHash ?? ""}
                  onChange={(e) => onUpdate(key, { passwordHash: e.target.value || undefined })}
                  onBlur={onCommit}
                  placeholder="bcrypt(cost=12)"
                />
              </td>
              <td>
                <input
                  className="form-control form-control-sm"
                  value={entry.description ?? ""}
                  onChange={(e) => onUpdate(key, { description: e.target.value || undefined })}
                  onBlur={onCommit}
                />
              </td>
              <td className="text-center"><DeleteBtn onClick={() => onRemove(key)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <NewKeyRow
        placeholder="新規 key (例: default)"
        value={newKey}
        setValue={setNewKey}
        onAdd={() => { const k = newKey.trim(); if (k && !auth[k]) { onAdd(k); setNewKey(""); } }}
        disabled={!newKey.trim() || Object.hasOwn(auth, newKey.trim())}
      />
    </EntriesWrapper>
  );
}

function DbEditor({
  db, onAdd, onUpdate, onCommit, onRemove,
}: {
  db: Record<string, DbEntry>;
  onAdd: (key: string) => void;
  onUpdate: (key: string, patch: Partial<DbEntry>) => void;
  onCommit: () => void;
  onRemove: (key: string) => void;
}) {
  const [newKey, setNewKey] = useState("");
  const entries = Object.entries(db);

  return (
    <EntriesWrapper empty={entries.length === 0}>
      <table className="conventions-table">
        <colgroup>
          <col style={{ width: "12em" }} />
          <col style={{ width: "12em" }} />
          <col style={{ width: "10em" }} />
          <col style={{ width: "16em" }} />
          <col style={{ width: "12em" }} />
          <col />
          <col style={{ width: 28 }} />
        </colgroup>
        <thead>
          <tr>
            <th>key (@conv.db.xxx)</th>
            <th>engine</th>
            <th>namingConvention</th>
            <th>timestampColumns (カンマ区切り)</th>
            <th>logicalDeleteColumn</th>
            <th>description</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([key, entry]) => (
            <tr key={key}>
              <td><code className="conventions-key-badge">{key}</code></td>
              <td>
                <input
                  className="form-control form-control-sm"
                  value={entry.engine ?? ""}
                  onChange={(e) => onUpdate(key, { engine: e.target.value || undefined })}
                  onBlur={onCommit}
                  placeholder="postgresql@14"
                />
              </td>
              <td>
                <input
                  className="form-control form-control-sm"
                  value={entry.namingConvention ?? ""}
                  onChange={(e) => onUpdate(key, { namingConvention: e.target.value || undefined })}
                  onBlur={onCommit}
                  placeholder="snake_case"
                />
              </td>
              <td>
                <input
                  className="form-control form-control-sm"
                  value={(entry.timestampColumns ?? []).join(", ")}
                  onChange={(e) => {
                    const cols = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                    onUpdate(key, { timestampColumns: cols.length > 0 ? cols : undefined });
                  }}
                  onBlur={onCommit}
                  placeholder="created_at, updated_at"
                />
              </td>
              <td>
                <input
                  className="form-control form-control-sm"
                  value={entry.logicalDeleteColumn ?? ""}
                  onChange={(e) => onUpdate(key, { logicalDeleteColumn: e.target.value || undefined })}
                  onBlur={onCommit}
                  placeholder="is_deleted"
                />
              </td>
              <td>
                <input
                  className="form-control form-control-sm"
                  value={entry.description ?? ""}
                  onChange={(e) => onUpdate(key, { description: e.target.value || undefined })}
                  onBlur={onCommit}
                />
              </td>
              <td className="text-center"><DeleteBtn onClick={() => onRemove(key)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <NewKeyRow
        placeholder="新規 key (例: default)"
        value={newKey}
        setValue={setNewKey}
        onAdd={() => { const k = newKey.trim(); if (k && !db[k]) { onAdd(k); setNewKey(""); } }}
        disabled={!newKey.trim() || Object.hasOwn(db, newKey.trim())}
      />
    </EntriesWrapper>
  );
}

function NumberingEditor({
  numbering, onAdd, onUpdate, onCommit, onRemove,
}: {
  numbering: Record<string, NumberingEntry>;
  onAdd: (key: string) => void;
  onUpdate: (key: string, patch: Partial<NumberingEntry>) => void;
  onCommit: () => void;
  onRemove: (key: string) => void;
}) {
  const [newKey, setNewKey] = useState("");
  const entries = Object.entries(numbering);

  return (
    <EntriesWrapper empty={entries.length === 0}>
      <table className="conventions-table">
        <colgroup>
          <col style={{ width: "14em" }} />
          <col style={{ width: "14em" }} />
          <col style={{ width: "18em" }} />
          <col />
          <col style={{ width: 28 }} />
        </colgroup>
        <thead>
          <tr>
            <th>key (@conv.numbering.xxx)</th>
            <th>format</th>
            <th>implementation</th>
            <th>description</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([key, entry]) => (
            <tr key={key}>
              <td><code className="conventions-key-badge">{key}</code></td>
              <td>
                <input
                  className="form-control form-control-sm conventions-mono"
                  value={entry.format}
                  onChange={(e) => onUpdate(key, { format: e.target.value })}
                  onBlur={onCommit}
                  placeholder="C-NNNN"
                />
              </td>
              <td>
                <input
                  className="form-control form-control-sm"
                  value={entry.implementation ?? ""}
                  onChange={(e) => onUpdate(key, { implementation: e.target.value || undefined })}
                  onBlur={onCommit}
                  placeholder="PG sequence + DEFAULT"
                />
              </td>
              <td>
                <input
                  className="form-control form-control-sm"
                  value={entry.description ?? ""}
                  onChange={(e) => onUpdate(key, { description: e.target.value || undefined })}
                  onBlur={onCommit}
                />
              </td>
              <td className="text-center"><DeleteBtn onClick={() => onRemove(key)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <NewKeyRow
        placeholder="新規 key (例: customerCode)"
        value={newKey}
        setValue={setNewKey}
        onAdd={() => { const k = newKey.trim(); if (k && !numbering[k]) { onAdd(k); setNewKey(""); } }}
        disabled={!newKey.trim() || Object.hasOwn(numbering, newKey.trim())}
      />
    </EntriesWrapper>
  );
}

function TxEditor({
  tx, onAdd, onUpdate, onCommit, onRemove,
}: {
  tx: Record<string, TxEntry>;
  onAdd: (key: string) => void;
  onUpdate: (key: string, patch: Partial<TxEntry>) => void;
  onCommit: () => void;
  onRemove: (key: string) => void;
}) {
  const [newKey, setNewKey] = useState("");
  const entries = Object.entries(tx);

  return (
    <EntriesWrapper empty={entries.length === 0}>
      <table className="conventions-table">
        <colgroup>
          <col style={{ width: "14em" }} />
          <col />
          <col style={{ width: "18em" }} />
          <col style={{ width: 28 }} />
        </colgroup>
        <thead>
          <tr>
            <th>key (@conv.tx.xxx)</th>
            <th>policy</th>
            <th>description</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([key, entry]) => (
            <tr key={key}>
              <td><code className="conventions-key-badge">{key}</code></td>
              <td>
                <textarea
                  className="form-control form-control-sm conventions-table-textarea"
                  value={entry.policy}
                  onChange={(e) => onUpdate(key, { policy: e.target.value })}
                  onBlur={onCommit}
                  rows={2}
                  placeholder="単一操作は 1 TX..."
                />
              </td>
              <td>
                <input
                  className="form-control form-control-sm"
                  value={entry.description ?? ""}
                  onChange={(e) => onUpdate(key, { description: e.target.value || undefined })}
                  onBlur={onCommit}
                />
              </td>
              <td className="text-center"><DeleteBtn onClick={() => onRemove(key)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <NewKeyRow
        placeholder="新規 key (例: singleOperation)"
        value={newKey}
        setValue={setNewKey}
        onAdd={() => { const k = newKey.trim(); if (k && !tx[k]) { onAdd(k); setNewKey(""); } }}
        disabled={!newKey.trim() || Object.hasOwn(tx, newKey.trim())}
      />
    </EntriesWrapper>
  );
}

const OUTCOME_OPTIONS: ExternalOutcomeDefaultEntry["outcome"][] = ["success", "failure", "timeout"];
const ACTION_OPTIONS: ExternalOutcomeDefaultEntry["action"][] = ["continue", "abort", "compensate"];
const RETRY_OPTIONS = ["", "none", "fixed", "exponential"] as const;

function ExternalOutcomeDefaultEditor({
  entries: entriesMap, onAdd, onUpdate, onCommit, onRemove,
}: {
  entries: Record<string, ExternalOutcomeDefaultEntry>;
  onAdd: (key: string) => void;
  onUpdate: (key: string, patch: Partial<ExternalOutcomeDefaultEntry>) => void;
  onCommit: () => void;
  onRemove: (key: string) => void;
}) {
  const [newKey, setNewKey] = useState("");
  const entries = Object.entries(entriesMap);

  return (
    <EntriesWrapper empty={entries.length === 0}>
      <table className="conventions-table">
        <colgroup>
          <col style={{ width: "12em" }} />
          <col style={{ width: "10em" }} />
          <col style={{ width: "10em" }} />
          <col style={{ width: "12em" }} />
          <col />
          <col style={{ width: 28 }} />
        </colgroup>
        <thead>
          <tr>
            <th>key (@conv.externalOutcomeDefaults.xxx)</th>
            <th>outcome</th>
            <th>action</th>
            <th>retry</th>
            <th>description</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([key, entry]) => (
            <tr key={key}>
              <td><code className="conventions-key-badge">{key}</code></td>
              <td>
                <select
                  className="form-select form-select-sm"
                  value={entry.outcome}
                  onChange={(e) => { onUpdate(key, { outcome: e.target.value as ExternalOutcomeDefaultEntry["outcome"] }); onCommit(); }}
                >
                  {OUTCOME_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </td>
              <td>
                <select
                  className="form-select form-select-sm"
                  value={entry.action}
                  onChange={(e) => { onUpdate(key, { action: e.target.value as ExternalOutcomeDefaultEntry["action"] }); onCommit(); }}
                >
                  {ACTION_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </td>
              <td>
                <select
                  className="form-select form-select-sm"
                  value={entry.retry ?? ""}
                  onChange={(e) => {
                    onUpdate(key, { retry: (e.target.value || undefined) as ExternalOutcomeDefaultEntry["retry"] });
                    onCommit();
                  }}
                >
                  {RETRY_OPTIONS.map((o) => <option key={o} value={o}>{o || "(未指定)"}</option>)}
                </select>
              </td>
              <td>
                <input
                  className="form-control form-control-sm"
                  value={entry.description ?? ""}
                  onChange={(e) => onUpdate(key, { description: e.target.value || undefined })}
                  onBlur={onCommit}
                />
              </td>
              <td className="text-center"><DeleteBtn onClick={() => onRemove(key)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <NewKeyRow
        placeholder="新規 key (例: failure)"
        value={newKey}
        setValue={setNewKey}
        onAdd={() => { const k = newKey.trim(); if (k && !entriesMap[k]) { onAdd(k); setNewKey(""); } }}
        disabled={!newKey.trim() || Object.hasOwn(entriesMap, newKey.trim())}
      />
    </EntriesWrapper>
  );
}
