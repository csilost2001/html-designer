/**
 * GrapesJSBackend — EditorBackend の GrapesJS 実装。
 *
 * 設計方針:
 * - 既存の Designer.tsx の GrapesJS 初期化・load/save ロジックを EditorBackend interface に
 *   適合する形にラップする。
 * - autosave 廃止 (#683) は完了済。明示保存式は Designer.tsx 側で commitDraft 経路を維持。
 * - PR-A 段階 (#815): renderEditor() は本実装ではなく placeholder (#806 で残されていた no-op
 *   実装の interface 追従のみ)。実体は PR-B で <GjsEditor> + Canvas + BlocksPanel + RightPanel
 *   をラップした完全なエディタペインに移植する。Designer.tsx の GrapesJS 経路は当面
 *   <GjsEditor> 直接マウントを継続する。
 *
 * 詳細仕様: docs/spec/multi-editor-puck.md § 3
 *
 * #806 子 3 / #815 (interface 真の等価性、段階的 refactor 中)
 */

import type {
  EditorBackend,
  EditorState,
  RenderEditorProps,
  ReactNode,
} from "./EditorBackend";

/**
 * GrapesJS の getProjectData() が返すプロジェクトデータの最小型。
 * GrapesJS の型定義が `any` 寄りなため、ここで便宜的に定義する。
 */
interface GjsProjectData {
  pages?: unknown[];
  styles?: unknown[];
  [key: string]: unknown;
}

/**
 * GrapesJS が empty な payload かどうかを判定する。
 * null / undefined / pages が空配列 / pages[0].frames が空の場合は empty とみなす。
 */
function isEmptyGjsPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return true;
  const data = payload as GjsProjectData;
  if (!data.pages || !Array.isArray(data.pages) || data.pages.length === 0) return true;
  return false;
}

/**
 * GrapesJSBackend — GrapesJS エディタの load / save / renderEditor を提供する。
 *
 * Designer.tsx との役割分担 (PR-A 段階):
 * - Designer.tsx: <GjsEditor> マウント、React state 管理、useEditSession hook、UI ダイアログ群、
 *   dirty 追跡、theme apply、サムネイル生成、cross-tab broadcast 受信
 * - GrapesJSBackend: load / save の draft 経由 wrapper のみ (renderEditor は PR-B で実装)
 */
export class GrapesJSBackend implements EditorBackend {
  /**
   * screen の payload を読み込み EditorState を返す。
   * draftRead は MCP bridge 経由の draft 読込み (edit-session-draft #683)。
   *
   * GrapesJS 自体の load() は registerRemoteStorage 経由で内部処理されるため、
   * ここでは payload を EditorState にラップして返すだけ (PR-A 段階)。
   * PR-C で registerRemoteStorage を撤去し、明示 load (editor.loadProjectData) に切り替える。
   */
  async load(screenId: string, draftRead: () => Promise<unknown>): Promise<EditorState> {
    let payload: unknown = null;
    try {
      payload = await draftRead();
    } catch {
      // draft が存在しない場合は null のまま (GrapesJS が autoload で本体ファイルを読む)
    }
    return { payload, ui: { screenId } };
  }

  /**
   * editor state を save。
   * GrapesJS の getProjectData() を payload として draftWrite に渡す。
   * 本体ファイルへの昇格 (commitDraft + releaseLock) は Designer.tsx が担う。
   */
  async save(
    _screenId: string,
    state: EditorState,
    draftWrite: (payload: unknown) => Promise<void>,
  ): Promise<void> {
    await draftWrite(state.payload);
  }

  /**
   * エディタペイン全体を ReactNode として返す。
   *
   * PR-A 段階の placeholder: 現状は null を返し、Designer.tsx は editorKind === "grapesjs"
   * の時に従来どおり <GjsEditor> を直接マウントする。
   *
   * PR-B で <GjsEditor> + Canvas + BlocksPanel + RightPanel をラップした完全実装に置換する。
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  renderEditor(_props: RenderEditorProps): ReactNode {
    // PR-B で本実装に置換する (現状は Designer.tsx 側が <GjsEditor> を render する)
    return null;
  }
}

// -----------------------------------------------------------------------
// Helper: empty payload 判定 (テスト等から利用可能にする)
// -----------------------------------------------------------------------
export { isEmptyGjsPayload };
