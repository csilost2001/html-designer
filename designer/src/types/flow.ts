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
  name: string;
  type: ScreenType;
  description: string;
  path: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  hasDesign: boolean;
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

/** プロジェクト全体 */
export interface FlowProject {
  version: 1;
  name: string;
  screens: ScreenNode[];
  edges: ScreenEdge[];
  updatedAt: string;
}
