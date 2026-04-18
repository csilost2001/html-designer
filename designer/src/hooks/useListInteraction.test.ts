import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useListFilter } from "./useListFilter";
import { useListSort } from "./useListSort";
import { useListSelection } from "./useListSelection";

interface Item {
  id: string;
  group: "a" | "b";
  order: number;
}

const items: Item[] = [
  { id: "x1", group: "a", order: 3 },
  { id: "x2", group: "b", order: 1 },
  { id: "x3", group: "a", order: 2 },
  { id: "x4", group: "b", order: 4 },
];

/**
 * §3.8 「選択状態とソート / フィルタの相互作用」のユーザーフロー検証
 *
 * フィルタ/ソート/選択を組み合わせたフックを連結し、仕様の相互作用が
 * 期待通りに動作することを確認する。
 */
function setup() {
  return renderHook(() => {
    const filter = useListFilter(items);
    const sort = useListSort(filter.filtered, (it, key) =>
      key === "order" ? it.order : key === "group" ? it.group : "",
    );
    const selection = useListSelection(sort.sorted, (it) => it.id);
    return { filter, sort, selection };
  });
}

describe("List hooks interaction (§3.8)", () => {
  it("ソート適用後も選択は維持される", () => {
    const { result } = setup();
    act(() => result.current.selection.handleRowClick("x1", {}));
    act(() => result.current.sort.toggleSort("order"));
    expect(result.current.selection.selectedIds).toEqual(new Set(["x1"]));
  });

  it("ソート解除後も選択は維持される", () => {
    const { result } = setup();
    act(() => result.current.sort.toggleSort("order"));
    act(() => result.current.selection.handleRowClick("x2", {}));
    act(() => result.current.sort.clearSort());
    expect(result.current.selection.selectedIds).toEqual(new Set(["x2"]));
  });

  it("フィルタ適用で非表示になった項目は selectedItems から除かれる", () => {
    const { result } = setup();
    // 全件から x2 と x4 (group=b) を選択
    act(() => result.current.selection.setSelectedIds(new Set(["x2", "x4"])));
    expect(result.current.selection.selectedItems.map((x) => x.id).sort()).toEqual(["x2", "x4"]);
    // group=a でフィルタ
    act(() => result.current.filter.applyFilter((x) => x.group === "a"));
    // filtered 配列に x2, x4 がいないので selectedItems から除かれる
    expect(result.current.selection.selectedItems.map((x) => x.id)).toEqual([]);
    // 内部 selectedIds は保持 (再表示時に復活しない仕様なので消えないだけ)
    expect(result.current.selection.selectedIds.has("x2")).toBe(true);
  });

  it("フィルタクリア後に items が戻っても、selectedItems は selectedIds から再構築される", () => {
    const { result } = setup();
    act(() => result.current.selection.setSelectedIds(new Set(["x2"])));
    act(() => result.current.filter.applyFilter((x) => x.group === "a"));
    act(() => result.current.filter.clearFilter());
    expect(result.current.selection.selectedItems.map((x) => x.id)).toEqual(["x2"]);
  });

  it("Ctrl+A は見えている項目のみを選択対象とする", () => {
    const { result } = setup();
    act(() => result.current.filter.applyFilter((x) => x.group === "a"));
    act(() => result.current.selection.selectAll());
    // a のみが全選択されるべき (x1, x3)
    expect(result.current.selection.selectedIds).toEqual(new Set(["x1", "x3"]));
  });

  it("多段ソート→同列の通常クリックで単一ソートに縮約", () => {
    const { result } = setup();
    act(() => result.current.sort.toggleSort("group"));
    act(() => result.current.sort.toggleSort("order", { addKey: true }));
    expect(result.current.sort.sortKeys).toHaveLength(2);
    act(() => result.current.sort.toggleSort("order"));
    expect(result.current.sort.sortKeys).toEqual([{ columnKey: "order", direction: "asc" }]);
  });

  it("ソート後の Shift+ クリックは sort 適用後の表示順でアンカーから範囲選択される", () => {
    const { result } = setup();
    // order 昇順でソート: x2(1), x3(2), x1(3), x4(4)
    act(() => result.current.sort.toggleSort("order"));
    act(() => result.current.selection.handleRowClick("x2", {}));
    act(() => result.current.selection.handleRowClick("x1", { shiftKey: true }));
    // x2, x3, x1 が選択される (ソート順での範囲)
    expect(result.current.selection.selectedIds).toEqual(new Set(["x2", "x3", "x1"]));
  });
});
