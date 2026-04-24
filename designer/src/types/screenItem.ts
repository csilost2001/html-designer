/**
 * 画面項目定義 (#318 / docs/spec/screen-items.md v1.1 相当)。
 *
 * 画面 (GrapesJS) のフォーム要素に紐付けるバリデーション・ラベル・表示制御を
 * 宣言的に保持する。処理フローの inputs から screenItemRef で参照される想定。
 *
 * ファイル配置: data/screen-items/{screenId}.json (1 画面 = 1 ファイル)
 */
import type { FieldType } from "./action";

/**
 * 出力項目 (direction="output") のバインド元 (#377)。
 * 処理フロー変数 / テーブル列 / ビュー列 / 計算式 の 4 種別。
 */
export type ValueSource =
  | { kind: "flowVariable"; processFlowId?: string; variableName: string }
  | { kind: "tableColumn"; tableName: string; columnName: string }
  | { kind: "viewColumn"; viewName: string; columnName: string }
  | { kind: "expression"; expression: string };

export interface ScreenItemSelectOption {
  value: string;
  label: string;
}

export interface ScreenItemErrorMessages {
  required?: string;
  minLength?: string;
  maxLength?: string;
  invalidFormat?: string;
  outOfRange?: string;
  [code: string]: string | undefined;
}

export interface ScreenItem {
  /** 業務識別子 (実装コードのフィールド名 / API キー, e.g. userName, postalCode).
   *  GrapesJS data-item-id と #331 以降で一致させる想定。 */
  id: string;
  /** 日本語表示名 (ラベル・エラーメッセージ内の {label}) */
  label: string;
  /** 型 (処理フロー FieldType と共通、primitive + { kind: "custom", label }) */
  type: FieldType;

  // ─── フォーム制御 ─────────────────────────────────────────────────
  required?: boolean;
  readonly?: boolean;
  disabled?: boolean;

  // ─── 文字列系制約 ───────────────────────────────────────────────
  minLength?: number;
  maxLength?: number;
  /** 正規表現。@conv.regex.* 参照も直接パターンも可 */
  pattern?: string;

  // ─── 数値系制約 ─────────────────────────────────────────────────
  min?: number;
  max?: number;
  step?: number;

  // ─── 選択系 ─────────────────────────────────────────────────────
  options?: ScreenItemSelectOption[];

  // ─── 規定値・プレースホルダ・ヘルプ ─────────────────────────────
  defaultValue?: string | number | boolean;
  placeholder?: string;
  helperText?: string;

  // ─── エラーメッセージ (規約参照推奨) ───────────────────────────
  errorMessages?: ScreenItemErrorMessages;

  // ─── 表示制御 (式言語、process-flow-expression-language.md) ─
  visibleWhen?: string;
  enabledWhen?: string;

  // ─── 画面上での役割 ─────────────────────────────────────────────
  /** "input": フォーム入力 (デフォルト) / "output": データ表示 */
  direction?: "input" | "output";

  // ─── 出力項目専用 (direction="output" のみ) ──────────────────────
  /** 表示書式 (例: "YYYY/MM/DD", "¥#,##0", "0.00%") */
  displayFormat?: string;
  /** バインド元 — どのデータを表示するか (#377) */
  valueFrom?: ValueSource;

  // ─── 備考 ──────────────────────────────────────────────────────
  description?: string;
}

export interface ScreenItemsFile {
  $schema?: string;
  /** 紐付く画面 ID */
  screenId: string;
  /** SemVer */
  version: string;
  /** ISO 8601 */
  updatedAt: string;
  items: ScreenItem[];
}

/** 画面項目定義ファイルの初期状態 */
export function createEmptyScreenItems(screenId: string): ScreenItemsFile {
  return {
    screenId,
    version: "0.1.0",
    updatedAt: new Date().toISOString(),
    items: [],
  };
}
