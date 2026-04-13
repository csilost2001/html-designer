/**
 * specExporter.ts
 * AIエージェント向け統合JSON仕様書の生成
 *
 * PG工程のAIが正確に解釈可能な構造化フォーマットで、
 * テーブル定義・リレーション（物理/論理）・画面情報を統合出力する。
 */
import type { TableDefinition } from "../types/table";
import type { ErRelation, ErLayout } from "../types/table";
import type { FlowProject } from "../types/flow";
import { getAllRelations } from "./erUtils";

export interface SpecJson {
  /** プロジェクト名 */
  projectName: string;
  /** 生成日時 */
  generatedAt: string;
  /** テーブル定義 */
  tables: SpecTable[];
  /** リレーション一覧（物理FK + 論理FK） */
  relations: SpecRelation[];
  /** 画面一覧（フロー図の情報） */
  screens: SpecScreen[];
  /** 画面遷移 */
  transitions: SpecTransition[];
}

export interface SpecTable {
  name: string;
  logicalName: string;
  description: string;
  category?: string;
  columns: SpecColumn[];
  indexes: SpecIndex[];
}

export interface SpecColumn {
  name: string;
  logicalName: string;
  dataType: string;
  length?: number;
  scale?: number;
  notNull: boolean;
  primaryKey: boolean;
  unique: boolean;
  autoIncrement?: boolean;
  defaultValue?: string;
  comment?: string;
  /** FK参照情報（物理/論理どちらも含む） */
  reference?: {
    table: string;
    column: string;
    /** "physical" = DDLにFOREIGN KEY出力, "logical" = アプリ層で制御 */
    type: "physical" | "logical";
    memo?: string;
  };
}

export interface SpecIndex {
  name: string;
  columns: string[];
  unique: boolean;
}

export interface SpecRelation {
  /** "orders.customer_id → customers.id" 形式 */
  from: string;
  to: string;
  cardinality: string;
  /** "physical" = DB制約あり, "logical" = アプリ層で制御, "conceptual" = カラム未定 */
  constraintType: "physical" | "logical" | "conceptual";
  memo?: string;
}

export interface SpecScreen {
  name: string;
  type: string;
  path: string;
  description: string;
  hasDesign: boolean;
}

export interface SpecTransition {
  from: string;
  to: string;
  label: string;
  trigger: string;
}

/**
 * 統合JSON仕様書を生成
 */
export function generateSpecJson(
  project: FlowProject,
  tables: TableDefinition[],
  erLayout: ErLayout | null,
): SpecJson {
  const relations = getAllRelations(tables, erLayout);

  return {
    projectName: project.name,
    generatedAt: new Date().toISOString(),
    tables: tables.map((t) => toSpecTable(t)),
    relations: relations.map((r) => toSpecRelation(r)),
    screens: project.screens.map((s) => ({
      name: s.name,
      type: s.type,
      path: s.path,
      description: s.description,
      hasDesign: s.hasDesign,
    })),
    transitions: project.edges.map((e) => {
      const src = project.screens.find((s) => s.id === e.source);
      const tgt = project.screens.find((s) => s.id === e.target);
      return {
        from: src?.name ?? e.source,
        to: tgt?.name ?? e.target,
        label: e.label,
        trigger: e.trigger,
      };
    }),
  };
}

function toSpecTable(t: TableDefinition): SpecTable {
  return {
    name: t.name,
    logicalName: t.logicalName,
    description: t.description,
    category: t.category,
    columns: t.columns.map((c) => {
      const col: SpecColumn = {
        name: c.name,
        logicalName: c.logicalName,
        dataType: c.dataType,
        length: c.length,
        scale: c.scale,
        notNull: c.notNull,
        primaryKey: c.primaryKey,
        unique: c.unique,
        autoIncrement: c.autoIncrement || undefined,
        defaultValue: c.defaultValue,
        comment: c.comment,
      };
      if (c.foreignKey) {
        col.reference = {
          table: c.foreignKey.tableId,
          column: c.foreignKey.columnName,
          type: c.foreignKey.noConstraint ? "logical" : "physical",
        };
      }
      return col;
    }),
    indexes: t.indexes.map((idx) => ({
      name: idx.name,
      columns: idx.columns.map((cid) => {
        const col = t.columns.find((cc) => cc.id === cid);
        return col ? col.name : cid;
      }),
      unique: idx.unique,
    })),
  };
}

function toSpecRelation(r: ErRelation): SpecRelation {
  const hasColumns = r.sourceColumnName && r.targetColumnName;
  const from = hasColumns
    ? `${r.sourceTableName}.${r.sourceColumnName}`
    : r.sourceTableName;
  const to = hasColumns
    ? `${r.targetTableName}.${r.targetColumnName}`
    : r.targetTableName;

  let constraintType: "physical" | "logical" | "conceptual";
  if (r.physical) {
    constraintType = "physical";
  } else if (hasColumns) {
    constraintType = "logical";
  } else {
    constraintType = "conceptual";
  }

  return {
    from,
    to,
    cardinality: r.cardinality,
    constraintType,
    memo: r.label,
  };
}
