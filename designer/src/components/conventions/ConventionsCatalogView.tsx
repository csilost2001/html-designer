/**
 * 規約カタログ編集ビュー (#317)
 *
 * 横断規約 (`@conv.msg.*` / `@conv.regex.*` / `@conv.limit.*`) の
 * 機械可読カタログ (`data/conventions/catalog.json`) を designer 内で編集する
 * シングルトンタブ。正本は JSON (本ビューで編集可)、`docs/conventions/*.md`
 * は人間向け参考資料。
 *
 * カテゴリは 3 種: msg / regex / limit。それぞれサブタブで切替。CRUD は
 * インライン編集 (name/description/etc をテキスト入力)。
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
import "../../styles/conventions.css";

type Category = "msg" | "regex" | "limit";

const CATEGORY_LABELS: Record<Category, string> = {
  msg: "メッセージ",
  regex: "正規表現",
  limit: "制限値",
};

const CATEGORY_ICONS: Record<Category, string> = {
  msg: "bi-chat-left-text",
  regex: "bi-regex",
  limit: "bi-rulers",
};

/** シングルトンなので id を "main" 固定で useResourceEditor を流用 */
const RESOURCE_ID = "main";

async function loadCatalog(_id: string): Promise<ConventionsCatalog> {
  const cat = await loadConventions();
  return cat ?? createEmptyCatalog();
}

async function saveCatalog(data: ConventionsCatalog): Promise<void> {
  await saveConventions(data);
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
    update((c) => {
      if (!c.msg) c.msg = {};
      if (!c.msg[key]) c.msg[key] = { template: "" };
    });
  }, [update]);

  const addRegex = useCallback((key: string) => {
    update((c) => {
      if (!c.regex) c.regex = {};
      if (!c.regex[key]) c.regex[key] = { pattern: "" };
    });
  }, [update]);

  const addLimit = useCallback((key: string) => {
    update((c) => {
      if (!c.limit) c.limit = {};
      if (!c.limit[key]) c.limit[key] = { value: 0 };
    });
  }, [update]);

  if (!catalog) return null;

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

      <div className="conventions-category-tabs" role="tablist">
        {(Object.keys(CATEGORY_LABELS) as Category[]).map((cat) => {
          const count = Object.keys(catalog[cat] ?? {}).length;
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

      <div className="conventions-category-content">
        {activeCategory === "msg" && (
          <MsgEditor
            msg={catalog.msg ?? {}}
            onAdd={addMsg}
            onUpdate={(key, patch) => updateSilent((c) => {
              if (!c.msg || !c.msg[key]) return;
              Object.assign(c.msg[key], patch);
            })}
            onCommit={commit}
            onRemove={(key) => update((c) => {
              if (c.msg) delete c.msg[key];
            })}
          />
        )}
        {activeCategory === "regex" && (
          <RegexEditor
            regex={catalog.regex ?? {}}
            onAdd={addRegex}
            onUpdate={(key, patch) => updateSilent((c) => {
              if (!c.regex || !c.regex[key]) return;
              Object.assign(c.regex[key], patch);
            })}
            onCommit={commit}
            onRemove={(key) => update((c) => {
              if (c.regex) delete c.regex[key];
            })}
          />
        )}
        {activeCategory === "limit" && (
          <LimitEditor
            limit={catalog.limit ?? {}}
            onAdd={addLimit}
            onUpdate={(key, patch) => updateSilent((c) => {
              if (!c.limit || !c.limit[key]) return;
              Object.assign(c.limit[key], patch);
            })}
            onCommit={commit}
            onRemove={(key) => update((c) => {
              if (c.limit) delete c.limit[key];
            })}
          />
        )}
      </div>
    </div>
  );
}

// ── 各カテゴリエディタ ─────────────────────────────────────────────────

interface MsgEntry {
  template: string;
  params?: string[];
  description?: string;
}

function MsgEditor({
  msg, onAdd, onUpdate, onCommit, onRemove,
}: {
  msg: Record<string, MsgEntry>;
  onAdd: (key: string) => void;
  onUpdate: (key: string, patch: Partial<MsgEntry>) => void;
  onCommit: () => void;
  onRemove: (key: string) => void;
}) {
  const [newKey, setNewKey] = useState("");
  const entries = Object.entries(msg);

  return (
    <div className="conventions-entries">
      {entries.length === 0 && (
        <div className="conventions-empty">エントリがありません。下の入力欄から追加してください。</div>
      )}
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
              <td className="text-center">
                <button
                  type="button"
                  className="btn btn-sm btn-link text-danger p-0"
                  onClick={() => onRemove(key)}
                  title="削除"
                  aria-label="削除"
                >
                  <i className="bi bi-x" />
                </button>
              </td>
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
    </div>
  );
}

interface RegexEntry {
  pattern: string;
  flags?: string;
  description?: string;
  exampleValid?: string[];
  exampleInvalid?: string[];
}

function RegexEditor({
  regex, onAdd, onUpdate, onCommit, onRemove,
}: {
  regex: Record<string, RegexEntry>;
  onAdd: (key: string) => void;
  onUpdate: (key: string, patch: Partial<RegexEntry>) => void;
  onCommit: () => void;
  onRemove: (key: string) => void;
}) {
  const [newKey, setNewKey] = useState("");
  const entries = Object.entries(regex);

  return (
    <div className="conventions-entries">
      {entries.length === 0 && (
        <div className="conventions-empty">エントリがありません。下の入力欄から追加してください。</div>
      )}
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
              <td className="text-center">
                <button
                  type="button"
                  className="btn btn-sm btn-link text-danger p-0"
                  onClick={() => onRemove(key)}
                  title="削除"
                  aria-label="削除"
                >
                  <i className="bi bi-x" />
                </button>
              </td>
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
    </div>
  );
}

interface LimitEntry {
  value: number;
  unit?: string;
  description?: string;
}

function LimitEditor({
  limit, onAdd, onUpdate, onCommit, onRemove,
}: {
  limit: Record<string, LimitEntry>;
  onAdd: (key: string) => void;
  onUpdate: (key: string, patch: Partial<LimitEntry>) => void;
  onCommit: () => void;
  onRemove: (key: string) => void;
}) {
  const [newKey, setNewKey] = useState("");
  const entries = Object.entries(limit);

  return (
    <div className="conventions-entries">
      {entries.length === 0 && (
        <div className="conventions-empty">エントリがありません。下の入力欄から追加してください。</div>
      )}
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
              <td className="text-center">
                <button
                  type="button"
                  className="btn btn-sm btn-link text-danger p-0"
                  onClick={() => onRemove(key)}
                  title="削除"
                  aria-label="削除"
                >
                  <i className="bi bi-x" />
                </button>
              </td>
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
    </div>
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
