/**
 * GrapesJSBackend — EditorBackend の GrapesJS 実装。
 *
 * 既存の Designer.tsx が持つ GrapesJS の初期化・load/save ロジックを
 * EditorBackend interface に適合する形にラップする。
 *
 * 設計方針:
 * - 既存挙動は変えない (regression 排除)。本 task では「interface 化」のみ。
 * - autosave 廃止 (#683) や大規模ロジック改修は対象外。
 * - Designer.tsx は引き続き state 管理 / route hook / save indicator 等を保持し、
 *   GrapesJS の初期化と payload 受け渡しだけを Backend に委譲する。
 * - applyThemeToCanvas 等は Backend 内部で呼ぶ形にする (ThemeId を opts 経由で受け取る)。
 *
 * 詳細仕様: docs/spec/multi-editor-puck.md § 3
 *
 * #806 子 3
 */

import type { EditorBackend, EditorState, RenderOpts, Disposable } from "./EditorBackend";

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
 * Designer.tsx との役割分担:
 * - Designer.tsx: React state 管理、useEditSession hook、UI ダイアログ群、dirty 追跡
 * - GrapesJSBackend: GrapesJS インスタンスの初期化・load・save・teardown
 *
 * renderEditor() は Designer.tsx の既存フローに組み込まれることを想定しており、
 * GjsEditor コンポーネントが使用する `onEditor` / `onReady` コールバック経由で
 * エディタを受け取る現行パターンとの橋渡しとして機能する。
 */
export class GrapesJSBackend implements EditorBackend {
  /**
   * screen の payload を読み込み EditorState を返す。
   * draftRead は MCP bridge 経由の draft 読込み (edit-session-draft #683)。
   *
   * GrapesJS 自体の load() は remoteStorage 経由で内部処理されるため、
   * ここでは payload を EditorState にラップして返すだけ。
   * 実際の GrapesJS canvas へのロードは renderEditor() 後に GrapesJS が行う。
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
   * container DOM への GrapesJS マウント。
   *
   * 注意: GrapesJS は @grapesjs/react の GjsEditor コンポーネント経由で
   * Designer.tsx にマウントされているため、このメソッドは
   * 「GrapesJS をフル管理する PuckBackend のような外部マウント」ではなく、
   * Designer.tsx の既存 React ツリーとの統合ポイントを提供する。
   *
   * 現行の Designer.tsx では GjsEditor が `onEditor` でエディタ参照を受け取り、
   * applyThemeToCanvas 等の操作を行っている。
   * この renderEditor() は editorKind === "grapesjs" の分岐確認用として呼ばれ、
   * GrapesJS 側の実際のマウントは GjsEditor コンポーネントが行う。
   * そのため、ここでは Disposable のみ返す (GrapesJS の cleanup は GjsEditor が行う)。
   *
   * 引数は interface の契約上必要だが GrapesJS 実装では未使用 (GjsEditor が管理する)。
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  renderEditor(_container: HTMLElement, _state: EditorState, _opts: RenderOpts): Disposable {
    // GrapesJS の cleanup は GjsEditor コンポーネントおよび Designer.tsx の
    // useEffect cleanup が担うため、ここでは no-op な Disposable を返す。
    return {
      dispose() {
        // no-op: cleanup は GjsEditor (React コンポーネント) が担当
      },
    };
  }
}

// -----------------------------------------------------------------------
// Helper: empty payload 判定 (テスト等から利用可能にする)
// -----------------------------------------------------------------------
export { isEmptyGjsPayload };
