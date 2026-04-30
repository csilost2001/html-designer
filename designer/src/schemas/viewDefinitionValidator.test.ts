/**
 * ViewDefinition 整合検証テスト (#649)
 *
 * viewDefinitionValidator.ts の 9 観点を網羅:
 * 1. UNKNOWN_SOURCE_TABLE
 * 2. UNKNOWN_TABLE_COLUMN_REF
 * 3. COLUMN_REF_NOT_IN_SOURCE_TABLE (warning)
 * 4. DUPLICATE_VIEW_COLUMN_NAME
 * 5. FIELD_TYPE_INCOMPATIBLE (warning)
 * 6. UNKNOWN_SORT_COLUMN
 * 7. UNKNOWN_FILTER_COLUMN
 * 8. FILTER_OPERATOR_TYPE_MISMATCH (warning)
 * 9. UNKNOWN_GROUP_BY_COLUMN
 */
import { describe, it, expect } from "vitest";
import {
  checkViewDefinition,
  checkViewDefinitions,
  type TableDefinitionForView,
} from "./viewDefinitionValidator";
import type { ViewDefinition } from "../types/v3/view-definition";

// ─── テスト用ファクトリ ──────────────────────────────────────────────────────

const TABLE_ID = "aaaaaaaa-0001-4000-8000-aaaaaaaaaaaa";
const OTHER_TABLE_ID = "bbbbbbbb-0002-4000-8000-bbbbbbbbbbbb";

const TABLES: TableDefinitionForView[] = [
  {
    id: TABLE_ID,
    physicalName: "products",
    name: "商品マスタ",
    columns: [
      { id: "col-p01", physicalName: "id", name: "商品ID", dataType: "INTEGER" },
      { id: "col-p02", physicalName: "name", name: "商品名", dataType: "VARCHAR" },
      { id: "col-p03", physicalName: "unit_price", name: "単価", dataType: "INTEGER" },
      { id: "col-p04", physicalName: "category", name: "カテゴリ", dataType: "VARCHAR" },
      { id: "col-p05", physicalName: "is_active", name: "販売フラグ", dataType: "BOOLEAN" },
      { id: "col-p06", physicalName: "created_at", name: "作成日時", dataType: "TIMESTAMP" },
    ],
  },
  {
    id: OTHER_TABLE_ID,
    physicalName: "inventory",
    name: "在庫管理",
    columns: [
      { id: "col-i01", physicalName: "id", name: "在庫ID", dataType: "INTEGER" },
      { id: "col-i02", physicalName: "product_code", name: "商品コード", dataType: "VARCHAR" },
    ],
  },
];

function makeViewDefinition(partial: Partial<ViewDefinition>): ViewDefinition {
  return {
    meta: {
      id: "vvvvvvvv-0001-4000-8000-vvvvvvvvvvvv",
      name: "商品一覧",
      version: "1.0.0",
      maturity: "draft",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
    kind: "list",
    sourceTableId: TABLE_ID,
    columns: [
      {
        name: "productId" as unknown as import("../types/v3/common").Identifier,
        tableColumnRef: { tableId: TABLE_ID, columnId: "col-p01" },
        type: "integer" as unknown as import("../types/v3/common").FieldType,
        displayName: "商品ID" as unknown as import("../types/v3/common").DisplayName,
        sortable: true,
        filterable: true,
      },
      {
        name: "productName" as unknown as import("../types/v3/common").Identifier,
        tableColumnRef: { tableId: TABLE_ID, columnId: "col-p02" },
        type: "string" as unknown as import("../types/v3/common").FieldType,
        displayName: "商品名" as unknown as import("../types/v3/common").DisplayName,
        sortable: true,
        filterable: true,
      },
    ],
    ...partial,
  } as ViewDefinition;
}

// ─── 1. UNKNOWN_SOURCE_TABLE ─────────────────────────────────────────────────

describe("viewDefinitionValidator — 1. UNKNOWN_SOURCE_TABLE", () => {
  it("存在しない sourceTableId を検出する", () => {
    const vd = makeViewDefinition({ sourceTableId: "00000000-dead-4000-8000-000000000000" });
    const issues = checkViewDefinition(vd, TABLES);
    expect(issues.some((i) => i.code === "UNKNOWN_SOURCE_TABLE")).toBe(true);
    const issue = issues.find((i) => i.code === "UNKNOWN_SOURCE_TABLE");
    expect(issue?.severity).toBe("error");
  });

  it("正しい sourceTableId は issue なし", () => {
    const vd = makeViewDefinition({});
    const issues = checkViewDefinition(vd, TABLES);
    expect(issues.filter((i) => i.code === "UNKNOWN_SOURCE_TABLE")).toHaveLength(0);
  });
});

// ─── 2. UNKNOWN_TABLE_COLUMN_REF ─────────────────────────────────────────────

describe("viewDefinitionValidator — 2. UNKNOWN_TABLE_COLUMN_REF", () => {
  it("存在しない columnId を検出する", () => {
    const vd = makeViewDefinition({
      columns: [
        {
          name: "productId" as unknown as import("../types/v3/common").Identifier,
          tableColumnRef: { tableId: TABLE_ID, columnId: "col-nonexistent" },
          type: "integer" as unknown as import("../types/v3/common").FieldType,
        },
      ],
    });
    const issues = checkViewDefinition(vd, TABLES);
    expect(issues.some((i) => i.code === "UNKNOWN_TABLE_COLUMN_REF")).toBe(true);
    expect(issues.find((i) => i.code === "UNKNOWN_TABLE_COLUMN_REF")?.severity).toBe("error");
  });

  it("存在しない tableId を検出する", () => {
    const vd = makeViewDefinition({
      columns: [
        {
          name: "col" as unknown as import("../types/v3/common").Identifier,
          tableColumnRef: { tableId: "00000000-dead-4000-8000-000000000000", columnId: "col-p01" },
          type: "integer" as unknown as import("../types/v3/common").FieldType,
        },
      ],
    });
    const issues = checkViewDefinition(vd, TABLES);
    // COLUMN_REF_NOT_IN_SOURCE_TABLE (warning) も出るが UNKNOWN_TABLE_COLUMN_REF (error) も出る
    expect(issues.some((i) => i.code === "UNKNOWN_TABLE_COLUMN_REF")).toBe(true);
  });

  it("正しい tableColumnRef は issue なし", () => {
    const vd = makeViewDefinition({});
    const issues = checkViewDefinition(vd, TABLES);
    expect(issues.filter((i) => i.code === "UNKNOWN_TABLE_COLUMN_REF")).toHaveLength(0);
  });
});

// ─── 3. COLUMN_REF_NOT_IN_SOURCE_TABLE ───────────────────────────────────────

describe("viewDefinitionValidator — 3. COLUMN_REF_NOT_IN_SOURCE_TABLE", () => {
  it("別テーブルの列参照を warning で検出する (joined view 許容)", () => {
    const vd = makeViewDefinition({
      columns: [
        {
          name: "inventoryId" as unknown as import("../types/v3/common").Identifier,
          // 別テーブル (OTHER_TABLE_ID) の列参照 (joined view 想定)
          tableColumnRef: { tableId: OTHER_TABLE_ID, columnId: "col-i01" },
          type: "integer" as unknown as import("../types/v3/common").FieldType,
        },
      ],
    });
    const issues = checkViewDefinition(vd, TABLES);
    expect(issues.some((i) => i.code === "COLUMN_REF_NOT_IN_SOURCE_TABLE")).toBe(true);
    expect(issues.find((i) => i.code === "COLUMN_REF_NOT_IN_SOURCE_TABLE")?.severity).toBe("warning");
  });

  it("sourceTableId と一致するテーブル参照は warning なし", () => {
    const vd = makeViewDefinition({});
    const issues = checkViewDefinition(vd, TABLES);
    expect(issues.filter((i) => i.code === "COLUMN_REF_NOT_IN_SOURCE_TABLE")).toHaveLength(0);
  });
});

// ─── 4. DUPLICATE_VIEW_COLUMN_NAME ───────────────────────────────────────────

describe("viewDefinitionValidator — 4. DUPLICATE_VIEW_COLUMN_NAME", () => {
  it("同 name が 2 回出てくる場合を検出する", () => {
    const vd = makeViewDefinition({
      columns: [
        {
          name: "productId" as unknown as import("../types/v3/common").Identifier,
          tableColumnRef: { tableId: TABLE_ID, columnId: "col-p01" },
          type: "integer" as unknown as import("../types/v3/common").FieldType,
        },
        {
          name: "productId" as unknown as import("../types/v3/common").Identifier, // duplicate
          tableColumnRef: { tableId: TABLE_ID, columnId: "col-p02" },
          type: "string" as unknown as import("../types/v3/common").FieldType,
        },
      ],
    });
    const issues = checkViewDefinition(vd, TABLES);
    expect(issues.some((i) => i.code === "DUPLICATE_VIEW_COLUMN_NAME")).toBe(true);
    expect(issues.find((i) => i.code === "DUPLICATE_VIEW_COLUMN_NAME")?.severity).toBe("error");
  });

  it("全 name がユニークなら issue なし", () => {
    const vd = makeViewDefinition({});
    const issues = checkViewDefinition(vd, TABLES);
    expect(issues.filter((i) => i.code === "DUPLICATE_VIEW_COLUMN_NAME")).toHaveLength(0);
  });
});

// ─── 5. FIELD_TYPE_INCOMPATIBLE ──────────────────────────────────────────────

describe("viewDefinitionValidator — 5. FIELD_TYPE_INCOMPATIBLE", () => {
  it("VARCHAR に boolean 型は warning 検出", () => {
    const vd = makeViewDefinition({
      columns: [
        {
          name: "productName" as unknown as import("../types/v3/common").Identifier,
          tableColumnRef: { tableId: TABLE_ID, columnId: "col-p02" }, // VARCHAR
          type: "boolean" as unknown as import("../types/v3/common").FieldType, // 不整合
        },
      ],
    });
    const issues = checkViewDefinition(vd, TABLES);
    expect(issues.some((i) => i.code === "FIELD_TYPE_INCOMPATIBLE")).toBe(true);
    expect(issues.find((i) => i.code === "FIELD_TYPE_INCOMPATIBLE")?.severity).toBe("warning");
  });

  it("INTEGER に integer 型は互換、warning なし", () => {
    const vd = makeViewDefinition({
      columns: [
        {
          name: "productId" as unknown as import("../types/v3/common").Identifier,
          tableColumnRef: { tableId: TABLE_ID, columnId: "col-p01" }, // INTEGER
          type: "integer" as unknown as import("../types/v3/common").FieldType,
        },
      ],
    });
    const issues = checkViewDefinition(vd, TABLES);
    expect(issues.filter((i) => i.code === "FIELD_TYPE_INCOMPATIBLE")).toHaveLength(0);
  });

  it("TIMESTAMP に datetime は互換、warning なし", () => {
    const vd = makeViewDefinition({
      columns: [
        {
          name: "createdAt" as unknown as import("../types/v3/common").Identifier,
          tableColumnRef: { tableId: TABLE_ID, columnId: "col-p06" }, // TIMESTAMP
          type: "datetime" as unknown as import("../types/v3/common").FieldType,
        },
      ],
    });
    const issues = checkViewDefinition(vd, TABLES);
    expect(issues.filter((i) => i.code === "FIELD_TYPE_INCOMPATIBLE")).toHaveLength(0);
  });
});

// ─── 6. UNKNOWN_SORT_COLUMN ───────────────────────────────────────────────────

describe("viewDefinitionValidator — 6. UNKNOWN_SORT_COLUMN", () => {
  it("columns に存在しない columnName は error 検出", () => {
    const vd = makeViewDefinition({
      sortDefaults: [
        { columnName: "nonexistentCol" as unknown as import("../types/v3/common").Identifier, order: "asc" },
      ],
    });
    const issues = checkViewDefinition(vd, TABLES);
    expect(issues.some((i) => i.code === "UNKNOWN_SORT_COLUMN")).toBe(true);
    expect(issues.find((i) => i.code === "UNKNOWN_SORT_COLUMN")?.severity).toBe("error");
  });

  it("正しい columnName は issue なし", () => {
    const vd = makeViewDefinition({
      sortDefaults: [
        { columnName: "productId" as unknown as import("../types/v3/common").Identifier, order: "desc" },
      ],
    });
    const issues = checkViewDefinition(vd, TABLES);
    expect(issues.filter((i) => i.code === "UNKNOWN_SORT_COLUMN")).toHaveLength(0);
  });
});

// ─── 7. UNKNOWN_FILTER_COLUMN ────────────────────────────────────────────────

describe("viewDefinitionValidator — 7. UNKNOWN_FILTER_COLUMN", () => {
  it("columns に存在しない columnName は error 検出", () => {
    const vd = makeViewDefinition({
      filterDefaults: [
        { columnName: "noSuchColumn" as unknown as import("../types/v3/common").Identifier, operator: "eq" },
      ],
    });
    const issues = checkViewDefinition(vd, TABLES);
    expect(issues.some((i) => i.code === "UNKNOWN_FILTER_COLUMN")).toBe(true);
    expect(issues.find((i) => i.code === "UNKNOWN_FILTER_COLUMN")?.severity).toBe("error");
  });

  it("正しい columnName は issue なし", () => {
    const vd = makeViewDefinition({
      filterDefaults: [
        { columnName: "productName" as unknown as import("../types/v3/common").Identifier, operator: "contains" },
      ],
    });
    const issues = checkViewDefinition(vd, TABLES);
    expect(issues.filter((i) => i.code === "UNKNOWN_FILTER_COLUMN")).toHaveLength(0);
  });
});

// ─── 8. FILTER_OPERATOR_TYPE_MISMATCH ────────────────────────────────────────

describe("viewDefinitionValidator — 8. FILTER_OPERATOR_TYPE_MISMATCH", () => {
  it("string 型カラムに between は warning 検出", () => {
    const vd = makeViewDefinition({
      filterDefaults: [
        {
          columnName: "productName" as unknown as import("../types/v3/common").Identifier, // string
          operator: "between",
        },
      ],
    });
    const issues = checkViewDefinition(vd, TABLES);
    expect(issues.some((i) => i.code === "FILTER_OPERATOR_TYPE_MISMATCH")).toBe(true);
    expect(issues.find((i) => i.code === "FILTER_OPERATOR_TYPE_MISMATCH")?.severity).toBe("warning");
  });

  it("integer 型カラムに contains は warning 検出", () => {
    const vd = makeViewDefinition({
      filterDefaults: [
        {
          columnName: "productId" as unknown as import("../types/v3/common").Identifier, // integer
          operator: "contains",
        },
      ],
    });
    const issues = checkViewDefinition(vd, TABLES);
    expect(issues.some((i) => i.code === "FILTER_OPERATOR_TYPE_MISMATCH")).toBe(true);
  });

  it("string 型カラムに contains は warning なし", () => {
    const vd = makeViewDefinition({
      filterDefaults: [
        {
          columnName: "productName" as unknown as import("../types/v3/common").Identifier, // string
          operator: "contains",
        },
      ],
    });
    const issues = checkViewDefinition(vd, TABLES);
    expect(issues.filter((i) => i.code === "FILTER_OPERATOR_TYPE_MISMATCH")).toHaveLength(0);
  });
});

// ─── 9. UNKNOWN_GROUP_BY_COLUMN ──────────────────────────────────────────────

describe("viewDefinitionValidator — 9. UNKNOWN_GROUP_BY_COLUMN", () => {
  it("columns に存在しない groupBy は error 検出", () => {
    const vd = makeViewDefinition({
      groupBy: "missingColumn" as unknown as import("../types/v3/common").Identifier,
    });
    const issues = checkViewDefinition(vd, TABLES);
    expect(issues.some((i) => i.code === "UNKNOWN_GROUP_BY_COLUMN")).toBe(true);
    expect(issues.find((i) => i.code === "UNKNOWN_GROUP_BY_COLUMN")?.severity).toBe("error");
  });

  it("columns に存在する groupBy は issue なし", () => {
    const vd = makeViewDefinition({
      groupBy: "productId" as unknown as import("../types/v3/common").Identifier,
    });
    const issues = checkViewDefinition(vd, TABLES);
    expect(issues.filter((i) => i.code === "UNKNOWN_GROUP_BY_COLUMN")).toHaveLength(0);
  });
});

// ─── 正常系: 全 issue なし ────────────────────────────────────────────────────

describe("viewDefinitionValidator — 正常系", () => {
  it("完全に正しい ViewDefinition は issue なし", () => {
    const vd = makeViewDefinition({
      columns: [
        {
          name: "productId" as unknown as import("../types/v3/common").Identifier,
          tableColumnRef: { tableId: TABLE_ID, columnId: "col-p01" },
          type: "integer" as unknown as import("../types/v3/common").FieldType,
          displayName: "商品ID" as unknown as import("../types/v3/common").DisplayName,
          sortable: true,
          filterable: true,
          align: "right",
        },
        {
          name: "productName" as unknown as import("../types/v3/common").Identifier,
          tableColumnRef: { tableId: TABLE_ID, columnId: "col-p02" },
          type: "string" as unknown as import("../types/v3/common").FieldType,
          displayName: "商品名" as unknown as import("../types/v3/common").DisplayName,
          sortable: true,
          filterable: true,
        },
        {
          name: "unitPrice" as unknown as import("../types/v3/common").Identifier,
          tableColumnRef: { tableId: TABLE_ID, columnId: "col-p03" },
          type: "integer" as unknown as import("../types/v3/common").FieldType,
          displayName: "単価" as unknown as import("../types/v3/common").DisplayName,
          sortable: true,
          align: "right",
          displayFormat: "#,##0",
        },
      ],
      sortDefaults: [
        { columnName: "unitPrice" as unknown as import("../types/v3/common").Identifier, order: "desc" },
      ],
      filterDefaults: [
        { columnName: "productName" as unknown as import("../types/v3/common").Identifier, operator: "contains" },
      ],
    });
    const issues = checkViewDefinition(vd, TABLES);
    expect(issues).toHaveLength(0);
  });
});

// ─── checkViewDefinitions (複数 ViewDefinition) ───────────────────────────────

describe("checkViewDefinitions", () => {
  it("複数 ViewDefinition を一括検証し各 issue を集約する", () => {
    const vd1 = makeViewDefinition({ sourceTableId: "00000000-dead-4000-8000-000000000000" });
    const vd2 = makeViewDefinition({
      sortDefaults: [
        { columnName: "noSuchCol" as unknown as import("../types/v3/common").Identifier, order: "asc" },
      ],
    });
    const issues = checkViewDefinitions([vd1, vd2], TABLES);
    expect(issues.some((i) => i.code === "UNKNOWN_SOURCE_TABLE")).toBe(true);
    expect(issues.some((i) => i.code === "UNKNOWN_SORT_COLUMN")).toBe(true);
  });

  it("空配列は issue なし", () => {
    const issues = checkViewDefinitions([], TABLES);
    expect(issues).toHaveLength(0);
  });
});
