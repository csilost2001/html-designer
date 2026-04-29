import { describe, expect, it } from "vitest";
import { checkScreenItemFieldTypeConsistency } from "./screenItemFieldTypeValidator";

const FLOW_ID = "11111111-1111-4111-8111-111111111111";
const SCREEN_ID = "22222222-2222-4222-8222-222222222222";

function makeFlow(input: Record<string, unknown>, expression = "@self.targetItem"): Record<string, unknown> {
  return {
    meta: {
      id: FLOW_ID,
      name: "テスト処理フロー",
      kind: "screen",
      primaryInvoker: { kind: "screen-item-event", screenId: SCREEN_ID, itemId: "button", eventId: "click" },
      createdAt: "2026-04-30T00:00:00.000Z",
      updatedAt: "2026-04-30T00:00:00.000Z",
    },
    inputs: [{ name: "value", ...input }],
    steps: [{ id: "step1", kind: "validation", argumentMapping: { value: expression } }],
  };
}

function makeFlowWithActionMapping(input: Record<string, unknown>, expression = "@self.targetItem"): Record<string, unknown> {
  return {
    meta: {
      id: FLOW_ID,
      name: "テスト処理フロー",
      kind: "screen",
      primaryInvoker: { kind: "screen-item-event", screenId: SCREEN_ID, itemId: "button", eventId: "click" },
      createdAt: "2026-04-30T00:00:00.000Z",
      updatedAt: "2026-04-30T00:00:00.000Z",
    },
    inputs: [{ name: "value", ...input }],
    steps: [{ id: "step1", kind: "validation", action: { argumentMapping: { value: expression } } }],
  };
}

function makeScreen(item: Record<string, unknown>): Record<string, unknown> {
  return {
    id: SCREEN_ID,
    name: "テスト画面",
    kind: "form",
    path: "/test",
    createdAt: "2026-04-30T00:00:00.000Z",
    updatedAt: "2026-04-30T00:00:00.000Z",
    items: [{ id: "targetItem", label: "対象項目", ...item }],
  };
}

function codes(flows: unknown[], screens: unknown[]): string[] {
  return checkScreenItemFieldTypeConsistency(flows as never, screens as never).map((issue) => issue.code);
}

describe("checkScreenItemFieldTypeConsistency", () => {
  it("OPTIONS_NOT_SUBSET_OF_ENUM: options が enum の部分集合でない場合に検出する", () => {
    const flow = makeFlow({ type: "string", domain: { enum: { values: ["A", "B"] } } });
    const screen = makeScreen({
      type: "string",
      options: [
        { value: "A", label: "A" },
        { value: "C", label: "C" },
      ],
    });

    const issues = checkScreenItemFieldTypeConsistency([flow] as never, [screen] as never);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "OPTIONS_NOT_SUBSET_OF_ENUM",
      severity: "error",
      screenId: SCREEN_ID,
      itemId: "targetItem",
      flowId: FLOW_ID,
      inputId: "value",
    });
  });

  it("OPTIONS_NOT_SUBSET_OF_ENUM: options が enum の部分集合なら検出しない", () => {
    const flow = makeFlow({ type: "string", domain: { enum: { values: ["A", "B"] } } });
    const screen = makeScreen({ type: "string", options: [{ value: "A", label: "A" }] });

    expect(codes([flow], [screen])).not.toContain("OPTIONS_NOT_SUBSET_OF_ENUM");
  });

  it("PATTERN_DIVERGENCE: pattern が不一致なら warning を検出する", () => {
    const flow = makeFlowWithActionMapping({ type: "string", domain: { pattern: "^[A-Z]+$" } });
    const screen = makeScreen({ type: "string", pattern: "^[0-9]+$" });

    const issues = checkScreenItemFieldTypeConsistency([flow] as never, [screen] as never);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "PATTERN_DIVERGENCE", severity: "warning" });
  });

  it("PATTERN_DIVERGENCE: pattern が一致する場合は検出しない", () => {
    const flow = makeFlow({ type: "string", domain: { pattern: "^[A-Z]+$" } });
    const screen = makeScreen({ type: "string", validation: { pattern: "^[A-Z]+$" } });

    expect(codes([flow], [screen])).not.toContain("PATTERN_DIVERGENCE");
  });

  it("RANGE_DIVERGENCE: min または max が不一致なら warning を検出する", () => {
    const flow = makeFlow({ type: "number", domain: { minimum: 1, maximum: 10 } });
    const screen = makeScreen({ type: "number", min: 2, max: 10 });

    const issues = checkScreenItemFieldTypeConsistency([flow] as never, [screen] as never);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "RANGE_DIVERGENCE", severity: "warning" });
  });

  it("RANGE_DIVERGENCE: min と max が一致する場合は検出しない", () => {
    const flow = makeFlow({ type: "number", domain: { minimum: 1, maximum: 10 } });
    const screen = makeScreen({ type: "number", validation: { min: 1, max: 10 } });

    expect(codes([flow], [screen])).not.toContain("RANGE_DIVERGENCE");
  });

  it("LENGTH_DIVERGENCE: minLength または maxLength が不一致なら warning を検出する", () => {
    const flow = makeFlow({ type: "string", domain: { minLength: 1, maxLength: 20 } });
    const screen = makeScreen({ type: "string", minLength: 1, maxLength: 10 });

    const issues = checkScreenItemFieldTypeConsistency([flow] as never, [screen] as never);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "LENGTH_DIVERGENCE", severity: "warning" });
  });

  it("LENGTH_DIVERGENCE: minLength と maxLength が一致する場合は検出しない", () => {
    const flow = makeFlow({ type: "string", domain: { minLength: 1, maxLength: 20 } });
    const screen = makeScreen({ type: "string", validation: { minLength: 1, maxLength: 20 } });

    expect(codes([flow], [screen])).not.toContain("LENGTH_DIVERGENCE");
  });

  it("DOMAIN_KEY_MISMATCH: domainKey が不一致なら error を検出する", () => {
    const flow = makeFlow({ type: { kind: "domain", domainKey: "CustomerId" } });
    const screen = makeScreen({ type: { kind: "domain", domainKey: "OrderId" } });

    const issues = checkScreenItemFieldTypeConsistency([flow] as never, [screen] as never);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "DOMAIN_KEY_MISMATCH", severity: "error" });
  });

  it("DOMAIN_KEY_MISMATCH: domainKey が一致する場合は検出しない", () => {
    const flow = makeFlow({ type: { kind: "domain", domainKey: "CustomerId" } });
    const screen = makeScreen({ type: { kind: "domain", domainKey: "CustomerId" } });

    expect(codes([flow], [screen])).not.toContain("DOMAIN_KEY_MISMATCH");
  });

  it("TYPE_MISMATCH: primitive type が不一致なら error を検出する", () => {
    const flow = makeFlow({ type: "number" });
    const screen = makeScreen({ type: "string" });

    const issues = checkScreenItemFieldTypeConsistency([flow] as never, [screen] as never);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "TYPE_MISMATCH", severity: "error" });
  });

  it("TYPE_MISMATCH: kind が一致する場合は検出しない", () => {
    const flow = makeFlow({ type: { kind: "domain", domainKey: "CustomerId" } });
    const screen = makeScreen({ type: { kind: "domain", domainKey: "CustomerId" } });

    expect(codes([flow], [screen])).not.toContain("TYPE_MISMATCH");
  });

  it("空入力では issue を返さない", () => {
    expect(checkScreenItemFieldTypeConsistency([], [])).toEqual([]);
  });

  it("argumentMapping 未設定の ScreenItem はスキップする", () => {
    const flow = { ...makeFlow({ type: "number" }), steps: [{ id: "step1", kind: "validation" }] };
    const screen = makeScreen({ type: "string" });

    expect(checkScreenItemFieldTypeConsistency([flow] as never, [screen] as never)).toEqual([]);
  });
});
