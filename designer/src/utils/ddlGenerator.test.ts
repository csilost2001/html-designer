import { describe, it, expect } from "vitest";
import { generateDdl } from "./ddlGenerator";
import type { TableDefinition } from "../types/table";

function baseTable(overrides: Partial<TableDefinition> = {}): TableDefinition {
  return {
    id: "t1",
    name: "orders",
    logicalName: "受注",
    description: "",
    columns: [
      {
        id: "c1", no: 1, name: "id", logicalName: "ID",
        dataType: "INTEGER", notNull: true, primaryKey: true, unique: false, autoIncrement: true,
      },
      {
        id: "c2", no: 2, name: "amount", logicalName: "金額",
        dataType: "DECIMAL", length: 12, scale: 2, notNull: true, primaryKey: false, unique: false,
      },
      {
        id: "c3", no: 3, name: "supplier_id", logicalName: "仕入先ID",
        dataType: "INTEGER", notNull: true, primaryKey: false, unique: false,
      },
      {
        id: "c4", no: 4, name: "po_number", logicalName: "発注番号",
        dataType: "VARCHAR", length: 50, notNull: true, primaryKey: false, unique: false,
      },
    ],
    indexes: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("generateDdl — constraints (β-2)", () => {
  it("UNIQUE 制約が ALTER TABLE ... ADD CONSTRAINT ... UNIQUE として出力される", () => {
    const table = baseTable({
      constraints: [
        { id: "uq_po_number", kind: "unique", columns: ["po_number"] },
      ],
    });
    const ddl = generateDdl(table, "postgresql");
    expect(ddl).toContain("ALTER TABLE orders ADD CONSTRAINT uq_po_number UNIQUE (po_number);");
  });

  it("CHECK 制約が ALTER TABLE ... ADD CONSTRAINT ... CHECK として出力される", () => {
    const table = baseTable({
      constraints: [
        { id: "chk_amount_positive", kind: "check", expression: "amount > 0" },
      ],
    });
    const ddl = generateDdl(table, "postgresql");
    expect(ddl).toContain("ALTER TABLE orders ADD CONSTRAINT chk_amount_positive CHECK (amount > 0);");
  });

  it("FOREIGN KEY 制約が ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY として出力される", () => {
    const table = baseTable({
      constraints: [
        {
          id: "fk_orders_supplier",
          kind: "foreignKey",
          columns: ["supplier_id"],
          referencedTable: "suppliers",
          referencedColumns: ["id"],
          onDelete: "RESTRICT",
        },
      ],
    });
    const ddl = generateDdl(table, "postgresql");
    expect(ddl).toContain("ALTER TABLE orders ADD CONSTRAINT fk_orders_supplier");
    expect(ddl).toContain("FOREIGN KEY (supplier_id) REFERENCES suppliers(id)");
    expect(ddl).toContain("ON DELETE RESTRICT");
  });

  it("FK に onUpdate が指定された場合は ON UPDATE も出力される", () => {
    const table = baseTable({
      constraints: [
        {
          id: "fk_cascade",
          kind: "foreignKey",
          columns: ["supplier_id"],
          referencedTable: "suppliers",
          referencedColumns: ["id"],
          onDelete: "CASCADE",
          onUpdate: "CASCADE",
        },
      ],
    });
    const ddl = generateDdl(table, "postgresql");
    expect(ddl).toContain("ON DELETE CASCADE");
    expect(ddl).toContain("ON UPDATE CASCADE");
  });

  it("FK に onDelete / onUpdate が未指定の場合は ON DELETE / ON UPDATE を出力しない", () => {
    const table = baseTable({
      constraints: [
        {
          id: "fk_bare",
          kind: "foreignKey",
          columns: ["supplier_id"],
          referencedTable: "suppliers",
          referencedColumns: ["id"],
        },
      ],
    });
    const ddl = generateDdl(table, "postgresql");
    expect(ddl).not.toContain("ON DELETE");
    expect(ddl).not.toContain("ON UPDATE");
  });

  it("constraints が未定義の場合は ALTER TABLE を出力しない", () => {
    const table = baseTable();
    const ddl = generateDdl(table, "postgresql");
    expect(ddl).not.toContain("ALTER TABLE");
  });

  it("複数制約が順序通り出力される", () => {
    const table = baseTable({
      constraints: [
        { id: "uq_po_number", kind: "unique", columns: ["po_number"] },
        { id: "chk_amount", kind: "check", expression: "amount > 0" },
      ],
    });
    const ddl = generateDdl(table, "postgresql");
    const uqPos = ddl.indexOf("uq_po_number");
    const chkPos = ddl.indexOf("chk_amount");
    expect(uqPos).toBeGreaterThan(-1);
    expect(chkPos).toBeGreaterThan(-1);
    expect(uqPos).toBeLessThan(chkPos);
  });

  it("MySQL でも同じ ALTER TABLE 構文が出力される", () => {
    const table = baseTable({
      constraints: [
        { id: "uq_po", kind: "unique", columns: ["po_number"] },
      ],
    });
    const ddl = generateDdl(table, "mysql");
    expect(ddl).toContain("ALTER TABLE orders ADD CONSTRAINT uq_po UNIQUE (po_number);");
  });
});
