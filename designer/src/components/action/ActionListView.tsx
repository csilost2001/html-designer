import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { ActionGroupMeta, ActionGroupType } from "../../types/action";
import { ACTION_GROUP_TYPE_LABELS, ACTION_GROUP_TYPE_ICONS } from "../../types/action";
import {
  listActionGroups,
  loadActionGroup,
  createActionGroup,
  deleteActionGroup,
} from "../../store/actionStore";
import { loadProject } from "../../store/flowStore";
import { validateActionGroup } from "../../utils/actionValidation";
import { mcpBridge } from "../../mcp/mcpBridge";
import { TableSubToolbar } from "../table/TableSubToolbar";
import { DataList, type DataListColumn } from "../common/DataList";
import { FilterBar } from "../common/FilterBar";
import { ViewModeToggle, type ViewMode } from "../common/ViewModeToggle";
import { useListSelection } from "../../hooks/useListSelection";
import { useListKeyboard } from "../../hooks/useListKeyboard";
import { useListFilter } from "../../hooks/useListFilter";
import { useListSort } from "../../hooks/useListSort";
import { usePersistentState } from "../../hooks/usePersistentState";
import "../../styles/action.css";

const ALL_TYPES: ActionGroupType[] = ["screen", "batch", "scheduled", "system", "common", "other"];
const STORAGE_KEY = "list-view-mode:process-flow-list";

interface ValidationSummary {
  errors: number;
  warnings: number;
}

export function ActionListView() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<ActionGroupMeta[]>([]);
  const [filterType, setFilterType] = useState<ActionGroupType | "all">("all");
  const [filterErrorsOnly, setFilterErrorsOnly] = useState(false);
  const [validationMap, setValidationMap] = useState<Map<string, ValidationSummary>>(new Map());
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addType, setAddType] = useState<ActionGroupType>("screen");
  const [addScreenId, setAddScreenId] = useState("");
  const [addDescription, setAddDescription] = useState("");
  const [screens, setScreens] = useState<{ id: string; name: string }[]>([]);
  const [viewMode, setViewMode] = usePersistentState<ViewMode>(STORAGE_KEY, "card");

  const reload = useCallback(async () => {
    const g = await listActionGroups();
    setGroups(g);
    const p = await loadProject();
    setScreens(p.screens.map((s) => ({ id: s.id, name: s.name })));
  }, []);

  useEffect(() => {
    mcpBridge.startWithoutEditor();
    reload();
    const unsub = mcpBridge.onStatusChange((s) => {
      if (s === "connected") reload();
    });
    return unsub;
  }, [reload]);

  // バックグラウンドでバリデーション実行
  useEffect(() => {
    if (groups.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const meta of groups) {
        if (cancelled) break;
        const group = await loadActionGroup(meta.id);
        if (!group || cancelled) continue;
        const errs = validateActionGroup(group);
        setValidationMap((prev) => {
          const next = new Map(prev);
          next.set(meta.id, {
            errors: errs.filter((e) => e.severity === "error").length,
            warnings: errs.filter((e) => e.severity === "warning").length,
          });
          return next;
        });
      }
    })();
    return () => { cancelled = true; };
  }, [groups]);

  const getErrorPriority = useCallback((id: string): number => {
    const v = validationMap.get(id);
    if (!v) return 0;
    if (v.errors > 0) return 2;
    if (v.warnings > 0) return 1;
    return 0;
  }, [validationMap]);

  const filter = useListFilter(groups);

  useEffect(() => {
    const hasTypeFilter = filterType !== "all";
    if (!hasTypeFilter && !filterErrorsOnly) {
      filter.applyFilter(null);
      return;
    }
    filter.applyFilter((g) => {
      if (hasTypeFilter && g.type !== filterType) return false;
      if (filterErrorsOnly && getErrorPriority(g.id) === 0) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, filterErrorsOnly, validationMap]);

  const sortAccessor = useCallback((g: ActionGroupMeta, key: string): string | number => {
    switch (key) {
      case "name": return g.name;
      case "type": return ACTION_GROUP_TYPE_LABELS[g.type as ActionGroupType] ?? g.type;
      case "actionCount": return g.actionCount;
      case "screenId": return g.screenId ? 1 : 0;
      case "errorPriority": return getErrorPriority(g.id);
      default: return "";
    }
  }, [getErrorPriority]);

  const sort = useListSort(filter.filtered, sortAccessor);
  const selection = useListSelection(sort.sorted, (g) => g.id);

  const handleActivate = useCallback((g: ActionGroupMeta) => {
    navigate(`/process-flow/edit/${g.id}`);
  }, [navigate]);

  const handleDelete = async (items: ActionGroupMeta[]) => {
    if (!confirm(`${items.length} 件の処理フロー定義を削除しますか？`)) return;
    for (const g of items) {
      await deleteActionGroup(g.id);
    }
    await reload();
    selection.clearSelection();
  };

  useListKeyboard({
    items: sort.sorted,
    getId: (g) => g.id,
    selection,
    layout: viewMode === "card" ? "grid" : "list",
    onActivate: handleActivate,
    onDelete: handleDelete,
  });

  const handleAdd = async () => {
    const name = addName.trim();
    if (!name) return;
    const group = await createActionGroup(
      name,
      addType,
      addType === "screen" && addScreenId ? addScreenId : undefined,
      addDescription.trim() || undefined,
    );
    setShowAdd(false);
    setAddName("");
    setAddType("screen");
    setAddScreenId("");
    setAddDescription("");
    navigate(`/process-flow/edit/${group.id}`);
  };

  const columns = useMemo<DataListColumn<ActionGroupMeta>[]>(() => [
    {
      key: "name",
      header: "名前",
      sortable: true,
      sortAccessor: (g) => g.name,
      render: (g) => <span className="action-list-name">{g.name}</span>,
    },
    {
      key: "type",
      header: "種別",
      width: "130px",
      sortable: true,
      sortAccessor: (g) => ACTION_GROUP_TYPE_LABELS[g.type as ActionGroupType] ?? g.type,
      render: (g) => (
        <span className={`action-group-type-badge ${g.type}`}>
          <i className={`${ACTION_GROUP_TYPE_ICONS[g.type as ActionGroupType] ?? "bi-three-dots"} me-1`} />
          {ACTION_GROUP_TYPE_LABELS[g.type as ActionGroupType] ?? g.type}
        </span>
      ),
    },
    {
      key: "actionCount",
      header: "アクション",
      width: "90px",
      align: "right",
      sortable: true,
      sortAccessor: (g) => g.actionCount,
      render: (g) => <span>{g.actionCount}</span>,
    },
    {
      key: "screenId",
      header: "画面紐付け",
      width: "110px",
      align: "center",
      sortable: true,
      sortAccessor: (g) => (g.screenId ? 1 : 0),
      render: (g) => g.screenId ? <i className="bi bi-display" title="画面紐付きあり" /> : null,
    },
    {
      key: "errorPriority",
      header: "検証",
      width: "100px",
      align: "center",
      sortable: true,
      sortAccessor: (g) => getErrorPriority(g.id),
      render: (g) => {
        const v = validationMap.get(g.id);
        if (!v) return null;
        if (v.errors > 0) return <span className="validation-badge error"><i className="bi bi-x-circle-fill" />{v.errors}</span>;
        if (v.warnings > 0) return <span className="validation-badge warning"><i className="bi bi-exclamation-triangle-fill" />{v.warnings}</span>;
        return <i className="bi bi-check-lg action-validation-ok" title="問題なし" />;
      },
    },
  ], [validationMap, getErrorPriority]);

  const renderCard = (g: ActionGroupMeta) => {
    const v = validationMap.get(g.id);
    const hasError = (v?.errors ?? 0) > 0;
    const hasWarning = (v?.warnings ?? 0) > 0;
    return (
      <div className={`action-card-content${hasError ? " has-error" : hasWarning ? " has-warning" : ""}`}>
        <div className="action-card-head">
          <span className={`action-group-type-badge ${g.type}`}>
            <i className={`${ACTION_GROUP_TYPE_ICONS[g.type as ActionGroupType] ?? "bi-three-dots"} me-1`} />
            {ACTION_GROUP_TYPE_LABELS[g.type as ActionGroupType] ?? g.type}
          </span>
          <span className="action-card-name">{g.name}</span>
          {v && (hasError || hasWarning) && (
            <span className="action-validation-badges">
              {hasError && <span className="validation-badge error"><i className="bi bi-x-circle-fill" />{v.errors}</span>}
              {hasWarning && <span className="validation-badge warning"><i className="bi bi-exclamation-triangle-fill" />{v.warnings}</span>}
            </span>
          )}
        </div>
        <div className="action-card-meta">
          <span><i className="bi bi-lightning me-1" />アクション: {g.actionCount}件</span>
          {g.screenId && <span><i className="bi bi-display me-1" />画面紐付き</span>}
        </div>
      </div>
    );
  };

  const typeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const g of groups) c[g.type] = (c[g.type] ?? 0) + 1;
    return c;
  }, [groups]);

  return (
    <div className="action-page">
      <TableSubToolbar />

      <div className="action-content">
        <div className="action-list-header">
          <h5><i className="bi bi-diagram-3 me-2" />処理フロー定義</h5>
          <div className="action-list-header-right">
            <ViewModeToggle mode={viewMode} onChange={setViewMode} storageKey={STORAGE_KEY} />
            <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
              <i className="bi bi-plus-lg me-1" />新規作成
            </button>
          </div>
        </div>

        {/* フィルタバー */}
        <div className="action-list-filters">
          <button
            className={`btn btn-sm ${filterType === "all" ? "btn-primary" : "btn-outline-secondary"}`}
            onClick={() => setFilterType("all")}
          >
            すべて ({groups.length})
          </button>
          {ALL_TYPES.map((t) => {
            const count = typeCounts[t] ?? 0;
            if (count === 0) return null;
            return (
              <button
                key={t}
                className={`btn btn-sm ${filterType === t ? "btn-primary" : "btn-outline-secondary"}`}
                onClick={() => setFilterType(t)}
              >
                {ACTION_GROUP_TYPE_LABELS[t]} ({count})
              </button>
            );
          })}

          <div className="action-list-filter-sep" />

          <label className="action-list-check-label">
            <input
              type="checkbox"
              checked={filterErrorsOnly}
              onChange={(e) => setFilterErrorsOnly(e.target.checked)}
            />
            エラーありのみ
          </label>
        </div>

        <FilterBar
          isActive={filter.isActive}
          totalCount={filter.totalCount}
          visibleCount={filter.visibleCount}
          label={
            filterType !== "all"
              ? `種別: ${ACTION_GROUP_TYPE_LABELS[filterType]}${filterErrorsOnly ? " + エラーあり" : ""}`
              : filterErrorsOnly ? "エラーあり" : undefined
          }
          onClear={() => { setFilterType("all"); setFilterErrorsOnly(false); }}
        />

        <DataList
          items={sort.sorted}
          columns={columns}
          getId={(g) => g.id}
          selection={selection}
          sort={sort}
          onActivate={handleActivate}
          layout={viewMode === "card" ? "grid" : "list"}
          renderCard={renderCard}
          showNumColumn={viewMode === "table"}
          className="action-data-list"
          emptyMessage={
            groups.length === 0
              ? <p>処理フロー定義がまだありません。「新規作成」から追加してください。</p>
              : <p>該当する処理フロー定義がありません。</p>
          }
        />
      </div>

      {/* 新規作成モーダル */}
      {showAdd && (
        <div className="action-modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="action-modal" onClick={(e) => e.stopPropagation()}>
            <h6>処理フロー定義の新規作成</h6>
            <div className="form-group">
              <label className="form-label">名前 *</label>
              <input
                className="form-control form-control-sm"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="例: ログイン画面、月次集計バッチ"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">種別 *</label>
              <select
                className="form-select form-select-sm"
                value={addType}
                onChange={(e) => setAddType(e.target.value as ActionGroupType)}
              >
                {ALL_TYPES.map((t) => (
                  <option key={t} value={t}>{ACTION_GROUP_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            {addType === "screen" && (
              <div className="form-group">
                <label className="form-label">紐付け画面</label>
                <select
                  className="form-select form-select-sm"
                  value={addScreenId}
                  onChange={(e) => setAddScreenId(e.target.value)}
                >
                  <option value="">（なし）</option>
                  {screens.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">説明</label>
              <textarea
                className="form-control form-control-sm"
                rows={2}
                value={addDescription}
                onChange={(e) => setAddDescription(e.target.value)}
                placeholder="処理フローの概要"
              />
            </div>
            <div className="action-modal-footer">
              <button className="btn btn-outline-secondary btn-sm" onClick={() => setShowAdd(false)}>
                キャンセル
              </button>
              <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={!addName.trim()}>
                作成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
