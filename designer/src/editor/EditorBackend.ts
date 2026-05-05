/**
 * EditorBackend — エディタ実装を抽象化する境界 interface。
 *
 * 実装: GrapesJSBackend / PuckBackend の 2 つ。
 * 後発エディタ追加時はこの interface を実装するだけ。
 *
 * 詳細仕様: docs/spec/multi-editor-puck.md § 3
 *
 * #806 子 3 / #815 (interface 真の等価性)
 */

import type { ReactNode } from "react";
import type { CssFramework } from "../types/v3/project";

export type ThemeId = "standard" | "card" | "compact" | "dark";
export type PanelMode = "pinned" | "autohide" | "hidden";

/**
 * エディタの永続化状態。Backend 実装ごとの payload を保持する。
 * - GrapesJS: GrapesJS の getProjectData() が返す object (HTML + CSS + components)
 * - Puck:     Puck Data tree (semantic props 構造、cssFramework 非依存)
 */
export interface EditorState {
  /** 永続化される payload。GrapesJS なら HTML+CSS+components、Puck なら Puck Data */
  payload: unknown;
  /** UI 状態 (dirty フラグ等)。EditorBackend 実装ごと自由に拡張 */
  ui?: Record<string, unknown>;
}

/**
 * Backend が ready 後に上位 (Designer.tsx) に expose する imperative API。
 * Backend 実装は onReady(api) を介してこの API を渡す。
 *
 * GrapesJS Backend: GrapesJS editor インスタンスの操作を wrap して expose する。
 * Puck Backend: Puck 内部状態にアクセスする操作を expose する (現状必要な API は限定的)。
 */
export interface EditorApi {
  /** canvas iframe に framework × variant の 2 軸 CSS を注入する */
  applyTheme(themeVariant: ThemeId, cssFramework: CssFramework): void;
  /** 本体ファイルを再読み込みする (cross-tab broadcast 受信時 / discard 時 等) */
  reload(): Promise<void>;
  /** タブ切替時等の canvas 再レンダリング */
  refreshCanvas(): void;
  /** canvas が空 (component 数 0) かどうか */
  isCanvasEmpty(): boolean;
  /** サムネイル画像 (data URL) を生成する。Backend 非対応の場合 null */
  captureThumbnail(): Promise<string | null>;
  /** 現在の payload を返す (save 時に使う) */
  getProjectData(): unknown;
  /** UndoManager.clear() 等の post-discard cleanup */
  clearUndo(): void;
}

/**
 * renderEditor() の引数。
 *
 * Designer.tsx が編集セッション state / 周辺 UI 要素を全て props で渡し、
 * Backend は受け取った props に従って自身の DOM ツリーを組み立てる。
 *
 * subToolbarSlot / dialogsSlot / panelLeftSlot は Designer.tsx で組み立てられた
 * ReactNode を slot として渡し、Backend はそれを自身の layout に注入する。
 * これにより GrapesJS Backend は <GjsEditor> の context 内側 (useEditor が効く位置)
 * に subToolbarSlot を配置できる。
 */
export interface RenderEditorProps {
  /** Backend.load() で取得した state */
  state: EditorState;

  /** 描画用の framework / theme variant */
  cssFramework: CssFramework;
  themeVariant: ThemeId;

  /** 編集セッション (#683) 由来 — readonly 表示分岐 / readonly overlay 表示判断 */
  isReadonly: boolean;

  /** Designer.tsx が組み立てる subToolbar 要素。
   * GrapesJS Backend は <WithEditor> 内に注入し useEditor() が effective になる位置に置く。
   * Puck Backend は通常 DOM 配置 (Puck では useEditor() context 不要)。 */
  subToolbarSlot: ReactNode;

  /** Designer.tsx が組み立てる共通ダイアログ群 (EditModeToolbar / Discard / Force / Resume / etc) */
  dialogsSlot: ReactNode;

  /** GrapesJS の左 BlocksPanel 表示モード (Puck Backend は無視) */
  panelMode: PanelMode;
  onTogglePin: () => void;
  onClosePanel: () => void;

  /** 編集対象 screenId (RightPanel 等で利用) */
  screenId: string;

  /** readonly overlay の「編集開始」ボタン用 */
  onStartEditing: () => void;

  /** 編集中変更通知 — Backend は user 編集を検出したら呼ぶ */
  onChange?: (newState: EditorState) => void;

  /** Backend init 完了通知 — editor 由来の API を上位に expose する */
  onReady?: (api: EditorApi) => void;

  // ---------------------------------------------------------------------
  // GrapesJS 固有 callback (Puck Backend は無視) — #815 PR-C
  //   両 Backend で型安全に渡せるよう RenderEditorProps の optional プロパティとして
  //   定義する。as キャストで型チェックをバイパスする実装は禁止。
  // ---------------------------------------------------------------------

  /** discard / serverChange reload 時に呼ばれる payload 再取得 (Backend.load を内包する関数を Designer.tsx が provide) */
  reloadPayload?: () => Promise<unknown>;

  /** 他タブ / 別クライアントから screenChanged broadcast を受信した通知 */
  onServerChanged?: () => void;

  /** mcpBridge 接続状態の変化通知 */
  onMcpStatusChange?: (status: import("../mcp/mcpBridge").McpStatus) => void;

  /** mcpBridge.setThemeHandler 経由で外部から theme 変更要求が来たときの通知 (AI rename 等) */
  onExternalThemeChange?: (themeId: ThemeId) => void;
}

/**
 * エディタ Backend の共通 interface。
 *
 * 各 Backend は次の 3 操作を提供する:
 *   - load:         screen payload を読み込み EditorState を返す
 *   - save:         EditorState を draft 経由で書き込む
 *   - renderEditor: ReactNode を返す (Designer.tsx は editorKind に応じて
 *                   この戻り値を render するだけ)
 *
 * #815 (interface 真の等価性) で renderEditor() の return type を Disposable から
 * ReactNode に変更。両 Backend (GrapesJS / Puck) が React 製であるため、
 * createRoot を Backend 内部で扱う必要がなくなり、cleanup も React の useEffect
 * cleanup が自然に担う。
 */
export interface EditorBackend {
  /**
   * screen の payload を読み込み editor state を返す。
   * draftRead は draft-state 経由の読込み (#683)。
   */
  load(screenId: string, draftRead: () => Promise<unknown>): Promise<EditorState>;

  /**
   * editor state を save。
   * draftWrite は draft-state 経由の書込み (#683)。
   * 本体ファイルへの昇格 (commitDraft) は呼び出し側 = lock/draft 経路が担う。
   */
  save(
    screenId: string,
    state: EditorState,
    draftWrite: (payload: unknown) => Promise<void>,
  ): Promise<void>;

  /**
   * エディタペイン全体 (周辺 UI を含む) を ReactNode として返す。
   * Designer.tsx は editorKind に応じて Backend を選び、`{backend.renderEditor(props)}`
   * を render するだけになる。
   */
  renderEditor(props: RenderEditorProps): ReactNode;
}

// -----------------------------------------------------------------------
// re-export: 利用側が EditorBackend.ts だけ import すれば揃うよう型を再公開
// -----------------------------------------------------------------------
export type { ReactNode };
