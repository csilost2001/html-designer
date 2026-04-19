/** データ型 */
export type DataType =
  | "VARCHAR"
  | "CHAR"
  | "TEXT"
  | "INTEGER"
  | "BIGINT"
  | "SMALLINT"
  | "DECIMAL"
  | "FLOAT"
  | "BOOLEAN"
  | "DATE"
  | "TIME"
  | "TIMESTAMP"
  | "BLOB"
  | "JSON";

/** データ型ラベル */
export const DATA_TYPE_LABELS: Record<DataType, string> = {
  VARCHAR: "VARCHAR（可変長文字列）",
  CHAR: "CHAR（固定長文字列）",
  TEXT: "TEXT（長文テキスト）",
  INTEGER: "INTEGER（整数）",
  BIGINT: "BIGINT（長整数）",
  SMALLINT: "SMALLINT（短整数）",
  DECIMAL: "DECIMAL（固定小数点）",
  FLOAT: "FLOAT（浮動小数点）",
  BOOLEAN: "BOOLEAN（真偽値）",
  DATE: "DATE（日付）",
  TIME: "TIME（時刻）",
  TIMESTAMP: "TIMESTAMP（日時）",
  BLOB: "BLOB（バイナリ）",
  JSON: "JSON",
};

/** データ型のデフォルト長 */
export const DATA_TYPE_DEFAULT_LENGTH: Partial<Record<DataType, number>> = {
  VARCHAR: 255,
  CHAR: 1,
  DECIMAL: 10,
};

/** データ型のデフォルトスケール */
export const DATA_TYPE_DEFAULT_SCALE: Partial<Record<DataType, number>> = {
  DECIMAL: 2,
};

/** 長さ指定が有効なデータ型 */
export const DATA_TYPES_WITH_LENGTH: DataType[] = [
  "VARCHAR", "CHAR", "DECIMAL", "FLOAT",
];

/** スケール指定が有効なデータ型 */
export const DATA_TYPES_WITH_SCALE: DataType[] = ["DECIMAL"];

/** カラム定義 */
export interface TableColumn {
  id: string;
  /** 物理順 (1..N 連番)。一覧表示の No 列として使用。詳細は docs/spec/list-common.md §3.10 */
  no: number;
  name: string;
  logicalName: string;
  dataType: DataType;
  length?: number;
  scale?: number;
  notNull: boolean;
  primaryKey: boolean;
  unique: boolean;
  defaultValue?: string;
  autoIncrement?: boolean;
  foreignKey?: {
    tableId: string;
    columnName: string;
    /** true = 論理FKのみ（DDLにFOREIGN KEY制約を出力しない） */
    noConstraint?: boolean;
  };
  comment?: string;
}

/** インデックス定義 */
export interface TableIndex {
  id: string;
  name: string;
  columns: string[];
  unique: boolean;
}

/** テーブル定義（完全データ） */
export interface TableDefinition {
  id: string;
  name: string;
  logicalName: string;
  description: string;
  category?: string;
  columns: TableColumn[];
  indexes: TableIndex[];
  createdAt: string;
  updatedAt: string;
}

/** テーブルメタ情報（project.json 用） */
export interface TableMeta {
  id: string;
  /** 物理順 (1..N 連番)。詳細は docs/spec/list-common.md §3.10 */
  no: number;
  name: string;
  logicalName: string;
  category?: string;
  columnCount: number;
  updatedAt: string;
}

// ── ER図関連 ──────────────────────────────────────────────────────────────

/** ER図レイアウト（data/er-layout.json） */
export interface ErLayout {
  positions: Record<string, { x: number; y: number }>;
  /** 論理リレーション（FK定義なしだが事実上のリレーション） */
  logicalRelations?: ErLogicalRelation[];
  updatedAt: string;
}

/** 論理リレーション（ER図上のみ、テーブル定義には反映しない） */
export interface ErLogicalRelation {
  id: string;
  sourceTableId: string;
  sourceColumnName?: string;   // 概念設計段階では未定
  targetTableId: string;
  targetColumnName?: string;   // 概念設計段階では未定
  cardinality: ErCardinality;
  label?: string;              // メモ（例: 「顧客は複数の注文を持つ」）
}

/** ER図リレーション（物理FK + 論理の統合ビュー） */
export interface ErRelation {
  id: string;
  sourceTableId: string;
  sourceTableName: string;
  sourceColumnName?: string;
  targetTableId: string;
  targetTableName: string;
  targetColumnName?: string;
  cardinality: ErCardinality;
  physical: boolean;
  label?: string;
}

export type ErCardinality = "one-to-many" | "one-to-one" | "many-to-many";

export const CARDINALITY_LABELS: Record<ErCardinality, string> = {
  "one-to-many": "1:N",
  "one-to-one": "1:1",
  "many-to-many": "N:N",
};

/** テーブルカテゴリ */
export const TABLE_CATEGORIES = [
  "マスタ",
  "トランザクション",
  "中間テーブル",
  "ログ",
  "設定",
  "その他",
] as const;

/** DDL ダイアレクト */
export type SqlDialect = "mysql" | "postgresql" | "oracle" | "sqlite" | "standard";

export const SQL_DIALECT_LABELS: Record<SqlDialect, string> = {
  mysql: "MySQL",
  postgresql: "PostgreSQL",
  oracle: "Oracle",
  sqlite: "SQLite",
  standard: "標準SQL",
};

// ── カラムテンプレート ─────────────────────────────────────────────────────

export interface ColumnTemplate {
  id: string;
  label: string;
  icon: string;
  category: string;
  /** no / id はテンプレートには含めない (挿入時に採番・生成) */
  column: Omit<TableColumn, "id" | "no">;
}

export const COLUMN_TEMPLATES: ColumnTemplate[] = [
  // ── ID・キー系 ──
  {
    id: "tpl-pk-auto",
    label: "ID（自動採番）",
    icon: "bi-key-fill",
    category: "ID・キー",
    column: {
      name: "id",
      logicalName: "ID",
      dataType: "INTEGER",
      notNull: true,
      primaryKey: true,
      unique: false,
      autoIncrement: true,
    },
  },
  {
    id: "tpl-pk-bigint",
    label: "ID（BIGINT）",
    icon: "bi-key",
    category: "ID・キー",
    column: {
      name: "id",
      logicalName: "ID",
      dataType: "BIGINT",
      notNull: true,
      primaryKey: true,
      unique: false,
      autoIncrement: true,
    },
  },
  {
    id: "tpl-fk",
    label: "外部キー（FK）",
    icon: "bi-link-45deg",
    category: "ID・キー",
    column: {
      name: "_id",
      logicalName: "参照ID",
      dataType: "INTEGER",
      notNull: true,
      primaryKey: false,
      unique: false,
    },
  },
  // ── 文字列系 ──
  {
    id: "tpl-name",
    label: "名前",
    icon: "bi-person",
    category: "文字列",
    column: {
      name: "name",
      logicalName: "名前",
      dataType: "VARCHAR",
      length: 100,
      notNull: true,
      primaryKey: false,
      unique: false,
    },
  },
  {
    id: "tpl-email",
    label: "メールアドレス",
    icon: "bi-envelope",
    category: "文字列",
    column: {
      name: "email",
      logicalName: "メールアドレス",
      dataType: "VARCHAR",
      length: 255,
      notNull: false,
      primaryKey: false,
      unique: true,
    },
  },
  {
    id: "tpl-phone",
    label: "電話番号",
    icon: "bi-telephone",
    category: "文字列",
    column: {
      name: "phone",
      logicalName: "電話番号",
      dataType: "VARCHAR",
      length: 20,
      notNull: false,
      primaryKey: false,
      unique: false,
    },
  },
  {
    id: "tpl-address",
    label: "住所",
    icon: "bi-geo-alt",
    category: "文字列",
    column: {
      name: "address",
      logicalName: "住所",
      dataType: "VARCHAR",
      length: 500,
      notNull: false,
      primaryKey: false,
      unique: false,
    },
  },
  {
    id: "tpl-code",
    label: "コード",
    icon: "bi-upc",
    category: "文字列",
    column: {
      name: "code",
      logicalName: "コード",
      dataType: "VARCHAR",
      length: 50,
      notNull: true,
      primaryKey: false,
      unique: true,
    },
  },
  {
    id: "tpl-description",
    label: "説明・備考",
    icon: "bi-card-text",
    category: "文字列",
    column: {
      name: "description",
      logicalName: "説明",
      dataType: "TEXT",
      notNull: false,
      primaryKey: false,
      unique: false,
    },
  },
  {
    id: "tpl-password",
    label: "パスワードハッシュ",
    icon: "bi-shield-lock",
    category: "文字列",
    column: {
      name: "password_hash",
      logicalName: "パスワードハッシュ",
      dataType: "VARCHAR",
      length: 255,
      notNull: true,
      primaryKey: false,
      unique: false,
    },
  },
  // ── 数値系 ──
  {
    id: "tpl-amount",
    label: "金額",
    icon: "bi-currency-yen",
    category: "数値",
    column: {
      name: "amount",
      logicalName: "金額",
      dataType: "DECIMAL",
      length: 12,
      scale: 2,
      notNull: true,
      primaryKey: false,
      unique: false,
      defaultValue: "0",
    },
  },
  {
    id: "tpl-quantity",
    label: "数量",
    icon: "bi-123",
    category: "数値",
    column: {
      name: "quantity",
      logicalName: "数量",
      dataType: "INTEGER",
      notNull: true,
      primaryKey: false,
      unique: false,
      defaultValue: "0",
    },
  },
  {
    id: "tpl-sort-order",
    label: "表示順",
    icon: "bi-sort-numeric-down",
    category: "数値",
    column: {
      name: "sort_order",
      logicalName: "表示順",
      dataType: "INTEGER",
      notNull: true,
      primaryKey: false,
      unique: false,
      defaultValue: "0",
    },
  },
  // ── 日付・フラグ系 ──
  {
    id: "tpl-flag",
    label: "フラグ（有効/無効）",
    icon: "bi-toggle-on",
    category: "フラグ・日付",
    column: {
      name: "is_active",
      logicalName: "有効フラグ",
      dataType: "BOOLEAN",
      notNull: true,
      primaryKey: false,
      unique: false,
      defaultValue: "true",
    },
  },
  {
    id: "tpl-delete-flag",
    label: "削除フラグ",
    icon: "bi-trash",
    category: "フラグ・日付",
    column: {
      name: "is_deleted",
      logicalName: "削除フラグ",
      dataType: "BOOLEAN",
      notNull: true,
      primaryKey: false,
      unique: false,
      defaultValue: "false",
    },
  },
  {
    id: "tpl-status",
    label: "ステータス",
    icon: "bi-flag",
    category: "フラグ・日付",
    column: {
      name: "status",
      logicalName: "ステータス",
      dataType: "VARCHAR",
      length: 20,
      notNull: true,
      primaryKey: false,
      unique: false,
      defaultValue: "'active'",
    },
  },
  {
    id: "tpl-created-at",
    label: "作成日時",
    icon: "bi-clock",
    category: "フラグ・日付",
    column: {
      name: "created_at",
      logicalName: "作成日時",
      dataType: "TIMESTAMP",
      notNull: true,
      primaryKey: false,
      unique: false,
      defaultValue: "CURRENT_TIMESTAMP",
    },
  },
  {
    id: "tpl-updated-at",
    label: "更新日時",
    icon: "bi-clock-history",
    category: "フラグ・日付",
    column: {
      name: "updated_at",
      logicalName: "更新日時",
      dataType: "TIMESTAMP",
      notNull: true,
      primaryKey: false,
      unique: false,
      defaultValue: "CURRENT_TIMESTAMP",
    },
  },
];
