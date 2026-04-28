/**
 * v3 ScreenItem 型定義 (`schemas/v3/screen-item.v3.schema.json` と 1:1 対応)
 *
 * - id は Identifier (camelCase 強制)
 * - ValueSource は discriminated union (組み込み 4 種 + 拡張)
 * - flowVariable.variableName は IdentifierPath (#533 R3-1) で object field 参照可
 *
 * 参考: schemas/v3/screen-item.v3.schema.json
 */

import type {
  Description,
  DisplayName,
  ExpressionString,
  FieldType,
  Identifier,
  IdentifierPath,
  ProcessFlowId,
  TableColumnRef,
  ViewColumnRef,
} from "./common";

/** ScreenItem.options 1 件。 */
export interface ScreenItemOption {
  value: string;
  label: DisplayName;
}

/**
 * output 項目のバインド元。discriminated union (kind)。
 * 組み込み 4 種 + 拡張 (extensions.v3.valueSourceKinds で定義)。
 */
export type ValueSource =
  | {
      kind: "flowVariable";
      /** 省略時はカレント画面に紐付く ProcessFlow を解決する。 */
      processFlowId?: ProcessFlowId;
      /**
       * ProcessFlow 変数名。Identifier 単独 (例: `inventoryRows`) または
       * IdentifierPath (#533 R3-1) で object field 参照可能 (例: `createdOrder.order_number`)。
       */
      variableName: IdentifierPath;
    }
  | { kind: "tableColumn"; ref: TableColumnRef }
  | { kind: "viewColumn"; ref: ViewColumnRef }
  | { kind: "expression"; expression: ExpressionString }
  | {
      /** 拡張 ValueSource。kind は `namespace:identifier` 形式。例: `retail:cartCalculation` */
      kind: string;
      config?: Record<string, unknown>;
      ref?: never;
      expression?: never;
      variableName?: never;
      processFlowId?: never;
    };

/**
 * ScreenItem (画面項目) 1 件。
 * 識別子 (Identifier) は画面内で一意、AI 実装で API key / 変数名としてそのまま使用可能。
 */
export interface ScreenItem {
  /** 画面項目識別子 (camelCase 強制、JS 識別子に直接使用可)。 */
  id: Identifier;
  label: DisplayName;
  type: FieldType;
  /** input = フォーム入力項目 (既定) / output = 表示専用項目。 */
  direction?: "input" | "output";
  required?: boolean;
  readonly?: boolean;
  disabled?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  step?: number;
  /** 正規表現または `@conv.regex.<key>` 参照。 */
  pattern?: string;
  /** 選択肢 (select / radio / checkbox 用)。静的マスタ。 */
  options?: ScreenItemOption[];
  /** 既定値 (式可は formula 参照)。 */
  defaultValue?: string | number | boolean | null;
  placeholder?: string;
  helperText?: string;
  /** バリデーション NG 時のメッセージ。`@conv.msg.<key>` 参照推奨。 */
  errorMessages?: Record<string, string>;
  /** 表示条件式。 */
  visibleWhen?: ExpressionString;
  /** 活性条件式。 */
  enabledWhen?: ExpressionString;
  /** 表示書式 (output 専用)。例: `YYYY/MM/DD`, `¥#,##0`, `0.00%` */
  displayFormat?: string;
  valueFrom?: ValueSource;
  /** 派生計算式 (= で始まる)。output 項目用。 */
  formula?: ExpressionString;
  description?: Description;
}
