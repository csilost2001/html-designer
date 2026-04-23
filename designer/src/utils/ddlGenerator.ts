/**
 * ddlGenerator.ts
 * テーブル定義から DDL (CREATE TABLE) を生成するユーティリティ
 * MySQL / PostgreSQL / Oracle / SQLite / 標準SQL に対応
 */
import type { TableDefinition, SqlDialect, ConstraintDefinition, DefaultDefinition, TriggerDefinition } from "../types/table";

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
    const colList = idx.columns.map((ic) => {
      const ord = ic.order === "desc" ? " DESC" : "";
      return `${ic.name}${ord}`;
    }).join(", ");
    const uniq = idx.unique ? "UNIQUE " : "";
    const method = idx.method && idx.method !== "btree" && dialect === "postgresql"
      ? ` USING ${idx.method.toUpperCase()}`
      : "";
    let stmt = `CREATE ${uniq}INDEX ${idx.id} ON ${table.name}${method} (${colList})`;
    if (idx.where) stmt += `\n  WHERE ${idx.where}`;
    ddl += `\n\n${stmt};`;
  }

  // ALTER TABLE constraints (β-2)
  for (const c of table.constraints ?? []) {
    ddl += `\n\n${constraintToDdl(table.name, c, dialect)}`;
  }

  // DEFAULT 値定義 (β-4) — ALTER TABLE SET DEFAULT
  for (const def of table.defaults ?? []) {
    ddl += `\n\n${defaultToDdl(table.name, def, dialect)}`;
  }

  // トリガー定義 (β-4)
  for (const trg of table.triggers ?? []) {
    ddl += `\n\n${triggerToDdl(table.name, trg, dialect)}`;
  }

  // Comments for PostgreSQL / Oracle
  if (dialect === "postgresql" || dialect === "oracle") {
    const tableComment = table.comment || table.logicalName;
    if (tableComment) {
      ddl += `\n\nCOMMENT ON TABLE ${table.name} IS '${tableComment.replace(/'/g, "''")}';`;
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
      "| インデックス名 | カラム | ユニーク | WHERE |",
      "|-------------|--------|---------|-------|",
    );
    for (const idx of table.indexes) {
      const colList = idx.columns.map((ic) =>
        `${ic.name}${ic.order === "desc" ? " DESC" : ""}`
      ).join(", ");
      lines.push(`| ${idx.id} | ${colList} | ${idx.unique ? "✓" : ""} | ${idx.where ?? ""} |`);
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

function constraintToDdl(tableName: string, c: ConstraintDefinition, _dialect: SqlDialect): string {
  switch (c.kind) {
    case "unique":
      return `ALTER TABLE ${tableName} ADD CONSTRAINT ${c.id} UNIQUE (${c.columns.join(", ")});`;
    case "check":
      return `ALTER TABLE ${tableName} ADD CONSTRAINT ${c.id} CHECK (${c.expression});`;
    case "foreignKey": {
      let s = `ALTER TABLE ${tableName} ADD CONSTRAINT ${c.id}\n  FOREIGN KEY (${c.columns.join(", ")}) REFERENCES ${c.referencedTable}(${c.referencedColumns.join(", ")})`;
      if (c.onDelete) s += `\n  ON DELETE ${c.onDelete}`;
      if (c.onUpdate) s += `\n  ON UPDATE ${c.onUpdate}`;
      return s + ";";
    }
  }
}

function defaultToDdl(tableName: string, def: DefaultDefinition, dialect: SqlDialect): string {
  let expr: string;
  switch (def.kind) {
    case "literal":
    case "function":
      expr = def.value;
      break;
    case "sequence":
      expr = dialect === "postgresql"
        ? `nextval('${def.value}')`
        : def.value;
      break;
    case "conventionRef":
      expr = `NULL /* ${def.value} */`;
      break;
  }
  if (dialect === "oracle") {
    return `ALTER TABLE ${tableName} MODIFY (${def.column} DEFAULT ${expr});`;
  }
  return `ALTER TABLE ${tableName} ALTER COLUMN ${def.column} SET DEFAULT ${expr};`;
}

function triggerToDdl(tableName: string, trg: TriggerDefinition, dialect: SqlDialect): string {
  const events = trg.events.join(" OR ");
  const when = trg.whenCondition ? `\n  WHEN (${trg.whenCondition})` : "";
  if (dialect === "postgresql") {
    const fnName = `${trg.id}_fn`;
    const returnStmt = trg.events.length === 1 && trg.events[0] === "DELETE"
      ? "RETURN OLD;"
      : "RETURN NEW;";
    return [
      `CREATE OR REPLACE FUNCTION ${fnName}() RETURNS TRIGGER AS $$`,
      `BEGIN`,
      `  ${trg.body.split("\n").join("\n  ")}`,
      `  ${returnStmt}`,
      `END;`,
      `$$ LANGUAGE plpgsql;`,
      ``,
      `CREATE TRIGGER ${trg.id}`,
      `${trg.timing} ${events} ON ${tableName}${when}`,
      `FOR EACH ROW EXECUTE FUNCTION ${fnName}();`,
    ].join("\n");
  }
  return [
    `CREATE TRIGGER ${trg.id}`,
    `${trg.timing} ${events} ON ${tableName}${when}`,
    `FOR EACH ROW`,
    `BEGIN`,
    `  ${trg.body.split("\n").join("\n  ")}`,
    `END;`,
  ].join("\n");
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
