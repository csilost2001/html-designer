import { useState } from "react";
import type { Step, StepType, DbOperation } from "../../types/action";
import {
  STEP_TYPE_LABELS,
  STEP_TYPE_ICONS,
  STEP_TYPE_COLORS,
  DB_OPERATION_LABELS,
} from "../../types/action";
import { getStepLabel, resolveJumpLabel, getJumpTargetOptions } from "../../utils/actionUtils";

interface StepCardProps {
  step: Step;
  index: number;
  label: string;
  allSteps: Step[];
  tables: { id: string; name: string; logicalName: string }[];
  screens: { id: string; name: string }[];
  commonGroups: { id: string; name: string }[];
  onChange: (changes: Partial<Step>) => void;
  /** Undo 履歴にスナップショットを積む（テキストフィールドの onBlur 時に呼ぶ） */
  onCommit?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onAddSubStep: (type: StepType) => void;
  onDeleteSubStep: (subStepId: string) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onNavigateCommon: (refId: string) => void;
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
  onDeleteSubStep,
  onContextMenu,
  onNavigateCommon,
}: StepCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const color = STEP_TYPE_COLORS[step.type];

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
        return step.condition || step.description || "条件分岐";
      case "jump": {
        const jumpLabel = resolveJumpLabel(step.jumpTo, allSteps);
        return `[${jumpLabel}] へ${step.description ? ` - ${step.description}` : ""}`;
      }
      default:
        return step.description || "その他";
    }
  };

  return (
    <div>
      <div
        className="step-card"
        style={{ borderLeftColor: color }}
        onContextMenu={onContextMenu}
      >
        <div className="step-card-header" onClick={() => setExpanded(!expanded)}>
          <span className="step-card-drag-handle" title="ドラッグで移動">
            <i className="bi bi-grip-vertical" />
          </span>
          <span className="step-card-number">{label}</span>
          <i className={`step-card-icon ${STEP_TYPE_ICONS[step.type]}`} style={{ color }} />
          <span className="step-card-type-label">{STEP_TYPE_LABELS[step.type]}</span>
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
                onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
              >
                <i className="bi bi-three-dots" />
              </button>
              {showMenu && (
                <div
                  className="step-context-menu"
                  style={{ top: "100%", right: 0, position: "absolute" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button className="step-context-menu-item" onClick={() => { onDuplicate(); setShowMenu(false); }}>
                    <i className="bi bi-copy" /> 複製
                  </button>
                  <button className="step-context-menu-item" onClick={() => { onAddSubStep("other"); setShowMenu(false); }}>
                    <i className="bi bi-diagram-2" /> サブステップ追加
                  </button>
                  <div className="step-context-menu-sep" />
                  <button className="step-context-menu-item danger" onClick={() => { onDelete(); setShowMenu(false); }}>
                    <i className="bi bi-trash" /> 削除
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 展開時: 編集フォーム */}
        {expanded && (
          <div className="step-card-body">
            <div className="row g-2 mb-2">
              <div className="col-12">
                <label className="form-label">処理概要</label>
                <input
                  className="form-control form-control-sm"
                  value={step.description}
                  onChange={(e) => onChange({ description: e.target.value })}
                  onBlur={onCommit}
                  placeholder="処理の説明"
                />
              </div>
            </div>

            {/* 種別ごとの編集フィールド */}
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

            {step.type === "dbAccess" && (
              <div className="row g-2 mb-2">
                <div className="col-md-6">
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
                <div className="col-md-3">
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
                <div className="col-md-3">
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
            )}

            {step.type === "externalSystem" && (
              <div className="row g-2 mb-2">
                <div className="col-md-6">
                  <label className="form-label">接続先</label>
                  <input
                    className="form-control form-control-sm"
                    value={step.systemName}
                    onChange={(e) => onChange({ systemName: e.target.value } as Partial<Step>)}
                    onBlur={onCommit}
                    placeholder="システム名"
                  />
                </div>
                <div className="col-md-6">
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

            {step.type === "branch" && (
              <>
                <div className="row g-2 mb-2">
                  <div className="col-12">
                    <label className="form-label">分岐条件</label>
                    <input
                      className="form-control form-control-sm"
                      value={step.condition}
                      onChange={(e) => onChange({ condition: e.target.value } as Partial<Step>)}
                      onBlur={onCommit}
                      placeholder="条件式"
                    />
                  </div>
                </div>
                <div className="step-inline-branch">
                  <div className="step-branch-box ok">
                    <div className="step-branch-label">A: {step.branchA.label}</div>
                    <input
                      className="form-control form-control-sm"
                      value={step.branchA.description}
                      onChange={(e) =>
                        onChange({ branchA: { ...step.branchA, description: e.target.value } } as Partial<Step>)
                      }
                      placeholder="A分岐の処理"
                      onBlur={onCommit}
                    />
                  </div>
                  <div className="step-branch-box ng">
                    <div className="step-branch-label">B: {step.branchB.label}</div>
                    <input
                      className="form-control form-control-sm"
                      value={step.branchB.description}
                      onChange={(e) =>
                        onChange({ branchB: { ...step.branchB, description: e.target.value } } as Partial<Step>)
                      }
                      placeholder="B分岐の処理"
                      onBlur={onCommit}
                    />
                  </div>
                </div>
              </>
            )}

            {step.type === "jump" && (
              <div className="row g-2 mb-2">
                <div className="col-12">
                  <label className="form-label">ジャンプ先</label>
                  <select
                    className="form-select form-select-sm"
                    value={step.jumpTo}
                    onChange={(e) => onChange({ jumpTo: e.target.value } as Partial<Step>)}
                  >
                    <option value="">（選択）</option>
                    {getJumpTargetOptions(allSteps, step.id).map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label} {opt.description}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* メモ */}
            <div className="row g-2">
              <div className="col-12">
                <label className="form-label">メモ</label>
                <input
                  className="form-control form-control-sm"
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

      {/* サブステップ */}
      {step.subSteps && step.subSteps.length > 0 && (
        <div className="sub-steps">
          {step.subSteps.map((sub, si) => (
            <div key={sub.id} className="mb-1">
              <div
                className="step-card"
                style={{ borderLeftColor: STEP_TYPE_COLORS[sub.type] }}
              >
                <div className="step-card-header">
                  <span className="step-card-number">{getStepLabel(index, si)}</span>
                  <i className={`step-card-icon ${STEP_TYPE_ICONS[sub.type]}`} style={{ color: STEP_TYPE_COLORS[sub.type] }} />
                  <span className="step-card-type-label">{STEP_TYPE_LABELS[sub.type]}</span>
                  <span className="step-card-description">{sub.description || sub.type}</span>
                  <button
                    className="step-card-menu-btn ms-auto"
                    onClick={() => onDeleteSubStep(sub.id)}
                    title="サブステップ削除"
                  >
                    <i className="bi bi-x-lg" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
