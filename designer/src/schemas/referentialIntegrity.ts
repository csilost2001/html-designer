/**
 * 蜃ｦ逅・ヵ繝ｭ繝ｼ JSON 縺ｮ繧ｯ繝ｭ繧ｹ繝ｪ繝輔ぃ繝ｬ繝ｳ繧ｹ讀懆ｨｼ (#253)縲・
 *
 * JSON Schema 2020-12 縺ｧ縺ｯ cross-reference (蛻･繝輔ぅ繝ｼ繝ｫ繝峨↓蟄伜惠縺吶ｋ蛟､縺ｸ縺ｮ蜿ら・讀懆ｨｼ) 縺ｯ
 * $dynamicRef 繧帝ｧ・ｽｿ縺励※繧りｪｭ縺ｿ縺ｫ縺上￥縺ｪ繧九◆繧√√せ繧ｭ繝ｼ繝槫､悶・繝舌Μ繝・・繧ｿ縺ｨ縺励※螳溯｣・・
 *
 * 讀懆ｨｼ縺吶ｋ隕冗ｴ・
 * 1. ReturnStep.responseRef 縺ｯ action.responses[].id 縺ｫ蟄伜惠縺吶ｋ縺薙→
 * 2. ValidationStep.inlineBranch.ngResponseRef 縺ｯ action.responses[].id 縺ｫ蟄伜惠縺吶ｋ縺薙→
 * 3. BranchConditionVariant.errorCode 縺ｯ ProcessFlow.errorCatalog 縺ｮ繧ｭ繝ｼ縺ｫ蟄伜惠縺吶ｋ縺薙→
 *    (errorCatalog 縺悟ｮ夂ｾｩ縺輔ｌ縺ｦ縺・ｋ蝣ｴ蜷医・縺ｿ)
 * 4. DbAccessStep.affectedRowsCheck.errorCode 繧ょ酔荳・
 * 5. ErrorCatalogEntry.responseRef 縺ｯ action.responses[].id 縺ｫ蟄伜惠縺吶ｋ縺薙→ (errorCatalog 竊・responses)
 */
import type { ProcessFlow, Step } from "../types/action";
import type { LoadedExtensions } from "./loadExtensions";

export interface IntegrityIssue {
  /** 繝峨ャ繝医ヱ繧ｹ (萓・ "actions[0].steps[2].responseRef") */
  path: string;
  /** 蝠城｡後・隴伜挨蟄・*/
  code:
    | "UNKNOWN_RESPONSE_REF"
    | "UNKNOWN_ERROR_CODE"
    | "UNKNOWN_SYSTEM_REF"
    | "UNKNOWN_TYPE_REF"
    | "UNKNOWN_SECRET_REF";
  /** 蜿ら・縺励ｈ縺・→縺励◆蛟､ */
  value: string;
  /** 繧ｨ繝ｩ繝ｼ繝｡繝・そ繝ｼ繧ｸ */
  message: string;
}

/** @secret.KEY 縺ｫ繝槭ャ繝・*/
const SECRET_RE = /@secret\.([a-zA-Z_][\w-]*)/g;

/** ProcessFlow 蜈ｨ菴薙・繧ｯ繝ｭ繧ｹ繝ｪ繝輔ぃ繝ｬ繝ｳ繧ｹ讀懆ｨｼ縲らｩｺ驟榊・縺ｪ繧・OK */
export function checkReferentialIntegrity(
  group: ProcessFlow,
  extensions?: LoadedExtensions,
): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const errorCodes = new Set(Object.keys(group.errorCatalog ?? {}));
  const hasErrorCatalog = errorCodes.size > 0;
  const systemIds = new Set(Object.keys(group.externalSystemCatalog ?? {}));
  const hasSystemCatalog = systemIds.size > 0;
  const typeIds = new Set(Object.keys(extensions?.responseTypes ?? {}));
  const hasExtensions = extensions !== undefined && typeIds.size > 0;
  const secretKeys = new Set(Object.keys(group.secretsCatalog ?? {}));
  const hasSecretsCatalog = secretKeys.size > 0;

  // externalSystemCatalog.*.auth.tokenRef 蜀・・ @secret.* 蜿ら・繧呈､懈渊
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
              message: `@secret.${m[1]} 縺・ProcessFlow.secretsCatalog 縺ｫ蟄伜惠縺励∪縺帙ｓ`,
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
    // bodySchema.typeRef 縺ｮ蜿ら・讀懈渊
    (action.responses ?? []).forEach((resp, ri) => {
      if (resp.bodySchema && typeof resp.bodySchema === "object" && "typeRef" in resp.bodySchema && resp.bodySchema.typeRef) {
        if (hasExtensions && !typeIds.has(resp.bodySchema.typeRef)) {
          issues.push({
            path: `actions[${ai}].responses[${ri}].bodySchema.typeRef`,
            code: "UNKNOWN_TYPE_REF",
            value: resp.bodySchema.typeRef,
            message: `bodySchema.typeRef "${resp.bodySchema.typeRef}" 縺・グローバル extensions responseTypes 縺ｫ蟄伜惠縺励∪縺帙ｓ`,
          });
        }
      }
    });
    walkSteps(action.steps ?? [], `actions[${ai}].steps`, (step, path) => {
      checkStep(step, path, responseIds, errorCodes, hasErrorCatalog, systemIds, hasSystemCatalog, issues, secretKeys, hasSecretsCatalog);
    });

    // errorCatalog 竊・responses 蜿ら・
    Object.entries(group.errorCatalog ?? {}).forEach(([key, entry]) => {
      if (entry.responseRef && !responseIds.has(entry.responseRef)) {
        issues.push({
          path: `errorCatalog.${key}.responseRef (actions[${ai}])`,
          code: "UNKNOWN_RESPONSE_REF",
          value: entry.responseRef,
          message: `errorCatalog.${key}.responseRef "${entry.responseRef}" 縺・action "${action.name}" 縺ｮ responses[].id 縺ｫ蟄伜惠縺励∪縺帙ｓ`,
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
    // 繝阪せ繝医＠縺・steps 繧呈戟縺､ variant
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
    if (step.type === "transactionScope") {
      walkSteps(step.steps, `${path}.steps`, visit);
      if (step.onCommit) walkSteps(step.onCommit, `${path}.onCommit`, visit);
      if (step.onRollback) walkSteps(step.onRollback, `${path}.onRollback`, visit);
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
      message: `ExternalSystemStep.systemRef "${step.systemRef}" 縺・ProcessFlow.externalSystemCatalog 縺ｫ蟄伜惠縺励∪縺帙ｓ`,
    });
  }
  // step 蛛ｴ auth.tokenRef 縺ｮ @secret.* 蜿ら・繧呈､懈渊
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
          message: `@secret.${m[1]} 縺・ProcessFlow.secretsCatalog 縺ｫ蟄伜惠縺励∪縺帙ｓ`,
        });
      }
    }
  }
  if (step.type === "return" && step.responseRef && !responseIds.has(step.responseRef)) {
    issues.push({
      path: `${path}.responseRef`,
      code: "UNKNOWN_RESPONSE_REF",
      value: step.responseRef,
      message: `ReturnStep.responseRef "${step.responseRef}" 縺・action.responses[].id 縺ｫ蟄伜惠縺励∪縺帙ｓ`,
    });
  }
  if (step.type === "validation" && step.inlineBranch?.ngResponseRef) {
    const r = step.inlineBranch.ngResponseRef;
    if (!responseIds.has(r)) {
      issues.push({
        path: `${path}.inlineBranch.ngResponseRef`,
        code: "UNKNOWN_RESPONSE_REF",
        value: r,
        message: `ValidationStep.inlineBranch.ngResponseRef "${r}" 縺・action.responses[].id 縺ｫ蟄伜惠縺励∪縺帙ｓ`,
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
        message: `DbAccessStep.affectedRowsCheck.errorCode "${e}" 縺・ProcessFlow.errorCatalog 縺ｫ蟄伜惠縺励∪縺帙ｓ`,
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
            message: `BranchConditionVariant.errorCode "${c.errorCode}" 縺・ProcessFlow.errorCatalog 縺ｫ蟄伜惠縺励∪縺帙ｓ`,
          });
        }
      }
    });
  }
  if (step.type === "transactionScope" && step.rollbackOn && hasErrorCatalog) {
    step.rollbackOn.forEach((code, ci) => {
      if (!errorCodes.has(code)) {
        issues.push({
          path: `${path}.rollbackOn[${ci}]`,
          code: "UNKNOWN_ERROR_CODE",
          value: code,
          message: `TransactionScopeStep.rollbackOn[${ci}] "${code}" 縺・ProcessFlow.errorCatalog 縺ｫ蟄伜惠縺励∪縺帙ｓ`,
        });
      }
    });
  }
}
