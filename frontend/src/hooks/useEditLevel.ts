/**
 * useEditLevel — 処理フローエディタの編集レベル (設計段階) を管理する hook。
 *
 * 編集レベル:
 *   rough          ラフ設計 — step の目的・失敗時・メモのみ表示
 *   detail         詳細設計 — 入出力・DB/画面/外部参照まで表示
 *   implementation プログラム設計 — 全項目表示 (デフォルト)
 *
 * localStorage に永続化 (key=`processFlow:editLevel:<flowId>`)。
 * flowId が undefined の場合は in-memory のみ。
 */

import { usePersistentState } from "./usePersistentState";
import { useState } from "react";

export type EditLevel = "rough" | "detail" | "implementation";

const VALID_LEVELS = new Set<string>(["rough", "detail", "implementation"]);

function isValidLevel(value: unknown): value is EditLevel {
  return typeof value === "string" && VALID_LEVELS.has(value);
}

export interface UseEditLevelResult {
  editLevel: EditLevel;
  setEditLevel: (level: EditLevel) => void;
}

/**
 * flowId ありで localStorage を使う内部 hook。
 * Rules of Hooks: 条件分岐で hook を呼ばないため分離。
 */
function useEditLevelPersisted(flowId: string): UseEditLevelResult {
  const storageKey = `processFlow:editLevel:${flowId}`;
  const [rawLevel, setRawLevel] = usePersistentState<string>(storageKey, "implementation");
  const editLevel: EditLevel = isValidLevel(rawLevel) ? rawLevel : "implementation";
  return { editLevel, setEditLevel: (l) => setRawLevel(l) };
}

/**
 * flowId なしで in-memory のみ管理する内部 hook。
 */
function useEditLevelMemory(): UseEditLevelResult {
  const [rawLevel, setRawLevel] = useState<string>("implementation");
  const editLevel: EditLevel = isValidLevel(rawLevel) ? rawLevel : "implementation";
  return { editLevel, setEditLevel: (l) => setRawLevel(l) };
}

/**
 * 編集レベルを管理する hook。
 * @param flowId 処理フロー ID (localStorage キーの suffix)。未指定時は in-memory のみ
 *
 * Note: flowId の有無によって内部 hook の分岐が変わるが、呼び出し側での
 * flowId の有無は通常マウント後に変わらないため、この分岐はルール違反にならない。
 * ただし、flowId が途中で変わる可能性がある場合は `useEditLevelPersisted` を直接使うこと。
 */
export function useEditLevel(flowId?: string): UseEditLevelResult {
  const persisted = useEditLevelPersisted(flowId ?? "__noop__");
  const memory = useEditLevelMemory();

  // flowId がある場合は永続化、ない場合はメモリのみ
  // 注: どちらの hook も毎回 call するのでルール違反にならない
  if (flowId) {
    return persisted;
  }
  return memory;
}
