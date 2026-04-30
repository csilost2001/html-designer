/**
 * v3 ViewDefinition 型定義 (`schemas/v3/view-definition.v3.schema.json` と 1:1 対応)
 *
 * - 画面側の一覧 UI viewer 設定 (list / detail / kanban / calendar 等)
 * - DB View (view.ts) とは axis が異なる: viewer は画面コンポーネント内 render
 * - Screen は viewDefinitionRefs[] で 1:N 参照する
 *
 * 参考: schemas/v3/view-definition.v3.schema.json
 */

import type {
  Authoring,
  Brand,
  DisplayName,
  EntityMeta,
  ExpressionString,
  FieldType,
  Identifier,
  TableColumnRef,
  TableId,
  Uuid,
} from "./common";

/** ViewDefinition の永続識別子 (branded UUID)。 */
export type ViewDefinitionId = Brand<Uuid, "ViewDefinitionId">;

/** 組み込み viewer 種別 (4 種)。 */
export type BuiltinViewDefinitionKind = "list" | "detail" | "kanban" | "calendar";

/**
 * viewer 種別。組み込み + 拡張参照 (`namespace:kindName`)。
 * 例: `retail:storefront`
 */
export type ViewDefinitionKind = BuiltinViewDefinitionKind | string;

/** ソート 1 列。columnName は ViewColumn.name を参照。 */
export interface SortSpec {
  columnName: Identifier;
  order: "asc" | "desc";
}

/** フィルタの比較演算子。 */
export type FilterOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "startsWith"
  | "in"
  | "between";

/** フィルタ 1 件。columnName は ViewColumn.name を参照。 */
export interface FilterSpec {
  columnName: Identifier;
  operator: FilterOperator;
  /** 比較リテラル (operator に応じて型が変わる)。 */
  value?: unknown;
  /** 比較値を式で渡す場合 (例: `@conv.numbering.lowStockThreshold`)。 */
  valueExpression?: ExpressionString;
}

/** viewer 1 列。table カラムへの複合参照 + 画面表示型 (FieldType)。 */
export interface ViewColumn {
  /** 列識別子 (camelCase)。同 ViewDefinition 内で一意。 */
  name: Identifier;
  /** 参照する table カラム (Pattern B)。 */
  tableColumnRef: TableColumnRef;
  displayName?: DisplayName;
  /** 画面表示型 (FieldType)。Column.dataType (DB 型) と互換であること (validator が検査)。 */
  type: FieldType;
  /** 表示書式。例: `'#,##0'`, `'YYYY-MM-DD'`。 */
  displayFormat?: string;
  /** 列幅 (CSS 表記、例: `'120px'`, `'1fr'`)。 */
  width?: string;
  align?: "left" | "center" | "right";
  sortable?: boolean;
  filterable?: boolean;
  /** 列表示条件式。 */
  visibleWhen?: ExpressionString;
  /** セル click で navigate する path (例: `'/orders/:id'`)。 */
  linkTo?: string;
}

/** ViewDefinition entity 本体。 */
export interface ViewDefinition extends EntityMeta {
  $schema?: string;
  kind: ViewDefinitionKind;
  /** viewer の主要ソーステーブル。1 ViewDefinition = 1 ベース table。 */
  sourceTableId: TableId;
  columns: ViewColumn[];
  /** 既定ソート順 (複数列対応)。 */
  sortDefaults?: SortSpec[];
  /** 初期フィルタ条件。 */
  filterDefaults?: FilterSpec[];
  /** ページング初期件数 (1..1000)。 */
  pageSize?: number;
  /** kanban / グルーピング表示時の集約キー。columns[].name を参照。 */
  groupBy?: Identifier;
  authoring?: Authoring;
}
