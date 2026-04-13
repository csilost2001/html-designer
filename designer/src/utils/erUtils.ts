/**
 * erUtils.ts
 * ER図のリレーション導出・Mermaid生成・自動配置ユーティリティ
 */
import type { TableDefinition, ErRelation, ErLayout, ErLogicalRelation } from "../types/table";

/**
 * テーブル定義群から物理FK リレーションを導出する
 */
export function derivePhysicalRelations(tables: TableDefinition[]): ErRelation[] {
  const relations: ErRelation[] = [];
  const tableMap = new Map(tables.map((t) => [t.name, t]));
  const tableIdMap = new Map(tables.map((t) => [t.id, t]));

  for (const table of tables) {
    for (const col of table.columns) {
      if (!col.foreignKey) continue;
      // foreignKey.tableId は実際にはテーブル名が入っている（UIの仕様）
      const targetTable = tableMap.get(col.foreignKey.tableId) ?? tableIdMap.get(col.foreignKey.tableId);
      if (!targetTable) continue;

      relations.push({
        id: `fk-${table.id}-${col.id}`,
        sourceTableId: table.id,
        sourceTableName: table.name,
        sourceColumnName: col.name,
        targetTableId: targetTable.id,
        targetTableName: targetTable.name,
        targetColumnName: col.foreignKey.columnName,
        cardinality: "one-to-many",
        physical: true,
      });
    }
  }

  return relations;
}

/**
 * 論理リレーションを ErRelation 形式に変換
 */
export function convertLogicalRelations(
  logicals: ErLogicalRelation[],
  tables: TableDefinition[],
): ErRelation[] {
  const tableIdMap = new Map(tables.map((t) => [t.id, t]));

  return logicals
    .map((lr) => {
      const src = tableIdMap.get(lr.sourceTableId);
      const tgt = tableIdMap.get(lr.targetTableId);
      if (!src || !tgt) return null;
      return {
        id: lr.id,
        sourceTableId: lr.sourceTableId,
        sourceTableName: src.name,
        sourceColumnName: lr.sourceColumnName,
        targetTableId: lr.targetTableId,
        targetTableName: tgt.name,
        targetColumnName: lr.targetColumnName,
        cardinality: lr.cardinality,
        physical: false,
        label: lr.label,
      } satisfies ErRelation;
    })
    .filter((r): r is ErRelation => r !== null);
}

/**
 * 全リレーション（物理 + 論理）を統合
 */
export function getAllRelations(
  tables: TableDefinition[],
  layout: ErLayout | null,
): ErRelation[] {
  const physical = derivePhysicalRelations(tables);
  const logical = layout?.logicalRelations
    ? convertLogicalRelations(layout.logicalRelations, tables)
    : [];
  return [...physical, ...logical];
}

/**
 * Mermaid ER図を生成
 */
export function generateErMermaid(
  tables: TableDefinition[],
  relations: ErRelation[],
): string {
  if (tables.length === 0) return "erDiagram\n    %% テーブルなし";

  const lines: string[] = ["erDiagram"];

  // テーブル定義
  for (const table of tables) {
    lines.push(`    ${table.name} {`);
    for (const col of table.columns) {
      const markers: string[] = [];
      if (col.primaryKey) markers.push("PK");
      if (col.foreignKey) markers.push("FK");
      if (col.unique && !col.primaryKey) markers.push("UK");
      const marker = markers.length > 0 ? ` ${markers.join(",")}` : "";
      const comment = col.logicalName ? ` "${col.logicalName}"` : "";
      lines.push(`        ${col.dataType} ${col.name}${marker}${comment}`);
    }
    lines.push("    }");
  }

  // リレーション
  for (const rel of relations) {
    const cardStr = rel.cardinality === "one-to-one"
      ? "||--||"
      : rel.cardinality === "many-to-many"
        ? "}|--|{"
        : "||--o{";
    const label = rel.sourceColumnName;
    const lineStyle = rel.physical ? cardStr : "..";
    if (rel.physical) {
      lines.push(`    ${rel.targetTableName} ${cardStr} ${rel.sourceTableName} : "${label}"`);
    } else {
      lines.push(`    ${rel.targetTableName} ${lineStyle} ${rel.sourceTableName} : "${label} (論理)"`);
    }
  }

  return lines.join("\n");
}

/**
 * FK依存関係に基づく自動配置
 * 被参照テーブル（親）を上・左に、参照元（子）を下・右に配置
 */
export function autoLayout(
  tables: TableDefinition[],
  relations: ErRelation[],
): Record<string, { x: number; y: number }> {
  if (tables.length === 0) return {};

  // 被参照回数（入次数）を計算
  const inDegree = new Map<string, number>();
  const outEdges = new Map<string, string[]>();
  for (const t of tables) {
    inDegree.set(t.id, 0);
    outEdges.set(t.id, []);
  }
  for (const rel of relations) {
    // source(FK側) → target(参照先) : target は親
    inDegree.set(rel.sourceTableId, (inDegree.get(rel.sourceTableId) ?? 0) + 1);
    outEdges.get(rel.targetTableId)?.push(rel.sourceTableId);
  }

  // トポロジカルソート（BFS）でレイヤー割り当て
  const layers: string[][] = [];
  const assigned = new Set<string>();

  // ルートノード（被参照されない＝入次数0のテーブル or FK なしのテーブル）
  // ここでは「他テーブルからFKで参照されている数」ではなく「自身がFKを持つ数」で判断
  const fkCount = new Map<string, number>();
  for (const t of tables) {
    const count = t.columns.filter((c) => c.foreignKey).length;
    fkCount.set(t.id, count);
  }

  // FK を持たないテーブル（マスタ系）をルートに
  let roots = tables.filter((t) => (fkCount.get(t.id) ?? 0) === 0).map((t) => t.id);
  if (roots.length === 0) roots = [tables[0].id]; // 循環の場合は最初のテーブル

  let current = roots;
  while (current.length > 0) {
    layers.push(current);
    current.forEach((id) => assigned.add(id));
    const next: string[] = [];
    for (const id of current) {
      for (const childId of outEdges.get(id) ?? []) {
        if (!assigned.has(childId)) {
          next.push(childId);
          assigned.add(childId);
        }
      }
    }
    current = [...new Set(next)];
  }

  // 未割り当てのテーブル（孤立テーブル）を最後のレイヤーに追加
  for (const t of tables) {
    if (!assigned.has(t.id)) {
      if (layers.length === 0) layers.push([]);
      layers[layers.length - 1].push(t.id);
    }
  }

  // 位置を計算
  const NODE_WIDTH = 240;
  const NODE_GAP_X = 80;
  const NODE_GAP_Y = 120;
  const positions: Record<string, { x: number; y: number }> = {};

  for (let row = 0; row < layers.length; row++) {
    const layer = layers[row];
    const totalWidth = layer.length * NODE_WIDTH + (layer.length - 1) * NODE_GAP_X;
    const startX = -totalWidth / 2;
    for (let col = 0; col < layer.length; col++) {
      positions[layer[col]] = {
        x: startX + col * (NODE_WIDTH + NODE_GAP_X),
        y: row * (200 + NODE_GAP_Y),
      };
    }
  }

  return positions;
}
