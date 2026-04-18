import { useState, useEffect, useCallback, useRef } from "react";
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
import "../../styles/action.css";

const ALL_TYPES: ActionGroupType[] = ["screen", "batch", "scheduled", "system", "common", "other"];

interface ValidationSummary {
  errors: number;
  warnings: number;
}

export function ActionListView() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<ActionGroupMeta[]>([]);
  const [filterType, setFilterType] = useState<ActionGroupType | "all">("all");
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addType, setAddType] = useState<ActionGroupType>("screen");
  const [addScreenId, setAddScreenId] = useState("");
  const [addDescription, setAddDescription] = useState("");
  const [screens, setScreens] = useState<{ id: string; name: string }[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortByErrors, setSortByErrors] = useState(false);
  const [filterErrorsOnly, setFilterErrorsOnly] = useState(false);
  const [validationMap, setValidationMap] = useState<Map<string, ValidationSummary>>(new Map());
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("この処理フロー定義を削除しますか？")) return;
    await deleteActionGroup(id);
    await reload();
  };

  // シングルクリック: 選択、ダブルクリック: 編集画面へ
  const handleCardClick = (id: string) => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      navigate(`/process-flow/edit/${id}`);
    } else {
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null;
        setSelectedId((prev) => (prev === id ? null : id));
      }, 250);
    }
  };

  const getErrorPriority = (id: string): number => {
    const v = validationMap.get(id);
    if (!v) return 0;
    if (v.errors > 0) return 2;
    if (v.warnings > 0) return 1;
    return 0;
  };

  let displayed = filterType === "all" ? groups : groups.filter((g) => g.type === filterType);
  if (filterErrorsOnly) {
    displayed = displayed.filter((g) => getErrorPriority(g.id) > 0);
  }
  if (sortByErrors) {
    displayed = [...displayed].sort((a, b) => getErrorPriority(b.id) - getErrorPriority(a.id));
  }

  return (
    <div className="action-page" onClick={() => setSelectedId(null)}>
      <TableSubToolbar />

      <div className="action-content">
        <div className="action-list-header">
          <h5><i className="bi bi-diagram-3 me-2" />処理フロー定義</h5>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
            <i className="bi bi-plus-lg me-1" />新規作成
          </button>
        </div>

        {/* フィルタ・ソートバー */}
        <div className="action-list-filters">
          <button
            className={`btn btn-sm ${filterType === "all" ? "btn-primary" : "btn-outline-secondary"}`}
            onClick={() => setFilterType("all")}
          >
            すべて ({groups.length})
          </button>
          {ALL_TYPES.map((t) => {
            const count = groups.filter((g) => g.type === t).length;
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

          <button
            className={`btn btn-sm ${sortByErrors ? "btn-warning" : "btn-outline-secondary"}`}
            onClick={() => setSortByErrors(!sortByErrors)}
            title="エラーあり優先でソート"
          >
            <i className="bi bi-sort-down me-1" />
            エラー優先
          </button>
        </div>

        {displayed.length === 0 ? (
          <div className="step-empty">
            <i className="bi bi-diagram-3" />
            {groups.length === 0
              ? "処理フロー定義がまだありません。「新規作成」から追加してください。"
              : "該当する処理フロー定義がありません。"}
          </div>
        ) : (
          <div className="action-list-grid">
            {displayed.map((g) => {
              const v = validationMap.get(g.id);
              const hasError = (v?.errors ?? 0) > 0;
              const hasWarning = (v?.warnings ?? 0) > 0;
              const cardClass = [
                "action-group-card",
                selectedId === g.id ? "selected" : "",
                hasError ? "has-error" : hasWarning ? "has-warning" : "",
              ].filter(Boolean).join(" ");

              return (
                <div
                  key={g.id}
                  className={cardClass}
                  onClick={(e) => { e.stopPropagation(); handleCardClick(g.id); }}
                >
                  <div className="action-group-card-header">
                    <span className={`action-group-type-badge ${g.type}`}>
                      <i className={`${ACTION_GROUP_TYPE_ICONS[g.type as ActionGroupType] ?? "bi-three-dots"} me-1`} />
                      {ACTION_GROUP_TYPE_LABELS[g.type as ActionGroupType] ?? g.type}
                    </span>
                    <span className="action-group-card-name">{g.name}</span>
                    {/* バリデーションバッジ */}
                    {v && (hasError || hasWarning) && (
                      <span
                        className="action-validation-badges"
                        onClick={(e) => { e.stopPropagation(); navigate(`/process-flow/edit/${g.id}`); }}
                        title="編集画面でエラーを確認"
                      >
                        {hasError && (
                          <span className="validation-badge error">
                            <i className="bi bi-x-circle-fill" />{v.errors}
                          </span>
                        )}
                        {hasWarning && (
                          <span className="validation-badge warning">
                            <i className="bi bi-exclamation-triangle-fill" />{v.warnings}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  <div className="action-group-card-meta">
                    <span>
                      <i className="bi bi-lightning me-1" />
                      アクション: {g.actionCount}件
                    </span>
                    {g.screenId && (
                      <span>
                        <i className="bi bi-display me-1" />
                        画面紐付き
                      </span>
                    )}
                  </div>
                  <div className="action-group-card-actions">
                    <button
                      className="btn btn-outline-danger btn-sm py-0 px-2"
                      onClick={(e) => handleDelete(g.id, e)}
                      title="削除"
                    >
                      <i className="bi bi-trash" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
