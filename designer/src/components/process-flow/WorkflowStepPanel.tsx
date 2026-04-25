import type { Step, WorkflowApprover, WorkflowPattern, WorkflowStep } from "../../types/action";
import {
  WORKFLOW_PATTERN_LABELS,
  WORKFLOW_PATTERN_VALUES,
} from "../../types/action";
import type { ConventionsCatalog } from "../../schemas/conventionsValidator";
import { ConvCompletionInput } from "../common/ConvCompletionInput";
import { JumpTargetSelector } from "./JumpTargetSelector";

interface Props {
  step: WorkflowStep;
  allSteps: Step[];
  conventions?: ConventionsCatalog | null;
  onChange: (patch: Partial<WorkflowStep>) => void;
  onCommit?: () => void;
}

function normalizePositiveInteger(value: string): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

export function WorkflowStepPanel({
  step,
  allSteps,
  conventions,
  onChange,
  onCommit,
}: Props) {
  const approvers = step.approvers ?? [];
  const roleOptions = Object.entries(conventions?.role ?? {});

  const updateApprover = (index: number, patch: Partial<WorkflowApprover>) => {
    onChange({
      approvers: approvers.map((approver, i) => (
        i === index ? { ...approver, ...patch } : approver
      )),
    });
  };

  const addApprover = () => {
    onChange({
      approvers: [
        ...approvers,
        { role: roleOptions[0]?.[0] ?? "", order: approvers.length + 1 },
      ],
    });
  };

  const removeApprover = (index: number) => {
    onChange({ approvers: approvers.filter((_, i) => i !== index) });
    onCommit?.();
  };

  const roleSelect = (
    value: string,
    onRoleChange: (value: string) => void,
    fieldPath: string,
  ) => (
    <select
      className="form-select form-select-sm"
      value={value}
      onChange={(e) => onRoleChange(e.target.value)}
      onBlur={onCommit}
      data-field-path={fieldPath}
    >
      <option value="">ロールを選択</option>
      {roleOptions.map(([key, role]) => (
        <option key={key} value={key}>
          {role.name ? `${role.name} (${key})` : key}
        </option>
      ))}
      {value && !roleOptions.some(([key]) => key === value) && (
        <option value={value}>{value}</option>
      )}
    </select>
  );

  const targetSelector = (
    value: string | undefined,
    onTargetChange: (value: string | undefined) => void,
  ) => (
    <JumpTargetSelector
      value={value ?? ""}
      allSteps={allSteps}
      excludeStepId={step.id}
      onChange={(next) => onTargetChange(next || undefined)}
      onBlur={onCommit}
    />
  );

  return (
    <div className="workflow-step-panel" style={{ marginTop: 8 }}>
      <div className="row g-2 mb-2">
        <div className="col-md-6" data-field-path="pattern">
          <label className="form-label">ワークフローパターン</label>
          <select
            className="form-select form-select-sm"
            value={step.pattern}
            onChange={(e) => onChange({ pattern: e.target.value as WorkflowPattern })}
            onBlur={onCommit}
          >
            {WORKFLOW_PATTERN_VALUES.map((pattern) => (
              <option key={pattern} value={pattern}>
                {WORKFLOW_PATTERN_LABELS[pattern]} ({pattern})
              </option>
            ))}
          </select>
        </div>

        <div className="col-md-3" data-field-path="quorum">
          <label className="form-label">必要承認数</label>
          <input
            type="number"
            min={1}
            className="form-control form-control-sm"
            value={step.quorum ?? ""}
            onChange={(e) => onChange({ quorum: normalizePositiveInteger(e.target.value) })}
            onBlur={onCommit}
            placeholder="例: 1"
          />
        </div>
      </div>

      <div className="mb-2" data-field-path="approvers">
        <div className="d-flex align-items-center justify-content-between mb-1">
          <label className="form-label mb-0">承認者ロール</label>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary py-0"
            onClick={addApprover}
            style={{ fontSize: "0.75rem" }}
          >
            <i className="bi bi-plus-lg" /> 追加
          </button>
        </div>

        {approvers.length === 0 && (
          <div className="text-muted mb-1" style={{ fontSize: "0.78rem" }}>
            承認者ロールを追加してください。
          </div>
        )}

        {approvers.map((approver, index) => (
          <div key={index} className="row g-1 align-items-center mb-1">
            <div className="col-md-4">
              {roleSelect(
                approver.role,
                (value) => updateApprover(index, { role: value }),
                `approvers[${index}].role`,
              )}
            </div>
            <div className="col-md-5" data-field-path={`approvers[${index}].label`}>
              <input
                type="text"
                className="form-control form-control-sm"
                value={approver.label ?? ""}
                onChange={(e) => updateApprover(index, { label: e.target.value || undefined })}
                onBlur={onCommit}
                placeholder="表示名"
              />
            </div>
            <div className="col-md-2" data-field-path={`approvers[${index}].order`}>
              <input
                type="number"
                min={1}
                className="form-control form-control-sm"
                value={approver.order ?? ""}
                onChange={(e) => updateApprover(index, { order: normalizePositiveInteger(e.target.value) })}
                onBlur={onCommit}
                placeholder="順序"
              />
            </div>
            <div className="col-auto">
              <button
                type="button"
                className="btn btn-sm btn-link text-danger p-0"
                onClick={() => removeApprover(index)}
                title="削除"
              >
                <i className="bi bi-x" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="row g-2 mb-2">
        <div className="col-md-4" data-field-path="onApproved">
          <label className="form-label">承認時</label>
          {targetSelector(step.onApproved, (value) => onChange({ onApproved: value }))}
        </div>
        <div className="col-md-4" data-field-path="onRejected">
          <label className="form-label">却下・差戻し時</label>
          {targetSelector(step.onRejected, (value) => onChange({ onRejected: value }))}
        </div>
        <div className="col-md-4" data-field-path="onTimeout">
          <label className="form-label">期限切れ時</label>
          {targetSelector(step.onTimeout, (value) => onChange({ onTimeout: value }))}
        </div>
      </div>

      <div className="row g-2 mb-2">
        <div className="col-md-6" data-field-path="deadlineExpression">
          <label className="form-label">期限式</label>
          <ConvCompletionInput
            className="form-control form-control-sm"
            value={step.deadlineExpression ?? ""}
            onValueChange={(value) => onChange({ deadlineExpression: value || undefined })}
            onCommit={onCommit}
            conventions={conventions ?? null}
            placeholder="例: @submittedAt + duration('P3D')"
            style={{ fontFamily: "monospace" }}
          />
        </div>
        <div className="col-md-6" data-field-path="escalateAfter">
          <label className="form-label">エスカレーションまで</label>
          <ConvCompletionInput
            className="form-control form-control-sm"
            value={step.escalateAfter ?? ""}
            onValueChange={(value) => onChange({ escalateAfter: value || undefined })}
            onCommit={onCommit}
            conventions={conventions ?? null}
            placeholder="例: duration('P2D')"
            style={{ fontFamily: "monospace" }}
          />
        </div>
      </div>

      <div className="row g-2 mb-2">
        <div className="col-md-6" data-field-path="escalateTo">
          <label className="form-label">エスカレーション先ロール</label>
          {roleSelect(
            step.escalateTo ?? "",
            (value) => onChange({ escalateTo: value || undefined }),
            "escalateTo",
          )}
        </div>
      </div>
    </div>
  );
}
