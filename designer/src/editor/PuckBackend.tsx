/* eslint-disable react-refresh/only-export-components */
/**
 * PuckBackend — EditorBackend の Puck 実装。
 *
 * 子 3 の HeadingBlock 単体 Config を廃止し、子 4 で実装した全 primitive
 * (20 個) を buildPuckConfig() 経由で組み込む。
 *
 * CssFrameworkContext.Provider で Puck コンポーネントツリーを wrap することで、
 * 各 primitive の render 関数が useCssFramework() で cssFramework を参照できる。
 *
 * 詳細仕様: docs/spec/multi-editor-puck.md § 3 / § 4.2 / § 4.3
 *
 * #806 子 4
 */

import React from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { Puck } from "@measured/puck";
import type { Data } from "@measured/puck";
import "@measured/puck/puck.css";

import type {
  EditorBackend,
  EditorState,
  RenderOpts,
  Disposable,
} from "./EditorBackend";
import { CssFrameworkProvider } from "../puck/CssFrameworkContext";
import { buildPuckConfig } from "../puck/buildConfig";

// -----------------------------------------------------------------------
// 空の Puck Data (新規画面のデフォルト)
// -----------------------------------------------------------------------

/** 空の Puck Data (新規画面のデフォルト)。 */
const EMPTY_PUCK_DATA: Data = {
  root: { props: {} },
  content: [],
};

/** unknown を Puck Data に安全にキャストする。失敗したら EMPTY_PUCK_DATA を返す。 */
function toPuckData(payload: unknown): Data {
  if (
    payload !== null &&
    typeof payload === "object" &&
    "root" in payload &&
    "content" in payload
  ) {
    return payload as Data;
  }
  return EMPTY_PUCK_DATA;
}

// -----------------------------------------------------------------------
// PuckEditorWrapper (React コンポーネント)
// -----------------------------------------------------------------------

interface PuckEditorWrapperProps {
  initialData: Data;
  cssFramework: "bootstrap" | "tailwind";
  onChange?: (state: EditorState) => void;
}

function PuckEditorWrapper({
  initialData,
  cssFramework,
  onChange,
}: PuckEditorWrapperProps) {
  // buildPuckConfig は cssFramework 非依存 (全 primitive を含む)。
  // cssFramework は CssFrameworkContext 経由で各 primitive の render に伝わる。
  const config = React.useMemo(() => buildPuckConfig(), []);

  const handleChange = React.useCallback(
    (data: Data) => {
      if (onChange) {
        onChange({ payload: data });
      }
    },
    [onChange],
  );

  return (
    // CssFrameworkProvider で Puck ツリー全体を wrap。
    // 各 primitive の render は useCssFramework() でここの値を参照する。
    <CssFrameworkProvider value={cssFramework}>
      <Puck
        config={config}
        data={initialData}
        onChange={handleChange}
        // ヘッダーのデフォルト "Publish" ボタンは PuckBackend では使わない。
        // 明示保存式 (#683) なので onPublish は no-op。
        onPublish={() => {
          // no-op: 明示保存は Designer.tsx の handleSave 経由
        }}
      />
    </CssFrameworkProvider>
  );
}

// -----------------------------------------------------------------------
// PuckBackend 実装
// -----------------------------------------------------------------------

/**
 * PuckBackend — @measured/puck を container DOM にマウントする EditorBackend 実装。
 *
 * ライフサイクル:
 *   1. load()         — draftRead で Puck Data を取得 (無ければ empty data)
 *   2. renderEditor() — container に React ツリーをマウント
 *   3. save()         — Puck Data を draftWrite に渡す
 *   4. dispose()      — React ルートを unmount してクリーンアップ
 */
export class PuckBackend implements EditorBackend {
  /**
   * screen の payload を読み込み EditorState を返す。
   * payload が空なら EMPTY_PUCK_DATA を使用する。
   */
  async load(
    _screenId: string,
    draftRead: () => Promise<unknown>,
  ): Promise<EditorState> {
    let payload: unknown = null;
    try {
      payload = await draftRead();
    } catch {
      // draft が存在しない場合は空 Puck Data を使用する
    }

    const puckData = toPuckData(payload);
    return { payload: puckData };
  }

  /**
   * editor state を save。
   * Puck Data を payload としてそのまま draftWrite に渡す。
   */
  async save(
    _screenId: string,
    state: EditorState,
    draftWrite: (payload: unknown) => Promise<void>,
  ): Promise<void> {
    await draftWrite(state.payload);
  }

  /**
   * container DOM に Puck エディタをマウントする。
   * React の createRoot を使用して PuckEditorWrapper をレンダリングする。
   * CssFrameworkProvider により cssFramework が全 primitive に伝達される。
   *
   * @returns Disposable — dispose() で React ルートを unmount する
   */
  renderEditor(
    container: HTMLElement,
    state: EditorState,
    opts: RenderOpts,
  ): Disposable {
    const puckData = toPuckData(state.payload);
    let root: Root | null = createRoot(container);

    root.render(
      <PuckEditorWrapper
        initialData={puckData}
        cssFramework={opts.cssFramework}
        onChange={opts.onChange}
      />,
    );

    return {
      dispose() {
        if (root) {
          root.unmount();
          root = null;
        }
      },
    };
  }
}
