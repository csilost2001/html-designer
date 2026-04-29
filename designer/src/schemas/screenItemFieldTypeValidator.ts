// @ts-nocheck
import type { ProcessFlow, StructuredField } from "../types/action";
import type { Screen } from "../types/v3/screen";
import type { ScreenItem } from "../types/v3/screen-item";

export type ScreenItemFieldTypeIssueCode =
  | "OPTIONS_NOT_SUBSET_OF_ENUM"
  | "PATTERN_DIVERGENCE"
  | "RANGE_DIVERGENCE"
  | "LENGTH_DIVERGENCE"
  | "DOMAIN_KEY_MISMATCH"
  | "TYPE_MISMATCH";

export interface ScreenItemFieldTypeIssue {
  code: ScreenItemFieldTypeIssueCode;
  severity: "error" | "warning";
  screenId: string;
  itemId: string;
  flowId: string;
  inputId: string;
  message: string;
}

interface MappedPair {
  screenId: string;
  item: ScreenItem;
  flowId: string;
  inputId: string;
  input: StructuredField;
}

const SELF_ITEM_REF = /^@self\.([a-zA-Z_][\w-]*)/;

function getFlowId(flow: ProcessFlow): string | null {
  return flow.id ?? flow.meta?.id ?? null;
}

function getScreenId(screen: Screen): string | null {
  return screen.id ?? screen.meta?.id ?? null;
}

function getFlowInputs(flow: ProcessFlow): StructuredField[] {
  if (Array.isArray(flow.inputs)) return flow.inputs;
  if (Array.isArray(flow.actions?.[0]?.inputs)) return flow.actions[0].inputs;
  return [];
}

function getStepCandidates(flow: ProcessFlow): any[] {
  const steps = Array.isArray(flow.steps) ? [...flow.steps] : [];
  for (const action of flow.actions ?? []) {
    if (Array.isArray(action.steps)) steps.push(...action.steps);
  }
  return steps;
}

function getArgumentMapping(step: any): Record<string, string> | null {
  const mapping = step?.action?.argumentMapping ?? step?.argumentMapping;
  return mapping && typeof mapping === "object" ? mapping : null;
}

function findScreenItems(screens: Screen[], flow: ProcessFlow, itemId: string): Array<{ screenId: string; item: ScreenItem }> {
  const preferredScreenId = flow.meta?.primaryInvoker?.screenId;
  const targetScreens = preferredScreenId
    ? screens.filter((screen) => getScreenId(screen) === preferredScreenId)
    : screens;

  const found: Array<{ screenId: string; item: ScreenItem }> = [];
  for (const screen of targetScreens) {
    const screenId = getScreenId(screen);
    if (!screenId) continue;
    for (const item of screen.items ?? []) {
      if (item.id === itemId) found.push({ screenId, item });
    }
  }
  return found;
}

function collectMappedPairs(flows: ProcessFlow[], screens: Screen[]): MappedPair[] {
  const pairs: MappedPair[] = [];

  for (const flow of flows) {
    const flowId = getFlowId(flow);
    if (!flowId) continue;

    const inputByName = new Map<string, StructuredField>();
    for (const input of getFlowInputs(flow)) {
      inputByName.set(input.name, input);
    }

    for (const step of getStepCandidates(flow)) {
      const argumentMapping = getArgumentMapping(step);
      if (!argumentMapping) continue;

      for (const [inputId, expression] of Object.entries(argumentMapping)) {
        if (typeof expression !== "string") continue;
        const match = expression.match(SELF_ITEM_REF);
        if (!match) continue;

        const input = inputByName.get(inputId);
        if (!input) continue;

        for (const { screenId, item } of findScreenItems(screens, flow, match[1])) {
          pairs.push({ screenId, item, flowId, inputId, input });
        }
      }
    }
  }

  return pairs;
}

function getDomain(input: StructuredField): any | null {
  return input.domain && typeof input.domain === "object" ? input.domain : null;
}

function getEnumValues(input: StructuredField): unknown[] | null {
  const values = getDomain(input)?.enum?.values;
  return Array.isArray(values) ? values : null;
}

function getItemPattern(item: ScreenItem): string | undefined {
  return item.validation?.pattern ?? item.pattern;
}

function getItemMin(item: ScreenItem): number | undefined {
  return item.validation?.min ?? item.min;
}

function getItemMax(item: ScreenItem): number | undefined {
  return item.validation?.max ?? item.max;
}

function getItemMinLength(item: ScreenItem): number | undefined {
  return item.validation?.minLength ?? item.minLength;
}

function getItemMaxLength(item: ScreenItem): number | undefined {
  return item.validation?.maxLength ?? item.maxLength;
}

function getDomainKey(type: unknown): string | undefined {
  return typeof type === "object" && type !== null ? type.domainKey : undefined;
}

function normalizeTypeForComparison(type: unknown): string | null {
  if (typeof type === "string") return type;
  if (typeof type === "object" && type !== null && typeof type.kind === "string") return type.kind;
  return null;
}

function addIssue(
  issues: ScreenItemFieldTypeIssue[],
  pair: MappedPair,
  code: ScreenItemFieldTypeIssueCode,
  severity: "error" | "warning",
  message: string,
): void {
  issues.push({
    code,
    severity,
    screenId: pair.screenId,
    itemId: pair.item.id,
    flowId: pair.flowId,
    inputId: pair.inputId,
    message,
  });
}

function checkOptionsSubset(issues: ScreenItemFieldTypeIssue[], pair: MappedPair): void {
  const optionValues = pair.item.options?.map((option) => option.value);
  const enumValues = getEnumValues(pair.input);
  if (!optionValues?.length || !enumValues?.length) return;

  const enumSet = new Set(enumValues);
  const extras = optionValues.filter((value) => !enumSet.has(value));
  if (extras.length > 0) {
    addIssue(
      issues,
      pair,
      "OPTIONS_NOT_SUBSET_OF_ENUM",
      "error",
      `画面項目 '${pair.item.id}' の options が処理フロー入力 '${pair.inputId}' の enum に含まれない値を持っています: ${extras.join(", ")}`,
    );
  }
}

function checkPatternDivergence(issues: ScreenItemFieldTypeIssue[], pair: MappedPair): void {
  const itemPattern = getItemPattern(pair.item);
  const inputPattern = getDomain(pair.input)?.pattern;
  if (itemPattern === undefined || inputPattern === undefined) return;
  if (itemPattern !== inputPattern) {
    addIssue(
      issues,
      pair,
      "PATTERN_DIVERGENCE",
      "warning",
      `画面項目 '${pair.item.id}' と処理フロー入力 '${pair.inputId}' の pattern が一致しません。`,
    );
  }
}

function checkRangeDivergence(issues: ScreenItemFieldTypeIssue[], pair: MappedPair): void {
  const domain = getDomain(pair.input);
  if (!domain) return;

  const itemMin = getItemMin(pair.item);
  const itemMax = getItemMax(pair.item);
  const minDiffers = itemMin !== undefined && domain.minimum !== undefined && itemMin !== domain.minimum;
  const maxDiffers = itemMax !== undefined && domain.maximum !== undefined && itemMax !== domain.maximum;

  if (minDiffers || maxDiffers) {
    addIssue(
      issues,
      pair,
      "RANGE_DIVERGENCE",
      "warning",
      `画面項目 '${pair.item.id}' と処理フロー入力 '${pair.inputId}' の数値範囲が一致しません。`,
    );
  }
}

function checkLengthDivergence(issues: ScreenItemFieldTypeIssue[], pair: MappedPair): void {
  const domain = getDomain(pair.input);
  if (!domain) return;

  const itemMinLength = getItemMinLength(pair.item);
  const itemMaxLength = getItemMaxLength(pair.item);
  const minLengthDiffers =
    itemMinLength !== undefined && domain.minLength !== undefined && itemMinLength !== domain.minLength;
  const maxLengthDiffers =
    itemMaxLength !== undefined && domain.maxLength !== undefined && itemMaxLength !== domain.maxLength;

  if (minLengthDiffers || maxLengthDiffers) {
    addIssue(
      issues,
      pair,
      "LENGTH_DIVERGENCE",
      "warning",
      `画面項目 '${pair.item.id}' と処理フロー入力 '${pair.inputId}' の文字数範囲が一致しません。`,
    );
  }
}

function checkDomainKeyMismatch(issues: ScreenItemFieldTypeIssue[], pair: MappedPair): void {
  const itemDomainKey = getDomainKey(pair.item.type);
  const inputDomainKey = getDomainKey(pair.input.type);
  if (itemDomainKey === undefined || inputDomainKey === undefined) return;
  if (itemDomainKey !== inputDomainKey) {
    addIssue(
      issues,
      pair,
      "DOMAIN_KEY_MISMATCH",
      "error",
      `画面項目 '${pair.item.id}' と処理フロー入力 '${pair.inputId}' の domainKey が一致しません。`,
    );
  }
}

function checkTypeMismatch(issues: ScreenItemFieldTypeIssue[], pair: MappedPair): void {
  const itemType = normalizeTypeForComparison(pair.item.type);
  const inputType = normalizeTypeForComparison(pair.input.type);
  if (itemType === null || inputType === null) return;
  if (itemType !== inputType) {
    addIssue(
      issues,
      pair,
      "TYPE_MISMATCH",
      "error",
      `画面項目 '${pair.item.id}' の type '${itemType}' が処理フロー入力 '${pair.inputId}' の type '${inputType}' と一致しません。`,
    );
  }
}

export function checkScreenItemFieldTypeConsistency(flows: any[], screens: any[]): ScreenItemFieldTypeIssue[] {
  const issues: ScreenItemFieldTypeIssue[] = [];

  for (const pair of collectMappedPairs(flows ?? [], screens ?? [])) {
    checkOptionsSubset(issues, pair);
    checkPatternDivergence(issues, pair);
    checkRangeDivergence(issues, pair);
    checkLengthDivergence(issues, pair);
    checkDomainKeyMismatch(issues, pair);
    checkTypeMismatch(issues, pair);
  }

  return issues;
}
