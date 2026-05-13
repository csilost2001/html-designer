import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAiContextChips } from "./useAiContextChips";

describe("useAiContextChips", () => {
  it("starts with empty chips", () => {
    const { result } = renderHook(() => useAiContextChips());
    expect(result.current.chips).toHaveLength(0);
  });

  it("adds a chip with addChip", () => {
    const { result } = renderHook(() => useAiContextChips());
    act(() => {
      result.current.addChip({
        id: "step:s1",
        kind: "step",
        label: "S1: 入力検証",
        payload: { id: "s1", kind: "validation" },
      });
    });
    expect(result.current.chips).toHaveLength(1);
    expect(result.current.chips[0].id).toBe("step:s1");
  });

  it("does not add duplicate chips (same id)", () => {
    const { result } = renderHook(() => useAiContextChips());
    act(() => {
      result.current.addChip({ id: "step:s1", kind: "step", label: "S1", payload: {} });
      result.current.addChip({ id: "step:s1", kind: "step", label: "S1 duplicate", payload: {} });
    });
    expect(result.current.chips).toHaveLength(1);
    expect(result.current.chips[0].label).toBe("S1");
  });

  it("removes a chip by id", () => {
    const { result } = renderHook(() => useAiContextChips());
    act(() => {
      result.current.addChip({ id: "step:s1", kind: "step", label: "S1", payload: {} });
      result.current.addChip({ id: "step:s2", kind: "step", label: "S2", payload: {} });
    });
    act(() => result.current.removeChip("step:s1"));
    expect(result.current.chips).toHaveLength(1);
    expect(result.current.chips[0].id).toBe("step:s2");
  });

  it("clears all chips", () => {
    const { result } = renderHook(() => useAiContextChips());
    act(() => {
      result.current.addChip({ id: "step:s1", kind: "step", label: "S1", payload: {} });
      result.current.addChip({ id: "action:act1", kind: "action", label: "Act1", payload: {} });
    });
    act(() => result.current.clearChips());
    expect(result.current.chips).toHaveLength(0);
  });

  it("addStepChip creates chip with id=step:<stepId>", () => {
    const { result } = renderHook(() => useAiContextChips());
    act(() => result.current.addStepChip("s42", "S42: DB アクセス", { id: "s42", kind: "dbAccess" }));
    expect(result.current.chips[0].id).toBe("step:s42");
    expect(result.current.chips[0].kind).toBe("step");
    expect(result.current.chips[0].label).toBe("S42: DB アクセス");
  });

  it("addActionChip creates chip with id=action:<actionId>", () => {
    const { result } = renderHook(() => useAiContextChips());
    act(() => result.current.addActionChip("act-reg", "登録処理", { id: "act-reg" }));
    expect(result.current.chips[0].id).toBe("action:act-reg");
    expect(result.current.chips[0].kind).toBe("action");
  });

  it("addFlowChip creates chip with id=flow:<flowId>", () => {
    const { result } = renderHook(() => useAiContextChips());
    act(() => result.current.addFlowChip("flow-1", "在庫登録フロー", { meta: { id: "flow-1" } }));
    expect(result.current.chips[0].id).toBe("flow:flow-1");
    expect(result.current.chips[0].kind).toBe("flow");
  });

  it("does not add duplicate step chips (same stepId)", () => {
    const { result } = renderHook(() => useAiContextChips());
    act(() => {
      result.current.addStepChip("s1", "S1", { id: "s1" });
      result.current.addStepChip("s1", "S1 again", { id: "s1" });
    });
    expect(result.current.chips).toHaveLength(1);
  });

  it("buildContextString returns empty string when no chips", () => {
    const { result } = renderHook(() => useAiContextChips());
    expect(result.current.buildContextString()).toBe("");
  });

  it("buildContextString includes step JSON in a code block", () => {
    const { result } = renderHook(() => useAiContextChips());
    act(() => result.current.addStepChip("s1", "S1: 入力検証", { id: "s1", kind: "validation" }));
    const ctx = result.current.buildContextString();
    expect(ctx).toContain("## ステップ: S1: 入力検証");
    expect(ctx).toContain("```json");
    expect(ctx).toContain('"id": "s1"');
  });

  it("buildContextString includes action and flow headers with correct prefixes", () => {
    const { result } = renderHook(() => useAiContextChips());
    act(() => {
      result.current.addActionChip("act1", "登録", { id: "act1" });
      result.current.addFlowChip("f1", "在庫フロー", { meta: { id: "f1" } });
    });
    const ctx = result.current.buildContextString();
    expect(ctx).toContain("## アクション: 登録");
    expect(ctx).toContain("## フロー全体: 在庫フロー");
  });
});
