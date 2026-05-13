/**
 * useAiContextChips — AI 依頼パネルの context chip を管理する hook。
 *
 * context chip は「AI へ依頼する際に添付するコンテキスト」を表す。
 * 種別:
 *   step   — 特定のステップ (step.id + label + name)
 *   action — 特定のアクション (action.id + name)
 *   flow   — フロー全体
 */

import { useState, useCallback } from "react";

export type AiContextChipKind = "step" | "action" | "flow";

export interface AiContextChip {
  /** chip の一意識別子 */
  id: string;
  /** chip の種別 */
  kind: AiContextChipKind;
  /** 表示ラベル (例: "S1: 入力検証", "act-register: 登録処理", "フロー全体") */
  label: string;
  /** 実際に AI プロンプトに注入する JSON (step オブジェクト等) */
  payload: unknown;
}

export interface UseAiContextChipsResult {
  chips: AiContextChip[];
  addChip: (chip: AiContextChip) => void;
  removeChip: (id: string) => void;
  clearChips: () => void;
  /** step を chip に追加 (既に存在する場合は追加しない) */
  addStepChip: (stepId: string, label: string, stepPayload: unknown) => void;
  /** action を chip に追加 (既に存在する場合は追加しない) */
  addActionChip: (actionId: string, actionName: string, actionPayload: unknown) => void;
  /** フロー全体を chip に追加 (既に存在する場合は追加しない) */
  addFlowChip: (flowId: string, flowName: string, flowPayload: unknown) => void;
  /** chip 内容から AI プロンプト用のコンテキスト文字列を組み立てる */
  buildContextString: () => string;
}

/**
 * AI 依頼パネルの context chip を管理する hook。
 */
export function useAiContextChips(): UseAiContextChipsResult {
  const [chips, setChips] = useState<AiContextChip[]>([]);

  const addChip = useCallback((chip: AiContextChip) => {
    setChips((prev) => {
      if (prev.some((c) => c.id === chip.id)) return prev;
      return [...prev, chip];
    });
  }, []);

  const removeChip = useCallback((id: string) => {
    setChips((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const clearChips = useCallback(() => {
    setChips([]);
  }, []);

  const addStepChip = useCallback((stepId: string, label: string, stepPayload: unknown) => {
    const chip: AiContextChip = {
      id: `step:${stepId}`,
      kind: "step",
      label,
      payload: stepPayload,
    };
    addChip(chip);
  }, [addChip]);

  const addActionChip = useCallback((actionId: string, actionName: string, actionPayload: unknown) => {
    const chip: AiContextChip = {
      id: `action:${actionId}`,
      kind: "action",
      label: actionName,
      payload: actionPayload,
    };
    addChip(chip);
  }, [addChip]);

  const addFlowChip = useCallback((flowId: string, flowName: string, flowPayload: unknown) => {
    const chip: AiContextChip = {
      id: `flow:${flowId}`,
      kind: "flow",
      label: flowName,
      payload: flowPayload,
    };
    addChip(chip);
  }, [addChip]);

  const buildContextString = useCallback((): string => {
    if (chips.length === 0) return "";
    const parts = chips.map((chip) => {
      const header = chip.kind === "step"
        ? `## ステップ: ${chip.label}`
        : chip.kind === "action"
          ? `## アクション: ${chip.label}`
          : `## フロー全体: ${chip.label}`;
      return `${header}\n\`\`\`json\n${JSON.stringify(chip.payload, null, 2)}\n\`\`\``;
    });
    return parts.join("\n\n");
  }, [chips]);

  return {
    chips,
    addChip,
    removeChip,
    clearChips,
    addStepChip,
    addActionChip,
    addFlowChip,
    buildContextString,
  };
}
