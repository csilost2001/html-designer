/**
 * tableStore.ts
 * テーブル設計書の永続化ストア
 *
 * - wsBridge が接続済みの場合: サーバー側ファイルに保存（mcpBridge 経由）
 * - 未接続の場合: localStorage にフォールバック
 */
import type { TableDefinition, TableMeta, TableColumn, IndexDefinition, ConstraintDefinition, TriggerDefinition, DefaultDefinition } from "../types/table";
import type { FlowProject } from "../types/flow";
import { loadProject, saveProject } from "./flowStore";
import { generateUUID } from "../utils/uuid";
import { renumber, nextNo } from "../utils/listOrder";

// ─── ストレージバックエンド ──────────────────────────────────────────────

export interface TableStorageBackend {
  loadTable(tableId: string): Promise<unknown>;
  saveTable(tableId: string, data: unknown): Promise<void>;
  deleteTable(tableId: string): Promise<void>;
}

let _backend: TableStorageBackend | null = null;

export function setTableStorageBackend(b: TableStorageBackend | null): void {
  _backend = b;
}

// ─── localStorage キー ───────────────────────────────────────────────────

const TABLE_PREFIX = "table-";

function now(): string {
  return new Date().toISOString();
}

// ─── 公開 API ────────────────────────────────────────────────────────────

/** テーブル一覧を取得（project.json のメタ情報） */
export async function listTables(): Promise<TableMeta[]> {
  const project = await loadProject();
  return project.tables ?? [];
}

/** テーブル定義を読み込み (columns の no を補完) */
export async function loadTable(tableId: string): Promise<TableDefinition | null> {
  const raw = await (async () => {
    if (_backend) return (await _backend.loadTable(tableId)) as TableDefinition | null;
    const s = localStorage.getItem(`${TABLE_PREFIX}${tableId}`);
    if (!s) return null;
    try { return JSON.parse(s) as TableDefinition; } catch { return null; }
  })();
  if (!raw) return null;
  // docs/spec/list-common.md §3.10: 読み込み時に no を配列順で補完
  raw.columns = renumber(raw.columns ?? []);
  return raw;
}

/** テーブル定義を保存（project.json のメタも同期） */
export async function saveTable(table: TableDefinition): Promise<void> {
  table.updatedAt = now();

  if (_backend) {
    await _backend.saveTable(table.id, table);
  } else {
    localStorage.setItem(`${TABLE_PREFIX}${table.id}`, JSON.stringify(table));
  }

  // project.json のテーブルメタを同期
  await syncTableMeta(table);
}

/** テーブルを新規作成 */
export async function createTable(
  name: string,
  logicalName: string,
  description?: string,
  category?: string,
): Promise<TableDefinition> {
  const id = generateUUID();
  const ts = now();
  const table: TableDefinition = {
    id,
    name,
    logicalName,
    description: description ?? "",
    category,
    columns: [],
    indexes: [],
    createdAt: ts,
    updatedAt: ts,
  };
  await saveTable(table);
  return table;
}

/** テーブルを削除 */
export async function deleteTable(tableId: string): Promise<void> {
  if (_backend) {
    await _backend.deleteTable(tableId);
  } else {
    localStorage.removeItem(`${TABLE_PREFIX}${tableId}`);
  }

  // project.json からメタを削除
  const project = await loadProject();
  if (project.tables) {
    project.tables = renumber(project.tables.filter((t) => t.id !== tableId));
    await saveProject(project);
  }
}

/** カラムを追加 */
export function addColumn(
  table: TableDefinition,
  partial?: Partial<TableColumn>,
): TableColumn {
  const col: TableColumn = {
    id: generateUUID(),
    no: nextNo(table.columns),
    name: partial?.name ?? "new_column",
    logicalName: partial?.logicalName ?? "新規カラム",
    dataType: partial?.dataType ?? "VARCHAR",
    length: partial?.length,
    scale: partial?.scale,
    notNull: partial?.notNull ?? false,
    primaryKey: partial?.primaryKey ?? false,
    unique: partial?.unique ?? false,
    defaultValue: partial?.defaultValue,
    autoIncrement: partial?.autoIncrement,
    foreignKey: partial?.foreignKey,
    comment: partial?.comment,
  };
  table.columns.push(col);
  table.columns = renumber(table.columns);
  return col;
}

/** カラムを削除 */
export function removeColumn(table: TableDefinition, columnId: string): void {
  const removedName = table.columns.find((c) => c.id === columnId)?.name;
  const idx = table.columns.findIndex((c) => c.id === columnId);
  if (idx >= 0) {
    table.columns.splice(idx, 1);
    table.columns = renumber(table.columns);
    // インデックスからも参照を削除 (列名で照合)
    if (removedName) {
      for (const index of table.indexes) {
        index.columns = index.columns.filter((ic) => ic.name !== removedName);
      }
      table.indexes = table.indexes.filter((idx) => idx.columns.length > 0);
    }
  }
}

/** インデックスを追加 */
export function addIndex(
  table: TableDefinition,
  partial?: Partial<IndexDefinition>,
): IndexDefinition {
  const idx: IndexDefinition = {
    id: partial?.id ?? `idx_${table.name}_${table.indexes.length + 1}`,
    columns: partial?.columns ?? [],
    unique: partial?.unique ?? false,
    method: partial?.method,
    where: partial?.where,
    description: partial?.description,
  };
  table.indexes.push(idx);
  return idx;
}

/** インデックスを削除 */
export function removeIndex(table: TableDefinition, indexId: string): void {
  const idx = table.indexes.findIndex((i) => i.id === indexId);
  if (idx >= 0) table.indexes.splice(idx, 1);
}

/** 制約を追加 */
export function addConstraint(
  table: TableDefinition,
  constraint: Omit<ConstraintDefinition, "id">,
): ConstraintDefinition {
  const c = { id: generateUUID(), ...constraint } as ConstraintDefinition;
  table.constraints = [...(table.constraints ?? []), c];
  return c;
}

/** 制約を削除 */
export function removeConstraint(table: TableDefinition, constraintId: string): void {
  table.constraints = (table.constraints ?? []).filter((c) => c.id !== constraintId);
}

/** DEFAULT 値定義を追加 */
export function addDefault(table: TableDefinition, def: DefaultDefinition): void {
  table.defaults = [...(table.defaults ?? []), def];
}

/** DEFAULT 値定義を削除 */
export function removeDefault(table: TableDefinition, column: string): void {
  table.defaults = (table.defaults ?? []).filter((d) => d.column !== column);
}

/** トリガーを追加 */
export function addTrigger(
  table: TableDefinition,
  partial?: Partial<TriggerDefinition>,
): TriggerDefinition {
  const t: TriggerDefinition = {
    id: partial?.id ?? `trg_${table.name}_${(table.triggers ?? []).length + 1}`,
    timing: partial?.timing ?? "BEFORE",
    events: partial?.events ?? ["INSERT"],
    whenCondition: partial?.whenCondition,
    body: partial?.body ?? "",
    description: partial?.description,
  };
  table.triggers = [...(table.triggers ?? []), t];
  return t;
}

/** トリガーを削除 */
export function removeTrigger(table: TableDefinition, triggerId: string): void {
  table.triggers = (table.triggers ?? []).filter((t) => t.id !== triggerId);
}

/** テーブル一覧の並び順を変更する (project.tables の物理順) */
export async function reorderTables(fromIndex: number, toIndex: number): Promise<void> {
  const project = await loadProject();
  if (!project.tables) return;
  if (fromIndex < 0 || toIndex < 0) return;
  if (fromIndex >= project.tables.length || toIndex >= project.tables.length) return;
  if (fromIndex === toIndex) return;
  const [moved] = project.tables.splice(fromIndex, 1);
  project.tables.splice(toIndex, 0, moved);
  project.tables = renumber(project.tables);
  await saveProject(project);
}

// ─── 内部 ────────────────────────────────────────────────────────────────

/** project.json のテーブルメタを同期 */
async function syncTableMeta(table: TableDefinition): Promise<void> {
  const project = await loadProject();
  if (!project.tables) project.tables = [];

  const idx = project.tables.findIndex((t) => t.id === table.id);
  const meta: FlowProject["tables"] extends (infer T)[] | undefined ? T : never = {
    id: table.id,
    no: idx >= 0 ? project.tables[idx].no : nextNo(project.tables),
    name: table.name,
    logicalName: table.logicalName,
    category: table.category,
    columnCount: table.columns.length,
    updatedAt: table.updatedAt,
  };

  if (idx >= 0) {
    project.tables[idx] = meta;
  } else {
    project.tables.push(meta);
  }
  project.tables = renumber(project.tables);
  await saveProject(project);
}
