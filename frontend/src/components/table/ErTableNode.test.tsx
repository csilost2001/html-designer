/**
 * ErTableNode — rendering smoke (#1146)
 *
 * memo node component (~100 lines). PK / FK / other column の
 * grouping ロジックと折りたたみ trigger を検証。
 */

import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import ErTableNode, { type ErTableNodeData } from "./ErTableNode";
import type { Column, LocalId, PhysicalName, DisplayName } from "../../types/v3";

function makeColumn(over: Partial<Column>): Column {
  return {
    id: "col-1" as LocalId,
    physicalName: "id" as PhysicalName,
    name: "ID" as DisplayName,
    dataType: "INTEGER",
    ...over,
  };
}

function renderNode(data: ErTableNodeData, selected = false) {
  // NodeProps は内部的に多くの fields を要求するため
  // 必要 props のみ与えて型を緩める。
  const props = {
    data,
    selected,
    id: "node-1",
    type: "erTable",
    dragging: false,
    isConnectable: false,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    zIndex: 0,
    width: 200,
    height: 200,
    deletable: true,
    draggable: false,
    selectable: false,
    targetPosition: undefined,
    sourcePosition: undefined,
  } as unknown as Parameters<typeof ErTableNode>[0];

  return render(
    <ReactFlowProvider>
      <ErTableNode {...props} />
    </ReactFlowProvider>,
  );
}

describe("ErTableNode", () => {
  it("renders physical name and display name", () => {
    const { container } = renderNode({
      tableId: "t1",
      physicalName: "users",
      name: "ユーザー",
      columns: [],
    });

    expect(container.querySelector(".er-node-name")?.textContent).toBe("users");
    expect(container.querySelector(".er-node-logical")?.textContent).toBe("ユーザー");
  });

  it("renders category when given", () => {
    const { container } = renderNode({
      tableId: "t1",
      physicalName: "users",
      name: "ユーザー",
      category: "マスタ",
      columns: [],
    });

    expect(container.querySelector(".er-node-category")?.textContent).toBe("マスタ");
  });

  it("classifies columns: PK first, then FK, then others (hidden by default)", () => {
    const pkCol = makeColumn({ id: "c1" as LocalId, physicalName: "id" as PhysicalName, primaryKey: true });
    const fkCol = makeColumn({ id: "c2" as LocalId, physicalName: "tenant_id" as PhysicalName });
    const otherCol = makeColumn({ id: "c3" as LocalId, physicalName: "name" as PhysicalName });
    const { container } = renderNode({
      tableId: "t1",
      physicalName: "users",
      name: "ユーザー",
      columns: [pkCol, fkCol, otherCol],
      fkColumnIds: new Set(["c2"]),
    });

    expect(container.querySelector(".er-col.pk")?.textContent).toContain("id");
    expect(container.querySelector(".er-col.fk")?.textContent).toContain("tenant_id");
    // 通常列はデフォルトで折りたたみ
    expect(container.textContent).toContain("他 1 カラム");
    expect(container.textContent).not.toContain("name");
  });

  it("expands hidden columns when toggle is clicked", () => {
    const otherCol = makeColumn({ id: "c3" as LocalId, physicalName: "name" as PhysicalName });
    const { container } = renderNode({
      tableId: "t1",
      physicalName: "users",
      name: "ユーザー",
      columns: [otherCol],
    });

    const toggle = container.querySelector(".er-col-toggle");
    expect(toggle).not.toBeNull();
    fireEvent.click(toggle!);

    expect(container.textContent).toContain("折りたたむ");
    expect(container.textContent).toContain("name");
  });

  it("shows selected class when selected prop is true", () => {
    const { container } = renderNode(
      {
        tableId: "t1",
        physicalName: "users",
        name: "ユーザー",
        columns: [],
      },
      true,
    );

    expect(container.querySelector(".er-table-node.selected")).not.toBeNull();
  });

  it("renders dataType with length for VARCHAR", () => {
    const pkCol = makeColumn({
      id: "c1" as LocalId,
      physicalName: "code" as PhysicalName,
      dataType: "VARCHAR",
      length: 32,
      primaryKey: true,
    });
    const { container } = renderNode({
      tableId: "t1",
      physicalName: "items",
      name: "商品",
      columns: [pkCol],
    });

    expect(container.querySelector(".er-col-type")?.textContent).toBe("VARCHAR(32)");
  });
});
