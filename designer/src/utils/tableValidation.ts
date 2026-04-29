import type { Table } from "../types/v3/table";
import type { ValidationError } from "./actionValidation";

function tableNamespace(table: Table): string {
  return ((table as Table & { namespace?: string }).namespace ?? "").trim();
}

export function validateTable(table: Table, allTables: Table[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const stepId = table.id;

  if (!table.columns || table.columns.length === 0) {
    errors.push({
      stepId,
      severity: "warning",
      code: "table.columns.empty",
      path: "columns",
      message: "カラムが未定義です",
    });
  }

  if (!(table.columns ?? []).some((column) => column.primaryKey)) {
    errors.push({
      stepId,
      severity: "warning",
      code: "table.primaryKey.empty",
      path: "columns",
      message: "主キーが未指定です",
    });
  }

  const namespace = tableNamespace(table);
  const physicalName = table.physicalName?.trim();
  if (!physicalName) {
    errors.push({
      stepId,
      severity: "error",
      code: "table.physicalName.empty",
      path: "physicalName",
      message: "物理名が必須です",
    });
  } else {
    const duplicated = allTables.some((other) =>
      other.id !== table.id &&
      tableNamespace(other) === namespace &&
      other.physicalName?.trim() === physicalName,
    );
    if (duplicated) {
      errors.push({
        stepId,
        severity: "error",
        code: "table.physicalName.duplicate",
        path: "physicalName",
        message: `同じ名前空間に物理名 "${physicalName}" のテーブルが既に存在します`,
      });
    }
  }

  if (!table.name?.trim()) {
    errors.push({
      stepId,
      severity: "warning",
      code: "table.displayName.empty",
      path: "name",
      message: "表示名が未定義です",
    });
  }

  return errors;
}
