/**
 * DB 制約 × フロー操作順序の交差検査 (#632 MVP: 観点 1+2)。
 *
 * 観点 1 (NULL_NOT_ALLOWED_AT_INSERT):
 *   INSERT 時点で NOT NULL カラムに対応する変数が未バインド
 *   (= outputBinding に記録されていない変数名を VALUES に使っている)
 *
 * 観点 2 (FK_REFERENCE_NOT_INSERTED):
 *   INSERT 時点で FK 参照先テーブルへの先行 INSERT が同 action 内に無い
 *   (= FK 制約の参照整合を保証する先行書き込みが存在しない)
 *
 * 既存 sqlColumnValidator と同じ node-sql-parser v5 AST walker を再利用。
 * 変数バインド時系列追跡 + テーブル schema (notNull / foreignKey) との交差解析
 * で実行時 DB 制約違反を構造的に検出する。
 *
 * 観点 3 (UNIQUE_CHECK_MISSING) → #640
 * 観点 4 (CASCADE_DELETE_OMITTED) → #641
 * 観点 5 (TX_CIRCULAR_DEPENDENCY) → #642
 */

import { Parser } from "node-sql-parser";
import type { ProcessFlow, Step } from "../types/v3";
import { isBuiltinStep } from "./stepGuards";

// ─── 入力型: テーブル定義 (v3 形式) ────────────────────────────────────────

/** カラム 1 件 (validator 内部で必要な最小フィールド)。 */
export interface OrderTableColumn {
  id: string;
  physicalName: string;
  notNull?: boolean;
  primaryKey?: boolean;
  autoIncrement?: boolean;
  defaultValue?: string;
}

/** FK 制約 (validator 内部で必要な最小フィールド)。 */
export interface OrderForeignKeyConstraint {
  kind: "foreignKey";
  columnIds: string[];
  referencedTableId: string;
}

/** テーブル制約 (validator 内部では FK だけ利用)。 */
export type OrderConstraint =
  | { kind: "unique" | "check"; [key: string]: unknown }
  | OrderForeignKeyConstraint;

/** テーブル定義 (v3 table.v3.schema.json の最小シェイプ)。 */
export interface OrderTableDefinition {
  id: string;
  physicalName: string;
  columns: OrderTableColumn[];
  constraints?: OrderConstraint[];
}

// ─── 出力型: 検出 issue ─────────────────────────────────────────────────────

export interface SqlOrderIssue {
  path: string;
  code: "NULL_NOT_ALLOWED_AT_INSERT" | "FK_REFERENCE_NOT_INSERTED" | "SQL_PARSE_ERROR";
  message: string;
}

// ─── パーサー初期化 ─────────────────────────────────────────────────────────

const parser = new Parser();
const DIALECT = "postgresql" as const;

/** @xxx / @x.y.z を $N プレースホルダに置換 (sqlColumnValidator と同じ手法)。 */
function substituteAtVars(sql: string): string {
  let n = 0;
  return sql.replace(/@[a-zA-Z_][\w.?]*/g, () => `$${++n}`);
}

// ─── AST ヘルパー ───────────────────────────────────────────────────────────

/** INSERT AST から対象テーブル名を取得 (lowercase)。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractInsertTableName(ast: any): string | null {
  if (!ast || typeof ast !== "object") return null;
  if (ast.type === "insert" && Array.isArray(ast.table)) {
    for (const t of ast.table) {
      if (t.table && typeof t.table === "string") return t.table.toLowerCase();
    }
  }
  return null;
}

/**
 * INSERT AST から (columnPhysicalName → varName | null) マップを抽出。
 *
 * node-sql-parser v5 PostgreSQL dialect での INSERT AST 構造:
 *   - ast.columns: Array<{ type: "default", value: string }> (列名リスト)
 *   - ast.values: { type: "values", values: Array<{ type: "expr_list", value: any[] }> }
 *   - 各 value 要素: { type: "var", name: number, prefix: "$", members: [] }  ← プレースホルダ
 *                 または { type: "null", value: null }  ← NULL リテラル
 *                 または { type: "number" | "string" | ... }  ← リテラル
 *
 * @atVarMap: プレースホルダ番号 (1, 2, ...) → 元の @varName のルート名のマップ
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractInsertColumnVarMap(ast: any, atVarMap: Map<number, string>): Map<string, string | null> {
  const result = new Map<string, string | null>();
  if (!ast || ast.type !== "insert") return result;

  // columns: Array<{ type: "default", value: string }> または string[] のどちらもサポート
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: string[] = Array.isArray(ast.columns) ? ast.columns.map((c: any) => {
    if (typeof c === "string") return c;
    if (c && typeof c.value === "string") return c.value;
    return String(c);
  }) : [];

  // values: { type: "values", values: Array<{ type: "expr_list", value: any[] }> }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const valuesContainer: any = ast.values;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let valueRows: any[][] = [];
  if (valuesContainer && Array.isArray(valuesContainer.values)) {
    // v5 形式: { type: "values", values: [...] }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    valueRows = valuesContainer.values.map((row: any) => Array.isArray(row?.value) ? row.value : []);
  } else if (Array.isArray(valuesContainer)) {
    // フォールバック: 旧来の配列形式
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    valueRows = valuesContainer.map((row: any) => Array.isArray(row?.value) ? row.value : []);
  }

  if (columns.length === 0 || valueRows.length === 0) return result;

  // 最初の VALUES 行のみ検査 (バルク INSERT の 2 行目以降は同形とみなす)
  const firstRow = valueRows[0];
  for (let i = 0; i < columns.length; i++) {
    const colName = columns[i].toLowerCase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const valNode: any = firstRow[i];
    if (!valNode) {
      result.set(colName, null);
      continue;
    }
    // プレースホルダ: { type: "var", name: number, prefix: "$" }
    if (valNode.type === "var" && valNode.prefix === "$" && typeof valNode.name === "number") {
      const paramNum = valNode.name; // 1, 2, 3, ...
      const originalVar = atVarMap.get(paramNum) ?? null;
      result.set(colName, originalVar);
    } else if (valNode.type === "null" || valNode.value === null) {
      // NULL リテラル
      result.set(colName, null);
    } else {
      // リテラル値 (string / number / boolean) → 変数参照ではないため non-null とみなす
      result.set(colName, `__literal__`);
    }
  }
  return result;
}

/**
 * @xxx / @x.y.z → プレースホルダ番号 → 元変数名 の逆引きマップを構築。
 * substituteAtVars と同じ順序で置換するため、同じ regex を使用。
 */
function buildAtVarMap(sql: string): Map<number, string> {
  const map = new Map<number, string>();
  let n = 0;
  const re = /@[a-zA-Z_][\w.?]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    n++;
    // @varName.field の場合はルート変数名部分を抽出 (例: @beneficiary.id → beneficiary)
    const fullRef = m[0].slice(1); // "varName.field"
    const rootName = fullRef.split(".")[0]; // "varName"
    map.set(n, rootName);
  }
  return map;
}

// ─── 変数バインド時系列追跡 ─────────────────────────────────────────────────

/**
 * step 列を順走査して、各 step が outputBinding で宣言する変数名を収集。
 * action.inputs[] はこの関数の外で先に追加しておく。
 *
 * @param steps   走査対象 step 列
 * @param visitor (step, path) → void コールバック (副作用あり)
 */
function walkStepsInOrder(
  steps: Step[],
  basePath: string,
  visitor: (step: Step, path: string) => void,
): void {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const path = `${basePath}[${i}]`;
    visitor(step, path);
    if (!isBuiltinStep(step)) continue;
    if (step.kind === "branch") {
      step.branches.forEach((b, bi) =>
        walkStepsInOrder(b.steps, `${path}.branches[${bi}].steps`, visitor),
      );
      if (step.elseBranch) walkStepsInOrder(step.elseBranch.steps, `${path}.elseBranch.steps`, visitor);
    }
    if (step.kind === "loop") walkStepsInOrder(step.steps, `${path}.steps`, visitor);
    if (step.kind === "transactionScope") {
      walkStepsInOrder(step.steps, `${path}.steps`, visitor);
      if (step.onCommit) walkStepsInOrder(step.onCommit, `${path}.onCommit`, visitor);
      if (step.onRollback) walkStepsInOrder(step.onRollback, `${path}.onRollback`, visitor);
    }
    if (step.kind === "externalSystem") {
      Object.entries(step.outcomes ?? {}).forEach(([k, spec]) => {
        if (spec?.sideEffects) walkStepsInOrder(spec.sideEffects, `${path}.outcomes.${k}.sideEffects`, visitor);
      });
    }
  }
}

// ─── テーブルメタデータ ─────────────────────────────────────────────────────

interface TableMeta {
  id: string;
  physicalName: string;
  notNullColumns: Set<string>;     // physicalName (lowercase) で保持
  autoColumns: Set<string>;        // autoIncrement || defaultValue 付き → NOT NULL でもバインド不要
  fkConstraints: Array<{
    columnPhysicalNames: string[]; // FK 本テーブル側カラム物理名 (lowercase)
    referencedTableId: string;
  }>;
}

/**
 * テーブルまたはカラムの物理名を取得。
 * v3 では physicalName、v1 フォールバックでは name を使用。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPhysicalName(obj: any): string | undefined {
  return (typeof obj?.physicalName === "string" && obj.physicalName)
    ? obj.physicalName
    : (typeof obj?.name === "string" ? obj.name : undefined);
}

function buildTableMeta(tables: OrderTableDefinition[]): Map<string, TableMeta> {
  const map = new Map<string, TableMeta>();
  for (const t of tables) {
    const tablePhysicalName = getPhysicalName(t);
    if (!tablePhysicalName) continue; // 物理名が取れないテーブルはスキップ

    const notNullColumns = new Set<string>();
    const autoColumns = new Set<string>();
    for (const col of t.columns) {
      const pName = getPhysicalName(col);
      if (!pName) continue;
      const pNameLower = pName.toLowerCase();
      if (col.notNull) notNullColumns.add(pNameLower);
      // autoIncrement または DB 側 DEFAULT がある列はバインド不要 (DB が値を埋める)
      if (col.autoIncrement || col.defaultValue !== undefined) autoColumns.add(pNameLower);
      // primaryKey は通常 autoIncrement と同義だが念のため除外
      if (col.primaryKey) autoColumns.add(pNameLower);
    }

    // FK 制約: Column.id → physicalName 逆引きマップ
    const colIdToPhysical = new Map<string, string>();
    for (const col of t.columns) {
      const pName = getPhysicalName(col);
      if (pName) colIdToPhysical.set(col.id, pName.toLowerCase());
    }

    const fkConstraints: TableMeta["fkConstraints"] = [];
    for (const con of t.constraints ?? []) {
      if (con.kind === "foreignKey") {
        const fkCon = con as OrderForeignKeyConstraint;
        const columnPhysicalNames = fkCon.columnIds
          .map((id) => colIdToPhysical.get(id) ?? "")
          .filter(Boolean);
        if (columnPhysicalNames.length > 0) {
          fkConstraints.push({
            columnPhysicalNames,
            referencedTableId: fkCon.referencedTableId,
          });
        }
      }
    }

    map.set(tablePhysicalName.toLowerCase(), {
      id: t.id,
      physicalName: tablePhysicalName.toLowerCase(),
      notNullColumns,
      autoColumns,
      fkConstraints,
    });
  }
  return map;
}

// ─── メイン検査ロジック ─────────────────────────────────────────────────────

/**
 * action 内 INSERT step を順番に検査。
 *
 * - boundVars: action.inputs の name + 各 step を順に実行した際に蓄積される outputBinding.name
 * - insertedTableIds: 先行 INSERT で書き込んだテーブルの id (FK 参照先確認用)
 */
function checkAction(
  actionIndex: number,
  steps: Step[],
  tableMeta: Map<string, TableMeta>,
  tableIdIndex: Map<string, TableMeta>, // id → TableMeta
  initialBound: Set<string>,
  issues: SqlOrderIssue[],
): void {
  const boundVars = new Set<string>(initialBound);
  const insertedTableIds = new Set<string>();

  // 平坦化した step のシーケンスを順走査
  // (branch 内部は楽観的に両パスを走査してバインドを union する — 保守的な偽陽性抑止)
  walkStepsInOrder(steps, `actions[${actionIndex}].steps`, (step, path) => {
    if (!isBuiltinStep(step)) return;

    // outputBinding を先に boundVars に追加 (同 step の sql でも使えるよう before/after は問わない)
    // 厳密には sql 評価後に bind されるが、偽陽性抑止のため同 step の binding も有効とする。
    if (step.outputBinding?.name) {
      boundVars.add(step.outputBinding.name);
    }
    if (step.kind === "compute" && step.outputBinding?.name) {
      boundVars.add(step.outputBinding.name);
    }

    // dbAccess INSERT のみ検査
    if (step.kind !== "dbAccess") return;
    if (step.operation !== "INSERT") return;
    const sql = step.sql;
    if (!sql) return;

    // INSERT 先テーブルを記録
    const tableIdRef = step.tableId ?? "";

    // SQL パース
    const atVarMap = buildAtVarMap(sql);
    const substituted = substituteAtVars(sql);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ast: any;
    try {
      ast = parser.astify(substituted, { database: DIALECT });
    } catch {
      issues.push({
        path: `${path}.sql`,
        code: "SQL_PARSE_ERROR",
        message: "INSERT SQL のパースに失敗しました (sqlOrderValidator)",
      });
      return;
    }

    // AST が配列の場合は先頭のみ使用
    const rootNode = Array.isArray(ast) ? ast[0] : ast;
    if (!rootNode || rootNode.type !== "insert") return;

    const insertTableName = extractInsertTableName(rootNode);
    if (!insertTableName) return;
    const meta = tableMeta.get(insertTableName);

    // テーブルがカタログに無い場合は検査しない (外部テーブルは対象外)
    if (meta) {
      const colVarMap = extractInsertColumnVarMap(rootNode, atVarMap);

      // ── 観点 1: NOT NULL × 変数バインド ─────────────────────────────────
      for (const [colPhysical, varName] of colVarMap.entries()) {
        if (!meta.notNullColumns.has(colPhysical)) continue;   // nullable は無視
        if (meta.autoColumns.has(colPhysical)) continue;        // autoIncrement / DEFAULT は無視

        if (varName === null) {
          // NULL リテラルまたはプレースホルダ番号に対応する @var が無い (プレースホルダ外の NULL)
          issues.push({
            path: `${path}.sql`,
            code: "NULL_NOT_ALLOWED_AT_INSERT",
            message: `テーブル "${insertTableName}" の NOT NULL カラム "${colPhysical}" に NULL が挿入されます。INSERT 時点で非 NULL 値が必要です。`,
          });
        } else if (varName !== "__literal__" && !boundVars.has(varName)) {
          // 変数参照だが、この時点でまだバインドされていない
          issues.push({
            path: `${path}.sql`,
            code: "NULL_NOT_ALLOWED_AT_INSERT",
            message: `テーブル "${insertTableName}" の NOT NULL カラム "${colPhysical}" が参照する変数 @${varName} は INSERT 時点で未バインドです。`,
          });
        }
      }

      // ── 観点 2: FK 参照先テーブルへの先行 INSERT ─────────────────────────
      // 検査対象: FK カラムの値が変数参照 (= 実行時 binding) であり、
      //           かつその変数が boundVars にも存在しない (= SELECT 未済) で、
      //           かつ FK 参照先テーブルへの先行 INSERT も存在しない場合
      //
      // False positive 抑止の設計判断:
      //   FK カラムが @existingRow.id のような変数参照をしており、その変数が
      //   boundVars に存在する場合は「先行 SELECT で取得済みの既存行を参照している」
      //   とみなして issue にしない (よくあるパターン: SELECT → INSERT の正常フロー)。
      //   問題になるのは FK カラムが「まだバインドされていない変数」を参照している場合のみ。
      for (const fk of meta.fkConstraints) {
        // FK カラムが今回の INSERT 対象に含まれているか
        const fkColsInInsert = fk.columnPhysicalNames.filter((c) => colVarMap.has(c));
        if (fkColsInInsert.length === 0) continue;

        const refTableId = fk.referencedTableId;
        const refMeta = tableIdIndex.get(refTableId);
        if (!refMeta) continue; // 参照先テーブルがカタログ外 → skip

        // FK 参照先テーブルへの先行 INSERT が存在する場合は OK (通常の親→子 INSERT 順序)
        if (insertedTableIds.has(refTableId)) continue;

        // FK 列の値変数が全て boundVars に存在する場合は OK
        // (SELECT で取得済みの既存行 ID を参照しているとみなす)
        const allVarsBound = fkColsInInsert.every((c) => {
          const v = colVarMap.get(c);
          // null (NULL リテラル) または未バインド変数 → NG
          if (v === null) return false;
          if (v === "__literal__") return true; // リテラル値は OK
          return boundVars.has(v); // 変数がバインド済みなら OK
        });
        if (allVarsBound) continue;

        // FK 列の値が変数参照かつ未バインド → 潜在的問題
        const unboundFkCols = fkColsInInsert.filter((c) => {
          const v = colVarMap.get(c);
          if (v === null || v === "__literal__") return false;
          return !boundVars.has(v);
        });
        if (unboundFkCols.length === 0) continue;

        issues.push({
          path: `${path}.sql`,
          code: "FK_REFERENCE_NOT_INSERTED",
          message: `テーブル "${insertTableName}" の FK カラム [${unboundFkCols.join(", ")}] が参照する "${refMeta.physicalName}" の行が INSERT 時点で未確保です (先行 INSERT なし、かつ FK 列の変数が未バインド)。`,
        });
      }

      // INSERT 完了後: このテーブル id を insertedTableIds に追加
      insertedTableIds.add(meta.id);
    }

    // tableId 参照 (SQL ではなく step.tableId から) でも追加
    if (tableIdRef) {
      const metaById = tableIdIndex.get(tableIdRef);
      if (metaById) insertedTableIds.add(metaById.id);
    }
  });
}

// ─── エクスポート関数 ───────────────────────────────────────────────────────

/**
 * ProcessFlow 内の全 action を検査し、DB 制約 × 操作順序の問題を返す。
 *
 * @param flow   検査対象の ProcessFlow
 * @param tables テーブル定義一覧 (v3 形式、physicalName + columns[].notNull + constraints[])
 */
export function checkSqlOrder(
  flow: ProcessFlow,
  tables: OrderTableDefinition[],
): SqlOrderIssue[] {
  const issues: SqlOrderIssue[] = [];
  const tableMeta = buildTableMeta(tables);

  // id → TableMeta の逆引きインデックス
  const tableIdIndex = new Map<string, TableMeta>();
  for (const meta of tableMeta.values()) {
    tableIdIndex.set(meta.id, meta);
  }

  // ProcessFlow は context.ambientVariables が暗黙バインド
  const ambientVars = new Set<string>(
    (flow.context?.ambientVariables ?? []).map((v) => v.name),
  );
  // 暗黙的にどこでも参照可能な特殊ルート変数名
  // (@inputs.xxx / @conv.xxx / @env.xxx / @secret.xxx / @now 等は常にバインド済みとみなす)
  const ALWAYS_BOUND = new Set(["inputs", "outputs", "conv", "env", "secret", "now", "requestId", "fn"]);

  flow.actions.forEach((action, ai) => {
    // inputs は action 開始時点で全てバインド済み
    const initialBound = new Set<string>(ambientVars);
    // 特殊ルート変数は常にバインド済み
    for (const name of ALWAYS_BOUND) initialBound.add(name);
    for (const inp of action.inputs ?? []) {
      initialBound.add(inp.name);
    }
    checkAction(ai, action.steps ?? [], tableMeta, tableIdIndex, initialBound, issues);
  });

  return issues;
}
