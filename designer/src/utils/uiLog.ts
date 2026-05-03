/**
 * UI フレームワークレイヤーの構造化ログ (#748 follow-up、redirect-loop 調査用)
 *
 * 目的:
 *  - navigate / tab open-close / URL sync / workspace state transition / resource load
 *    のイベントを共通フォーマットで console に出力し、無限ループ系バグの追跡を容易にする
 *  - 同一カテゴリの異常頻度 (例: 同 path navigate × 5+ in 1s) をフレームワーク側で
 *    自動検出して console.warn する
 *
 * 出力例:
 *   [13:42:18.345][redirect] /w/A/view-definition/edit/X { from: "/w/A/" }
 *   [13:42:18.351][urlsync] view-definition tab open { id: "X", label: "注文一覧" }
 *   [13:42:18.402][load] viewDefinition X → null { hasFallback: true }
 *
 * 環境変数 / localStorage で出力レベルを制御:
 *   localStorage.setItem("ui-log", "debug")  // 全出力
 *   localStorage.setItem("ui-log", "warn")   // 警告以上のみ (デフォルト)
 *   localStorage.setItem("ui-log", "off")    // 完全停止
 */

export type UiLogLevel = "debug" | "info" | "warn" | "error" | "off";
export type UiLogCategory =
  | "redirect"
  | "urlsync"
  | "tabsync"
  | "workspace"
  | "load"
  | "ws-broadcast"
  | "guard";

interface RecentEvent {
  ts: number;
  category: UiLogCategory;
  msg: string;
}

const LEVEL_ORDER: Record<UiLogLevel, number> = {
  debug: 0, info: 1, warn: 2, error: 3, off: 4,
};

let _recent: RecentEvent[] = [];
const RECENT_WINDOW_MS = 1000;
const RECENT_MAX = 200; // メモリ抑制

function getLevel(): UiLogLevel {
  try {
    const v = localStorage.getItem("ui-log");
    if (v === "debug" || v === "info" || v === "warn" || v === "error" || v === "off") return v;
  } catch { /* SSR / private mode */ }
  // 開発環境では debug (ログだけで現象判別できるレベル)、本番では warn
  return import.meta.env?.DEV ? "debug" : "warn";
}

function shouldLog(level: UiLogLevel): boolean {
  const cur = getLevel();
  return LEVEL_ORDER[level] >= LEVEL_ORDER[cur];
}

function ts(): string {
  return new Date().toISOString().slice(11, 23); // HH:mm:ss.sss
}

function pushRecent(category: UiLogCategory, msg: string): void {
  const now = Date.now();
  _recent.push({ ts: now, category, msg });
  // ウィンドウ外を捨てる + 上限超過分をトリム
  _recent = _recent.filter((e) => now - e.ts < RECENT_WINDOW_MS);
  if (_recent.length > RECENT_MAX) _recent = _recent.slice(-RECENT_MAX);
}

/** 1 秒間に同 (category, msg) が threshold 回超えたら warn を出す。 */
function detectFlooding(category: UiLogCategory, msg: string): boolean {
  const now = Date.now();
  const sameCount = _recent.filter(
    (e) => now - e.ts < RECENT_WINDOW_MS && e.category === category && e.msg === msg,
  ).length;
  // 同 (category, msg) が 5 回超: 多分ループ
  if (sameCount >= 5 && sameCount % 5 === 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[${ts()}][ui-log][flood] ${category}/${msg.slice(0, 60)} が 1 秒に ${sameCount} 回発生しています。loop 疑い。`,
    );
    return true;
  }
  return false;
}

export function uiLog(
  level: UiLogLevel,
  category: UiLogCategory,
  msg: string,
  ctx?: Record<string, unknown>,
): void {
  pushRecent(category, msg);
  detectFlooding(category, msg);
  if (!shouldLog(level)) return;
  const prefix = `[${ts()}][${category}]`;
  // eslint-disable-next-line no-console
  const out =
    level === "error" ? console.error
    : level === "warn" ? console.warn
    : level === "info" ? console.info
    : console.debug;
  if (ctx) out(prefix, msg, ctx);
  else out(prefix, msg);
}

// 便利な短縮
export const uiDebug = (cat: UiLogCategory, msg: string, ctx?: Record<string, unknown>) =>
  uiLog("debug", cat, msg, ctx);
export const uiInfo = (cat: UiLogCategory, msg: string, ctx?: Record<string, unknown>) =>
  uiLog("info", cat, msg, ctx);
export const uiWarn = (cat: UiLogCategory, msg: string, ctx?: Record<string, unknown>) =>
  uiLog("warn", cat, msg, ctx);
export const uiError = (cat: UiLogCategory, msg: string, ctx?: Record<string, unknown>) =>
  uiLog("error", cat, msg, ctx);

/** 主にテスト用 */
export function _resetUiLog(): void { _recent = []; }
export function _getRecent(): readonly RecentEvent[] { return _recent.slice(); }

/**
 * ブラウザコンソールから呼び出してバグ報告に貼り付けやすくするための窓口。
 * 例: `__uiLogDump()` をコンソールで実行 → 直近 1 秒の全イベントが返る。
 *
 * バグ報告時のテンプレ:
 *   1. 不具合の現象を文章で説明
 *   2. ブラウザコンソールで `__uiLogDump()` を実行し結果を貼る
 *   3. URL バーの値を貼る
 *
 * これだけで AI 側はリダイレクトループ / 重複 load / state 競合を判別できる前提で
 * カテゴリ・メッセージ・コンテキストを設計している。
 */
declare global {
  interface Window {
    __uiLogDump?: () => readonly RecentEvent[];
    __uiLogSetLevel?: (l: UiLogLevel) => void;
  }
}

if (typeof window !== "undefined") {
  window.__uiLogDump = () => _recent.slice();
  window.__uiLogSetLevel = (l: UiLogLevel) => {
    try { localStorage.setItem("ui-log", l); } catch { /* private mode */ }
  };
}
