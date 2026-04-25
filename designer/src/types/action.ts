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
  | "compute"          // 計算式 / 変数代入 (#174)
  | "return"           // HTTP レスポンス返却 (#178)
  | "log" | "audit"    // アプリケーションログ / 監査ログ
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
  compute: "計算/代入",
  return: "レスポンス返却",
  log: "ログ出力",
  audit: "監査ログ",
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
  compute: "bi-calculator",
  return: "bi-reply",
  log: "bi-journal-text",
  audit: "bi-shield-check",
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
  compute: "#0ea5e9",
  return: "#22c55e",
  log: "#64748b",
  audit: "#a855f7",
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

/** ProcessFlowの種別 */
export type ProcessFlowType =
  | "screen"     // 画面のアクション
  | "batch"      // バッチ処理
  | "scheduled"  // スケジュール処理
  | "system"     // セッションタイムアウト等
  | "common"     // 共通処理
  | "other";

export const PROCESS_FLOW_TYPE_LABELS: Record<ProcessFlowType, string> = {
  screen: "画面",
  batch: "バッチ",
  scheduled: "スケジュール",
  system: "システム",
  common: "共通処理",
  other: "その他",
};

export const PROCESS_FLOW_TYPE_ICONS: Record<ProcessFlowType, string> = {
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

/** 処理フローのモード (docs/spec/process-flow-maturity.md §5) */
export type ProcessFlowMode = "upstream" | "downstream";

// ── outputBinding の構造化 (docs/spec, #151 (B)) ──────────────────────────

/**
 * outputBinding の代入方式。
 * - "assign": 新規代入 / 上書き (既定)
 * - "accumulate": 数値加算 (subtotal += ... のような累積)
 * - "push": 配列への要素追加 (shortageList.push(...) / enrichedItems.push(...))
 */
export type OutputBindingOperation = "assign" | "accumulate" | "push";

/** 構造化版 outputBinding */
export interface OutputBindingObject {
  name: string;
  /** 既定は "assign" */
  operation?: OutputBindingOperation;
  /**
   * 初期値 (#253)。JSON 値 (例: [], 0) または式文字列 (例: "[]", "@emptyArr")。
   * - operation="accumulate": 数値 (既定 0)
   * - operation="push": 配列 (既定 [])
   * - operation="assign": 通常不要
   * 初期化タイミング: 変数スコープ開始時 (通常はアクション開始)。
   */
  initialValue?: unknown;
}

/**
 * outputBinding の値型: 旧 string (assign 相当) と新 OutputBindingObject の union。
 * ヘルパー getBindingName / getBindingOperation を使うと透過的に扱える。
 */
export type OutputBinding = string | OutputBindingObject;

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
   * ステップの条件実行ガード (#178)。
   * 真偽式 (自由記述、例: "@paymentMethod == 'credit_card'") または @conv.* 参照。
   * 偽または未評価の場合、ステップを skip する。未指定は常に実行。
   */
  runIf?: string;
  /** ステップ実行に追加で必要な permission key。Action 側の requiredPermissions と AND 条件。 */
  requiredPermissions?: string[];
  /**
   * ステップの結果を保持する変数。後続ステップは @変数名 で参照する。
   * 旧形式 (string) は assign 相当、新形式 (object) は operation で代入方式を指定可能。
   * docs/spec/process-flow-variables.md §3.2, #151 (B)
   */
  outputBinding?: OutputBinding;
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

// ── 構造化バリデーション (docs/spec, #151 (B)) ─────────────────────────────

export type ValidationRuleType =
  | "required"    // 非空必須
  | "regex"       // 正規表現マッチ
  | "maxLength"   // 最大文字数
  | "minLength"   // 最小文字数
  | "range"       // 数値範囲
  | "enum"        // 許容値セット
  | "custom";     // 自由記述

/**
 * 1 件のバリデーションルール。同一 field に複数ルールを付けられる (配列の順で適用)。
 * message は直接文字列か @conv.msg.* 参照を想定。
 */
export interface ValidationRule {
  /** 検証対象フィールド名 (inputs[].name を参照) */
  field: string;
  type: ValidationRuleType;
  /** type="regex" 時のパターン (生 regex or @conv.regex.* 参照) */
  pattern?: string;
  /** type="maxLength" / "minLength" 時の文字数 */
  length?: number;
  /** type="range" 時の最小値 */
  min?: number;
  /** type="range" 時の最大値 */
  max?: number;
  /** type="range" 時の最小値を @conv.limit.* 参照で指定するバリアント (#253) */
  minRef?: string;
  /** type="range" 時の最大値を @conv.limit.* 参照で指定するバリアント (#253) */
  maxRef?: string;
  /** type="enum" 時の許容値リスト */
  values?: string[];
  /** type="custom" 時の自由記述条件 (例: "@items.length >= 1") */
  condition?: string;
  /** エラーメッセージ (直接文字列 or @conv.msg.* 参照) */
  message?: string;
}

export interface ValidationStep extends StepBase {
  type: "validation";
  /**
   * 自由記述のバリデーション条件 (後方互換、人間可読の補足として残す)。
   * 構造化済なら rules[] を優先。
   */
  conditions: string;
  /**
   * 構造化バリデーションルール。AI / UI はこちらを機械可読な一次情報として使う。
   * 未指定時は conditions の自由記述を読むしかない (後方互換)。
   */
  rules?: ValidationRule[];
  /**
   * rules[] の評価結果を格納する変数名 (#261 v1.4)。
   * 既定は "fieldErrors"。inlineBranch.ngBodyExpression 等で \@fieldErrors として参照される。
   * 型は Record<fieldName, message> を想定。
   */
  fieldErrorsVar?: string;
  inlineBranch?: {
    ok: string;
    ng: string;
    ngJumpTo?: string;
    /**
     * バリデーション NG 時に返却する HTTP レスポンス参照 (#180)。
     * action.responses[].id を指す。
     */
    ngResponseRef?: string;
    /** NG 時の返却 body 式 (任意、自由記述) */
    ngBodyExpression?: string;
  };
}

// ── 条件付き UPDATE + 影響行数チェック (docs/spec, #151 (B)) ────────────────

export type AffectedRowsOperator = ">" | ">=" | "=" | "<" | "<=";

/**
 * 影響行数チェック。条件付き UPDATE (WHERE 条件で並行制御するパターン) の結果検証用。
 * 典型例: 在庫引当の "UPDATE inventory SET stock = stock - @qty WHERE stock >= @qty" で、
 * rowCount === 0 なら並行競合による在庫不足として throw する。
 */
export interface AffectedRowsCheck {
  operator: AffectedRowsOperator;
  expected: number;
  /**
   * 違反時の挙動:
   * - "throw": 例外を投げて TX ROLLBACK (errorCode で識別)
   * - "abort": アクション中断 (HTTP エラーレスポンス等)
   * - "log": ログ記録のみ、処理続行
   * - "continue": 黙って続行 (明示的に無視する場合)
   */
  onViolation: "throw" | "abort" | "log" | "continue";
  /** throw / abort 時のエラー識別子 (例: "STOCK_SHORTAGE") */
  errorCode?: string;
  description?: string;
}

export interface DbAccessStep extends StepBase {
  type: "dbAccess";
  tableName: string;
  tableId?: string;
  operation: DbOperation;
  /**
   * 自由記述の列リスト / WHERE 補足 (後方互換)。
   * 単純な INSERT/SELECT ではこちらで十分。複雑クエリは sql を使う。
   */
  fields?: string;
  /**
   * 完全な SQL 文 (例: "SELECT ... FROM ... WHERE ...", "INSERT ... RETURNING ..." 等)。
   * 指定時は fields / operation より優先。複雑クエリ (JOIN / CTE / サブクエリ / RETURNING 等) に使う。
   * docs/spec #151 (B)
   */
  sql?: string;
  /**
   * 一括 INSERT 時に VALUES 句へ展開する配列変数の参照 (例: "@poItemValues")。
   * 配列の各要素が 1 レコードとして INSERT される (#253)。
   */
  bulkValues?: string;
  /**
   * 影響行数チェック。UPDATE / DELETE で条件付き並行制御する場合に使う。
   * SELECT / INSERT では通常不要。
   */
  affectedRowsCheck?: AffectedRowsCheck;
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
  /**
   * 副作用として action 実行前に実行するステップ列。
   * 例: capture 失敗時に orders.status を 'payment_failed' に UPDATE + 運用通知。
   * docs/spec, #151 (B) / #172
   */
  sideEffects?: Step[];
  /**
   * 他の outcome の定義を流用する短縮記法 (例: timeout が failure と同じ扱い時)。
   * 指定時は他フィールド (action/description/sideEffects 等) を無視し、sameAs 先の定義を使う。
   * product-scope §11 の既定 (timeout 省略時は failure と同じ) を明示的に表現可能。
   */
  sameAs?: ExternalCallOutcome;
}

/** 外部呼出のリトライ方針 */
export interface RetryPolicy {
  maxAttempts: number;
  backoff?: "fixed" | "exponential";
  initialDelayMs?: number;
}

/** 外部システムの認証方式 (#253 v1.2) */
export type ExternalAuthKind = "bearer" | "basic" | "apiKey" | "oauth2" | "none";

/**
 * 外部呼出の認証設定 (#253 v1.2)。
 * secretRef は規約文字列で運用する (例: "ENV:STRIPE_SECRET_KEY", "SECRET:stripe/api-key")。
 * 正式な secret 管理機能は将来別途追加予定。
 */
export interface ExternalAuth {
  kind: ExternalAuthKind;
  /** 秘密値の参照 (例: "ENV:STRIPE_SECRET_KEY")。kind="none" では不要 */
  tokenRef?: string;
  /** apiKey 時のヘッダ名 (例: "X-API-Key"、既定 "Authorization") */
  headerName?: string;
}

/**
 * HTTP 呼出の構造化 (#261 v1.3)。
 * 旧 `protocol: string` (例: "HTTPS POST /v1/payment_intents/@id/cancel") を
 * method / path / pathParams / query / body に分解する。
 * path は式補間を許容 (js-subset の @identifier)。
 */
export interface ExternalHttpCall {
  method: HttpMethod;
  /** URL パス。式補間可 (例: "/v1/payment_intents/@paymentAuth.id/cancel") */
  path: string;
  /** クエリ文字列。値は式可 (例: { limit: "@pageSize", cursor: "@nextCursor" }) */
  query?: Record<string, string>;
  /** リクエスト body の式 (例: "{ amount: @order.totalAmount, currency: 'jpy' }")。
   *  GET 等で body 不要な場合は省略。 */
  body?: string;
}

/**
 * ProcessFlow.externalSystemCatalog エントリ (#261 v1.3)。
 * 同一外部システム (Stripe, SendGrid 等) を使う複数ステップで auth/baseUrl/timeoutMs/retryPolicy を集約し、
 * step 側は systemRef で参照する。DRY 化と drift 防止。
 */
export interface ExternalSystemCatalogEntry {
  /** 人間可読名 (例: "Stripe Japan") */
  name: string;
  /** HTTP ベース URL (例: "https://api.stripe.com") */
  baseUrl?: string;
  /** 既定認証 (step 側の auth が優先) */
  auth?: ExternalAuth;
  /** 既定タイムアウト (ms) */
  timeoutMs?: number;
  /** 既定リトライ方針 */
  retryPolicy?: RetryPolicy;
  /** 既定ヘッダ (step 側で上書き可) */
  headers?: Record<string, string>;
  /** 補足説明 */
  description?: string;
}

export interface ExternalSystemStep extends StepBase {
  type: "externalSystem";
  /**
   * 外部システム名。systemRef 指定時はカタログから継承する情報の override ラベル。
   * 従来互換のため必須継続 (systemRef だけの運用でも表示用に書く)。
   */
  systemName: string;
  /**
   * ProcessFlow.externalSystemCatalog のキー参照 (#261 v1.3)。
   * 指定時はカタログの baseUrl/auth/timeoutMs/retryPolicy/headers を既定値とし、
   * この step の同名フィールドで override 可能。
   */
  systemRef?: string;
  /**
   * @deprecated (#261 v1.3): 自由記述。httpCall への移行推奨。
   * 後方互換のため残す。新規データは httpCall を使用。
   */
  protocol?: string;
  /**
   * HTTP 呼出の構造化 (#261 v1.3)。protocol の後継。
   * method / path / query / body に分解、path は式補間可。
   */
  httpCall?: ExternalHttpCall;
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
  /**
   * 認証方式 (#253 v1.2)。未指定は "none" として解釈。
   * tokenRef は "ENV:FOO" / "SECRET:path/to/key" 等の規約文字列で秘密値を参照。
   */
  auth?: ExternalAuth;
  /**
   * 冪等性キーを生成する式 (#253 v1.2)。例: "order-@registeredOrder.id"。
   * Stripe 等の外部 API が Idempotency-Key ヘッダを要求する場合に設定。
   */
  idempotencyKey?: string;
  /**
   * 追加 HTTP ヘッダ (#253 v1.2)。値は式可 (例: @stripeVersion)。
   * auth / idempotencyKey で表現できない任意ヘッダを設定する場合に使用。
   */
  headers?: Record<string, string>;
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

/**
 * Branch の分岐条件 variant (#176 / #261 v1.3 で拡張)。
 * 旧 string と新しい型付き表現 (tryCatch 等) の union。
 *
 * v1.3 で追加:
 * - `affectedRowsZero`: 直前の DbAccessStep (affectedRowsCheck) で rowCount が期待を満たさなかった場合
 * - `externalOutcome`: 直前の ExternalSystemStep の outcome (success/failure/timeout) を分岐条件に
 */
export type BranchConditionVariant =
  | {
      /** TX catch / try-catch 文脈。errorCode が補足されているエラーが捕捉された時に成立 */
      kind: "tryCatch";
      /** DbAccessStep.affectedRowsCheck.errorCode 等と対応する識別子 */
      errorCode: string;
      description?: string;
    }
  | {
      /** 直前の DbAccess (UPDATE/DELETE) の rowCount が期待を満たさなかった時に成立 (#261 v1.3) */
      kind: "affectedRowsZero";
      /** 対象の DbAccessStep ID (省略時は直前の DbAccess) */
      stepRef?: string;
      description?: string;
    }
  | {
      /** 直前の ExternalSystemStep の outcome に基づく分岐 (#261 v1.3) */
      kind: "externalOutcome";
      /** 対象の ExternalSystemStep ID (省略時は直前の external call) */
      stepRef?: string;
      /** マッチ対象の outcome */
      outcome: ExternalCallOutcome;
      description?: string;
    };

/** Branch.condition の値型: 旧 string (自由記述) と新 BranchConditionVariant の union */
export type BranchCondition = string | BranchConditionVariant;

/** 多分岐の1件 */
export interface Branch {
  /** 内部 UUID */
  id: string;
  /** 自動採番コード: "A", "B", "C", ... */
  code: string;
  /** 任意の自由入力ラベル */
  label?: string;
  /**
   * 分岐条件。
   * - 旧: string (自由記述、LLM 解析前提)
   * - 新: BranchConditionVariant (tryCatch 等の型付き表現)
   * docs/spec, #151 (B) / #176
   */
  condition: BranchCondition;
  /** 任意のサブ処理（全カード配置可能） */
  steps: Step[];
}

/**
 * else 分岐 (otherwise)。構造は Branch とほぼ同じだが condition は本質的に不要 (#253)。
 * 旧データ (condition: "" 等の空文字列埋め) を壊さないため、後方互換で condition は optional。
 */
export interface ElseBranch {
  id: string;
  code: string;
  label?: string;
  /** 後方互換用のみ保持。新規データは省略可 */
  condition?: BranchCondition;
  steps: Step[];
}

export interface BranchStep extends StepBase {
  type: "branch";
  /** 最小 1 個、D&D で並び替え可能 */
  branches: Branch[];
  /** 任意、常に最後に描画 */
  elseBranch?: ElseBranch;
  /** tryCatch 分岐がガードするステップ ID の一覧。kind=tryCatch の Branch と組み合わせて try 範囲を明示 (#253) */
  tryScope?: string[];
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

/**
 * 計算・代入ステップ (docs/spec, #151 (B) / #174)。
 * 純粋計算 (税額・合計・集計など) や、@変数 の代入を構造化する。
 * DB / 外部呼出に依存しない「内部ロジック」の表現用。
 * 結果格納先は outputBinding で指定。
 */
export interface ComputeStep extends StepBase {
  type: "compute";
  /**
   * 代入式 (自由記述、AI 実装時に言語依存で翻訳)。
   * 例: "Math.floor(@subtotal * 0.10)" / "@subtotal + @taxAmount" / "@items.length"
   */
  expression: string;
}

/**
 * HTTP レスポンス返却ステップ (#178)。
 * action.responses[] への参照 (responseRef) で返却内容を指定する。
 * 返却 body の具体値は bodyExpression で表現。
 */
export interface ReturnStep extends StepBase {
  type: "return";
  /** action.responses[].id への参照 (例: "409-stock-shortage") */
  responseRef?: string;
  /**
   * 返却 body の式 (任意、自由記述)。
   * 例: "{ code: 'STOCK_SHORTAGE', detail: @shortageList }"
   */
  bodyExpression?: string;
}

export interface LogStep extends StepBase {
  type: "log";
  level: "trace" | "debug" | "info" | "warn" | "error";
  /** 式可。例: "注文 @orderId 受付完了" */
  message: string;
  /** ログカテゴリ。ログルーティング用 */
  category?: string;
  /** 値は式。例: { orderId: "@orderId", total: "@subtotal + @tax" } */
  structuredData?: Record<string, string>;
}

export interface AuditStep extends StepBase {
  type: "audit";
  /** 業務アクション名。例: "order.create" / "user.passwordChange" */
  action: string;
  resource?: {
    /** 例: "Order" / "User" */
    type: string;
    /** 式可。例: "@orderId" */
    id: string;
  };
  /** 未指定なら実装側で自動判定 (例外発生 → failure) */
  result?: "success" | "failure";
  /** 式可。例: "@rejectionReason" */
  reason?: string;
  /** true なら値本体をマスクして keys だけ記録 */
  sensitive?: boolean;
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
  | ComputeStep
  | ReturnStep
  | LogStep
  | AuditStep
  | OtherStep;

// ── アクション定義 ───────────────────────────────────────────────────────

// ── 入出力の構造化 (docs/spec/process-flow-variables.md §3.1) ─────────────

/**
 * 入出力フィールドの型。primitive + 複合型 (array/object) + テーブル/画面参照 + 自由記述型の union。
 *
 * `array` / `object` は #253 で追加。`custom` の `label` に
 * `"Array<{itemId, quantity}>"` のような自由記述で逃げていたケースを構造化可能にする。
 * 従来は custom で表現していたものも、可能なら array / object に移行するのが望ましい。
 */
export type FieldType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | { kind: "array"; itemType: FieldType }
  | { kind: "object"; fields: StructuredField[] }
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
  /** 採番形式 / フォーマットパターン (@conv.numbering.* 参照 or 正規表現) (#253) */
  format?: string;
  /** 自由記述の既定値 */
  defaultValue?: string;
  /**
   * 画面項目定義への参照 (#321)。
   * 設定時は対応する ScreenItem から id/label/type/required/pattern/maxLength 等を上書き解釈する。
   * 処理フロー側で上書きしたいフィールド (description 等) は本オブジェクトの同名プロパティが優先。
   * 参照先が存在しない場合は UNKNOWN_SCREEN_ITEM 警告 (参照整合性バリデータ)。
   */
  screenItemRef?: { screenId: string; itemId: string };
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

/**
 * bodySchema の構造化参照 (#253 v1.2)。
 * - `{ typeRef: string }`: 型カタログ (将来機能) への名前参照。今は規約的な型名 (例: "ApiError", "CustomerResponse")
 * - `{ schema: object }`: インライン JSON Schema (ad hoc な応答形式用)
 *
 * 旧 string 形式 (自由記述) も union で残る。段階的に構造化へ移行する想定。
 */
export type BodySchemaRef =
  | string
  | { typeRef: string }
  | { schema: Record<string, unknown> };

/** HTTP レスポンス仕様 (成功/エラーの各ケース) */
export interface HttpResponseSpec {
  /** ReturnStep.responseRef から参照するための識別子 (任意、例: "409-stock-shortage") */
  id?: string;
  /** 数値 HTTP ステータス (例: 201, 400, 404) */
  status: number;
  /** MIME タイプ。未指定は "application/json" として解釈 */
  contentType?: string;
  /**
   * レスポンスボディのスキーマ。
   * - 旧 string (自由記述): "CustomerRegisterResponse" / "ApiError" / "{ code, fieldErrors }"
   * - 新 `{ typeRef }` (#253 v1.2): 型カタログへの名前参照
   * - 新 `{ schema }` (#253 v1.2): インライン JSON Schema
   */
  bodySchema?: BodySchemaRef;
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
  /** アクション起動に必要な permission key。@conv.permission.<key> と対応する。 */
  requiredPermissions?: string[];
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

// ── 処理フロー ───────────────────────────────────────────────────

/**
 * エラーコードカタログの 1 エントリ (#253)。
 * 同一 errorCode が affectedRowsCheck.errorCode / BranchConditionVariant.errorCode / responses[].description の
 * 複数箇所に散在する問題を解決するため、ProcessFlow 単位で 1 箇所に集約する。
 */
/**
 * マーカーの種別 (#261)。
 * - "chat": AI への指示・質問 (会話的)
 * - "attention": 「ここ確認して」(人間が目印として置く)
 * - "todo": 未完了タスク
 * - "question": AI に答えを求める質問
 */
export type MarkerKind = "chat" | "attention" | "todo" | "question";

/**
 * マーカー 1 件 (#261 リアルタイム編集ワークフロー)。
 * 人間の指示・質問を保持し、Claude Code が読み取って処理する。
 */
export interface Marker {
  id: string;
  kind: MarkerKind;
  /** マーカー本文 (自然言語) */
  body: string;
  /** 紐付く step id (省略時はグループ全体宛) */
  stepId?: string;
  /** 紐付くフィールドパス (例: "expression", "sql")。省略時はステップ全体 */
  fieldPath?: string;
  /** 発言者 */
  author: "human" | "ai";
  /** ISO timestamp */
  createdAt: string;
  /** 解決済みなら設定 (AI が対応完了を記録) */
  resolvedAt?: string;
  /** AI 側の対応メモ (resolve 時に併記) */
  resolution?: string;
  /**
   * 警告由来の marker に紐付く validator コード (UNKNOWN_IDENTIFIER 等)。
   * 警告→marker 起票時に埋め、重複起票ガードに使う (#261)。
   */
  code?: string;
  /**
   * 警告由来の marker に紐付く JSON path (例: actions[0].steps[1].responseRef)。
   * code と併用して「同じ警告を 2 回起票しない」判定。
   */
  path?: string;
  /**
   * 自由描画 (赤線マーカー) の形状 (#261)。
   * ユーザーが画面上で描いた線・矩形などを SVG path として保持し、描画オーバーレイで可視化する。
   * 座標は editor container に対する % で正規化 (リサイズに追従)。
   */
  shape?: MarkerShape;
}

/**
 * マーカー形状 (#261)。現状は freeform path のみ。
 * 将来的に rectangle / arrow / circle 等を enum で拡張予定。
 */
export interface MarkerShape {
  type: "path";
  /**
   * SVG path の `d` 属性値。座標は 0-100 の % 表記、viewBox="0 0 100 100"。
   * `anchorStepId` 指定時はその DOM 要素 (step card / field) の bbox に対する %、
   * 未指定時は画面全体 (ProcessFlowEditor コンテンツ領域) に対する %。
   */
  d: string;
  /** 描画色 (省略時は #ef4444 赤) */
  color?: string;
  /** 線幅 (省略時は 2) */
  strokeWidth?: number;
  /**
   * DOM anchor: 描画を特定 step に紐付ける (#261 anchor 改善)。
   * 指定時は `d` 座標がこの step (+ field) の bbox 相対。step が削除されると orphan になる。
   */
  anchorStepId?: string;
  /**
   * DOM anchor の field 細分。step 内の特定フィールド (例: "sql", "conditions",
   * "expression") に紐付ける場合に指定。step レベルで十分な場合は省略。
   */
  anchorFieldPath?: string;
}

/**
 * Secrets カタログの 1 エントリ (#261 v1.6)。
 * 秘匿値そのものは JSON に含めない。取得方法のメタデータのみ。
 */
export interface SecretRef {
  /**
   * 秘匿値の取得元。
   * - "env": プロセス環境変数 (`process.env[name]`)
   * - "vault": 外部 secret store (HashiCorp Vault / AWS Secrets Manager / GCP Secret Manager 等)
   * - "file": ローカルファイルパス (開発時のみ)
   */
  source: "env" | "vault" | "file";
  /**
   * source 毎の具体的な名前/パス:
   * - env: 環境変数名 (例: "STRIPE_SECRET_KEY")
   * - vault: vault 内パス (例: "secret/stripe/api-key")
   * - file: ファイルパス (例: "/etc/secrets/stripe.pem")
   */
  name: string;
  /** 人間向け説明 */
  description?: string;
  /** ローテーション周期 (日)。未指定は運用規約依存 */
  rotationDays?: number;
  /** 最終ローテーション時刻 (ISO timestamp) */
  lastRotatedAt?: string;
}

/**
 * 型カタログの 1 エントリ (#261 v1.3)。
 * schema プロパティに JSON Schema (draft 2020-12) を持つ。
 * 型名単独での参照 (BodySchemaRef.typeRef) から解決される。
 */
export interface TypeCatalogEntry {
  /** 説明 (任意) */
  description?: string;
  /** JSON Schema 本体 (draft 2020-12 の object) */
  schema: Record<string, unknown>;
}

export interface ErrorCatalogEntry {
  /** 対応する HTTP ステータス (例: 409) */
  httpStatus?: number;
  /** 既定メッセージ (@conv.msg.* 参照も可) */
  defaultMessage?: string;
  /** action.responses[].id への参照。ReturnStep / 分岐処理で返却すべき response */
  responseRef?: string;
  /** 補足説明 */
  description?: string;
}

export interface ProcessFlow {
  id: string;
  name: string;
  type: ProcessFlowType;
  screenId?: string;
  description: string;
  actions: ActionDefinition[];
  /** 成熟度。未指定は "draft" として解釈 (docs/spec/process-flow-maturity.md §3) */
  maturity?: Maturity;
  /** 上流/下流モード。未指定は "upstream" として解釈 (docs/spec/process-flow-maturity.md §5) */
  mode?: ProcessFlowMode;
  /**
   * エラーコードカタログ (#253)。キー: errorCode (例: "STOCK_SHORTAGE")、値: HTTP ステータス / 既定メッセージ / 対応する responseRef。
   * affectedRowsCheck.errorCode / BranchConditionVariant.errorCode から参照される。
   */
  errorCatalog?: Record<string, ErrorCatalogEntry>;
  /**
   * 外部システムカタログ (#261 v1.3)。キー: systemId (例: "stripe", "sendgrid")。
   * ExternalSystemStep.systemRef から参照され、baseUrl/auth/timeoutMs 等の既定値を提供。
   */
  externalSystemCatalog?: Record<string, ExternalSystemCatalogEntry>;
  /**
   * 型カタログ (#261 v1.3)。キー: 型名 (例: "ApiError", "CustomerResponse")。
   * HttpResponseSpec.bodySchema = { typeRef: "ApiError" } から参照される。
   * 値は JSON Schema (inline) またはその略記形。
   */
  typeCatalog?: Record<string, TypeCatalogEntry>;
  /**
   * Ambient 変数カタログ (#261 v1.4)。ミドルウェア・フレームワーク由来の自動注入変数 (例: @requestId, @traceId, @fieldErrors)。
   * @param 記法で参照される際に「inputs にも outputBinding にも無い」と未定義エラー扱いされないよう、
   * アクション側で明示宣言する。実装側は各フレームワーク (Express/Fastify/Nest) の仕組みで値を供給する責務。
   */
  ambientVariables?: StructuredField[];
  /**
   * 規約カタログ defaults へのフロー固有例外 (#369)。
   * 未指定時は data/conventions/catalog.json の default:true エントリを全項目で継承。
   * キーはカタログカテゴリ名 (例: "currency", "scope.timezone")、値は @conv.* 参照文字列またはリテラル値。
   * 稀用途: 特定フローだけ別通貨・別タイムゾーンで動かす場合のみ記述する。
   */
  ambientOverrides?: Record<string, string>;
  /**
   * Secrets カタログ (#261 v1.6)。API キー・DB パスワード・署名鍵等の秘匿値の**メタデータ**。
   * 値そのものは JSON に保存せず、`source` で実際の取得先を指す (ENV / vault / file 等)。
   * ExternalAuth.tokenRef から `@secret.<key>` 記法で参照される。
   */
  secretsCatalog?: Record<string, SecretRef>;
  /**
   * マーカー (#261 リアルタイム編集ワークフロー)。
   * 人間が designer 画面で付けたコメント・質問・TODO・チャットメッセージを保持。
   * Claude Code が /designer-work でこれを読み取り、対応した後 resolvedAt を設定する。
   *
   * 付箋 (StepNote) との違い:
   * - StepNote: 仕様書として残す人間向け注記 (成熟度管理)
   * - Marker: AI への指示・一時的なコミュニケーション (解決後は resolvedAt で非表示)
   */
  markers?: Marker[];
  createdAt: string;
  updatedAt: string;
}

/** project.json用メタデータ */
export interface ProcessFlowMeta {
  id: string;
  /** 物理順 (1..N 連番)。詳細は docs/spec/list-common.md §3.10 */
  no: number;
  name: string;
  type: ProcessFlowType;
  screenId?: string;
  actionCount: number;
  updatedAt: string;
  /** 成熟度 (#186、docs/spec/process-flow-maturity.md §6.4)。未指定は "draft" として解釈 */
  maturity?: Maturity;
  /** グループ全体の付箋合計件数 (#228、一覧表示用) */
  notesCount?: number;
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
