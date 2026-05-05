/**
 * EditorBackend — エディタ実装を抽象化する薄い境界 interface。
 *
 * 実装: GrapesJSBackend / PuckBackend の 2 つ。
 * 後発エディタ追加時はこの interface を実装するだけ。
 *
 * 詳細仕様: docs/spec/multi-editor-puck.md § 3
 *
 * #806 子 3
 */

import type { ReactNode } from "react";

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
 * Backend.renderEditor() に渡す描画オプション。
 */
export interface RenderOpts {
  cssFramework: "bootstrap" | "tailwind";
  themeVariant: string; // standard / card / compact / dark 等
  onChange?: (state: EditorState) => void;
}

/**
 * cleanup 用 disposable。renderEditor() が返す。
 * dispose() を呼ぶとエディタの DOM マウントおよびイベントリスナーが解放される。
 */
export interface Disposable {
  dispose(): void;
}

/**
 * エディタ Backend の共通 interface。
 *
 * 各 Backend は次の 3 操作を提供する:
 *   - load:         screen payload を読み込み EditorState を返す
 *   - save:         EditorState を draft 経由で書き込む
 *   - renderEditor: container DOM にエディタをマウントし Disposable を返す
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
   * container DOM にエディタをマウント。
   * Disposable を返す — cleanup 時に dispose() を呼ぶこと。
   *
   * Puck Backend は React コンポーネントを renderRoot を通じて container にマウントする。
   * GrapesJS Backend は GjsEditor の DOM 操作として初期化する。
   */
  renderEditor(
    container: HTMLElement,
    state: EditorState,
    opts: RenderOpts,
  ): Disposable;
}

// -----------------------------------------------------------------------
// re-export: 利用側が EditorBackend.ts だけ import すれば揃うよう型を再公開
// -----------------------------------------------------------------------
export type { ReactNode };
