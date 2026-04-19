// ── 処理フロー定義 型定義 ─────────────────────────────────────────────────

/** ステップ種別 */
export type StepType =
  | "validation"       // バリデーション
  | "dbAccess"         // DB操作
  | "externalSystem"   // 外部システム呼び出し
  | "commonProcess"    // 共通処理参照
  | "screenTransition" // 画面遷移
  | "displayUpdate"    // 表示更新
  | "branch"           // 条件分岐（多分岐）
  | "loop"             // ループ
  | "loopBreak"        // ループ終了（break）
  | "loopContinue"     // 次のループへ（continue）
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
  loop: "ループ",
  loopBreak: "ループ終了",
  loopContinue: "次のループへ",
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
  loop: "bi-arrow-repeat",
  loopBreak: "bi-stop-circle",
  loopContinue: "bi-skip-forward",
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
  loop: "#06b6d4",
  loopBreak: "#ef4444",
  loopContinue: "#14b8a6",
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

// ── 成熟度・付箋 (docs/spec/process-flow-maturity.md §3〜§4) ───────────────

/** 成熟度 3 値。既定は "draft" */
export type Maturity = "draft" | "provisional" | "committed";

export const MATURITY_VALUES: readonly Maturity[] = ["draft", "provisional", "committed"] as const;

/** 付箋種別 5 値 (docs/spec/process-flow-maturity.md §4) */
export type StepNoteType =
  | "assumption"     // 想定
  | "prerequisite"   // 前提 (別設計必要)
  | "todo"           // TODO
  | "deferred"       // 将来検討
  | "question";      // 質問

export const STEP_NOTE_TYPE_VALUES: readonly StepNoteType[] =
  ["assumption", "prerequisite", "todo", "deferred", "question"] as const;

/** 付箋 (1 ステップに複数持てる、種別付き) */
export interface StepNote {
  id: string;
  type: StepNoteType;
  body: string;
  /** ISO timestamp */
  createdAt: string;
}

/** アクショングループのモード (docs/spec/process-flow-maturity.md §5) */
export type ActionGroupMode = "upstream" | "downstream";

// ── TX 境界 / Saga / 外部チェーン (docs/spec, #151 (B)) ─────────────────────

/** TX 境界におけるステップの役割 */
export type TxBoundaryRole = "begin" | "member" | "end";

/** トランザクション境界。同一 txId を持つステップ群が単一 TX 内で実行される想定 */
export interface TxBoundary {
  role: TxBoundaryRole;
  /** TX 識別子。同一アクション内で一意 */
  txId: string;
}

/** 外部呼出チェーンのフェーズ (例: Stripe の authorize → capture → cancel) */
export type ExternalChainPhase = "authorize" | "capture" | "cancel" | "other";

/** 同一外部リソースを参照する複数ステップを束ねる識別子 */
export interface ExternalChain {
  /** chain 識別子。同一アクション内で一意 */
  chainId: string;
  phase: ExternalChainPhase;
}

/** ステップ共通フィールド */
export interface StepBase {
  id: string;
  type: StepType;
  description: string;
  /** 旧形式の単一付箋 (後方互換)。読み込み時に notes[] へ自動変換される */
  note?: string;
  /** 種別付き付箋。新規保存時はこちらを正とする */
  notes?: StepNote[];
  /** 成熟度。未指定は "draft" として解釈 */
  maturity?: Maturity;
  /**
   * ステップの結果を保持する変数名。後続ステップは @変数名 で参照する。
   * docs/spec/process-flow-variables.md §3.2
   */
  outputBinding?: string;
  /**
   * トランザクション境界。同一 txId を持つステップ群が単一 TX 内で実行される。
   * docs/spec, #151 (B)
   */
  txBoundary?: TxBoundary;
  /** 簡易フラグ: TX 内であることだけ示唆 (txId 管理不要な場合) */
  transactional?: boolean;
  /**
   * Saga 補償の逆参照。補償対象のステップ ID を指す (例: authorize ステップの ID)。
   * 主に cancel / reversal ステップに付ける。
   */
  compensatesFor?: string;
  /**
   * 外部呼出チェーン。同一 chainId を持つステップ群は同じ外部リソースを扱う。
   * 例: Stripe の PaymentIntent に対する authorize → capture → cancel の 3 ステップ。
   */
  externalChain?: ExternalChain;
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

// ── 外部システム呼出の outcome / タイムアウト / リトライ (docs/spec, #151 (B)) ──

/** 外部呼出の結果種別。product-scope §11 の 3 値を型化 */
export type ExternalCallOutcome = "success" | "failure" | "timeout";

export const EXTERNAL_CALL_OUTCOME_VALUES: readonly ExternalCallOutcome[] =
  ["success", "failure", "timeout"] as const;

/** outcome ごとのハンドリング定義 */
export interface ExternalCallOutcomeSpec {
  /**
   * - "continue": 次ステップへ続行 (fire-and-forget で failure/timeout 時の既定)
   * - "abort": 処理中断 (HTTP エラーレスポンス等)
   * - "compensate": Saga 補償 (別途 compensatesFor などで指定する想定)
   */
  action: "continue" | "abort" | "compensate";
  /** 補足説明 (任意、エラーメッセージ文面のヒント等) */
  description?: string;
  /** abort 時のジャンプ先ラベル (任意) */
  jumpTo?: string;
}

/** 外部呼出のリトライ方針 */
export interface RetryPolicy {
  maxAttempts: number;
  backoff?: "fixed" | "exponential";
  initialDelayMs?: number;
}

export interface ExternalSystemStep extends StepBase {
  type: "externalSystem";
  systemName: string;
  protocol?: string;
  /**
   * 各 outcome (success / failure / timeout) のハンドリング定義。
   * 省略時は product-scope §11 の既定 (failure/timeout=abort、success=continue) を適用。
   */
  outcomes?: Partial<Record<ExternalCallOutcome, ExternalCallOutcomeSpec>>;
  /** タイムアウト (ミリ秒)。未指定は product-scope §11 の既定 10000 */
  timeoutMs?: number;
  /** リトライ方針。未指定は「リトライなし」 */
  retryPolicy?: RetryPolicy;
  /** true なら TX 後・非同期 fire-and-forget。同期レスポンスを待たない */
  fireAndForget?: boolean;
}

export interface CommonProcessStep extends StepBase {
  type: "commonProcess";
  refId: string;
  refName?: string;
  /**
   * 呼び先フローの入力名 → 値表現 (リテラル or "@変数名") のマッピング。
   * docs/spec/process-flow-variables.md §3.4
   */
  argumentMapping?: Record<string, string>;
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

/** 多分岐の1件 */
export interface Branch {
  /** 内部 UUID */
  id: string;
  /** 自動採番コード: "A", "B", "C", ... */
  code: string;
  /** 任意の自由入力ラベル */
  label?: string;
  /** 分岐条件（自由記述、LLM 解析前提） */
  condition: string;
  /** 任意のサブ処理（全カード配置可能） */
  steps: Step[];
}

export interface BranchStep extends StepBase {
  type: "branch";
  /** 最小 1 個、D&D で並び替え可能 */
  branches: Branch[];
  /** 任意、常に最後に描画 */
  elseBranch?: Branch;
}

/** ループ種別 */
export type LoopKind = "count" | "condition" | "collection";

/** ループ条件モード */
export type LoopConditionMode = "continue" | "exit";

export interface LoopStep extends StepBase {
  type: "loop";
  loopKind: LoopKind;
  /** loopKind="count" 用: "3回", "検索結果の件数分" 等 */
  countExpression?: string;
  /** loopKind="condition" 用、デフォルト "exit" */
  conditionMode?: LoopConditionMode;
  /** loopKind="condition" 用 */
  conditionExpression?: string;
  /** loopKind="collection" 用: 例 "検索結果" */
  collectionSource?: string;
  /** loopKind="collection" 用: 例 "ユーザー" */
  collectionItemName?: string;
  /** ループ本体 */
  steps: Step[];
}

export interface LoopBreakStep extends StepBase {
  type: "loopBreak";
}

export interface LoopContinueStep extends StepBase {
  type: "loopContinue";
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
  | LoopStep
  | LoopBreakStep
  | LoopContinueStep
  | JumpStep
  | OtherStep;

// ── アクション定義 ───────────────────────────────────────────────────────

// ── 入出力の構造化 (docs/spec/process-flow-variables.md §3.1) ─────────────

/** 入出力フィールドの型。primitive + テーブル/画面参照 + 自由記述型の union */
export type FieldType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | { kind: "tableRow"; tableId: string }
  | { kind: "tableList"; tableId: string }
  | { kind: "screenInput"; screenId: string }
  | { kind: "custom"; label: string };

export interface StructuredField {
  /** 識別子 (例: "userId")。@変数参照のキーにもなる */
  name: string;
  /** 表示名 (例: "ユーザーID") */
  label?: string;
  type: FieldType;
  required?: boolean;
  description?: string;
  /** 自由記述の既定値 */
  defaultValue?: string;
}

/** inputs / outputs の値型: 旧形式 (改行区切り文字列) と新形式 (StructuredField[]) の union */
export type ActionFields = string | StructuredField[];

// ── HTTP 契約 (docs/spec, #151 (B)) ─────────────────────────────────────

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** 認証要件。product-scope §6 参照 */
export type HttpAuthRequirement = "required" | "optional" | "none";

/** アクションが HTTP ハンドラの場合のルート定義 */
export interface HttpRoute {
  method: HttpMethod;
  /** 例: "/api/customers" または "/api/customers/:id" */
  path: string;
  /** 認証要件。省略時は "required" として解釈 (product-scope §6 既定) */
  auth?: HttpAuthRequirement;
}

/** HTTP レスポンス仕様 (成功/エラーの各ケース) */
export interface HttpResponseSpec {
  /** 数値 HTTP ステータス (例: 201, 400, 404) */
  status: number;
  /** MIME タイプ。未指定は "application/json" として解釈 */
  contentType?: string;
  /**
   * レスポンスボディのスキーマ参照 (自由記述)。
   * 例: "CustomerRegisterResponse" / "ApiError" / "{ code: string, fieldErrors: Record<string,string> }"
   */
  bodySchema?: string;
  /** 説明 (発生条件、UI 文言のヒント等) */
  description?: string;
  /** 発生条件 (自由記述、例: "@duplicateCustomer != null") */
  when?: string;
}

export interface ActionDefinition {
  id: string;
  name: string;
  trigger: ActionTrigger;
  elementRef?: string;
  description?: string;
  /**
   * 入力データ。
   * - 旧形式: 改行区切り文字列 (既存データ互換)
   * - 新形式: StructuredField[]
   * docs/spec/process-flow-variables.md §3.1
   */
  inputs?: ActionFields;
  /** 出力データ。inputs と同じ union 型 */
  outputs?: ActionFields;
  /** 成熟度。未指定は "draft" として解釈 */
  maturity?: Maturity;
  /**
   * HTTP ルート定義 (アクションが HTTP ハンドラの場合)。未指定は「非 HTTP」として解釈。
   * docs/spec #151 (B)
   */
  httpRoute?: HttpRoute;
  /**
   * HTTP レスポンス仕様の配列。success / 各エラーケースをまとめて列挙。
   * docs/spec #151 (B)
   */
  responses?: HttpResponseSpec[];
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
  /** 成熟度。未指定は "draft" として解釈 (docs/spec/process-flow-maturity.md §3) */
  maturity?: Maturity;
  /** 上流/下流モード。未指定は "upstream" として解釈 (docs/spec/process-flow-maturity.md §5) */
  mode?: ActionGroupMode;
  createdAt: string;
  updatedAt: string;
}

/** project.json用メタデータ */
export interface ActionGroupMeta {
  id: string;
  /** 物理順 (1..N 連番)。詳細は docs/spec/list-common.md §3.10 */
  no: number;
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
