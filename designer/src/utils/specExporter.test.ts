import { describe, it, expect } from "vitest";
import { generateSpecJson } from "./specExporter";
import type { TableDefinition } from "../types/table";
import type { FlowProject } from "../types/flow";
import type { ErLayout } from "../types/table";

const emptyProject: FlowProject = {
  name: "テストプロジェクト",
  screens: [],
  edges: [],
};

const emptyErLayout: ErLayout = {
  positions: {},
  updatedAt: new Date().toISOString(),
};

function makeTable(overrides: Partial<TableDefinition> = {}): TableDefinition {
  return {
    id: "t1",
    name: "orders",
    logicalName: "注文",
    description: "注文テーブル",
    columns: [
      {
        id: "c1", no: 1, name: "id", logicalName: "ID",
        dataType: "INTEGER", notNull: true, primaryKey: true, unique: false, autoIncrement: true,
      },
      {
        id: "c2", no: 2, name: "customer_id", logicalName: "顧客ID",
        dataType: "INTEGER", notNull: true, primaryKey: false, unique: false,
      },
    ],
    indexes: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("generateSpecJson — SpecTable", () => {
  it("constraints/defaults/triggers が空のとき出力に含まれない", () => {
    const spec = generateSpecJson(emptyProject, [makeTable()], emptyErLayout);
    const t = spec.tables[0];
    expect(t.constraints).toBeUndefined();
    expect(t.defaults).toBeUndefined();
    expect(t.triggers).toBeUndefined();
  });

  it("UNIQUE 制約が出力に含まれる", () => {
    const table = makeTable({
      constraints: [
        { id: "uq1", kind: "unique", columns: ["customer_id"], description: "顧客IDは一意" },
      ],
    });
    const spec = generateSpecJson(emptyProject, [table], emptyErLayout);
    const t = spec.tables[0];
    expect(t.constraints).toHaveLength(1);
    expect(t.constraints![0]).toMatchObject({ kind: "unique", columns: ["customer_id"] });
  });

  it("CHECK 制約が出力に含まれる", () => {
    const table = makeTable({
      constraints: [
        { id: "ck1", kind: "check", expression: "amount > 0", description: "金額は正の値" },
      ],
    });
    const spec = generateSpecJson(emptyProject, [table], emptyErLayout);
    expect(spec.tables[0].constraints![0]).toMatchObject({ kind: "check", expression: "amount > 0" });
  });

  it("FOREIGN KEY 制約が出力に含まれる", () => {
    const table = makeTable({
      constraints: [
        {
          id: "fk1", kind: "foreignKey",
          columns: ["customer_id"], referencedTable: "customers", referencedColumns: ["id"],
          onDelete: "CASCADE",
        },
      ],
    });
    const spec = generateSpecJson(emptyProject, [table], emptyErLayout);
    expect(spec.tables[0].constraints![0]).toMatchObject({
      kind: "foreignKey", referencedTable: "customers", onDelete: "CASCADE",
    });
  });

  it("DEFAULT 定義が出力に含まれる", () => {
    const table = makeTable({
      defaults: [
        { column: "created_at", kind: "function", value: "NOW()", description: "作成日時自動設定" },
        { column: "status", kind: "literal", value: "'active'" },
      ],
    });
    const spec = generateSpecJson(emptyProject, [table], emptyErLayout);
    const t = spec.tables[0];
    expect(t.defaults).toHaveLength(2);
    expect(t.defaults![0]).toMatchObject({ column: "created_at", kind: "function", value: "NOW()" });
    expect(t.defaults![1]).toMatchObject({ column: "status", kind: "literal" });
  });

  it("トリガー定義が出力に含まれる", () => {
    const table = makeTable({
      triggers: [
        {
          id: "tr1", timing: "BEFORE", events: ["INSERT", "UPDATE"],
          body: "SET NEW.updated_at = NOW();", description: "更新日時自動セット",
        },
      ],
    });
    const spec = generateSpecJson(emptyProject, [table], emptyErLayout);
    const t = spec.tables[0];
    expect(t.triggers).toHaveLength(1);
    expect(t.triggers![0]).toMatchObject({ timing: "BEFORE", events: ["INSERT", "UPDATE"] });
  });

  it("constraints / defaults / triggers が混在しても全て出力される", () => {
    const table = makeTable({
      constraints: [{ id: "uq1", kind: "unique", columns: ["customer_id"] }],
      defaults: [{ column: "status", kind: "literal", value: "'active'" }],
      triggers: [{ id: "tr1", timing: "AFTER", events: ["INSERT"], body: "..." }],
    });
    const spec = generateSpecJson(emptyProject, [table], emptyErLayout);
    const t = spec.tables[0];
    expect(t.constraints).toHaveLength(1);
    expect(t.defaults).toHaveLength(1);
    expect(t.triggers).toHaveLength(1);
  });
});
