/** 使用先テーブル・カラム */
export interface SequenceUsedBy {
  tableId: string;
  columnName: string;
}

/** シーケンス定義（完全データ） */
export interface SequenceDefinition {
  id: string;
  startValue?: number;
  increment?: number;
  minValue?: number;
  maxValue?: number;
  cycle?: boolean;
  cache?: number;
  usedBy?: SequenceUsedBy[];
  conventionRef?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

/** シーケンスメタ情報（project.json 用） */
export interface SequenceMeta {
  id: string;
  /** 物理順 (1..N 連番)。詳細は docs/spec/list-common.md §3.10 */
  no: number;
  conventionRef?: string;
  description?: string;
  updatedAt: string;
}
