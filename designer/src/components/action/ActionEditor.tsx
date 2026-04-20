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
} from "../../store/actionStore";
import { listTables, loadTable } from "../../store/tableStore";
import { loadProject } from "../../store/flowStore";
import { getStepLabel, clearJumpReferences } from "../../utils/actionUtils";
import { hasBlockingErrors } from "../../utils/actionValidation";
import { aggregateValidation } from "../../utils/aggregatedValidation";
import type { TableDefinition as ValidatorTableDef } from "../../schemas/sqlColumnValidator";
import type { ConventionsCatalog } from "../../schemas/conventionsValidator";
import type { ValidationError } from "../../utils/actionValidation";
import { generateUUID } from "../../utils/uuid";
import {
  DndContext,
  closestCenter,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type CollisionDetection,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useResourceEditor } from "../../hooks/useResourceEditor";
import { useSaveShortcut } from "../../hooks/useSaveShortcut";
import { useSelectionKeyboard } from "../../hooks/useSelectionKeyboard";
import { STEP_TYPE_COLORS } from "../../types/action";
import { TableSubToolbar } from "../table/TableSubToolbar";
import { SortableStepCard } from "./SortableStepCard";
import { MaturityBadge } from "./MaturityBadge";
import { ActionHttpContractPanel } from "./ActionHttpContractPanel";
import { ErrorCatalogPanel } from "./ErrorCatalogPanel";
import { AmbientVariablesPanel } from "./AmbientVariablesPanel";
import { SecretsCatalogPanel } from "./SecretsCatalogPanel";
import { ExternalSystemCatalogPanel } from "./ExternalSystemCatalogPanel";
import { TypeCatalogPanel } from "./TypeCatalogPanel";
import { StructuredFieldsEditor } from "./StructuredFieldsEditor";
import { EditorHeader } from "../common/EditorHeader";
import { ServerChangeBanner } from "../common/ServerChangeBanner";
import "../../styles/action.css";

/** グループ内の全ステップを再帰的に走査して maturity 別カウント + 付箋合計を集計 (#196 / #200) */
function countMaturity(group: ActionGroup): {
  draft: number;
  provisional: number;
  committed: number;
  total: number;
  notes: number;
} {
  const acc = { draft: 0, provisional: 0, committed: 0, total: 0, notes: 0 };
  const visit = (steps: Step[]) => {
    for (const s of steps) {
      const m = s.maturity ?? "draft";
      if (m === "draft") acc.draft++;
      else if (m === "provisional") acc.provisional++;
      else acc.committed++;
      acc.total++;
      acc.notes += s.notes?.length ?? 0;
      if (s.subSteps) visit(s.subSteps);
      if (s.type === "branch") {
        for (const b of s.branches) visit(b.steps);
        if (s.elseBranch) visit(s.elseBranch.steps);
      }
      if (s.type === "loop") visit(s.steps);
    }
  };
  for (const act of group.actions) visit(act.steps);
  return acc;
}

/** ツールバーのドラッグ可能なステップ種別ボタン */
function ToolbarStepButton({ type, onClick }: { type: StepType; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `toolbar-${type}`,
    data: { kind: "toolbar-step", stepType: type },
  });
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`step-toolbar-btn${isDragging ? " dragging" : ""}`}
      onClick={onClick}
      title={`${STEP_TYPE_LABELS[type]}（ドラッグで挿入）`}
      style={isDragging ? { opacity: 0.5, borderColor: STEP_TYPE_COLORS[type] } : undefined}
    >
      <i className={STEP_TYPE_ICONS[type]} />
      {STEP_TYPE_LABELS[type]}
    </button>
  );
}

/** ステップ間のドロップゾーン */
function StepInsertZone({ index, onClick, onPaste }: { index: number; onClick: () => void; onPaste?: () => void }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `insert-${index}`,
    data: { kind: "insert-zone", insertIndex: index },
  });
  return (
    <div ref={setNodeRef} className={`step-insert-point${isOver ? " drop-active" : ""}${onPaste ? " has-paste" : ""}`}>
      <button className="step-insert-btn" onClick={onClick} title="ステップを挿入">
        <i className="bi bi-plus" />
      </button>
      {onPaste && (
        <button className="step-paste-btn" onClick={onPaste} title="ここに貼り付け">
          <i className="bi bi-clipboard-plus me-1" />貼り付け
        </button>
      )}
    </div>
  );
}

const ALL_STEP_TYPES: StepType[] = [
  "validation", "dbAccess", "externalSystem", "commonProcess",
  "screenTransition", "displayUpdate", "branch", "loop",
  "loopBreak", "loopContinue", "jump", "compute", "return", "other",
];

const ALL_SUB_STEP_TYPES: StepType[] = [
  "validation", "dbAccess", "externalSystem", "commonProcess",
  "screenTransition", "displayUpdate", "branch", "loop",
  "loopBreak", "loopContinue", "jump", "compute", "return", "other",
];

const ALL_TRIGGERS: ActionTrigger[] = ["click", "submit", "select", "change", "load", "timer", "other"];

export function ActionEditor() {
  const { actionGroupId } = useParams<{ actionGroupId: string }>();
  const navigate = useNavigate();
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [showAddAction, setShowAddAction] = useState(false);
  const [newActionName, setNewActionName] = useState("");
  const [newActionTrigger, setNewActionTrigger] = useState<ActionTrigger>("click");
  const [tables, setTables] = useState<{ id: string; name: string; logicalName: string }[]>([]);
  const [screens, setScreens] = useState<{ id: string; name: string }[]>([]);
  const [commonGroups, setCommonGroups] = useState<{ id: string; name: string }[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showWarningsPanel, setShowWarningsPanel] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; stepId: string } | null>(null);
  const [contextMenuSubTypePicker, setContextMenuSubTypePicker] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  // SQL 列検査 / 規約参照検査のため (#261)
  const [tableDefs, setTableDefs] = useState<ValidatorTableDef[]>([]);
  const [conventions, setConventions] = useState<ConventionsCatalog | null>(null);
  const newStepIdsRef = useRef<Set<string>>(new Set());

  // 選択・クリップボード state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [clipboard, setClipboard] = useState<{
    steps: Step[];
    mode: "cut" | "copy";
  } | null>(null);
  const lastSelectedIdRef = useRef<string | null>(null);

  const handleNotFound = useCallback(() => navigate("/process-flow/list"), [navigate]);

  const handleLoaded = useCallback((g: ActionGroup) => {
    setActiveActionId((cur) => cur ?? (g.actions.length > 0 ? g.actions[0].id : null));
    loadProject().then((p) => {
      setScreens(p.screens.map((s) => ({ id: s.id, name: s.name })));
      const agMetas = p.actionGroups ?? [];
      setCommonGroups(agMetas.filter((a) => a.type === "common").map((a) => ({ id: a.id, name: a.name })));
    }).catch(console.error);
    listTables().then(async (metas) => {
      setTables(metas.map((tm) => ({ id: tm.id, name: tm.name, logicalName: tm.logicalName })));
      // SQL 列検査用に全テーブルの columns まで読む (#261 UI 統合)
      const defs = await Promise.all(
        metas.map(async (tm) => {
          const full = await loadTable(tm.id);
          if (!full) return null;
          return {
            id: full.id,
            name: full.name,
            columns: (full.columns ?? []).map((c) => ({ name: c.name })),
          } as ValidatorTableDef;
        }),
      );
      setTableDefs(defs.filter((d): d is ValidatorTableDef => d !== null));
    }).catch(console.error);
    // 規約カタログを public/ から fetch (#261 UI 統合)
    fetch("/conventions-catalog.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => setConventions(c as ConventionsCatalog | null))
      .catch(() => setConventions(null));
  }, []);

  const {
    state: group,
    isDirty, isSaving, serverChanged,
    update: updateGroup,
    updateSilent: updateGroupSilent,
    commit: commitGroup,
    undo, redo, canUndo, canRedo,
    handleSave: hookHandleSave,
    handleReset, dismissServerBanner,
  } = useResourceEditor<ActionGroup>({
    tabType: "action",
    mtimeKind: "actionGroup",
    draftKind: "action",
    id: actionGroupId,
    load: loadActionGroup,
    save: saveActionGroup,
    broadcastName: "actionGroupChanged",
    broadcastIdField: "id",
    onNotFound: handleNotFound,
    onLoaded: handleLoaded,
  });

  // 保存時にバリデーションをチェック（blocking なエラーがあれば中断）
  const handleSave = useCallback(async () => {
    if (!group || hasBlockingErrors(aggregateValidation(group, { tables: tableDefs, conventions }))) return;
    await hookHandleSave();
  }, [group, hookHandleSave, tableDefs, conventions]);

  // D&D: PointerSensor に移動距離閾値を設定（クリックとドラッグを区別）
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // D&D: ステップリストの境界外でのドロップをキャンセルするための ref
  const stepListRef = useRef<HTMLDivElement>(null);

  // ポインターがステップリスト内にあるときのみ衝突判定を行う
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const pointer = args.pointerCoordinates;
    if (pointer && stepListRef.current) {
      const { top, bottom } = stepListRef.current.getBoundingClientRect();
      if (pointer.y < top || pointer.y > bottom) return [];
    }
    return closestCenter(args);
  }, []);

  useSaveShortcut(() => {
    if (isDirty && !isSaving) handleSave();
  });

  useEffect(() => {
    setValidationErrors(group ? aggregateValidation(group, { tables: tableDefs, conventions }) : []);
  }, [group, tableDefs, conventions]);

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

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
    setContextMenuSubTypePicker(false);
  }, []);

  const handleDeleteStep = (stepId: string) => {
    updateGroup((g) => {
      const act = g.actions.find((a) => a.id === activeActionId);
      if (!act) return;
      clearJumpReferences(act.steps, stepId);
      removeStep(act, stepId);
    });
    closeContextMenu();
  };

  const handleIndentStep = (stepId: string) => {
    updateGroup((g) => {
      const act = g.actions.find((a) => a.id === activeActionId);
      if (!act) return;
      const idx = act.steps.findIndex((s) => s.id === stepId);
      if (idx <= 0) return;
      const stepToMove = act.steps[idx];
      const target = { ...act.steps[idx - 1] };
      target.subSteps = [...(target.subSteps ?? []), stepToMove];
      act.steps[idx - 1] = target;
      act.steps.splice(idx, 1);
    });
  };

  const handleOutdentSubStep = (parentStepId: string, subStepId: string) => {
    updateGroup((g) => {
      const act = g.actions.find((a) => a.id === activeActionId);
      if (!act) return;
      const parentIdx = act.steps.findIndex((s) => s.id === parentStepId);
      if (parentIdx < 0) return;
      const parent = act.steps[parentIdx];
      const subIdx = (parent.subSteps ?? []).findIndex((s) => s.id === subStepId);
      if (subIdx < 0) return;
      const subStep = parent.subSteps![subIdx];
      act.steps[parentIdx] = { ...parent, subSteps: parent.subSteps!.filter((s) => s.id !== subStepId) };
      act.steps.splice(parentIdx + 1, 0, subStep);
    });
  };

  const handleMoveStep = (fromIndex: number, toIndex: number) => {
    updateGroup((g) => {
      const act = g.actions.find((a) => a.id === activeActionId);
      if (act) moveStep(act, fromIndex, toIndex);
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !activeAction) return;

    const dragKind = active.data.current?.kind;

    if (dragKind === "toolbar-step") {
      // #46: ツールバーからドロップ → 新規ステップを挿入
      const stepType = active.data.current?.stepType as StepType;
      const insertIndex = over.data.current?.insertIndex as number | undefined;
      handleAddStep(stepType, insertIndex ?? activeAction.steps.length);
    } else {
      // #47: ステップカードの並べ替え
      if (active.id === over.id) return;
      const fromIndex = activeAction.steps.findIndex((s) => s.id === active.id);
      const toIndex = activeAction.steps.findIndex((s) => s.id === over.id);
      if (fromIndex < 0 || toIndex < 0) return;
      handleMoveStep(fromIndex, toIndex);
    }
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
    closeContextMenu();
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
    closeContextMenu();
  };

  const handleGroupInfoChange = (field: string, value: string) => {
    updateGroupSilent((g) => {
      (g as unknown as Record<string, string>)[field] = value;
    });
  };

  // ── 選択操作 ──────────────────────────────────────────────────
  const handleStepClick = (stepId: string, e: React.MouseEvent) => {
    if (!activeAction) return;
    if (e.ctrlKey || e.metaKey) {
      // Ctrl+Click: トグル
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(stepId)) next.delete(stepId);
        else next.add(stepId);
        return next;
      });
      lastSelectedIdRef.current = stepId;
    } else if (e.shiftKey && lastSelectedIdRef.current) {
      // Shift+Click: 範囲選択
      const steps = activeAction.steps;
      const lastIdx = steps.findIndex((s) => s.id === lastSelectedIdRef.current);
      const curIdx = steps.findIndex((s) => s.id === stepId);
      if (lastIdx >= 0 && curIdx >= 0) {
        const [from, to] = lastIdx < curIdx ? [lastIdx, curIdx] : [curIdx, lastIdx];
        const range = new Set<string>();
        for (let i = from; i <= to; i++) range.add(steps[i].id);
        setSelectedIds(range);
      }
    } else {
      // 通常クリック: 選択解除（展開/折りたたみはStepCard内で処理）
      setSelectedIds(new Set());
      lastSelectedIdRef.current = null;
    }
  };

  // ── クリップボード操作 ────────────────────────────────────────
  const handleCut = useCallback(() => {
    if (selectedIds.size === 0 || !activeAction) return;
    const steps = activeAction.steps.filter((s) => selectedIds.has(s.id));
    setClipboard({ steps: JSON.parse(JSON.stringify(steps)), mode: "cut" });
    updateGroup((g) => {
      const act = g.actions.find((a) => a.id === activeActionId);
      if (!act) return;
      for (const id of selectedIds) {
        clearJumpReferences(act.steps, id);
        removeStep(act, id);
      }
    });
    setSelectedIds(new Set());
  }, [selectedIds, activeAction, activeActionId, updateGroup]);

  const handleCopy = useCallback(() => {
    if (selectedIds.size === 0 || !activeAction) return;
    const steps = activeAction.steps.filter((s) => selectedIds.has(s.id));
    setClipboard({ steps: JSON.parse(JSON.stringify(steps)), mode: "copy" });
  }, [selectedIds, activeAction]);

  const handlePaste = useCallback((insertIndex?: number) => {
    if (!clipboard || !activeAction) return;
    const targetIndex = insertIndex ?? (() => {
      // 選択中のステップがある場合: 最後の選択ステップの直後
      if (selectedIds.size > 0) {
        const lastIdx = Math.max(...activeAction.steps.map((s, i) => selectedIds.has(s.id) ? i : -1));
        return lastIdx >= 0 ? lastIdx + 1 : activeAction.steps.length;
      }
      return activeAction.steps.length;
    })();

    updateGroup((g) => {
      const act = g.actions.find((a) => a.id === activeActionId);
      if (!act) return;
      const newSteps = clipboard.steps.map((s) => {
        const clone = JSON.parse(JSON.stringify(s)) as Step;
        clone.id = generateUUID();
        if (clone.subSteps) {
          clone.subSteps = clone.subSteps.map((sub: Step) => ({ ...sub, id: generateUUID() }));
        }
        return clone;
      });
      act.steps.splice(targetIndex, 0, ...newSteps);
    });
    if (clipboard.mode === "cut") setClipboard(null);
    setSelectedIds(new Set());
  }, [clipboard, activeAction, activeActionId, selectedIds, updateGroup]);

  const handleEscapeSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  useSelectionKeyboard({
    onCut: handleCut,
    onCopy: handleCopy,
    onPaste: () => handlePaste(),
    onEscape: handleEscapeSelection,
    enabled: selectedIds.size > 0 || clipboard !== null,
  });

  if (!group) return null;

  return (
    <div className="action-page" onClick={() => closeContextMenu()}>
      <TableSubToolbar />

      {serverChanged && (
        <ServerChangeBanner onReload={handleReset} onDismiss={dismissServerBanner} />
      )}

      <EditorHeader
        title={
          <div className="action-editor-breadcrumb">
            <Link to="/process-flow/list">処理フロー一覧</Link>
            <span className="mx-2">/</span>
            <span className="fw-semibold text-dark">{group.name}</span>
          </div>
        }
        undoRedo={{ onUndo: undo, onRedo: redo, canUndo, canRedo }}
        extraRight={
          <>
            {validationErrors.filter((e) => e.severity === "error").length > 0 && (
              <span
                className="validation-badge error"
                title={validationErrors
                  .filter((e) => e.severity === "error")
                  .map((e) => (e.path ? `[${e.path}] ${e.message}` : e.message))
                  .join("\n")}
              >
                <i className="bi bi-x-circle-fill" />
                {validationErrors.filter((e) => e.severity === "error").length} エラー
              </span>
            )}
            {validationErrors.filter((e) => e.severity === "warning").length > 0 && (
              <span
                className="validation-badge warning clickable"
                title={validationErrors
                  .filter((e) => e.severity === "warning")
                  .slice(0, 20)
                  .map((e) => (e.path ? `[${e.path}] ${e.message}` : e.message))
                  .join("\n")}
                onClick={() => setShowWarningsPanel((v) => !v)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setShowWarningsPanel((v) => !v); }}
              >
                <i className="bi bi-exclamation-triangle-fill" />
                {validationErrors.filter((e) => e.severity === "warning").length} 警告
                <i className={`bi bi-chevron-${showWarningsPanel ? "up" : "down"} ms-1`} />
              </span>
            )}
          </>
        }
        saveReset={{ isDirty, isSaving, onSave: handleSave, onReset: handleReset }}
      />

      {/* 警告詳細パネル (#261 UI 統合) */}
      {showWarningsPanel && validationErrors.filter((e) => e.severity === "warning").length > 0 && (
        <div className="action-validation-panel">
          <div className="action-validation-panel-header">
            <i className="bi bi-exclamation-triangle-fill" /> 警告 ({validationErrors.filter((e) => e.severity === "warning").length} 件)
            <button
              className="btn btn-sm btn-link ms-auto"
              onClick={() => setShowWarningsPanel(false)}
              title="閉じる"
            >
              <i className="bi bi-x-lg" />
            </button>
          </div>
          <ul className="action-validation-panel-list">
            {validationErrors
              .filter((e) => e.severity === "warning")
              .map((e, i) => (
                <li key={i}>
                  {e.code && <span className="validation-code">{e.code}</span>}
                  <span className="validation-message">{e.message}</span>
                  {e.path && <span className="validation-path">{e.path}</span>}
                </li>
              ))}
          </ul>
        </div>
      )}

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
        <div className="d-flex align-items-center gap-3 mt-2 small">
          <div className="d-flex align-items-center gap-1">
            <label className="form-label small fw-semibold mb-0">成熟度</label>
            <MaturityBadge
              maturity={group.maturity}
              size="md"
              onChange={(next) => handleGroupInfoChange("maturity", next)}
            />
          </div>
          <div className="d-flex align-items-center gap-1">
            <label className="form-label small fw-semibold mb-0">モード</label>
            <div className="btn-group btn-group-sm" role="group" aria-label="モード切替">
              <button
                type="button"
                className={`btn btn-outline-secondary${(group.mode ?? "upstream") === "upstream" ? " active" : ""}`}
                onClick={() => handleGroupInfoChange("mode", "upstream")}
                title="上流モード: 書きかけ・曖昧を許容"
              >
                <i className="bi bi-pencil me-1" />上流
              </button>
              <button
                type="button"
                className={`btn btn-outline-secondary${group.mode === "downstream" ? " active" : ""}`}
                onClick={() => handleGroupInfoChange("mode", "downstream")}
                title="下流モード: AI 実装用に確定"
              >
                <i className="bi bi-robot me-1" />下流
              </button>
            </div>
          </div>
        </div>
        {(() => {
          const counts = countMaturity(group);
          if (counts.total === 0) return null;
          return (
            <div className="d-flex align-items-center gap-3 mt-2 small" style={{ fontSize: "0.8rem" }}>
              <span className="text-muted">進捗:</span>
              <span title={`確定 ${counts.committed} 件`} style={{ color: "#22c55e" }}>
                <i className="bi bi-circle-fill" /> {counts.committed}
              </span>
              <span title={`暫定 ${counts.provisional} 件`} style={{ color: "#f97316" }}>
                <i className="bi bi-circle-fill" /> {counts.provisional}
              </span>
              <span title={`下書き ${counts.draft} 件`} style={{ color: "#f59e0b" }}>
                <i className="bi bi-circle-fill" /> {counts.draft}
              </span>
              <span className="text-muted">合計 {counts.total} ステップ</span>
              {counts.notes > 0 && (
                <span className="text-muted" title={`付箋 ${counts.notes} 件`}>
                  <i className="bi bi-sticky" /> {counts.notes}
                </span>
              )}
            </div>
          );
        })()}
        {group.mode === "downstream" && (() => {
          const counts = countMaturity(group);
          const unfinished = counts.draft + counts.provisional;
          if (unfinished === 0) return null;
          return (
            <div className="alert alert-warning py-1 px-2 mt-2 mb-0 small d-flex align-items-center gap-2" role="alert">
              <i className="bi bi-exclamation-triangle-fill" />
              <strong>下流モードで未確定ステップあり:</strong>
              <span>🟡 draft {counts.draft} / 🟠 provisional {counts.provisional}</span>
              <span className="text-muted">(AI 実装前に committed に昇格してください)</span>
            </div>
          );
        })()}
        {/* ActionGroup レベルカタログ編集 (#278) */}
        <ErrorCatalogPanel
          group={group}
          onChange={(next) => { updateGroup((g) => { g.errorCatalog = next.errorCatalog; }); }}
        />
        <AmbientVariablesPanel
          group={group}
          onChange={(next) => { updateGroup((g) => { g.ambientVariables = next.ambientVariables; }); }}
        />
        <SecretsCatalogPanel
          group={group}
          onChange={(next) => { updateGroup((g) => { g.secretsCatalog = next.secretsCatalog; }); }}
        />
        <ExternalSystemCatalogPanel
          group={group}
          onChange={(next) => { updateGroup((g) => { g.externalSystemCatalog = next.externalSystemCatalog; }); }}
        />
        <TypeCatalogPanel
          group={group}
          onChange={(next) => { updateGroup((g) => { g.typeCatalog = next.typeCatalog; }); }}
        />
      </div>

      {/* アクションタブ */}
      <div className="action-tabs">
        {group.actions.map((act) => (
          <div key={act.id} className="d-flex align-items-center">
            <button
              className={`action-tab ${activeActionId === act.id ? "active" : ""}`}
              onClick={() => setActiveActionId(act.id)}
            >
              <MaturityBadge
                maturity={act.maturity}
                onChange={(next) => {
                  updateGroupSilent((g) => {
                    const a = g.actions.find((a2) => a2.id === act.id);
                    if (a) a.maturity = next;
                  });
                }}
              />
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
            {/* HTTP 契約 */}
            <ActionHttpContractPanel
              action={activeAction}
              onChange={(patch) => {
                updateGroupSilent((g) => {
                  const act = g.actions.find((a) => a.id === activeActionId);
                  if (act) Object.assign(act, patch);
                });
                commitGroup();
              }}
            />
            {/* I/O パネル */}
            <div className="action-io-panel">
              <div className="action-io-field">
                <StructuredFieldsEditor
                  label="入力データ"
                  fields={activeAction.inputs}
                  onChange={(val) => {
                    updateGroupSilent((g) => {
                      const act = g.actions.find((a) => a.id === activeActionId);
                      if (act) act.inputs = val;
                    });
                  }}
                  onCommit={commitGroup}
                  placeholder="例: ユーザID、パスワード（改行で複数項目）"
                />
              </div>
              <div className="action-io-field">
                <StructuredFieldsEditor
                  label="出力データ"
                  fields={activeAction.outputs}
                  onChange={(val) => {
                    updateGroupSilent((g) => {
                      const act = g.actions.find((a) => a.id === activeActionId);
                      if (act) act.outputs = val;
                    });
                  }}
                  onCommit={commitGroup}
                  placeholder="例: セッションID、認証トークン（改行で複数項目）"
                />
              </div>
            </div>

            <DndContext sensors={sensors} onDragEnd={handleDragEnd} collisionDetection={collisionDetection}>
              {/* ツールバー */}
              <div className="step-toolbar">
                {ALL_STEP_TYPES.map((type) => (
                  <ToolbarStepButton key={type} type={type} onClick={() => handleAddStep(type)} />
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
                <SortableContext items={activeAction.steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                  <div className="step-list" ref={stepListRef}>
                    {activeAction.steps.map((step, index) => (
                      <div key={step.id}>
                        <StepInsertZone
                          index={index}
                          onClick={() => handleAddStep("other", index)}
                          onPaste={clipboard ? () => handlePaste(index) : undefined}
                        />
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
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setContextMenu({ x: e.clientX, y: e.clientY, stepId: step.id });
                          }}
                          onNavigateCommon={(refId) => navigate(`/process-flow/edit/${refId}`)}
                          defaultExpanded={newStepIdsRef.current.has(step.id)}
                          selected={selectedIds.has(step.id)}
                          onHeaderClick={(e) => handleStepClick(step.id, e)}
                          onIndent={index > 0 ? () => handleIndentStep(step.id) : undefined}
                          onOutdentSubStep={(subId) => handleOutdentSubStep(step.id, subId)}
                          validationErrors={validationErrors}
                        />
                      </div>
                    ))}
                    {/* 末尾の挿入ポイント */}
                    <StepInsertZone
                      index={activeAction.steps.length}
                      onClick={() => handleAddStep("other")}
                      onPaste={clipboard ? () => handlePaste(activeAction.steps.length) : undefined}
                    />
                  </div>
                </SortableContext>
              )}
            </DndContext>
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
          {!contextMenuSubTypePicker ? (
            <>
              <button
                className="step-context-menu-item"
                onClick={() => handleDuplicateStep(contextMenu.stepId)}
              >
                <i className="bi bi-copy" /> 複製
              </button>
              <button
                className="step-context-menu-item"
                onClick={() => setContextMenuSubTypePicker(true)}
              >
                <i className="bi bi-diagram-2" /> サブステップ追加 ▶
              </button>
              <div className="step-context-menu-sep" />
              <button
                className="step-context-menu-item danger"
                onClick={() => handleDeleteStep(contextMenu.stepId)}
              >
                <i className="bi bi-trash" /> 削除
              </button>
            </>
          ) : (
            <>
              <button
                className="step-context-menu-item"
                onClick={() => setContextMenuSubTypePicker(false)}
              >
                <i className="bi bi-arrow-left" /> 戻る
              </button>
              <div className="step-context-menu-sep" />
              {ALL_SUB_STEP_TYPES.map((t) => (
                <button
                  key={t}
                  className="step-context-menu-item"
                  onClick={() => { handleAddSubStep(contextMenu.stepId, t); }}
                >
                  <i className={`bi ${STEP_TYPE_ICONS[t]}`} style={{ color: STEP_TYPE_COLORS[t] }} />
                  {" "}{STEP_TYPE_LABELS[t]}
                </button>
              ))}
            </>
          )}
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
