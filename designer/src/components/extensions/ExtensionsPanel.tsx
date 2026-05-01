import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { mcpBridge } from "../../mcp/mcpBridge";
import { loadExtensionsFromBundle, type RawExtensionsBundle } from "../../schemas/loadExtensions";
import { StepsTab } from "./StepsTab";
import { FieldTypesTab } from "./FieldTypesTab";
import { TriggersTab } from "./TriggersTab";
import { DbOperationsTab } from "./DbOperationsTab";
import { ResponseTypesTab } from "./ResponseTypesTab";
import { useDraftRegistry } from "../../hooks/useDraftRegistry";
import "../../styles/editMode.css";

export type ExtensionKind = "steps" | "fieldTypes" | "triggers" | "dbOperations" | "responseTypes";

export interface ExtensionTabProps {
  bundle: RawExtensionsBundle;
  saving: boolean;
  onSave: (kind: ExtensionKind, content: unknown) => Promise<void>;
}

const TABS: Array<{ key: ExtensionKind; label: string; icon: string }> = [
  { key: "steps", label: "ステップ型", icon: "bi-diagram-2" },
  { key: "fieldTypes", label: "フィールド型", icon: "bi-input-cursor-text" },
  { key: "triggers", label: "トリガー", icon: "bi-lightning-charge" },
  { key: "dbOperations", label: "DB 操作", icon: "bi-database-gear" },
  { key: "responseTypes", label: "レスポンス型", icon: "bi-braces" },
];

function isTabKey(value: string | null): value is ExtensionKind {
  return TABS.some((tab) => tab.key === value);
}

export function ExtensionsPanel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const [active, setActive] = useState<ExtensionKind>(isTabKey(requestedTab) ? requestedTab : "steps");
  const [bundle, setBundle] = useState<RawExtensionsBundle>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { hasDraft } = useDraftRegistry();

  const load = useCallback(async (forceReload = false) => {
    setLoading(true);
    const next = await mcpBridge.getExtensions(forceReload);
    setBundle(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    return mcpBridge.onExtensionsChanged(() => {
      void load(true);
    });
  }, [load]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (isTabKey(tab) && tab !== active) setActive(tab);
  }, [active, searchParams]);

  const setActiveTab = (key: ExtensionKind) => {
    setActive(key);
    setSearchParams({ tab: key });
  };

  const summary = useMemo(() => loadExtensionsFromBundle(bundle), [bundle]);

  const handleSave = async (kind: ExtensionKind, content: unknown) => {
    setSaving(true);
    setMessage(null);
    try {
      await mcpBridge.request("saveExtensionPackage", { type: kind, content });
      setMessage("保存しました。");
      await load(true);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const tabProps: ExtensionTabProps = { bundle, saving, onSave: handleSave };

  return (
    <div className="container-fluid py-3 extensions-panel">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h1 className="h5 mb-1">拡張管理</h1>
          <div className="text-muted small">
            data/extensions のステップ型・フィールド型・トリガー・DB 操作・レスポンス型を管理します。
          </div>
        </div>
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => void load(true)} disabled={loading || saving}>
          <i className="bi bi-arrow-clockwise me-1" />
          再読み込み
        </button>
      </div>

      {message ? <div className="alert alert-info py-2">{message}</div> : null}
      {summary.errors.length > 0 ? (
        <div className="alert alert-warning py-2">
          {summary.errors.map((issue, index) => (
            <div key={index}>{issue.message}</div>
          ))}
        </div>
      ) : null}

      <ul className="nav nav-tabs" role="tablist">
        {TABS.map((tab) => (
          <li className="nav-item" role="presentation" key={tab.key}>
            <button
              type="button"
              className={`nav-link${active === tab.key ? " active" : ""}`}
              role="tab"
              aria-selected={active === tab.key}
              onClick={() => setActiveTab(tab.key)}
            >
              <i className={`bi ${tab.icon} me-1`} />
              {tab.label}
              {hasDraft("extension", tab.key) && (
                <span className="list-item-draft-mark" title="未保存の編集中 draft があります">●</span>
              )}
            </button>
          </li>
        ))}
      </ul>

      <div className="border border-top-0 p-3 bg-white">
        {loading ? (
          <div className="text-muted">読み込み中...</div>
        ) : (
          <>
            {active === "steps" && <StepsTab {...tabProps} />}
            {active === "fieldTypes" && <FieldTypesTab {...tabProps} />}
            {active === "triggers" && <TriggersTab {...tabProps} />}
            {active === "dbOperations" && <DbOperationsTab {...tabProps} />}
            {active === "responseTypes" && <ResponseTypesTab {...tabProps} />}
          </>
        )}
      </div>
    </div>
  );
}
