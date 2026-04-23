/** ビュー出力列 */
export interface ViewOutputColumn {
  name: string;
  type: string;
  description?: string;
}

/** ビュー定義（完全データ） */
export interface ViewDefinition {
  id: string;
  selectStatement: string;
  outputColumns: ViewOutputColumn[];
  dependencies?: string[];
  description?: string;
  createdAt: string;
  updatedAt: string;
}

/** ビューメタ情報（一覧用） */
export interface ViewMeta {
  id: string;
  /** 物理順 (1..N 連番) */
  no: number;
  description?: string;
  updatedAt: string;
}

/** views.json ファイル構造 */
export interface ViewsFile {
  $schema?: string;
  version: string;
  updatedAt: string;
  views: ViewDefinition[];
}
