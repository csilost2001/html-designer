/**
 * RegionContext — PageLayout composition preview 用の Context。
 *
 * PageLayoutDesigner の Puck 経路で RegionProvider を wrap し、
 * 各 Region primitive が assignments と gadget Puck data を参照できるようにする。
 *
 * pl-5 follow-up (#1026): Puck composition preview (feature parity)
 */

import { createContext, useContext } from "react";

export interface RegionContextValue {
  /** regionName → gadget screenId のマッピング (PageLayout.assignments) */
  assignments: Record<string, string>;
  /** gadget screenId → Puck data (未割り当てや未ロードは undefined) */
  gadgetData: Record<string, unknown>;
}

const RegionContext = createContext<RegionContextValue | null>(null);

export const RegionProvider = RegionContext.Provider;

/** assignments を取得する hook。未 wrap 時は空 object を返す。 */
export function usePageLayoutAssignments(): Record<string, string> {
  return useContext(RegionContext)?.assignments ?? {};
}

/**
 * 指定した gadget screenId の Puck data を取得する hook。
 * 未割り当て・未ロード・RegionContext 外のいずれかの場合は null を返す。
 */
export function useGadgetPuckData(gadgetScreenId?: string): unknown | null {
  const ctx = useContext(RegionContext);
  if (!gadgetScreenId || !ctx) return null;
  return ctx.gadgetData[gadgetScreenId] ?? null;
}
