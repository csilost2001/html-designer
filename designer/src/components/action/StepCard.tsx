import { useState, useRef, useEffect } from "react";
import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";
import type {
  Branch,
  Step,
  StepType,
  DbOperation,
  LoopKind,
  LoopConditionMode,
} from "../../types/action";
import {
  STEP_TYPE_LABELS,
  STEP_TYPE_ICONS,
  STEP_TYPE_COLORS,
  DB_OPERATION_LABELS,
} from "../../types/action";
import { resolveJumpLabel } from "../../utils/actionUtils";
import type { ValidationError } from "../../utils/actionValidation";
import { getBranchConditionText } from "../../utils/branchCondition";
import { generateUUID } from "../../utils/uuid";
import { createDefaultStep } from "../../store/actionStore";
import { MaturityBadge } from "./MaturityBadge";
import { NotesPanel } from "./NotesPanel";
import { JumpTargetSelector } from "./JumpTargetSelector";

const ALL_SUB_STEP_TYPES: StepType[] = [
  "validation", "dbAccess", "externalSystem", "commonProcess",
  "screenTransition", "displayUpdate", "branch", "loop",
  "loopBreak", "loopContinue", "jump", "other",
];

// ─── ヘルパーコンポーネント ──────────────────────────────────────────────────

function AutoResizeTextarea({
  value, onChange, onBlur, placeholder, className,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = `${ref.current.scrollHeight}px`;
    }
  }, [value]);
  return (
    <textarea
      ref={ref}
      className={className ?? "form-control form-control-sm auto-resize"}
      value={value}
      rows={1}
      onChange={onChange}
      onBlur={onBlur}
      placeholder={placeholder}
    />
  );
}

// ─── インラインステップリスト ─────────────────────────────────────────────────
// branch.steps / loop.steps の再帰レンダリング用。
// function 宣言（ホイスティング）で定義することで StepCard との相互参照を実現。

interface InlineStepListProps {
  steps: Step[];
  parentLabel: string;
  allSteps: Step[];
  tables: { id: string; name: string; logicalName: string }[];
  screens: { id: string; name: string }[];
  commonGroups: { id: string; name: string }[];
  onChange: (steps: Step[]) => void;
  onCommit?: () => void;
  onNavigateCommon: (refId: string) => void;
  validationErrors?: ValidationError[];
}

function InlineStepList({
  steps,
  parentLabel,
  allSteps,
  tables,
  screens,
  commonGroups,
  onChange,
  onCommit,
  onNavigateCommon,
  validationErrors,
}: InlineStepListProps) {
  const [showTypePicker, setShowTypePicker] = useState(false);

  const addStep = (type: StepType) => {
    const newStep = createDefaultStep(type);
    onChange([...steps, newStep]);
    onCommit?.();
    setShowTypePicker(false);
  };

  return (
    <div className="inline-step-list">
      {steps.map((step, si) => (
        <div key={step.id} className="mb-1">
          <StepCard
            step={step}
            index={si}
            label={`${parentLabel}-${si + 1}`}
            allSteps={allSteps}
            tables={tables}
            screens={screens}
            commonGroups={commonGroups}
            onChange={(changes) => {
              const arr = steps.slice();
              arr[si] = { ...arr[si], ...changes } as Step;
              onChange(arr);
            }}
            onCommit={onCommit}
            onMoveUp={si > 0 ? () => {
              const arr = steps.slice();
              [arr[si - 1], arr[si]] = [arr[si], arr[si - 1]];
              onChange(arr);
              onCommit?.();
            } : undefined}
            onMoveDown={si < steps.length - 1 ? () => {
              const arr = steps.slice();
              [arr[si], arr[si + 1]] = [arr[si + 1], arr[si]];
              onChange(arr);
              onCommit?.();
            } : undefined}
            onDelete={() => {
              onChange(steps.filter((s) => s.id !== step.id));
              onCommit?.();
            }}
            onDuplicate={() => {
              const clone = JSON.parse(JSON.stringify(step)) as Step;
              clone.id = generateUUID();
              const arr = steps.slice();
              arr.splice(si + 1, 0, clone);
              onChange(arr);
              onCommit?.();
            }}
            onAddSubStep={(type) => {
              const newSub = createDefaultStep(type);
              const arr = steps.slice();
              arr[si] = { ...arr[si], subSteps: [...(arr[si].subSteps ?? []), newSub] } as Step;
              onChange(arr);
              onCommit?.();
            }}
            onContextMenu={(e) => e.preventDefault()}
            onNavigateCommon={onNavigateCommon}
            depth={1}
            validationErrors={validationErrors}
          />
        </div>
      ))}
      <div className="inline-step-add">
        <button className="inline-add-btn" onClick={() => setShowTypePicker(!showTypePicker)}>
          <i className="bi bi-plus" /> ステップを追加
        </button>
        {showTypePicker && (
          <div className="inline-type-picker">
            {ALL_SUB_STEP_TYPES.map((t) => (
              <button key={t} className="inline-type-btn" onClick={() => addStep(t)}>
                <i className={`bi ${STEP_TYPE_ICONS[t]}`} style={{ color: STEP_TYPE_COLORS[t] }} />
                {STEP_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── StepCard ────────────────────────────────────────────────────────────────

interface StepCardProps {
  step: Step;
  index: number;
  label: string;
  allSteps: Step[];
  tables: { id: string; name: string; logicalName: string }[];
  screens: { id: string; name: string }[];
  commonGroups: { id: string; name: string }[];
  onChange: (changes: Partial<Step>) => void;
  onCommit?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onAddSubStep: (type: StepType) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onNavigateCommon: (refId: string) => void;
  defaultExpanded?: boolean;
  dragHandleListeners?: DraggableSyntheticListeners;
  dragHandleAttributes?: DraggableAttributes;
  selected?: boolean;
  onHeaderClick?: (e: React.MouseEvent) => void;
  onIndent?: () => void;
  onOutdent?: () => void;
  onOutdentSubStep?: (subStepId: string) => void;
  depth?: number;
  validationErrors?: ValidationError[];
}

const DB_OPS: DbOperation[] = ["SELECT", "INSERT", "UPDATE", "DELETE"];

export function StepCard({
  step,
  index,
  label,
  allSteps,
  tables,
  screens,
  commonGroups,
  onChange,
  onCommit,
  onMoveUp,
  onMoveDown,
  onDelete,
  onDuplicate,
  onAddSubStep,
  onContextMenu,
  onNavigateCommon,
  defaultExpanded,
  dragHandleListeners,
  dragHandleAttributes,
  selected,
  onHeaderClick,
  onIndent,
  onOutdent,
  onOutdentSubStep,
  depth = 0,
  validationErrors = [],
}: StepCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);
  const [showMenu, setShowMenu] = useState(false);
  const [showSubTypePicker, setShowSubTypePicker] = useState(false);
  const [collapsedBranchIds, setCollapsedBranchIds] = useState<Set<string>>(new Set());
  const [loopBodyCollapsed, setLoopBodyCollapsed] = useState(false);

  const color = STEP_TYPE_COLORS[step.type];
  const subSteps = step.subSteps ?? [];
  const myErrors = validationErrors.filter((e) => e.stepId === step.id);
  const hasError = myErrors.some((e) => e.severity === "error");
  const hasWarning = myErrors.some((e) => e.severity === "warning");

  const summaryText = (): string => {
    switch (step.type) {
      case "validation":
        return step.conditions || step.description || "バリデーション";
      case "dbAccess":
        return `${step.tableName || "?"} ${DB_OPERATION_LABELS[step.operation] ?? step.operation}${step.description ? ` - ${step.description}` : ""}`;
      case "externalSystem":
        return `${step.systemName || "?"}${step.protocol ? ` (${step.protocol})` : ""}${step.description ? ` - ${step.description}` : ""}`;
      case "commonProcess":
        return step.refName || step.description || "共通処理";
      case "screenTransition":
        return `${step.targetScreenName || "?"}${step.description ? ` - ${step.description}` : ""}`;
      case "displayUpdate":
        return step.target || step.description || "表示更新";
      case "branch":
        return step.description || getBranchConditionText(step.branches[0]?.condition) || "条件分岐";
      case "loop":
        if (step.loopKind === "count") return step.countExpression || step.description || "ループ";
        if (step.loopKind === "condition") return step.conditionExpression || step.description || "ループ";
        return `${step.collectionSource || "コレクション"}${step.collectionItemName ? ` [${step.collectionItemName}]` : ""}`;
      case "loopBreak":
        return step.description || "ループ終了";
      case "loopContinue":
        return step.description || "次のループへ";
      case "jump": {
        const jumpLabel = resolveJumpLabel(step.jumpTo, allSteps);
        return `[${jumpLabel}] へ${step.description ? ` - ${step.description}` : ""}`;
      }
      default:
        return step.description || "その他";
    }
  };

  // ── サブステップ管理 ────────────────────────────────────────────────────────

  const handleSubAddSubStep = (parentSubIdx: number, type: StepType) => {
    const newSub = createDefaultStep(type);
    const arr = subSteps.slice();
    arr[parentSubIdx] = {
      ...arr[parentSubIdx],
      subSteps: [...(arr[parentSubIdx].subSteps ?? []), newSub],
    };
    onChange({ subSteps: arr });
    onCommit?.();
  };

  const handleOutdentFromSubSteps = (parentSubId: string, stepToOutdentId: string) => {
    const arr = subSteps.slice();
    const parentIdx = arr.findIndex((s) => s.id === parentSubId);
    if (parentIdx < 0) return;
    const parent = { ...arr[parentIdx] };
    const outIdx = (parent.subSteps ?? []).findIndex((s) => s.id === stepToOutdentId);
    if (outIdx < 0) return;
    const outStep = parent.subSteps![outIdx];
    parent.subSteps = parent.subSteps!.filter((s) => s.id !== stepToOutdentId);
    arr[parentIdx] = parent;
    arr.splice(parentIdx + 1, 0, outStep);
    onChange({ subSteps: arr });
    onCommit?.();
  };

  // ── 分岐管理 (Phase 3) ──────────────────────────────────────────────────────

  const toggleBranchCollapse = (branchId: string) => {
    setCollapsedBranchIds((prev) => {
      const next = new Set(prev);
      if (next.has(branchId)) next.delete(branchId);
      else next.add(branchId);
      return next;
    });
  };

  const setBranchAt = (idx: number, next: Branch) => {
    if (step.type !== "branch") return;
    const branches = step.branches.slice();
    branches[idx] = next;
    onChange({ branches } as Partial<Step>);
  };

  const moveBranchUp = (idx: number) => {
    if (step.type !== "branch" || idx <= 0) return;
    const branches = step.branches.map((b) => ({ ...b }));
    [branches[idx - 1], branches[idx]] = [branches[idx], branches[idx - 1]];
    branches.forEach((b, i) => { b.code = String.fromCharCode(65 + i); });
    onChange({ branches } as Partial<Step>);
    onCommit?.();
  };

  const moveBranchDown = (idx: number) => {
    if (step.type !== "branch") return;
    const branches = step.branches.map((b) => ({ ...b }));
    if (idx >= branches.length - 1) return;
    [branches[idx], branches[idx + 1]] = [branches[idx + 1], branches[idx]];
    branches.forEach((b, i) => { b.code = String.fromCharCode(65 + i); });
    onChange({ branches } as Partial<Step>);
    onCommit?.();
  };

  const deleteBranch = (idx: number) => {
    if (step.type !== "branch" || step.branches.length <= 1) return;
    const branches = step.branches.filter((_, i) => i !== idx).map((b, i) => ({
      ...b,
      code: String.fromCharCode(65 + i),
    }));
    onChange({ branches } as Partial<Step>);
    onCommit?.();
  };

  const addBranch = () => {
    if (step.type !== "branch") return;
    const code = String.fromCharCode(65 + step.branches.length);
    const newBranch: Branch = { id: generateUUID(), code, condition: "", steps: [] };
    onChange({ branches: [...step.branches, newBranch] } as Partial<Step>);
    onCommit?.();
  };

  const addElseBranch = () => {
    if (step.type !== "branch") return;
    const elseBranch: Branch = { id: generateUUID(), code: "ELSE", condition: "", steps: [] };
    onChange({ elseBranch } as Partial<Step>);
    onCommit?.();
  };

  // ────────────────────────────────────────────────────────────────────────────

  const cardClass = [
    "step-card",
    selected ? "selected" : "",
    hasError ? "has-error" : "",
    hasWarning && !hasError ? "has-warning" : "",
  ].filter(Boolean).join(" ");

  return (
    <div>
      <div
        className={cardClass}
        style={{ borderLeftColor: color }}
        onContextMenu={onContextMenu}
      >
        <div
          className="step-card-header"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("[data-drag-handle]")) return;
            if ((e.ctrlKey || e.metaKey || e.shiftKey) && onHeaderClick) {
              onHeaderClick(e);
            } else {
              if (onHeaderClick) onHeaderClick(e);
              setExpanded(!expanded);
            }
          }}
        >
          {(dragHandleListeners || dragHandleAttributes) && (
            <span
              className="step-card-drag-handle"
              title="ドラッグで移動"
              data-drag-handle
              {...dragHandleAttributes}
              {...dragHandleListeners}
            >
              <i className="bi bi-grip-vertical" />
            </span>
          )}
          <span className="step-card-number">{label}</span>
          <i className={`step-card-icon ${STEP_TYPE_ICONS[step.type]}`} style={{ color }} />
          <span className="step-card-type-label">{STEP_TYPE_LABELS[step.type]}</span>
          <MaturityBadge
            maturity={step.maturity}
            onChange={(next) => onChange({ maturity: next } as Partial<Step>)}
          />
          <span className="step-card-description">{summaryText()}</span>
          {step.type === "commonProcess" && step.refId && (
            <button
              className="btn btn-link btn-sm p-0 text-success"
              onClick={(e) => { e.stopPropagation(); onNavigateCommon(step.refId); }}
              title="共通処理の定義を開く"
            >
              <i className="bi bi-box-arrow-up-right" />
            </button>
          )}
          <div className="d-flex gap-1 ms-auto" style={{ flexShrink: 0 }}>
            {onOutdent && (
              <button className="step-card-menu-btn" onClick={(e) => { e.stopPropagation(); onOutdent(); }} title="上位レベルに移動（アウトデント）">
                <i className="bi bi-chevron-left" />
              </button>
            )}
            {onIndent && (
              <button className="step-card-menu-btn" onClick={(e) => { e.stopPropagation(); onIndent(); }} title="前のステップのサブステップに移動（インデント）">
                <i className="bi bi-chevron-right" />
              </button>
            )}
            {onMoveUp && (
              <button className="step-card-menu-btn" onClick={(e) => { e.stopPropagation(); onMoveUp(); }} title="上に移動">
                <i className="bi bi-chevron-up" />
              </button>
            )}
            {onMoveDown && (
              <button className="step-card-menu-btn" onClick={(e) => { e.stopPropagation(); onMoveDown(); }} title="下に移動">
                <i className="bi bi-chevron-down" />
              </button>
            )}
            <div style={{ position: "relative" }}>
              <button
                className="step-card-menu-btn"
                onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); setShowSubTypePicker(false); }}
              >
                <i className="bi bi-three-dots" />
              </button>
              {showMenu && (
                <div
                  className="step-context-menu"
                  style={{ top: "100%", right: 0, position: "absolute" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {!showSubTypePicker ? (
                    <>
                      <button className="step-context-menu-item" onClick={() => { onDuplicate(); setShowMenu(false); }}>
                        <i className="bi bi-copy" /> 複製
                      </button>
                      <button className="step-context-menu-item" onClick={() => setShowSubTypePicker(true)}>
                        <i className="bi bi-diagram-2" /> サブステップ追加 ▶
                      </button>
                      <div className="step-context-menu-sep" />
                      <button className="step-context-menu-item danger" onClick={() => { onDelete(); setShowMenu(false); }}>
                        <i className="bi bi-trash" /> 削除
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="step-context-menu-item" onClick={() => setShowSubTypePicker(false)}>
                        <i className="bi bi-arrow-left" /> 戻る
                      </button>
                      <div className="step-context-menu-sep" />
                      {ALL_SUB_STEP_TYPES.map((t) => (
                        <button
                          key={t}
                          className="step-context-menu-item"
                          onClick={() => { onAddSubStep(t); setShowMenu(false); setShowSubTypePicker(false); }}
                        >
                          <i className={`bi ${STEP_TYPE_ICONS[t]}`} style={{ color: STEP_TYPE_COLORS[t] }} />
                          {" "}{STEP_TYPE_LABELS[t]}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* バリデーションメッセージ */}
        {myErrors.map((e, i) => (
          <div key={i} className={`step-validation-msg ${e.severity}`}>
            <i className={`bi ${e.severity === "error" ? "bi-x-circle-fill" : "bi-exclamation-triangle-fill"}`} />
            {e.message}
          </div>
        ))}

        {/* 展開時: 編集フォーム */}
        {expanded && (
          <div className="step-card-body">
            <div className="row g-2 mb-2">
              <div className="col-12">
                <label className="form-label">処理概要</label>
                <AutoResizeTextarea
                  value={step.description}
                  onChange={(e) => onChange({ description: e.target.value })}
                  onBlur={onCommit}
                  placeholder="処理の説明"
                />
              </div>
            </div>
            <NotesPanel
              notes={step.notes}
              onChange={(notes) => onChange({ notes } as Partial<Step>)}
            />

            {/* ── バリデーション ───────────────────────────────── */}
            {step.type === "validation" && (
              <>
                <div className="row g-2 mb-2">
                  <div className="col-12">
                    <label className="form-label">バリデーション条件</label>
                    <input
                      className="form-control form-control-sm"
                      value={step.conditions}
                      onChange={(e) => onChange({ conditions: e.target.value } as Partial<Step>)}
                      onBlur={onCommit}
                      placeholder="必須チェック、形式チェック等"
                    />
                  </div>
                </div>
                {step.inlineBranch && (
                  <div className="step-inline-branch">
                    <div className="step-branch-box ok">
                      <div className="step-branch-label">A: OK</div>
                      <input
                        className="form-control form-control-sm"
                        value={step.inlineBranch.ok}
                        onChange={(e) =>
                          onChange({ inlineBranch: { ...step.inlineBranch!, ok: e.target.value } } as Partial<Step>)
                        }
                        placeholder="OK時の処理"
                        onBlur={onCommit}
                      />
                    </div>
                    <div className="step-branch-box ng">
                      <div className="step-branch-label">B: NG</div>
                      <input
                        className="form-control form-control-sm"
                        value={step.inlineBranch.ng}
                        onChange={(e) =>
                          onChange({ inlineBranch: { ...step.inlineBranch!, ng: e.target.value } } as Partial<Step>)
                        }
                        placeholder="NG時の処理"
                        onBlur={onCommit}
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── DB操作 ──────────────────────────────────────── */}
            {step.type === "dbAccess" && (
              <>
                <div className="form-group">
                  <label className="form-label">テーブル</label>
                  <select
                    className="form-select form-select-sm"
                    value={step.tableName}
                    onChange={(e) => {
                      const t = tables.find((t) => t.name === e.target.value);
                      onChange({ tableName: e.target.value, tableId: t?.id } as Partial<Step>);
                    }}
                  >
                    <option value="">（選択）</option>
                    {tables.map((t) => (
                      <option key={t.id} value={t.name}>{t.name}（{t.logicalName}）</option>
                    ))}
                  </select>
                </div>
                <div className="form-row-pair">
                  <div className="form-group">
                    <label className="form-label">操作</label>
                    <select
                      className="form-select form-select-sm"
                      value={step.operation}
                      onChange={(e) => onChange({ operation: e.target.value as DbOperation } as Partial<Step>)}
                    >
                      {DB_OPS.map((op) => (
                        <option key={op} value={op}>{DB_OPERATION_LABELS[op]}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">対象フィールド</label>
                    <input
                      className="form-control form-control-sm"
                      value={step.fields ?? ""}
                      onChange={(e) => onChange({ fields: e.target.value } as Partial<Step>)}
                      onBlur={onCommit}
                      placeholder="概要"
                    />
                  </div>
                </div>
              </>
            )}

            {/* ── 外部システム ─────────────────────────────────── */}
            {step.type === "externalSystem" && (
              <div className="form-row-pair">
                <div className="form-group">
                  <label className="form-label">接続先</label>
                  <input
                    className="form-control form-control-sm"
                    value={step.systemName}
                    onChange={(e) => onChange({ systemName: e.target.value } as Partial<Step>)}
                    onBlur={onCommit}
                    placeholder="システム名"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">プロトコル</label>
                  <input
                    className="form-control form-control-sm"
                    value={step.protocol ?? ""}
                    onChange={(e) => onChange({ protocol: e.target.value } as Partial<Step>)}
                    onBlur={onCommit}
                    placeholder="REST / SOAP / gRPC"
                  />
                </div>
              </div>
            )}

            {/* ── 共通処理 ─────────────────────────────────────── */}
            {step.type === "commonProcess" && (
              <div className="row g-2 mb-2">
                <div className="col-12">
                  <label className="form-label">共通処理</label>
                  <select
                    className="form-select form-select-sm"
                    value={step.refId}
                    onChange={(e) => {
                      const cg = commonGroups.find((g) => g.id === e.target.value);
                      onChange({ refId: e.target.value, refName: cg?.name ?? "" } as Partial<Step>);
                    }}
                  >
                    <option value="">（選択）</option>
                    {commonGroups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* ── 画面遷移 ─────────────────────────────────────── */}
            {step.type === "screenTransition" && (
              <div className="row g-2 mb-2">
                <div className="col-12">
                  <label className="form-label">遷移先画面</label>
                  <select
                    className="form-select form-select-sm"
                    value={step.targetScreenId ?? ""}
                    onChange={(e) => {
                      const s = screens.find((s) => s.id === e.target.value);
                      onChange({ targetScreenId: e.target.value, targetScreenName: s?.name ?? e.target.value } as Partial<Step>);
                    }}
                  >
                    <option value="">（選択または手入力）</option>
                    {screens.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <input
                    className="form-control form-control-sm mt-1"
                    value={step.targetScreenName}
                    onChange={(e) => onChange({ targetScreenName: e.target.value } as Partial<Step>)}
                    onBlur={onCommit}
                    placeholder="画面名を直接入力"
                  />
                </div>
              </div>
            )}

            {/* ── 表示更新 ─────────────────────────────────────── */}
            {step.type === "displayUpdate" && (
              <div className="row g-2 mb-2">
                <div className="col-12">
                  <label className="form-label">更新対象</label>
                  <input
                    className="form-control form-control-sm"
                    value={step.target}
                    onChange={(e) => onChange({ target: e.target.value } as Partial<Step>)}
                    onBlur={onCommit}
                    placeholder="メッセージ表示、一覧テーブル更新 等"
                  />
                </div>
              </div>
            )}

            {/* ── 条件分岐 (Phase 3) ───────────────────────────── */}
            {step.type === "branch" && (
              <div className="branch-sections">
                {step.branches.map((br, bi) => {
                  const isCollapsed = collapsedBranchIds.has(br.id);
                  return (
                    <div key={br.id} className={`branch-section${isCollapsed ? " collapsed" : ""}`}>
                      <div
                        className="branch-section-header"
                        onClick={() => toggleBranchCollapse(br.id)}
                      >
                        <span className="branch-code-badge">{br.code}</span>
                        <input
                          className="form-control form-control-sm branch-condition-input"
                          value={getBranchConditionText(br.condition)}
                          placeholder="分岐条件"
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setBranchAt(bi, { ...br, condition: e.target.value })}
                          onBlur={onCommit}
                        />
                        {bi > 0 && (
                          <button
                            className="step-card-menu-btn"
                            title="上に移動"
                            onClick={(e) => { e.stopPropagation(); moveBranchUp(bi); }}
                          >
                            <i className="bi bi-chevron-up" />
                          </button>
                        )}
                        {bi < step.branches.length - 1 && (
                          <button
                            className="step-card-menu-btn"
                            title="下に移動"
                            onClick={(e) => { e.stopPropagation(); moveBranchDown(bi); }}
                          >
                            <i className="bi bi-chevron-down" />
                          </button>
                        )}
                        {step.branches.length > 1 && (
                          <button
                            className="step-card-menu-btn danger"
                            title="分岐を削除"
                            onClick={(e) => { e.stopPropagation(); deleteBranch(bi); }}
                          >
                            <i className="bi bi-trash" />
                          </button>
                        )}
                        <i
                          className={`bi bi-chevron-${isCollapsed ? "right" : "down"}`}
                          style={{ color: "#94a3b8", flexShrink: 0 }}
                        />
                      </div>
                      {!isCollapsed && (
                        <div className="branch-section-body">
                          <InlineStepList
                            steps={br.steps}
                            parentLabel={br.code}
                            allSteps={allSteps}
                            tables={tables}
                            screens={screens}
                            commonGroups={commonGroups}
                            onChange={(newSteps) => setBranchAt(bi, { ...br, steps: newSteps })}
                            onCommit={onCommit}
                            onNavigateCommon={onNavigateCommon}
                            validationErrors={validationErrors}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* ELSE分岐 */}
                {step.elseBranch && (() => {
                  const el = step.elseBranch;
                  const isCollapsed = collapsedBranchIds.has(el.id);
                  return (
                    <div className={`branch-section else${isCollapsed ? " collapsed" : ""}`}>
                      <div
                        className="branch-section-header"
                        onClick={() => toggleBranchCollapse(el.id)}
                      >
                        <span className="branch-code-badge">ELSE</span>
                        <span style={{ flex: 1, fontSize: "0.78rem", color: "#64748b" }}>
                          その他の場合
                        </span>
                        <button
                          className="step-card-menu-btn danger"
                          title="ELSE分岐を削除"
                          onClick={(e) => {
                            e.stopPropagation();
                            onChange({ elseBranch: undefined } as Partial<Step>);
                            onCommit?.();
                          }}
                        >
                          <i className="bi bi-trash" />
                        </button>
                        <i
                          className={`bi bi-chevron-${isCollapsed ? "right" : "down"}`}
                          style={{ color: "#94a3b8", flexShrink: 0 }}
                        />
                      </div>
                      {!isCollapsed && (
                        <div className="branch-section-body">
                          <InlineStepList
                            steps={el.steps}
                            parentLabel="ELSE"
                            allSteps={allSteps}
                            tables={tables}
                            screens={screens}
                            commonGroups={commonGroups}
                            onChange={(newSteps) =>
                              onChange({ elseBranch: { ...el, steps: newSteps } } as Partial<Step>)
                            }
                            onCommit={onCommit}
                            onNavigateCommon={onNavigateCommon}
                            validationErrors={validationErrors}
                          />
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div className="branch-add-row">
                  <button className="branch-add-btn" onClick={addBranch}>
                    <i className="bi bi-plus" /> 分岐を追加
                  </button>
                  {!step.elseBranch && (
                    <button className="branch-add-btn" onClick={addElseBranch} style={{ flex: "0 0 auto" }}>
                      <i className="bi bi-plus" /> ELSE分岐
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── ループ (Phase 4) ─────────────────────────────── */}
            {step.type === "loop" && (
              <div>
                <div className="loop-kind-radios">
                  {(["count", "condition", "collection"] as LoopKind[]).map((k) => (
                    <label key={k}>
                      <input
                        type="radio"
                        name={`loopkind-${step.id}`}
                        value={k}
                        checked={step.loopKind === k}
                        onChange={() => onChange({ loopKind: k } as Partial<Step>)}
                      />
                      {k === "count" ? "回数" : k === "condition" ? "条件" : "コレクション"}
                    </label>
                  ))}
                </div>

                {step.loopKind === "count" && (
                  <div className="form-group">
                    <label className="form-label">回数 / 範囲</label>
                    <input
                      className="form-control form-control-sm"
                      value={step.countExpression ?? ""}
                      onChange={(e) => onChange({ countExpression: e.target.value } as Partial<Step>)}
                      onBlur={onCommit}
                      placeholder="例: 3回, 検索結果の件数分"
                    />
                  </div>
                )}

                {step.loopKind === "condition" && (
                  <>
                    <div className="form-group mb-2">
                      <label className="form-label">条件モード</label>
                      <div className="d-flex gap-3 flex-wrap">
                        {(["continue", "exit"] as LoopConditionMode[]).map((m) => (
                          <label key={m} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.82rem", cursor: "pointer" }}>
                            <input
                              type="radio"
                              name={`condmode-${step.id}`}
                              value={m}
                              checked={(step.conditionMode ?? "exit") === m}
                              onChange={() => onChange({ conditionMode: m } as Partial<Step>)}
                            />
                            {m === "continue" ? "条件の間繰り返す (while)" : "条件になるまで繰り返す (until)"}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">条件式</label>
                      <input
                        className="form-control form-control-sm"
                        value={step.conditionExpression ?? ""}
                        onChange={(e) => onChange({ conditionExpression: e.target.value } as Partial<Step>)}
                        onBlur={onCommit}
                        placeholder="例: 残件数 > 0"
                      />
                    </div>
                  </>
                )}

                {step.loopKind === "collection" && (
                  <div className="form-row-pair">
                    <div className="form-group">
                      <label className="form-label">コレクション</label>
                      <input
                        className="form-control form-control-sm"
                        value={step.collectionSource ?? ""}
                        onChange={(e) => onChange({ collectionSource: e.target.value } as Partial<Step>)}
                        onBlur={onCommit}
                        placeholder="例: 検索結果"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">要素変数名</label>
                      <input
                        className="form-control form-control-sm"
                        value={step.collectionItemName ?? ""}
                        onChange={(e) => onChange({ collectionItemName: e.target.value } as Partial<Step>)}
                        onBlur={onCommit}
                        placeholder="例: ユーザー"
                      />
                    </div>
                  </div>
                )}

                <div className={`loop-body${loopBodyCollapsed ? " collapsed" : ""}`}>
                  <div
                    className="loop-body-header"
                    onClick={() => setLoopBodyCollapsed(!loopBodyCollapsed)}
                  >
                    <i className="bi bi-arrow-repeat" />
                    ループ本体
                    <i
                      className={`bi bi-chevron-${loopBodyCollapsed ? "right" : "down"} ms-auto`}
                      style={{ color: "#94a3b8" }}
                    />
                  </div>
                  {!loopBodyCollapsed && (
                    <div className="loop-body-content">
                      <InlineStepList
                        steps={step.steps}
                        parentLabel="L"
                        allSteps={allSteps}
                        tables={tables}
                        screens={screens}
                        commonGroups={commonGroups}
                        onChange={(newSteps) => onChange({ steps: newSteps } as Partial<Step>)}
                        onCommit={onCommit}
                        onNavigateCommon={onNavigateCommon}
                        validationErrors={validationErrors}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── ジャンプ (Phase 5) ───────────────────────────── */}
            {step.type === "jump" && (
              <div className="row g-2 mb-2">
                <div className="col-12">
                  <label className="form-label">ジャンプ先</label>
                  <JumpTargetSelector
                    value={step.jumpTo}
                    allSteps={allSteps}
                    excludeStepId={step.id}
                    onChange={(val) => onChange({ jumpTo: val } as Partial<Step>)}
                    onBlur={onCommit}
                  />
                </div>
              </div>
            )}

            <div className="row g-2">
              <div className="col-12">
                <label className="form-label">メモ</label>
                <AutoResizeTextarea
                  value={step.note ?? ""}
                  onChange={(e) => onChange({ note: e.target.value })}
                  onBlur={onCommit}
                  placeholder="補足情報"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* サブステップ（再帰レンダリング） */}
      {subSteps.length > 0 && (
        <div className="sub-steps">
          {subSteps.map((sub, si) => (
            <div key={sub.id} className="mb-1">
              <StepCard
                step={sub}
                index={si}
                label={`${index + 1}-${si + 1}`}
                allSteps={allSteps}
                tables={tables}
                screens={screens}
                commonGroups={commonGroups}
                onChange={(changes) => {
                  const arr = subSteps.slice();
                  const idx = arr.findIndex((s) => s.id === sub.id);
                  if (idx >= 0) {
                    arr[idx] = { ...arr[idx], ...changes } as Step;
                    onChange({ subSteps: arr });
                  }
                }}
                onCommit={onCommit}
                onMoveUp={si > 0 ? () => {
                  const arr = subSteps.slice();
                  [arr[si - 1], arr[si]] = [arr[si], arr[si - 1]];
                  onChange({ subSteps: arr });
                  onCommit?.();
                } : undefined}
                onMoveDown={si < subSteps.length - 1 ? () => {
                  const arr = subSteps.slice();
                  [arr[si], arr[si + 1]] = [arr[si + 1], arr[si]];
                  onChange({ subSteps: arr });
                  onCommit?.();
                } : undefined}
                onDelete={() => {
                  onChange({ subSteps: subSteps.filter((s) => s.id !== sub.id) });
                  onCommit?.();
                }}
                onDuplicate={() => {
                  const clone = JSON.parse(JSON.stringify(sub)) as Step;
                  clone.id = generateUUID();
                  const arr = subSteps.slice();
                  arr.splice(si + 1, 0, clone);
                  onChange({ subSteps: arr });
                  onCommit?.();
                }}
                onAddSubStep={(type) => handleSubAddSubStep(si, type)}
                onContextMenu={(e) => e.preventDefault()}
                onNavigateCommon={onNavigateCommon}
                depth={depth + 1}
                onOutdent={onOutdentSubStep ? () => onOutdentSubStep(sub.id) : undefined}
                onOutdentSubStep={(subSubId) => handleOutdentFromSubSteps(sub.id, subSubId)}
                validationErrors={validationErrors}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
