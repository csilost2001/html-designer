// ── 処理フロー定義 型定義 ─────────────────────────────────────────────────

/** ステップ種別 */
export type StepType =
  | "validation"       // バリデーション
  | "dbAccess"         // DB操作
  | "externalSystem"   // 外部システム呼び出し
  | "commonProcess"    // 共通処理参照
  | "screenTransition" // 画面遷移
  | "displayUpdate"    // 表示更新
  | "branch"           // 条件分岐（インラインA/B）
  | "jump"             // 別大分類へのジャンプ
  | "other";           // その他

/** ステップ種別ラベル */
export const STEP_TYPE_LABELS: Record<StepType, string> = {
  validation: "バリデーション",
  dbAccess: "DB操作",
  externalSystem: "外部システム",
  commonProcess: "共通処理",
  screenTransition: "画面遷移",
  displayUpdate: "表示更新",
  branch: "条件分岐",
  jump: "ジャンプ",
  other: "その他",
};

/** ステップ種別アイコン */
export const STEP_TYPE_ICONS: Record<StepType, string> = {
  validation: "bi-check-circle",
  dbAccess: "bi-database",
  externalSystem: "bi-cloud",
  commonProcess: "bi-box-seam",
  screenTransition: "bi-arrow-right-square",
  displayUpdate: "bi-display",
  branch: "bi-signpost-split",
  jump: "bi-arrow-return-right",
  other: "bi-three-dots",
};

/** ステップ種別カラー（左ボーダー色） */
export const STEP_TYPE_COLORS: Record<StepType, string> = {
  validation: "#f59e0b",
  dbAccess: "#3b82f6",
  externalSystem: "#8b5cf6",
  commonProcess: "#10b981",
  screenTransition: "#ec4899",
  displayUpdate: "#6366f1",
  branch: "#f97316",
  jump: "#94a3b8",
  other: "#9ca3af",
};

/** DB操作種別 */
export type DbOperation = "SELECT" | "INSERT" | "UPDATE" | "DELETE";

export const DB_OPERATION_LABELS: Record<DbOperation, string> = {
  SELECT: "検索",
  INSERT: "登録",
  UPDATE: "更新",
  DELETE: "削除",
};

/** ActionGroupの種別 */
export type ActionGroupType =
  | "screen"     // 画面のアクション
  | "batch"      // バッチ処理
  | "scheduled"  // スケジュール処理
  | "system"     // セッションタイムアウト等
  | "common"     // 共通処理
  | "other";

export const ACTION_GROUP_TYPE_LABELS: Record<ActionGroupType, string> = {
  screen: "画面",
  batch: "バッチ",
  scheduled: "スケジュール",
  system: "システム",
  common: "共通処理",
  other: "その他",
};

export const ACTION_GROUP_TYPE_ICONS: Record<ActionGroupType, string> = {
  screen: "bi-display",
  batch: "bi-gear",
  scheduled: "bi-clock",
  system: "bi-cpu",
  common: "bi-box-seam",
  other: "bi-three-dots",
};

/** トリガー種別 */
export type ActionTrigger =
  | "click"   // ボタン/リンククリック
  | "submit"  // フォーム送信
  | "select"  // 行選択
  | "change"  // 値変更
  | "load"    // 画面読み込み
  | "timer"   // タイマー
  | "other";  // その他

export const ACTION_TRIGGER_LABELS: Record<ActionTrigger, string> = {
  click: "クリック",
  submit: "フォーム送信",
  select: "行選択",
  change: "値変更",
  load: "画面読み込み",
  timer: "タイマー",
  other: "その他",
};

// ── ステップ定義 ─────────────────────────────────────────────────────────

/** ステップ共通フィールド */
export interface StepBase {
  id: string;
  type: StepType;
  description: string;
  note?: string;
  subSteps?: Step[];
}

export interface ValidationStep extends StepBase {
  type: "validation";
  conditions: string;
  inlineBranch?: {
    ok: string;
    ng: string;
    ngJumpTo?: string;
  };
}

export interface DbAccessStep extends StepBase {
  type: "dbAccess";
  tableName: string;
  tableId?: string;
  operation: DbOperation;
  fields?: string;
}

export interface ExternalSystemStep extends StepBase {
  type: "externalSystem";
  systemName: string;
  protocol?: string;
}

export interface CommonProcessStep extends StepBase {
  type: "commonProcess";
  refId: string;
  refName?: string;
}

export interface ScreenTransitionStep extends StepBase {
  type: "screenTransition";
  targetScreenId?: string;
  targetScreenName: string;
}

export interface DisplayUpdateStep extends StepBase {
  type: "displayUpdate";
  target: string;
}

export interface BranchStep extends StepBase {
  type: "branch";
  condition: string;
  branchA: { label: string; description: string; jumpTo?: string };
  branchB: { label: string; description: string; jumpTo?: string };
}

export interface JumpStep extends StepBase {
  type: "jump";
  jumpTo: string;
}

export interface OtherStep extends StepBase {
  type: "other";
}

export type Step =
  | ValidationStep
  | DbAccessStep
  | ExternalSystemStep
  | CommonProcessStep
  | ScreenTransitionStep
  | DisplayUpdateStep
  | BranchStep
  | JumpStep
  | OtherStep;

// ── アクション定義 ───────────────────────────────────────────────────────

export interface ActionDefinition {
  id: string;
  name: string;
  trigger: ActionTrigger;
  elementRef?: string;
  description?: string;
  /** 入力データ（自由記述、改行区切り） */
  inputs?: string;
  /** 出力データ（自由記述、改行区切り） */
  outputs?: string;
  steps: Step[];
}

// ── アクショングループ ───────────────────────────────────────────────────

export interface ActionGroup {
  id: string;
  name: string;
  type: ActionGroupType;
  screenId?: string;
  description: string;
  actions: ActionDefinition[];
  createdAt: string;
  updatedAt: string;
}

/** project.json用メタデータ */
export interface ActionGroupMeta {
  id: string;
  name: string;
  type: ActionGroupType;
  screenId?: string;
  actionCount: number;
  updatedAt: string;
}

// ── ステップテンプレート ─────────────────────────────────────────────────

/** テンプレート用のステップ定義（id省略、種別固有フィールドは any） */
export type TemplateStep = Omit<StepBase, "id"> & Record<string, unknown>;

export interface StepTemplate {
  id: string;
  label: string;
  description: string;
  steps: TemplateStep[];
}

export const STEP_TEMPLATES: StepTemplate[] = [
  {
    id: "tpl-validate-error",
    label: "バリデーション + エラー表示",
    description: "入力チェック → NG時エラーメッセージ表示",
    steps: [
      {
        type: "validation",
        description: "入力値チェック",
        conditions: "必須項目、形式チェック",
        inlineBranch: {
          ok: "次のステップへ続行",
          ng: "エラーメッセージを表示、処理中断",
        },
      },
    ],
  },
  {
    id: "tpl-db-search-display",
    label: "DB検索 + 結果表示",
    description: "テーブル検索 → 結果を画面に表示",
    steps: [
      {
        type: "dbAccess",
        description: "データ検索",
        tableName: "",
        operation: "SELECT",
      },
      {
        type: "displayUpdate",
        description: "検索結果を一覧に表示",
        target: "一覧テーブル",
      },
    ],
  },
  {
    id: "tpl-db-insert-transition",
    label: "DB登録 + 完了画面遷移",
    description: "テーブル登録 → 完了画面へ遷移",
    steps: [
      {
        type: "dbAccess",
        description: "データ登録",
        tableName: "",
        operation: "INSERT" as DbOperation,
      },
      {
        type: "screenTransition",
        description: "完了画面へ遷移",
        targetScreenName: "",
      },
    ],
  },
  {
    id: "tpl-auth-check",
    label: "認証 + 権限チェック",
    description: "認証チェック → 権限チェック → NG時ログイン画面",
    steps: [
      {
        type: "commonProcess",
        description: "認証チェック",
        refId: "",
        refName: "認証チェック",
      },
      {
        type: "commonProcess",
        description: "権限チェック",
        refId: "",
        refName: "権限チェック",
      },
    ],
  },
];
