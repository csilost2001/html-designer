/**
 * ViewDefinition 整合検証 (#649、Phase 4 子 1)
 *
 * 検査観点 (9 件):
 * 1. UNKNOWN_SOURCE_TABLE         — sourceTableId が同プロジェクト内に実在しない
 * 2. UNKNOWN_TABLE_COLUMN_REF     — ViewColumn.tableColumnRef が実在しない
 * 3. COLUMN_REF_NOT_IN_SOURCE_TABLE — tableColumnRef.tableId が sourceTableId と異なる (joined view、warning)
 * 4. DUPLICATE_VIEW_COLUMN_NAME   — ViewColumn.name が同 ViewDefinition 内で重複
 * 5. FIELD_TYPE_INCOMPATIBLE      — ViewColumn.type (FieldType) と DB Column.dataType が互換しない (warning)
 * 6. UNKNOWN_SORT_COLUMN          — sortDefaults[].columnName が columns[].name に存在しない
 * 7. UNKNOWN_FILTER_COLUMN        — filterDefaults[].columnName が columns[].name に存在しない
 * 8. FILTER_OPERATOR_TYPE_MISMATCH — filter operator が column type と不整合 (warning)
 * 9. UNKNOWN_GROUP_BY_COLUMN      — groupBy が columns[].name に存在しない
 */

import type { ViewDefinition, ViewColumn } from "../types/v3/view-definition";

export type ViewDefinitionIssueCode =
  | "UNKNOWN_SOURCE_TABLE"
  | "UNKNOWN_TABLE_COLUMN_REF"
  | "COLUMN_REF_NOT_IN_SOURCE_TABLE"
  | "DUPLICATE_VIEW_COLUMN_NAME"
  | "FIELD_TYPE_INCOMPATIBLE"
  | "UNKNOWN_SORT_COLUMN"
  | "UNKNOWN_FILTER_COLUMN"
  | "FILTER_OPERATOR_TYPE_MISMATCH"
  | "UNKNOWN_GROUP_BY_COLUMN";

export interface ViewDefinitionIssue {
  path: string;
  code: ViewDefinitionIssueCode;
  severity: "error" | "warning";
  viewDefinitionId: string;
  message: string;
}

/** テーブル定義の最小インターフェース (validate-dogfood からも利用) */
export interface TableDefinitionForView {
  id: string;
  physicalName?: string;
  name?: string;
  columns?: Array<{
    id: string;
    physicalName?: string;
    name?: string;
    dataType?: string;
  }>;
}

/** DB DataType → FieldType 互換マップ (ViewColumn.type と照合) */
const DATATYPE_TO_FIELDTYPE_COMPATIBLE: Record<string, string[]> = {
  INTEGER: ["integer", "number", "string"],
  BIGINT: ["integer", "number", "string"],
  SMALLINT: ["integer", "number", "string"],
  DECIMAL: ["number", "string"],
  NUMERIC: ["number", "string"],
  FLOAT: ["number", "string"],
  DOUBLE: ["number", "string"],
  REAL: ["number", "string"],
  VARCHAR: ["string"],
  TEXT: ["string"],
  CHAR: ["string"],
  BOOLEAN: ["boolean", "string"],
  DATE: ["date", "string"],
  TIMESTAMP: ["datetime", "date", "string"],
  DATETIME: ["datetime", "date", "string"],
  JSON: ["json", "string"],
  JSONB: ["json", "string"],
  BINARY: ["string"],
  BLOB: ["string"],
};

/** text 系 FieldType で between/in 等の数値系オペレータは不整合 */
const TEXT_OPERATORS_ONLY = new Set(["contains", "startsWith"]);
const NUMERIC_OPERATORS_ONLY = new Set(["between"]);

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function normalizeFieldType(type: unknown): string | null {
  if (typeof type === "string") return type;
  const rec = type as Record<string, unknown> | null;
  if (rec && typeof rec.kind === "string") return rec.kind;
  return null;
}

function getViewId(vd: ViewDefinition): string {
  // ViewDefinition extends EntityMeta (flat), so id is at root
  return vd.id ?? "<unknown>";
}

/**
 * 単一 ViewDefinition を検証。
 * tables は同プロジェクトのテーブル定義一覧。
 */
export function checkViewDefinition(
  vd: ViewDefinition,
  tables: TableDefinitionForView[],
): ViewDefinitionIssue[] {
  const issues: ViewDefinitionIssue[] = [];
  const viewId = getViewId(vd);

  // テーブル索引を事前構築
  const tableById = new Map<string, TableDefinitionForView>();
  for (const t of tables) {
    if (t.id) tableById.set(t.id, t);
  }

  // ─── 1. UNKNOWN_SOURCE_TABLE ─────────────────────────────────────────────
  const sourceTable = tableById.get(vd.sourceTableId);
  if (!sourceTable) {
    issues.push({
      path: `ViewDefinition[${viewId}].sourceTableId`,
      code: "UNKNOWN_SOURCE_TABLE",
      severity: "error",
      viewDefinitionId: viewId,
      message: `sourceTableId '${vd.sourceTableId}' が同プロジェクト内のテーブルに存在しません。`,
    });
    // sourceTable が無ければ以降の column 検査は全て false positive になるためスキップ
    // ただし columns 内の重複検査・sort/filter/groupBy 検査は継続する
  }

  // columns の name セットを構築 (後続 sort / filter / groupBy 検査用)
  const columnNames = new Set<string>();

  // ─── 4. DUPLICATE_VIEW_COLUMN_NAME (先にカウント) ─────────────────────
  const columnNameCount = new Map<string, number>();
  for (const col of vd.columns ?? []) {
    const n = asString(col.name);
    if (n) columnNameCount.set(n, (columnNameCount.get(n) ?? 0) + 1);
  }

  // ─── columns 個別検査 ────────────────────────────────────────────────────
  (vd.columns ?? []).forEach((col: ViewColumn, ci: number) => {
    const colName = asString(col.name) ?? `columns[${ci}]`;
    const colPath = `ViewDefinition[${viewId}].columns[${ci}=${colName}]`;

    // 4. DUPLICATE_VIEW_COLUMN_NAME
    if ((columnNameCount.get(colName) ?? 0) > 1) {
      // 初出 (first occurrence) のみ報告 (重複は 1 回のみ)
      if (!columnNames.has(colName)) {
        issues.push({
          path: colPath,
          code: "DUPLICATE_VIEW_COLUMN_NAME",
          severity: "error",
          viewDefinitionId: viewId,
          message: `columns[].name '${colName}' が同 ViewDefinition 内で重複しています。`,
        });
      }
    }
    columnNames.add(colName);

    const ref = col.tableColumnRef;
    if (!ref) return;

    const refTableId = asString(ref.tableId);
    const refColumnId = asString(ref.columnId);

    // 3. COLUMN_REF_NOT_IN_SOURCE_TABLE (warning: joined view は許容)
    if (refTableId && refTableId !== vd.sourceTableId) {
      issues.push({
        path: `${colPath}.tableColumnRef`,
        code: "COLUMN_REF_NOT_IN_SOURCE_TABLE",
        severity: "warning",
        viewDefinitionId: viewId,
        message: `tableColumnRef.tableId '${refTableId}' が sourceTableId '${vd.sourceTableId}' と異なります (joined view 参照は warning)。`,
      });
    }

    // 2. UNKNOWN_TABLE_COLUMN_REF
    if (refTableId && refColumnId) {
      const refTable = tableById.get(refTableId);
      if (!refTable) {
        issues.push({
          path: `${colPath}.tableColumnRef`,
          code: "UNKNOWN_TABLE_COLUMN_REF",
          severity: "error",
          viewDefinitionId: viewId,
          message: `tableColumnRef.tableId '${refTableId}' が同プロジェクト内のテーブルに存在しません。`,
        });
      } else {
        const refColumn = (refTable.columns ?? []).find((c) => c.id === refColumnId);
        if (!refColumn) {
          issues.push({
            path: `${colPath}.tableColumnRef`,
            code: "UNKNOWN_TABLE_COLUMN_REF",
            severity: "error",
            viewDefinitionId: viewId,
            message: `tableColumnRef.columnId '${refColumnId}' がテーブル '${refTableId}' に存在しません。`,
          });
        } else {
          // 5. FIELD_TYPE_INCOMPATIBLE (warning)
          const dbType = asString(refColumn.dataType)?.toUpperCase();
          const fieldType = normalizeFieldType(col.type);
          if (dbType && fieldType) {
            const compatible = DATATYPE_TO_FIELDTYPE_COMPATIBLE[dbType];
            if (compatible && !compatible.includes(fieldType)) {
              issues.push({
                path: `${colPath}.type`,
                code: "FIELD_TYPE_INCOMPATIBLE",
                severity: "warning",
                viewDefinitionId: viewId,
                message: `ViewColumn.type '${fieldType}' と DB Column.dataType '${dbType}' が互換しません。互換 FieldType: ${compatible.join(", ")}。`,
              });
            }
          }
        }
      }
    }

    // 8. FILTER_OPERATOR_TYPE_MISMATCH — columns 側で先に FieldType を記録
    // (filterDefaults の検査で参照するため、columnNames セットで型も保持)
  });

  // columnNames.has() はコラム名の存在確認のみ。型情報は別途 map で保持
  const columnFieldType = new Map<string, string | null>();
  for (const col of vd.columns ?? []) {
    const n = asString(col.name);
    if (n) columnFieldType.set(n, normalizeFieldType(col.type));
  }

  // ─── 6. UNKNOWN_SORT_COLUMN ────────────────────────────────────────────────
  (vd.sortDefaults ?? []).forEach((sortSpec, si) => {
    const colName = asString(sortSpec.columnName);
    if (colName && !columnNames.has(colName)) {
      issues.push({
        path: `ViewDefinition[${viewId}].sortDefaults[${si}].columnName`,
        code: "UNKNOWN_SORT_COLUMN",
        severity: "error",
        viewDefinitionId: viewId,
        message: `sortDefaults[${si}].columnName '${colName}' が columns[].name に存在しません。`,
      });
    }
  });

  // ─── 7. UNKNOWN_FILTER_COLUMN / 8. FILTER_OPERATOR_TYPE_MISMATCH ────────
  (vd.filterDefaults ?? []).forEach((filterSpec, fi) => {
    const colName = asString(filterSpec.columnName);
    if (!colName) return;

    if (!columnNames.has(colName)) {
      issues.push({
        path: `ViewDefinition[${viewId}].filterDefaults[${fi}].columnName`,
        code: "UNKNOWN_FILTER_COLUMN",
        severity: "error",
        viewDefinitionId: viewId,
        message: `filterDefaults[${fi}].columnName '${colName}' が columns[].name に存在しません。`,
      });
      return;
    }

    // 8. FILTER_OPERATOR_TYPE_MISMATCH
    const operator = asString(filterSpec.operator);
    const fieldType = columnFieldType.get(colName);
    if (operator && fieldType) {
      const isTextType = fieldType === "string";
      const isNumericType = ["integer", "number", "date", "datetime"].includes(fieldType);

      if (isTextType && NUMERIC_OPERATORS_ONLY.has(operator)) {
        issues.push({
          path: `ViewDefinition[${viewId}].filterDefaults[${fi}].operator`,
          code: "FILTER_OPERATOR_TYPE_MISMATCH",
          severity: "warning",
          viewDefinitionId: viewId,
          message: `filterDefaults[${fi}] operator '${operator}' は text 系 FieldType '${fieldType}' では不整合です。`,
        });
      }
      if (isNumericType && TEXT_OPERATORS_ONLY.has(operator)) {
        issues.push({
          path: `ViewDefinition[${viewId}].filterDefaults[${fi}].operator`,
          code: "FILTER_OPERATOR_TYPE_MISMATCH",
          severity: "warning",
          viewDefinitionId: viewId,
          message: `filterDefaults[${fi}] operator '${operator}' は数値/日付系 FieldType '${fieldType}' では不整合です。`,
        });
      }
    }
  });

  // ─── 9. UNKNOWN_GROUP_BY_COLUMN ───────────────────────────────────────────
  if (vd.groupBy) {
    const groupByName = asString(vd.groupBy);
    if (groupByName && !columnNames.has(groupByName)) {
      issues.push({
        path: `ViewDefinition[${viewId}].groupBy`,
        code: "UNKNOWN_GROUP_BY_COLUMN",
        severity: "error",
        viewDefinitionId: viewId,
        message: `groupBy '${groupByName}' が columns[].name に存在しません。`,
      });
    }
  }

  return issues;
}

/**
 * プロジェクト全体の ViewDefinition を検証。
 * viewDefinitions は data/view-definitions/<id>.json 相当のオブジェクト配列。
 */
export function checkViewDefinitions(
  viewDefinitions: ViewDefinition[],
  tables: TableDefinitionForView[],
): ViewDefinitionIssue[] {
  const issues: ViewDefinitionIssue[] = [];
  for (const vd of viewDefinitions ?? []) {
    issues.push(...checkViewDefinition(vd, tables));
  }
  return issues;
}
