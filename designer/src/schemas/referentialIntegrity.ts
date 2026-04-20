/**
 * 処理フロー JSON のクロスリファレンス検証 (#253)。
 *
 * JSON Schema 2020-12 では cross-reference (別フィールドに存在する値への参照検証) は
 * $dynamicRef を駆使しても読みにくくなるため、スキーマ外のバリデータとして実装。
 *
 * 検証する規約:
 * 1. ReturnStep.responseRef は action.responses[].id に存在すること
 * 2. ValidationStep.inlineBranch.ngResponseRef は action.responses[].id に存在すること
 * 3. BranchConditionVariant.errorCode は ActionGroup.errorCatalog のキーに存在すること
 *    (errorCatalog が定義されている場合のみ)
 * 4. DbAccessStep.affectedRowsCheck.errorCode も同上
 * 5. ErrorCatalogEntry.responseRef は action.responses[].id に存在すること (errorCatalog → responses)
 */
import type { ActionGroup, ActionDefinition, Step } from "../types/action";

export interface IntegrityIssue {
  /** ドットパス (例: "actions[0].steps[2].responseRef") */
  path: string;
  /** 問題の識別子 */
  code:
    | "UNKNOWN_RESPONSE_REF"
    | "UNKNOWN_ERROR_CODE"
    | "UNKNOWN_SYSTEM_REF"
    | "UNKNOWN_TYPE_REF"
    | "UNKNOWN_SECRET_REF";
  /** 参照しようとした値 */
  value: string;
  /** エラーメッセージ */
  message: string;
}

/** @secret.KEY にマッチ */
const SECRET_RE = /@secret\.([a-zA-Z_][\w-]*)/g;

/** ActionGroup 全体のクロスリファレンス検証。空配列なら OK */
export function checkReferentialIntegrity(group: ActionGroup): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const errorCodes = new Set(Object.keys(group.errorCatalog ?? {}));
  const hasErrorCatalog = errorCodes.size > 0;
  const systemIds = new Set(Object.keys(group.externalSystemCatalog ?? {}));
  const hasSystemCatalog = systemIds.size > 0;
  const typeIds = new Set(Object.keys(group.typeCatalog ?? {}));
  const hasTypeCatalog = typeIds.size > 0;
  const secretKeys = new Set(Object.keys(group.secretsCatalog ?? {}));
  const hasSecretsCatalog = secretKeys.size > 0;

  // externalSystemCatalog.*.auth.tokenRef 内の @secret.* 参照を検査
  if (hasSecretsCatalog) {
    Object.entries(group.externalSystemCatalog ?? {}).forEach(([k, entry]) => {
      const tok = entry.auth?.tokenRef;
      if (tok) {
        let m: RegExpExecArray | null;
        while ((m = SECRET_RE.exec(tok)) !== null) {
          if (!secretKeys.has(m[1])) {
            issues.push({
              path: `externalSystemCatalog.${k}.auth.tokenRef`,
              code: "UNKNOWN_SECRET_REF",
              value: `@secret.${m[1]}`,
              message: `@secret.${m[1]} が ActionGroup.secretsCatalog に存在しません`,
            });
          }
        }
      }
    });
  }

  group.actions.forEach((action, ai) => {
    const responseIds = new Set(
      (action.responses ?? []).map((r) => r.id).filter((x): x is string => !!x),
    );
    // bodySchema.typeRef の参照検査
    (action.responses ?? []).forEach((resp, ri) => {
      if (resp.bodySchema && typeof resp.bodySchema === "object" && "typeRef" in resp.bodySchema && resp.bodySchema.typeRef) {
        if (hasTypeCatalog && !typeIds.has(resp.bodySchema.typeRef)) {
          issues.push({
            path: `actions[${ai}].responses[${ri}].bodySchema.typeRef`,
            code: "UNKNOWN_TYPE_REF",
            value: resp.bodySchema.typeRef,
            message: `bodySchema.typeRef "${resp.bodySchema.typeRef}" が ActionGroup.typeCatalog に存在しません`,
          });
        }
      }
    });
    walkSteps(action.steps ?? [], `actions[${ai}].steps`, (step, path) => {
      checkStep(step, path, responseIds, errorCodes, hasErrorCatalog, systemIds, hasSystemCatalog, issues, secretKeys, hasSecretsCatalog);
    });

    // errorCatalog → responses 参照
    Object.entries(group.errorCatalog ?? {}).forEach(([key, entry]) => {
      if (entry.responseRef && !responseIds.has(entry.responseRef)) {
        issues.push({
          path: `errorCatalog.${key}.responseRef (actions[${ai}])`,
          code: "UNKNOWN_RESPONSE_REF",
          value: entry.responseRef,
          message: `errorCatalog.${key}.responseRef "${entry.responseRef}" が action "${action.name}" の responses[].id に存在しません`,
        });
      }
    });
  });

  return issues;
}

function walkSteps(
  steps: Step[],
  basePath: string,
  visit: (step: Step, path: string) => void,
): void {
  steps.forEach((step, i) => {
    const path = `${basePath}[${i}]`;
    visit(step, path);
    // ネストした steps を持つ variant
    if ("subSteps" in step && step.subSteps) {
      walkSteps(step.subSteps, `${path}.subSteps`, visit);
    }
    if (step.type === "branch") {
      step.branches.forEach((b, bi) => {
        walkSteps(b.steps, `${path}.branches[${bi}].steps`, visit);
      });
      if (step.elseBranch) {
        walkSteps(step.elseBranch.steps, `${path}.elseBranch.steps`, visit);
      }
    }
    if (step.type === "loop") {
      walkSteps(step.steps, `${path}.steps`, visit);
    }
    if (step.type === "externalSystem") {
      Object.entries(step.outcomes ?? {}).forEach(([k, spec]) => {
        if (spec?.sideEffects) {
          walkSteps(spec.sideEffects, `${path}.outcomes.${k}.sideEffects`, visit);
        }
      });
    }
  });
}

function checkStep(
  step: Step,
  path: string,
  responseIds: Set<string>,
  errorCodes: Set<string>,
  hasErrorCatalog: boolean,
  systemIds: Set<string>,
  hasSystemCatalog: boolean,
  issues: IntegrityIssue[],
  secretKeys?: Set<string>,
  hasSecretsCatalog?: boolean,
): void {
  if (step.type === "externalSystem" && step.systemRef && hasSystemCatalog && !systemIds.has(step.systemRef)) {
    issues.push({
      path: `${path}.systemRef`,
      code: "UNKNOWN_SYSTEM_REF",
      value: step.systemRef,
      message: `ExternalSystemStep.systemRef "${step.systemRef}" が ActionGroup.externalSystemCatalog に存在しません`,
    });
  }
  // step 側 auth.tokenRef の @secret.* 参照を検査
  if (step.type === "externalSystem" && step.auth?.tokenRef && hasSecretsCatalog && secretKeys) {
    const tok = step.auth.tokenRef;
    const re = /@secret\.([a-zA-Z_][\w-]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(tok)) !== null) {
      if (!secretKeys.has(m[1])) {
        issues.push({
          path: `${path}.auth.tokenRef`,
          code: "UNKNOWN_SECRET_REF",
          value: `@secret.${m[1]}`,
          message: `@secret.${m[1]} が ActionGroup.secretsCatalog に存在しません`,
        });
      }
    }
  }
  if (step.type === "return" && step.responseRef && !responseIds.has(step.responseRef)) {
    issues.push({
      path: `${path}.responseRef`,
      code: "UNKNOWN_RESPONSE_REF",
      value: step.responseRef,
      message: `ReturnStep.responseRef "${step.responseRef}" が action.responses[].id に存在しません`,
    });
  }
  if (step.type === "validation" && step.inlineBranch?.ngResponseRef) {
    const r = step.inlineBranch.ngResponseRef;
    if (!responseIds.has(r)) {
      issues.push({
        path: `${path}.inlineBranch.ngResponseRef`,
        code: "UNKNOWN_RESPONSE_REF",
        value: r,
        message: `ValidationStep.inlineBranch.ngResponseRef "${r}" が action.responses[].id に存在しません`,
      });
    }
  }
  if (step.type === "dbAccess" && step.affectedRowsCheck?.errorCode && hasErrorCatalog) {
    const e = step.affectedRowsCheck.errorCode;
    if (!errorCodes.has(e)) {
      issues.push({
        path: `${path}.affectedRowsCheck.errorCode`,
        code: "UNKNOWN_ERROR_CODE",
        value: e,
        message: `DbAccessStep.affectedRowsCheck.errorCode "${e}" が ActionGroup.errorCatalog に存在しません`,
      });
    }
  }
  if (step.type === "branch") {
    step.branches.forEach((b, bi) => {
      const c = b.condition;
      if (typeof c === "object" && c.kind === "tryCatch" && hasErrorCatalog) {
        if (!errorCodes.has(c.errorCode)) {
          issues.push({
            path: `${path}.branches[${bi}].condition.errorCode`,
            code: "UNKNOWN_ERROR_CODE",
            value: c.errorCode,
            message: `BranchConditionVariant.errorCode "${c.errorCode}" が ActionGroup.errorCatalog に存在しません`,
          });
        }
      }
    });
  }
}
