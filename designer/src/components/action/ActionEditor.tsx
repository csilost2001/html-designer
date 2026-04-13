import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import type {
  ActionGroup,
  ActionGroupType,
  ActionTrigger,
  Step,
  StepType,
} from "../../types/action";
import {
  ACTION_GROUP_TYPE_LABELS,
  ACTION_TRIGGER_LABELS,
  STEP_TYPE_LABELS,
  STEP_TYPE_ICONS,
  STEP_TEMPLATES,
} from "../../types/action";
import {
  loadActionGroup,
  saveActionGroup,
  addAction,
  removeAction,
  addStep,
  removeStep,
  moveStep,
  addSubStep,
  removeSubStep,
} from "../../store/actionStore";
import { listTables } from "../../store/tableStore";
import { loadProject } from "../../store/flowStore";
import { getStepLabel, clearJumpReferences } from "../../utils/actionUtils";
import { generateUUID } from "../../utils/uuid";
import { mcpBridge } from "../../mcp/mcpBridge";
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useUndoableState } from "../../hooks/useUndoableState";
import { useUndoKeyboard } from "../../hooks/useUndoKeyboard";
import { TableTopbar } from "../table/TableTopbar";
import { SortableStepCard } from "./SortableStepCard";
import "../../styles/action.css";

const ALL_STEP_TYPES: StepType[] = [
  "validation", "dbAccess", "externalSystem", "commonProcess",
  "screenTransition", "displayUpdate", "branch", "jump", "other",
];

const ALL_TRIGGERS: ActionTrigger[] = ["click", "submit", "select", "change", "load", "timer", "other"];

export function ActionEditor() {
  const { actionGroupId } = useParams<{ actionGroupId: string }>();
  const navigate = useNavigate();
  const [projectName, setProjectName] = useState("プロジェクト");
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [showAddAction, setShowAddAction] = useState(false);
  const [newActionName, setNewActionName] = useState("");
  const [newActionTrigger, setNewActionTrigger] = useState<ActionTrigger>("click");
  const [tables, setTables] = useState<{ id: string; name: string; logicalName: string }[]>([]);
  const [screens, setScreens] = useState<{ id: string; name: string }[]>([]);
  const [commonGroups, setCommonGroups] = useState<{ id: string; name: string }[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; stepId: string; parentStepId?: string } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const newStepIdsRef = useRef<Set<string>>(new Set());

  // 自動保存 (debounce 500ms)
  const scheduleSave = useCallback((updatedGroup: ActionGroup) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await saveActionGroup(updatedGroup);
    }, 500);
  }, []);

  // Undo/Redo 対応 state
  const {
    state: group,
    update: setGroup,
    updateAndCommit: updateGroupCommit,
    commit: commitGroup,
    undo,
    redo,
    canUndo,
    canRedo,
    reset: resetGroup,
  } = useUndoableState<ActionGroup | null>(null, { onSave: (g) => { if (g) saveActionGroup(g); } });

  useUndoKeyboard(undo, redo);

  const reload = useCallback(async () => {
    if (!actionGroupId) return;
    const g = await loadActionGroup(actionGroupId);
    if (!g) {
      navigate("/actions");
      return;
    }
    resetGroup(g);
    if (!activeActionId && g.actions.length > 0) {
      setActiveActionId(g.actions[0].id);
    }
    const p = await loadProject();
    setProjectName(p.name);
    setScreens(p.screens.map((s) => ({ id: s.id, name: s.name })));
    const agMetas = p.actionGroups ?? [];
    setCommonGroups(agMetas.filter((a) => a.type === "common").map((a) => ({ id: a.id, name: a.name })));
    const t = await listTables();
    setTables(t.map((tm) => ({ id: tm.id, name: tm.name, logicalName: tm.logicalName })));
  }, [actionGroupId, activeActionId, navigate, resetGroup]);

  useEffect(() => {
    mcpBridge.startWithoutEditor();
    reload();
    const unsub = mcpBridge.onStatusChange((s) => {
      if (s === "connected") reload();
    });
    return unsub;
  }, [reload]);

  /** 構造変化（履歴に積む）: ステップ追加・削除・移動、アクション追加・削除 */
  const updateGroup = useCallback(
    (updater: (g: ActionGroup) => void) => {
      updateGroupCommit((prev) => {
        if (!prev) return prev;
        const next = JSON.parse(JSON.stringify(prev)) as ActionGroup;
        updater(next);
        scheduleSave(next);
        return next;
      });
    },
    [updateGroupCommit, scheduleSave],
  );

  /** テキスト変更（履歴に積まない）: フィールド編集中の一時状態 */
  const updateGroupSilent = useCallback(
    (updater: (g: ActionGroup) => void) => {
      setGroup((prev) => {
        if (!prev) return prev;
        const next = JSON.parse(JSON.stringify(prev)) as ActionGroup;
        updater(next);
        scheduleSave(next);
        return next;
      });
    },
    [setGroup, scheduleSave],
  );

  const activeAction = group?.actions.find((a) => a.id === activeActionId) ?? null;

  const handleAddAction = () => {
    const name = newActionName.trim();
    if (!name || !group) return;
    updateGroup((g) => {
      const act = addAction(g, name, newActionTrigger);
      setActiveActionId(act.id);
    });
    setShowAddAction(false);
    setNewActionName("");
    setNewActionTrigger("click");
  };

  const handleDeleteAction = (actionId: string) => {
    if (!confirm("このアクションを削除しますか？")) return;
    updateGroup((g) => {
      removeAction(g, actionId);
      if (activeActionId === actionId) {
        setActiveActionId(g.actions.length > 0 ? g.actions[0].id : null);
      }
    });
  };

  const handleAddStep = (type: StepType, insertIndex?: number) => {
    if (!activeAction) return;
    updateGroup((g) => {
      const act = g.actions.find((a) => a.id === activeActionId);
      if (act) {
        const step = addStep(act, type, insertIndex);
        newStepIdsRef.current.add(step.id);
      }
    });
  };

  const handleAddTemplate = (templateId: string) => {
    const tpl = STEP_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl || !activeAction) return;
    updateGroup((g) => {
      const act = g.actions.find((a) => a.id === activeActionId);
      if (!act) return;
      for (const stepDef of tpl.steps) {
        const step = { ...stepDef, id: generateUUID() } as Step;
        act.steps.push(step);
      }
    });
    setShowTemplates(false);
  };

  const handleDeleteStep = (stepId: string, parentStepId?: string) => {
    updateGroup((g) => {
      const act = g.actions.find((a) => a.id === activeActionId);
      if (!act) return;
      if (parentStepId) {
        const parent = act.steps.find((s) => s.id === parentStepId);
        if (parent) removeSubStep(parent, stepId);
      } else {
        clearJumpReferences(act.steps, stepId);
        removeStep(act, stepId);
      }
    });
    setContextMenu(null);
  };

  const handleMoveStep = (fromIndex: number, toIndex: number) => {
    updateGroup((g) => {
      const act = g.actions.find((a) => a.id === activeActionId);
      if (act) moveStep(act, fromIndex, toIndex);
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !activeAction) return;
    const fromIndex = activeAction.steps.findIndex((s) => s.id === active.id);
    const toIndex = activeAction.steps.findIndex((s) => s.id === over.id);
    if (fromIndex < 0 || toIndex < 0) return;
    handleMoveStep(fromIndex, toIndex);
  };

  const handleStepChange = (stepId: string, changes: Partial<Step>) => {
    updateGroupSilent((g) => {
      const act = g.actions.find((a) => a.id === activeActionId);
      if (!act) return;
      const step = act.steps.find((s) => s.id === stepId);
      if (step) Object.assign(step, changes);
    });
  };

  const handleAddSubStep = (parentStepId: string, type: StepType) => {
    updateGroup((g) => {
      const act = g.actions.find((a) => a.id === activeActionId);
      if (!act) return;
      const parent = act.steps.find((s) => s.id === parentStepId);
      if (parent) addSubStep(parent, type);
    });
    setContextMenu(null);
  };

  const handleDuplicateStep = (stepId: string) => {
    updateGroup((g) => {
      const act = g.actions.find((a) => a.id === activeActionId);
      if (!act) return;
      const idx = act.steps.findIndex((s) => s.id === stepId);
      if (idx < 0) return;
      const clone = JSON.parse(JSON.stringify(act.steps[idx])) as Step;
      clone.id = generateUUID();
      if (clone.subSteps) {
        clone.subSteps = clone.subSteps.map((s) => ({ ...s, id: generateUUID() }));
      }
      act.steps.splice(idx + 1, 0, clone);
    });
    setContextMenu(null);
  };

  const handleGroupInfoChange = (field: string, value: string) => {
    updateGroupSilent((g) => {
      (g as unknown as Record<string, string>)[field] = value;
    });
  };

  if (!group) return null;

  return (
    <div className="action-page" onClick={() => setContextMenu(null)}>
      <TableTopbar projectName={projectName} />

      {/* ヘッダー */}
      <div className="action-editor-header">
        <div className="action-editor-breadcrumb">
          <Link to="/actions">処理フロー一覧</Link>
          <span className="mx-2">/</span>
          <span className="fw-semibold text-dark">{group.name}</span>
        </div>
        <div className="action-editor-undo-buttons">
          <button
            className="btn btn-outline-secondary btn-sm"
            onClick={undo}
            disabled={!canUndo}
            title="元に戻す (Ctrl+Z)"
          >
            <i className="bi bi-arrow-counterclockwise" />
          </button>
          <button
            className="btn btn-outline-secondary btn-sm"
            onClick={redo}
            disabled={!canRedo}
            title="やり直し (Ctrl+Y)"
          >
            <i className="bi bi-arrow-clockwise" />
          </button>
        </div>
      </div>

      {/* グループ情報 */}
      <div className="action-editor-info">
        <div className="row g-2">
          <div className="col-md-4">
            <label className="form-label small fw-semibold">名前</label>
            <input
              className="form-control form-control-sm"
              value={group.name}
              onChange={(e) => handleGroupInfoChange("name", e.target.value)}
            />
          </div>
          <div className="col-md-2">
            <label className="form-label small fw-semibold">種別</label>
            <select
              className="form-select form-select-sm"
              value={group.type}
              onChange={(e) => handleGroupInfoChange("type", e.target.value)}
            >
              {(["screen", "batch", "scheduled", "system", "common", "other"] as ActionGroupType[]).map((t) => (
                <option key={t} value={t}>{ACTION_GROUP_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div className="col-md-6">
            <label className="form-label small fw-semibold">説明</label>
            <input
              className="form-control form-control-sm"
              value={group.description}
              onChange={(e) => handleGroupInfoChange("description", e.target.value)}
              placeholder="処理フローの概要"
            />
          </div>
        </div>
      </div>

      {/* アクションタブ */}
      <div className="action-tabs">
        {group.actions.map((act) => (
          <div key={act.id} className="d-flex align-items-center">
            <button
              className={`action-tab ${activeActionId === act.id ? "active" : ""}`}
              onClick={() => setActiveActionId(act.id)}
            >
              {act.name}
              <span className="ms-1 text-muted small">({ACTION_TRIGGER_LABELS[act.trigger]})</span>
            </button>
            <button
              className="btn btn-link btn-sm text-muted p-0 ms-1"
              onClick={() => handleDeleteAction(act.id)}
              title="アクション削除"
              style={{ fontSize: "0.7rem" }}
            >
              <i className="bi bi-x" />
            </button>
          </div>
        ))}
        <button
          className="action-tab-add"
          onClick={() => setShowAddAction(true)}
          title="アクション追加"
        >
          <i className="bi bi-plus-lg" />
        </button>
      </div>

      {/* ステップエディタ */}
      <div className="action-content">
        {activeAction ? (
          <div className="step-editor">
            {/* I/O パネル */}
            <div className="action-io-panel">
              <div className="action-io-field">
                <label className="form-label"><i className="bi bi-box-arrow-in-right me-1" />入力データ</label>
                <textarea
                  className="form-control form-control-sm action-io-textarea"
                  rows={1}
                  value={activeAction.inputs ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    updateGroupSilent((g) => {
                      const act = g.actions.find((a) => a.id === activeActionId);
                      if (act) act.inputs = val;
                    });
                  }}
                  onBlur={commitGroup}
                  placeholder="例: ユーザID、パスワード（改行で複数項目）"
                />
              </div>
              <div className="action-io-field">
                <label className="form-label"><i className="bi bi-box-arrow-right me-1" />出力データ</label>
                <textarea
                  className="form-control form-control-sm action-io-textarea"
                  rows={1}
                  value={activeAction.outputs ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    updateGroupSilent((g) => {
                      const act = g.actions.find((a) => a.id === activeActionId);
                      if (act) act.outputs = val;
                    });
                  }}
                  onBlur={commitGroup}
                  placeholder="例: セッションID、認証トークン（改行で複数項目）"
                />
              </div>
            </div>

            {/* ツールバー */}
            <div className="step-toolbar">
              {ALL_STEP_TYPES.map((type) => (
                <button
                  key={type}
                  className="step-toolbar-btn"
                  onClick={() => handleAddStep(type)}
                  title={STEP_TYPE_LABELS[type]}
                >
                  <i className={STEP_TYPE_ICONS[type]} />
                  {STEP_TYPE_LABELS[type]}
                </button>
              ))}
              <div className="step-toolbar-sep" />
              <div style={{ position: "relative" }}>
                <button
                  className="step-template-btn"
                  onClick={() => setShowTemplates(!showTemplates)}
                >
                  <i className="bi bi-collection" />
                  テンプレート
                </button>
                {showTemplates && (
                  <div className="template-dropdown">
                    {STEP_TEMPLATES.map((tpl) => (
                      <div
                        key={tpl.id}
                        className="template-dropdown-item"
                        onClick={() => handleAddTemplate(tpl.id)}
                      >
                        <div className="template-dropdown-item-label">{tpl.label}</div>
                        <div className="template-dropdown-item-desc">{tpl.description}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ステップリスト */}
            {activeAction.steps.length === 0 ? (
              <div className="step-empty">
                <i className="bi bi-plus-circle" />
                ステップがありません。上のボタンから追加するか、テンプレートを使用してください。
              </div>
            ) : (
              <DndContext onDragEnd={handleDragEnd} collisionDetection={closestCenter}>
                <SortableContext items={activeAction.steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                  <div className="step-list">
                    {activeAction.steps.map((step, index) => (
                      <div key={step.id}>
                        {/* 挿入ポイント */}
                        <div className="step-insert-point">
                          <button
                            className="step-insert-btn"
                            onClick={() => handleAddStep("other", index)}
                            title="ステップを挿入"
                          >
                            <i className="bi bi-plus" />
                          </button>
                        </div>
                        <SortableStepCard
                          step={step}
                          index={index}
                          label={getStepLabel(index)}
                          allSteps={activeAction.steps}
                          tables={tables}
                          screens={screens}
                          commonGroups={commonGroups}
                          onChange={(changes) => handleStepChange(step.id, changes)}
                          onCommit={commitGroup}
                          onMoveUp={index > 0 ? () => handleMoveStep(index, index - 1) : undefined}
                          onMoveDown={index < activeAction.steps.length - 1 ? () => handleMoveStep(index, index + 1) : undefined}
                          onDelete={() => handleDeleteStep(step.id)}
                          onDuplicate={() => handleDuplicateStep(step.id)}
                          onAddSubStep={(type) => handleAddSubStep(step.id, type)}
                          onDeleteSubStep={(subId) => handleDeleteStep(subId, step.id)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setContextMenu({ x: e.clientX, y: e.clientY, stepId: step.id });
                          }}
                          onNavigateCommon={(refId) => navigate(`/actions/${refId}`)}
                          defaultExpanded={newStepIdsRef.current.has(step.id)}
                        />
                      </div>
                    ))}
                    {/* 末尾の挿入ポイント */}
                    <div className="step-insert-point" style={{ opacity: 1 }}>
                      <button
                        className="step-insert-btn"
                        onClick={() => handleAddStep("other")}
                        title="ステップを末尾に追加"
                      >
                        <i className="bi bi-plus" />
                      </button>
                    </div>
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        ) : (
          <div className="step-empty">
            <i className="bi bi-lightning" />
            アクションがありません。「+」ボタンからアクションを追加してください。
          </div>
        )}
      </div>

      {/* コンテキストメニュー */}
      {contextMenu && (
        <div
          className="step-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="step-context-menu-item"
            onClick={() => handleDuplicateStep(contextMenu.stepId)}
          >
            <i className="bi bi-copy" /> 複製
          </button>
          <button
            className="step-context-menu-item"
            onClick={() => handleAddSubStep(contextMenu.stepId, "other")}
          >
            <i className="bi bi-diagram-2" /> サブステップ追加
          </button>
          <div className="step-context-menu-sep" />
          <button
            className="step-context-menu-item danger"
            onClick={() => handleDeleteStep(contextMenu.stepId)}
          >
            <i className="bi bi-trash" /> 削除
          </button>
        </div>
      )}

      {/* アクション追加モーダル */}
      {showAddAction && (
        <div className="action-modal-overlay" onClick={() => setShowAddAction(false)}>
          <div className="action-modal" onClick={(e) => e.stopPropagation()}>
            <h6>アクション追加</h6>
            <div className="form-group">
              <label className="form-label">アクション名 *</label>
              <input
                className="form-control form-control-sm"
                value={newActionName}
                onChange={(e) => setNewActionName(e.target.value)}
                placeholder="例: 登録ボタン、検索ボタン"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">トリガー</label>
              <select
                className="form-select form-select-sm"
                value={newActionTrigger}
                onChange={(e) => setNewActionTrigger(e.target.value as ActionTrigger)}
              >
                {ALL_TRIGGERS.map((t) => (
                  <option key={t} value={t}>{ACTION_TRIGGER_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div className="action-modal-footer">
              <button className="btn btn-outline-secondary btn-sm" onClick={() => setShowAddAction(false)}>
                キャンセル
              </button>
              <button className="btn btn-primary btn-sm" onClick={handleAddAction} disabled={!newActionName.trim()}>
                追加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
