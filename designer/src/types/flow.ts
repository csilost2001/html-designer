/** 画面種別 */
export type ScreenType =
  | "login"      // ログイン
  | "dashboard"  // ダッシュボード
  | "list"       // 一覧
  | "detail"     // 詳細
  | "form"       // 入力フォーム
  | "search"     // 検索
  | "confirm"    // 確認
  | "complete"   // 完了
  | "error"      // エラー
  | "modal"      // モーダル
  | "other";     // その他

/** 遷移トリガー */
export type TransitionTrigger =
  | "click"      // ボタン/リンククリック
  | "submit"     // フォーム送信
  | "select"     // 行選択
  | "cancel"     // キャンセル
  | "auto"       // 自動遷移（リダイレクト等）
  | "back"       // 戻る操作
  | "other";     // その他

/** 画面種別ラベル */
export const SCREEN_TYPE_LABELS: Record<ScreenType, string> = {
  login: "ログイン",
  dashboard: "ダッシュボード",
  list: "一覧",
  detail: "詳細",
  form: "入力フォーム",
  search: "検索",
  confirm: "確認",
  complete: "完了",
  error: "エラー",
  modal: "モーダル",
  other: "その他",
};

/** 画面種別アイコン (Bootstrap Icons) */
export const SCREEN_TYPE_ICONS: Record<ScreenType, string> = {
  login: "bi-box-arrow-in-right",
  dashboard: "bi-speedometer2",
  list: "bi-list-ul",
  detail: "bi-file-earmark-text",
  form: "bi-pencil-square",
  search: "bi-search",
  confirm: "bi-check-circle",
  complete: "bi-check2-all",
  error: "bi-exclamation-triangle",
  modal: "bi-window-stack",
  other: "bi-circle",
};

/** 遷移トリガーラベル */
export const TRIGGER_LABELS: Record<TransitionTrigger, string> = {
  click: "クリック",
  submit: "フォーム送信",
  select: "行選択",
  cancel: "キャンセル",
  auto: "自動遷移",
  back: "戻る",
  other: "その他",
};

/** 画面ノード */
export interface ScreenNode {
  id: string;
  /** 物理順 (1..N 連番)。詳細は docs/spec/list-common.md §3.10 */
  no: number;
  name: string;
  type: ScreenType;
  description: string;
  path: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  hasDesign: boolean;
  /** 所属グループID */
  groupId?: string;
  /** デザインのサムネイル（data:image/jpeg;base64,...） */
  thumbnail?: string;
  createdAt: string;
  updatedAt: string;
}

/** 画面グループ */
export interface ScreenGroup {
  id: string;
  name: string;
  color?: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  createdAt: string;
  updatedAt: string;
}

/** 遷移エッジ */
export interface ScreenEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label: string;
  trigger: TransitionTrigger;
}

/** テーブルメタ情報（project.json 管理用） */
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

/** 処理フローメタ情報（project.json 管理用） */
export interface ProcessFlowMeta {
  id: string;
  /** 物理順 (1..N 連番)。詳細は docs/spec/list-common.md §3.10 */
  no: number;
  name: string;
  type: string;
  screenId?: string;
  actionCount: number;
  updatedAt: string;
  /** 成熟度 (#186、docs/spec/process-flow-maturity.md §6.4)。未指定は "draft" として解釈 */
  maturity?: "draft" | "provisional" | "committed";
  /** グループ全体の付箋合計件数 (#228、一覧表示用) */
  notesCount?: number;
}

/** プロジェクト全体 */
export interface FlowProject {
  version: 1;
  name: string;
  screens: ScreenNode[];
  groups: ScreenGroup[];
  edges: ScreenEdge[];
  tables?: TableMeta[];
  processFlows?: ProcessFlowMeta[];
  sequences?: import("./sequence").SequenceMeta[];
  updatedAt: string;
}
