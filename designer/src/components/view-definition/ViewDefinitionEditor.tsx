/**
 * ViewDefinitionEditor — ビュー定義編集画面 (#666 S5)
 *
 * 5 セクション構成:
 *  1. 基本情報 (id / name / physicalName / description / kind / sourceTableId)
 *  2. columns 編集テーブル (TableEditor のカラム編集パターンを参考)
 *  3. sortDefaults 編集テーブル
 *  4. filterDefaults 編集テーブル
 *  5. その他 (pageSize / groupBy)
 *
 * リアルタイム validator: checkViewDefinition() の結果を各フィールドの隣に inline 表示。
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type {
  ViewDefinition,
  ViewColumn,
  SortSpec,
  FilterSpec,
  FilterOperator,
  BuiltinViewDefinitionKind,
} from "../../types/v3/view-definition";
import type { Table, TableEntry, Maturity, Identifier, FieldType, FieldTypePrimitive } from "../../types/v3";
import type { TableId, LocalId } from "../../types/v3/common";
import { loadViewDefinition, saveViewDefinition } from "../../store/viewDefinitionStore";
import { listTables, loadTable } from "../../store/tableStore";
import { mcpBridge } from "../../mcp/mcpBridge";
import { useResourceEditor } from "../../hooks/useResourceEditor";
import { useSaveShortcut } from "../../hooks/useSaveShortcut";
import { EditorHeader, type EditorHeaderSaveReset, type EditorHeaderBackLink, type EditorHeaderUndoRedo } from "../common/EditorHeader";
import { ServerChangeBanner } from "../common/ServerChangeBanner";
import { MaturityBadge } from "../process-flow/MaturityBadge";
import { ValidationBadge } from "../common/ValidationBadge";
import { checkViewDefinition, type ViewDefinitionIssue, type TableDefinitionForView } from "../../schemas/viewDefinitionValidator";
import "../../styles/table.css";

// ─── FieldType primitives available for display ──────────────────────────────

const FIELD_TYPE_OPTIONS: FieldTypePrimitive[] = [
  "string", "integer", "number", "boolean", "date", "datetime", "json",
];

// ─── FilterOperator options ───────────────────────────────────────────────────

const FILTER_OPERATORS: FilterOperator[] = [
  "eq", "neq", "gt", "gte", "lt", "lte",
  "contains", "startsWith", "in", "between",
];

// ─── BuiltinViewDefinitionKind labels ────────────────────────────────────────

const KIND_LABELS: Record<BuiltinViewDefinitionKind, string> = {
  list: "list — 一覧",
  detail: "detail — 詳細",
  kanban: "kanban — カンバン",
  calendar: "calendar — カレンダー",
};

// ─── useTablesForValidator hook ───────────────────────────────────────────────

function useTablesForValidator(): TableDefinitionForView[] {
  const [tables, setTables] = useState<TableDefinitionForView[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await listTables();
      const all = await Promise.all(entries.map((e: TableEntry) => loadTable(e.id)));
      const valid = all.filter((t): t is Table => t !== null);
      if (!cancelled) {
        // Table is shape-compatible with TableDefinitionForView (id / name / physicalName / columns)
        setTables(valid as unknown as TableDefinitionForView[]);
      }
    })().catch(console.error);
    return () => { cancelled = true; };
  }, []);
  return tables;
}

// ─── TableOption ─────────────────────────────────────────────────────────────

interface TableOption {
  id: string;
  name: string;
  columns: Array<{ id: string; name: string; physicalName: string }>;
}

function useTableOptions(): TableOption[] {
  const [options, setOptions] = useState<TableOption[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await listTables();
      const tables = await Promise.all(entries.map((e: TableEntry) => loadTable(e.id)));
      if (!cancelled) {
        setOptions(
          tables
            .filter((t): t is Table => t !== null)
            .map((t) => ({
              id: t.id,
              name: t.name ?? t.physicalName ?? t.id,
              columns: (t.columns ?? []).map((c) => ({
                id: c.id,
                name: c.name ?? c.physicalName ?? c.id,
                physicalName: c.physicalName ?? c.id,
              })),
            })),
        );
      }
    })().catch(console.error);
    return () => { cancelled = true; };
  }, []);
  return options;
}

// ─── Inline issue display helper ─────────────────────────────────────────────

function IssueHints({ issues }: { issues: ViewDefinitionIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <div className="vd-editor-issue-hints">
      {issues.map((iss, i) => (
        <small
          key={i}
          className={`vd-editor-issue vd-editor-issue--${iss.severity}`}
          title={iss.code}
        >
          <i className={`bi ${iss.severity === "error" ? "bi-x-circle-fill" : "bi-exclamation-triangle-fill"}`} />
          {" "}{iss.message}
        </small>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ViewDefinitionEditor() {
  const { viewDefinitionId: rawId } = useParams<{ viewDefinitionId: string }>();
  const viewDefinitionId = rawId ? decodeURIComponent(rawId) : rawId;
  const navigate = useNavigate();

  // テーブル選択 state (tableColumnRef 用カスケード)
  // key: column index → 選択中のテーブル ID (cascade step 1)
  const [colRefTableIds, setColRefTableIds] = useState<Record<number, string>>({});

  // kind: 拡張参照モード (builtin 以外の場合は true で初期化)
  const [kindExtMode, setKindExtMode] = useState(false);

  const handleNotFound = useCallback(() => navigate("/view-definition/list"), [navigate]);

  // onLoaded: viewDefinition 読み込み時に UI state を初期化 (useEffect の代わり)
  const handleLoaded = useCallback((vd: ViewDefinition) => {
    const builtin = ["list", "detail", "kanban", "calendar"];
    setKindExtMode(!builtin.includes(vd.kind));
    const nextIds: Record<number, string> = {};
    (vd.columns ?? []).forEach((col, i) => {
      nextIds[i] = (col.tableColumnRef?.tableId as string) || (vd.sourceTableId as string);
    });
    setColRefTableIds(nextIds);
  }, []);

  const {
    state: viewDefinition,
    isDirty, isSaving, serverChanged,
    update, updateSilent, commit, handleSave, handleReset, dismissServerBanner,
    undo, redo, canUndo, canRedo,
  } = useResourceEditor<ViewDefinition>({
    tabType: "view-definition",
    mtimeKind: "viewDefinition",
    draftKind: "view-definition",
    id: viewDefinitionId,
    load: loadViewDefinition,
    save: saveViewDefinition,
    broadcastName: "viewDefinitionChanged",
    broadcastIdField: "viewDefinitionId",
    onNotFound: handleNotFound,
    onLoaded: handleLoaded,
  });

  useSaveShortcut(() => {
    if (isDirty && !isSaving) handleSave();
  });

  useEffect(() => {
    mcpBridge.startWithoutEditor();
  }, [viewDefinitionId]);

  // テーブル一覧 (validator 用 & tableColumnRef 選択用)
  const tables = useTablesForValidator();
  const tableOptions = useTableOptions();


  // リアルタイム validator
  const issues = useMemo<ViewDefinitionIssue[]>(() => {
    if (!viewDefinition) return [];
    return checkViewDefinition(viewDefinition, tables);
  }, [viewDefinition, tables]);

  const issuesByPath = useMemo<Map<string, ViewDefinitionIssue[]>>(() => {
    const map = new Map<string, ViewDefinitionIssue[]>();
    for (const issue of issues) {
      const list = map.get(issue.path) ?? [];
      list.push(issue);
      map.set(issue.path, list);
    }
    return map;
  }, [issues]);

  // issue 集計
  const errorCount = useMemo(() => issues.filter((i) => i.severity === "error").length, [issues]);
  const warningCount = useMemo(() => issues.filter((i) => i.severity === "warning").length, [issues]);

  // path ヘルパー
  const vdId = viewDefinition?.id ?? "";

  function colPath(ci: number, colName: string, field?: string): string {
    const base = `ViewDefinition[${vdId}].columns[${ci}=${colName}]`;
    return field ? `${base}.${field}` : base;
  }

  function sortPath(si: number, field?: string): string {
    const base = `ViewDefinition[${vdId}].sortDefaults[${si}].columnName`;
    return field ? `ViewDefinition[${vdId}].sortDefaults[${si}].${field}` : base;
  }

  function filterPath(fi: number, field: string): string {
    return `ViewDefinition[${vdId}].filterDefaults[${fi}].${field}`;
  }

  function getIssues(path: string): ViewDefinitionIssue[] {
    return issuesByPath.get(path) ?? [];
  }

  // ─── 読み込み中 ────────────────────────────────────────────────────────────
  if (!viewDefinition) {
    return (
      <div className="table-editor-loading">
        <i className="bi bi-hourglass-split" /> 読み込み中...
      </div>
    );
  }

  const columnNames = (viewDefinition.columns ?? []).map((c) => c.name as string);

  // ─── columns 操作 ──────────────────────────────────────────────────────────

  const addColumn = () => {
    const newCol: ViewColumn = {
      name: "" as Identifier,
      tableColumnRef: {
        tableId: viewDefinition.sourceTableId as TableId,
        columnId: "" as LocalId,
      },
      type: "string" as FieldTypePrimitive,
    };
    update((d) => { d.columns = [...(d.columns ?? []), newCol]; });
    setColRefTableIds((prev) => ({
      ...prev,
      [viewDefinition.columns.length]: viewDefinition.sourceTableId,
    }));
  };

  const removeColumn = (ci: number) => {
    update((d) => { d.columns = d.columns.filter((_, i) => i !== ci); });
    setColRefTableIds((prev) => {
      const next: Record<number, string> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const idx = Number(k);
        if (idx < ci) next[idx] = v;
        else if (idx > ci) next[idx - 1] = v;
      });
      return next;
    });
  };

  const moveColumn = (ci: number, direction: "up" | "down") => {
    const cols = [...(viewDefinition.columns ?? [])];
    const target = direction === "up" ? ci - 1 : ci + 1;
    if (target < 0 || target >= cols.length) return;
    update((d) => {
      const tmp = d.columns[ci];
      d.columns[ci] = d.columns[target];
      d.columns[target] = tmp;
    });
    setColRefTableIds((prev) => {
      const next = { ...prev };
      const tmp = next[ci];
      next[ci] = next[target] ?? "";
      next[target] = tmp ?? "";
      return next;
    });
  };

  const updateColumn = <K extends keyof ViewColumn>(ci: number, field: K, value: ViewColumn[K]) => {
    update((d) => {
      d.columns[ci] = { ...d.columns[ci], [field]: value };
    });
  };

  // tableColumnRef カスケード: テーブル選択
  const setColRefTable = (ci: number, tableId: string) => {
    setColRefTableIds((prev) => ({ ...prev, [ci]: tableId }));
    update((d) => {
      d.columns[ci] = {
        ...d.columns[ci],
        tableColumnRef: { tableId: tableId as TableId, columnId: "" as LocalId },
      };
    });
  };

  // tableColumnRef カスケード: カラム選択
  const setColRefColumn = (ci: number, columnId: string) => {
    const tableId = colRefTableIds[ci] ?? viewDefinition.sourceTableId;
    update((d) => {
      d.columns[ci] = {
        ...d.columns[ci],
        tableColumnRef: { tableId: tableId as TableId, columnId: columnId as LocalId },
      };
    });
  };

  // ─── sortDefaults 操作 ─────────────────────────────────────────────────────

  const addSortSpec = () => {
    const spec: SortSpec = { columnName: "" as Identifier, order: "asc" };
    update((d) => { d.sortDefaults = [...(d.sortDefaults ?? []), spec]; });
  };

  const removeSortSpec = (si: number) => {
    update((d) => { d.sortDefaults = (d.sortDefaults ?? []).filter((_, i) => i !== si); });
  };

  const updateSortSpec = <K extends keyof SortSpec>(si: number, field: K, value: SortSpec[K]) => {
    update((d) => {
      const specs = d.sortDefaults ?? [];
      specs[si] = { ...specs[si], [field]: value };
      d.sortDefaults = specs;
    });
  };

  // ─── filterDefaults 操作 ───────────────────────────────────────────────────

  const addFilterSpec = () => {
    const spec: FilterSpec = { columnName: "" as Identifier, operator: "eq" };
    update((d) => { d.filterDefaults = [...(d.filterDefaults ?? []), spec]; });
  };

  const removeFilterSpec = (fi: number) => {
    update((d) => { d.filterDefaults = (d.filterDefaults ?? []).filter((_, i) => i !== fi); });
  };

  const updateFilterSpec = <K extends keyof FilterSpec>(fi: number, field: K, value: FilterSpec[K]) => {
    update((d) => {
      const specs = d.filterDefaults ?? [];
      specs[fi] = { ...specs[fi], [field]: value };
      d.filterDefaults = specs;
    });
  };

  const isBuiltinKind = (k: string): k is BuiltinViewDefinitionKind =>
    ["list", "detail", "kanban", "calendar"].includes(k);

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <div className="table-editor-page">
      {serverChanged && (
        <ServerChangeBanner onReload={handleReset} onDismiss={dismissServerBanner} />
      )}

      <EditorHeader
        title={
          <>
            <i className="bi bi-layout-text-window" /> ビュー定義編集:{" "}
            <code>{viewDefinition.name || viewDefinition.id}</code>
          </>
        }
        backLink={{
          label: "ビュー定義一覧",
          onClick: () => navigate("/view-definition/list"),
        } satisfies EditorHeaderBackLink}
        undoRedo={{
          onUndo: undo,
          onRedo: redo,
          canUndo,
          canRedo,
        } satisfies EditorHeaderUndoRedo}
        saveReset={{
          isDirty,
          isSaving,
          onSave: handleSave,
          onReset: handleReset,
          resetConfirmMessage: "未保存の変更を破棄してサーバの状態に戻しますか？",
        } satisfies EditorHeaderSaveReset}
      />

      {/* 検証サマリーバー */}
      {(errorCount > 0 || warningCount > 0) && (
        <div className="vd-editor-issue-bar">
          {errorCount > 0 && (
            <ValidationBadge severity="error" count={errorCount} />
          )}
          {warningCount > 0 && (
            <ValidationBadge severity="warning" count={warningCount} />
          )}
          <span className="vd-editor-issue-bar-label">
            検証問題が検出されました。下記の各フィールドを確認してください。
          </span>
        </div>
      )}

      <div className="seq-editor-body">
        <div className="seq-editor-left-col">

          {/* ───── Section 1: 基本情報 ────────────────────────────────────── */}
          <section className="seq-editor-section">
            <h3 className="seq-editor-section-title">基本情報</h3>
            <div className="seq-editor-grid">

              {/* ID (read-only) */}
              <label className="tbl-field">
                <span>ID</span>
                <input
                  type="text"
                  value={viewDefinition.id}
                  readOnly
                  className="seq-readonly"
                  title="ID は変更できません"
                />
              </label>

              {/* 表示名 */}
              <label className="tbl-field">
                <span>表示名 <span className="vd-editor-required">*</span></span>
                <input
                  type="text"
                  value={viewDefinition.name}
                  onChange={(e) => updateSilent((d) => { d.name = e.target.value as ViewDefinition["name"]; })}
                  onBlur={commit}
                  placeholder="顧客一覧"
                />
              </label>

              {/* 説明 */}
              <label className="tbl-field">
                <span>説明</span>
                <textarea
                  value={viewDefinition.description ?? ""}
                  onChange={(e) => updateSilent((d) => {
                    d.description = e.target.value || undefined;
                  })}
                  onBlur={commit}
                  rows={2}
                  placeholder="このビュー定義の用途を記述..."
                />
              </label>

              {/* viewer 種別 */}
              <div className="tbl-field">
                <span>viewer 種別 <span className="vd-editor-required">*</span></span>
                <div className="vd-editor-kind-row">
                  {!kindExtMode ? (
                    <select
                      value={isBuiltinKind(viewDefinition.kind) ? viewDefinition.kind : "list"}
                      onChange={(e) => update((d) => { d.kind = e.target.value; })}
                    >
                      {(Object.entries(KIND_LABELS) as [BuiltinViewDefinitionKind, string][]).map(([v, label]) => (
                        <option key={v} value={v}>{label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={viewDefinition.kind}
                      onChange={(e) => updateSilent((d) => { d.kind = e.target.value; })}
                      onBlur={commit}
                      placeholder="namespace:kindName (例: retail:storefront)"
                    />
                  )}
                  <button
                    type="button"
                    className="tbl-btn tbl-btn-ghost tbl-btn-sm"
                    onClick={() => {
                      setKindExtMode((v) => !v);
                      if (kindExtMode) {
                        update((d) => { d.kind = "list"; });
                      }
                    }}
                    title={kindExtMode ? "組み込み種別に戻す" : "拡張参照を入力"}
                  >
                    {kindExtMode ? "組み込みに戻す" : "拡張参照"}
                  </button>
                </div>
              </div>

              {/* ソーステーブル */}
              <div className="tbl-field">
                <span>ソーステーブル <span className="vd-editor-required">*</span></span>
                <select
                  value={viewDefinition.sourceTableId}
                  onChange={(e) => update((d) => { d.sourceTableId = e.target.value as TableId; })}
                  className={getIssues(`ViewDefinition[${vdId}].sourceTableId`).length > 0 ? "input-error" : undefined}
                >
                  <option value="">— テーブルを選択 —</option>
                  {tableOptions.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <IssueHints issues={getIssues(`ViewDefinition[${vdId}].sourceTableId`)} />
              </div>

              {/* 成熟度 */}
              <label className="tbl-field">
                <span>成熟度</span>
                <div className="vd-editor-maturity-row">
                  <MaturityBadge
                    maturity={viewDefinition.maturity}
                    size="md"
                    onChange={(m: Maturity) => update((d) => { d.maturity = m; })}
                  />
                  <span className="vd-editor-maturity-label">
                    {viewDefinition.maturity ?? "draft"}
                  </span>
                </div>
              </label>

            </div>
          </section>

          {/* ───── Section 2: columns 編集 ────────────────────────────────── */}
          <section className="seq-editor-section">
            <h3 className="seq-editor-section-title">
              カラム定義
              <span className="vd-editor-col-count">
                ({(viewDefinition.columns ?? []).length} 件)
              </span>
            </h3>

            <div className="vd-editor-columns-table-wrap">
              <table className="vd-editor-columns-table">
                <thead>
                  <tr>
                    <th>name <span className="vd-editor-required">*</span></th>
                    <th>参照テーブル</th>
                    <th>参照カラム</th>
                    <th>表示名</th>
                    <th>type <span className="vd-editor-required">*</span></th>
                    <th>書式</th>
                    <th>幅</th>
                    <th>align</th>
                    <th title="ソート可能">sort</th>
                    <th title="フィルタ可能">filter</th>
                    <th>linkTo</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewDefinition.columns ?? []).map((col, ci) => {
                    const colName = col.name as string;
                    const refTableId = colRefTableIds[ci] ?? col.tableColumnRef?.tableId ?? viewDefinition.sourceTableId;
                    const colOptions = tableOptions.find((t) => t.id === refTableId)?.columns ?? [];
                    const basePath = colPath(ci, colName);
                    const colIssues = [
                      ...getIssues(basePath),
                      ...getIssues(`${basePath}.tableColumnRef`),
                      ...getIssues(`${basePath}.type`),
                    ];

                    return (
                      <tr key={ci} className={colIssues.some((i) => i.severity === "error") ? "vd-col-row--error" : colIssues.some((i) => i.severity === "warning") ? "vd-col-row--warning" : undefined}>
                        {/* name */}
                        <td>
                          <input
                            type="text"
                            value={col.name as string}
                            onChange={(e) => updateSilent((d) => {
                              d.columns[ci] = { ...d.columns[ci], name: e.target.value as Identifier };
                            })}
                            onBlur={commit}
                            placeholder="columnName"
                            className="vd-col-input-sm"
                            title="camelCase 識別子"
                          />
                        </td>
                        {/* 参照テーブル (cascade step 1) */}
                        <td>
                          <select
                            value={refTableId}
                            onChange={(e) => setColRefTable(ci, e.target.value)}
                            className="vd-col-select"
                          >
                            <option value="">— テーブル —</option>
                            {tableOptions.map((t) => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        </td>
                        {/* 参照カラム (cascade step 2) */}
                        <td>
                          <select
                            value={col.tableColumnRef?.columnId ?? ""}
                            onChange={(e) => setColRefColumn(ci, e.target.value)}
                            className="vd-col-select"
                            disabled={!refTableId}
                          >
                            <option value="">— カラム —</option>
                            {colOptions.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </td>
                        {/* displayName */}
                        <td>
                          <input
                            type="text"
                            value={col.displayName ?? ""}
                            onChange={(e) => updateSilent((d) => {
                              d.columns[ci] = {
                                ...d.columns[ci],
                                displayName: (e.target.value || undefined) as ViewColumn["displayName"],
                              };
                            })}
                            onBlur={commit}
                            placeholder="表示名"
                            className="vd-col-input-sm"
                          />
                        </td>
                        {/* type */}
                        <td>
                          <select
                            value={typeof col.type === "string" ? col.type : "string"}
                            onChange={(e) => updateColumn(ci, "type", e.target.value as FieldType)}
                            className="vd-col-select"
                          >
                            {FIELD_TYPE_OPTIONS.map((ft) => (
                              <option key={ft} value={ft}>{ft}</option>
                            ))}
                          </select>
                        </td>
                        {/* displayFormat */}
                        <td>
                          <input
                            type="text"
                            value={col.displayFormat ?? ""}
                            onChange={(e) => updateSilent((d) => {
                              d.columns[ci] = { ...d.columns[ci], displayFormat: e.target.value || undefined };
                            })}
                            onBlur={commit}
                            placeholder="#,##0"
                            className="vd-col-input-xs"
                          />
                        </td>
                        {/* width */}
                        <td>
                          <input
                            type="text"
                            value={col.width ?? ""}
                            onChange={(e) => updateSilent((d) => {
                              d.columns[ci] = { ...d.columns[ci], width: e.target.value || undefined };
                            })}
                            onBlur={commit}
                            placeholder="120px"
                            className="vd-col-input-xs"
                          />
                        </td>
                        {/* align */}
                        <td>
                          <select
                            value={col.align ?? ""}
                            onChange={(e) => update((d) => {
                              d.columns[ci] = {
                                ...d.columns[ci],
                                align: (e.target.value || undefined) as ViewColumn["align"],
                              };
                            })}
                            className="vd-col-select-xs"
                          >
                            <option value="">—</option>
                            <option value="left">left</option>
                            <option value="center">center</option>
                            <option value="right">right</option>
                          </select>
                        </td>
                        {/* sortable */}
                        <td className="vd-col-center">
                          <input
                            type="checkbox"
                            checked={col.sortable ?? false}
                            onChange={(e) => update((d) => {
                              d.columns[ci] = { ...d.columns[ci], sortable: e.target.checked || undefined };
                            })}
                          />
                        </td>
                        {/* filterable */}
                        <td className="vd-col-center">
                          <input
                            type="checkbox"
                            checked={col.filterable ?? false}
                            onChange={(e) => update((d) => {
                              d.columns[ci] = { ...d.columns[ci], filterable: e.target.checked || undefined };
                            })}
                          />
                        </td>
                        {/* linkTo */}
                        <td>
                          <input
                            type="text"
                            value={col.linkTo ?? ""}
                            onChange={(e) => updateSilent((d) => {
                              d.columns[ci] = { ...d.columns[ci], linkTo: e.target.value || undefined };
                            })}
                            onBlur={commit}
                            placeholder="/orders/:id"
                            className="vd-col-input-sm"
                          />
                        </td>
                        {/* 操作 */}
                        <td className="vd-col-ops">
                          <button
                            type="button"
                            className="tbl-btn-icon"
                            onClick={() => moveColumn(ci, "up")}
                            disabled={ci === 0}
                            title="上に移動"
                          >
                            <i className="bi bi-arrow-up" />
                          </button>
                          <button
                            type="button"
                            className="tbl-btn-icon"
                            onClick={() => moveColumn(ci, "down")}
                            disabled={ci === (viewDefinition.columns?.length ?? 0) - 1}
                            title="下に移動"
                          >
                            <i className="bi bi-arrow-down" />
                          </button>
                          <button
                            type="button"
                            className="tbl-btn-icon danger"
                            onClick={() => removeColumn(ci)}
                            title="削除"
                          >
                            <i className="bi bi-trash" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 列ごとの issue 表示 */}
            {(viewDefinition.columns ?? []).map((col, ci) => {
              const colName = col.name as string;
              const basePath = colPath(ci, colName);
              const colIssues = [
                ...getIssues(basePath),
                ...getIssues(`${basePath}.tableColumnRef`),
                ...getIssues(`${basePath}.type`),
              ];
              if (colIssues.length === 0) return null;
              return (
                <div key={ci} className="vd-editor-col-issues">
                  <span className="vd-editor-col-issues-label">
                    カラム {ci + 1} ({colName || "未設定"}):
                  </span>
                  <IssueHints issues={colIssues} />
                </div>
              );
            })}

            <button
              type="button"
              className="tbl-btn tbl-btn-ghost vd-editor-add-row-btn"
              onClick={addColumn}
            >
              <i className="bi bi-plus-lg" /> カラム追加
            </button>
          </section>

          {/* ───── Section 3: sortDefaults ────────────────────────────────── */}
          <section className="seq-editor-section">
            <h3 className="seq-editor-section-title">
              既定ソート順
              <span className="vd-editor-col-count">({(viewDefinition.sortDefaults ?? []).length} 件)</span>
            </h3>

            {(viewDefinition.sortDefaults ?? []).length > 0 && (
              <table className="vd-editor-sub-table">
                <thead>
                  <tr>
                    <th>カラム名</th>
                    <th>順序</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewDefinition.sortDefaults ?? []).map((spec, si) => {
                    const siIssues = getIssues(sortPath(si));
                    return (
                      <tr key={si} className={siIssues.some((i) => i.severity === "error") ? "vd-col-row--error" : undefined}>
                        <td>
                          <select
                            value={spec.columnName as string}
                            onChange={(e) => updateSortSpec(si, "columnName", e.target.value as Identifier)}
                            className={siIssues.length > 0 ? "input-error" : undefined}
                          >
                            <option value="">— カラムを選択 —</option>
                            {columnNames.map((cn) => (
                              <option key={cn} value={cn}>{cn}</option>
                            ))}
                          </select>
                          <IssueHints issues={siIssues} />
                        </td>
                        <td>
                          <select
                            value={spec.order}
                            onChange={(e) => updateSortSpec(si, "order", e.target.value as "asc" | "desc")}
                          >
                            <option value="asc">asc (昇順)</option>
                            <option value="desc">desc (降順)</option>
                          </select>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="tbl-btn-icon danger"
                            onClick={() => removeSortSpec(si)}
                            title="削除"
                          >
                            <i className="bi bi-trash" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            <button
              type="button"
              className="tbl-btn tbl-btn-ghost vd-editor-add-row-btn"
              onClick={addSortSpec}
            >
              <i className="bi bi-plus-lg" /> ソート条件追加
            </button>
          </section>

          {/* ───── Section 4: filterDefaults ─────────────────────────────── */}
          <section className="seq-editor-section">
            <h3 className="seq-editor-section-title">
              初期フィルタ
              <span className="vd-editor-col-count">({(viewDefinition.filterDefaults ?? []).length} 件)</span>
            </h3>

            {(viewDefinition.filterDefaults ?? []).length > 0 && (
              <table className="vd-editor-sub-table">
                <thead>
                  <tr>
                    <th>カラム名</th>
                    <th>演算子</th>
                    <th>値</th>
                    <th>値 (式)</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewDefinition.filterDefaults ?? []).map((spec, fi) => {
                    const colIssues = getIssues(filterPath(fi, "columnName"));
                    const opIssues = getIssues(filterPath(fi, "operator"));
                    return (
                      <tr
                        key={fi}
                        className={
                          [...colIssues, ...opIssues].some((i) => i.severity === "error")
                            ? "vd-col-row--error"
                            : [...colIssues, ...opIssues].some((i) => i.severity === "warning")
                              ? "vd-col-row--warning"
                              : undefined
                        }
                      >
                        <td>
                          <select
                            value={spec.columnName as string}
                            onChange={(e) => updateFilterSpec(fi, "columnName", e.target.value as Identifier)}
                            className={colIssues.length > 0 ? "input-error" : undefined}
                          >
                            <option value="">— カラムを選択 —</option>
                            {columnNames.map((cn) => (
                              <option key={cn} value={cn}>{cn}</option>
                            ))}
                          </select>
                          <IssueHints issues={colIssues} />
                        </td>
                        <td>
                          <select
                            value={spec.operator}
                            onChange={(e) => updateFilterSpec(fi, "operator", e.target.value as FilterOperator)}
                            className={opIssues.length > 0 ? "input-error" : undefined}
                          >
                            {FILTER_OPERATORS.map((op) => (
                              <option key={op} value={op}>{op}</option>
                            ))}
                          </select>
                          <IssueHints issues={opIssues} />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={typeof spec.value === "string" ? spec.value : spec.value != null ? String(spec.value) : ""}
                            onChange={(e) => updateSilent((d) => {
                              const specs = d.filterDefaults ?? [];
                              specs[fi] = { ...specs[fi], value: e.target.value || undefined };
                              d.filterDefaults = specs;
                            })}
                            onBlur={commit}
                            placeholder="比較値"
                            className="vd-col-input-sm"
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={spec.valueExpression ?? ""}
                            onChange={(e) => updateSilent((d) => {
                              const specs = d.filterDefaults ?? [];
                              specs[fi] = { ...specs[fi], valueExpression: (e.target.value || undefined) as FilterSpec["valueExpression"] };
                              d.filterDefaults = specs;
                            })}
                            onBlur={commit}
                            placeholder="@conv.numbering.threshold"
                            className="vd-col-input-sm"
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="tbl-btn-icon danger"
                            onClick={() => removeFilterSpec(fi)}
                            title="削除"
                          >
                            <i className="bi bi-trash" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            <button
              type="button"
              className="tbl-btn tbl-btn-ghost vd-editor-add-row-btn"
              onClick={addFilterSpec}
            >
              <i className="bi bi-plus-lg" /> フィルタ条件追加
            </button>
          </section>

          {/* ───── Section 5: その他 ─────────────────────────────────────── */}
          <section className="seq-editor-section">
            <h3 className="seq-editor-section-title">その他</h3>
            <div className="seq-editor-grid">

              {/* pageSize */}
              <label className="tbl-field">
                <span>ページサイズ <small>(1..1000)</small></span>
                <input
                  type="number"
                  value={viewDefinition.pageSize ?? ""}
                  min={1}
                  max={1000}
                  onChange={(e) => {
                    const v = e.target.value ? Number(e.target.value) : undefined;
                    update((d) => { d.pageSize = v; });
                  }}
                  placeholder="20"
                  className="vd-editor-number-input"
                />
              </label>

              {/* groupBy */}
              <div className="tbl-field">
                <span>groupBy</span>
                <select
                  value={viewDefinition.groupBy ?? ""}
                  onChange={(e) => update((d) => {
                    d.groupBy = (e.target.value || undefined) as Identifier | undefined;
                  })}
                  className={getIssues(`ViewDefinition[${vdId}].groupBy`).length > 0 ? "input-error" : undefined}
                >
                  <option value="">— なし —</option>
                  {columnNames.map((cn) => (
                    <option key={cn} value={cn}>{cn}</option>
                  ))}
                </select>
                <IssueHints issues={getIssues(`ViewDefinition[${vdId}].groupBy`)} />
              </div>

            </div>
          </section>

        </div>{/* seq-editor-left-col */}
      </div>
    </div>
  );
}
