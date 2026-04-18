/**
 * ddlGenerator.ts
 * テーブル定義から DDL (CREATE TABLE) を生成するユーティリティ
 * MySQL / PostgreSQL / Oracle / SQLite / 標準SQL に対応
 */
import type { TableDefinition, SqlDialect } from "../types/table";

export function generateDdl(table: TableDefinition, dialect: SqlDialect): string {
  const colDefs: string[] = [];
  const pks: string[] = [];

  for (const col of table.columns) {
    const typeStr = col.autoIncrement
      ? autoIncrementType(col.dataType, dialect)
      : mapDataType(col.dataType, col.length, col.scale, dialect);

    let line = `  ${col.name} ${typeStr}`;
    if (col.notNull) line += " NOT NULL";
    if (col.unique && !col.primaryKey) line += " UNIQUE";
    if (col.defaultValue && !col.autoIncrement) {
      line += ` DEFAULT ${col.defaultValue}`;
    }
    if (col.comment && dialect === "mysql") {
      line += ` COMMENT '${col.comment.replace(/'/g, "''")}'`;
    }
    colDefs.push(line);
    if (col.primaryKey) pks.push(col.name);
  }

  if (pks.length > 0) {
    colDefs.push(`  PRIMARY KEY (${pks.join(", ")})`);
  }

  // Foreign keys (物理FK制約のみ出力、noConstraint=true は除外)
  for (const col of table.columns) {
    if (col.foreignKey && !col.foreignKey.noConstraint) {
      const ref = col.foreignKey;
      colDefs.push(
        `  FOREIGN KEY (${col.name}) REFERENCES ${ref.tableId}(${ref.columnName})`,
      );
    }
  }

  let ddl = `CREATE TABLE ${table.name} (\n${colDefs.join(",\n")}\n)`;
  if (dialect === "mysql") ddl += " ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";
  ddl += ";";

  // Indexes
  for (const idx of table.indexes) {
    const colNames = idx.columns.map((cid) => {
      const c = table.columns.find((cc) => cc.id === cid);
      return c ? c.name : cid;
    });
    const uniq = idx.unique ? "UNIQUE " : "";
    ddl += `\n\nCREATE ${uniq}INDEX ${idx.name} ON ${table.name} (${colNames.join(", ")});`;
  }

  // Comments for PostgreSQL / Oracle
  if (dialect === "postgresql" || dialect === "oracle") {
    if (table.logicalName) {
      ddl += `\n\nCOMMENT ON TABLE ${table.name} IS '${table.logicalName.replace(/'/g, "''")}';`;
    }
    for (const col of table.columns) {
      const cmt = col.comment || col.logicalName;
      if (cmt) {
        ddl += `\nCOMMENT ON COLUMN ${table.name}.${col.name} IS '${cmt.replace(/'/g, "''")}';`;
      }
    }
  }

  return ddl;
}

/** 全テーブルの DDL を生成 */
export function generateAllDdl(tables: TableDefinition[], dialect: SqlDialect): string {
  return tables.map((t) => generateDdl(t, dialect)).join("\n\n");
}

/** Markdown 形式のテーブル定義書 */
export function generateTableMarkdown(table: TableDefinition): string {
  const lines: string[] = [
    `### ${table.name}（${table.logicalName}）`,
    "",
  ];

  if (table.description) {
    lines.push(table.description, "");
  }

  // カラム定義
  lines.push(
    "| # | カラム名 | 論理名 | データ型 | 長さ | NN | PK | UK | AI | デフォルト | 備考 |",
    "|---|---------|--------|---------|------|----|----|----|----|----------|------|",
  );
  table.columns.forEach((col, i) => {
    const len = col.length != null ? String(col.length) + (col.scale != null ? `,${col.scale}` : "") : "";
    lines.push(
      `| ${i + 1} | ${col.name} | ${col.logicalName} | ${col.dataType} | ${len} | ${col.notNull ? "✓" : ""} | ${col.primaryKey ? "✓" : ""} | ${col.unique ? "✓" : ""} | ${col.autoIncrement ? "✓" : ""} | ${col.defaultValue ?? ""} | ${col.comment ?? ""} |`,
    );
  });

  // インデックス
  if (table.indexes.length > 0) {
    lines.push("", "**インデックス**", "");
    lines.push(
      "| インデックス名 | カラム | ユニーク |",
      "|-------------|--------|---------|",
    );
    for (const idx of table.indexes) {
      const colNames = idx.columns.map((cid) => {
        const c = table.columns.find((cc) => cc.id === cid);
        return c ? c.name : cid;
      });
      lines.push(`| ${idx.name} | ${colNames.join(", ")} | ${idx.unique ? "✓" : ""} |`);
    }
  }

  return lines.join("\n");
}

/** 全テーブルの Markdown を生成 */
export function generateAllTableMarkdown(tables: TableDefinition[], projectName: string): string {
  const lines: string[] = [
    `# ${projectName} — テーブル設計書`,
    "",
    `> テーブル数: ${tables.length}`,
    "",
    "## 目次",
    "",
    ...tables.map((t, i) => `${i + 1}. [${t.name}（${t.logicalName}）](#${t.name})`),
    "",
    "---",
    "",
  ];

  for (const t of tables) {
    lines.push(generateTableMarkdown(t), "", "---", "");
  }

  lines.push(`> 生成日時: ${new Date().toLocaleString("ja-JP")}`);
  return lines.join("\n");
}

// ── 内部ヘルパー ────────────────────────────────────────────────────────────

function mapDataType(dt: string, length?: number, scale?: number, dialect?: SqlDialect): string {
  const d = dialect ?? "standard";
  switch (dt) {
    case "VARCHAR": return `VARCHAR(${length ?? 255})`;
    case "CHAR": return `CHAR(${length ?? 1})`;
    case "TEXT": return d === "oracle" ? "CLOB" : "TEXT";
    case "INTEGER": return d === "oracle" ? "NUMBER(10)" : "INTEGER";
    case "BIGINT": return d === "oracle" ? "NUMBER(19)" : "BIGINT";
    case "SMALLINT": return d === "oracle" ? "NUMBER(5)" : "SMALLINT";
    case "DECIMAL": return `DECIMAL(${length ?? 10}, ${scale ?? 2})`;
    case "FLOAT": return d === "oracle" ? "BINARY_FLOAT" : "FLOAT";
    case "BOOLEAN":
      if (d === "oracle") return "NUMBER(1)";
      if (d === "mysql") return "TINYINT(1)";
      return "BOOLEAN";
    case "DATE": return "DATE";
    case "TIME": return d === "oracle" ? "DATE" : "TIME";
    case "TIMESTAMP":
      if (d === "mysql") return "DATETIME";
      return "TIMESTAMP";
    case "BLOB": return "BLOB";
    case "JSON":
      if (d === "oracle") return "CLOB";
      if (d === "postgresql") return "JSONB";
      if (d === "mysql") return "JSON";
      return "TEXT";
    default: return dt;
  }
}

function autoIncrementType(dt: string, dialect: SqlDialect): string {
  switch (dialect) {
    case "mysql": return `${mapDataType(dt, undefined, undefined, dialect)} AUTO_INCREMENT`;
    case "postgresql": return dt === "BIGINT" ? "BIGSERIAL" : "SERIAL";
    case "oracle": return `${mapDataType(dt, undefined, undefined, dialect)} GENERATED ALWAYS AS IDENTITY`;
    case "sqlite": return "INTEGER";
    default: return mapDataType(dt, undefined, undefined, dialect);
  }
}
