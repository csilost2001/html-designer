/* eslint-disable react-refresh/only-export-components */
/**
 * PuckBackend — EditorBackend の Puck 実装 (雛形)。
 *
 * 本 task (子 3) では動作確認用の HeadingBlock 1 つだけを持つ最小構成。
 * 共通レイアウト props システム (§ 2.6) と Puck primitive 15-20 個は子 4 で実装する。
 *
 * cssFramework に応じたクラス名切り替えは子 4 で layoutPropsMapping に置き換える。
 * ここでは仮実装として直接 switch する。
 *
 * 詳細仕様: docs/spec/multi-editor-puck.md § 3 / § 2.4
 *
 * #806 子 3
 */

import React from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { Puck } from "@measured/puck";
import type { Config, Data } from "@measured/puck";
import "@measured/puck/puck.css";

import type {
  EditorBackend,
  EditorState,
  RenderOpts,
  Disposable,
} from "./EditorBackend";

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
// Puck Config の型 (HeadingBlock 用)
// -----------------------------------------------------------------------

/** HeadingBlock のプロップ定義。 */
type HeadingBlockConfig = Config<{ HeadingBlock: { text: string } }>;

/**
 * HeadingBlock コンポーネント設定ファクトリ。
 * cssFramework に応じて適切なクラス名を使用する。
 *
 * 子 4 で layoutPropsMapping に置き換える前提の仮実装。
 * Tailwind JIT 対応のため完全クラス名を static に列挙する (§ 11.1)。
 */
function buildConfig(cssFramework: "bootstrap" | "tailwind"): HeadingBlockConfig {
  const headingClass = cssFramework === "tailwind" ? "text-2xl font-bold" : "h2";

  return {
    components: {
      HeadingBlock: {
        label: "見出し",
        fields: {
          text: {
            type: "text" as const,
            label: "見出しテキスト",
          },
        },
        defaultProps: {
          text: "見出しテキスト",
        },
        render: ({ text }) => (
          <h2 className={headingClass}>{text}</h2>
        ),
      },
    },
  };
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
  const config = React.useMemo(
    () => buildConfig(cssFramework),
    [cssFramework],
  );

  const handleChange = React.useCallback(
    (data: Data) => {
      if (onChange) {
        onChange({ payload: data });
      }
    },
    [onChange],
  );

  return (
    <Puck
      config={config}
      data={initialData}
      onChange={handleChange}
      // ヘッダーのデフォルト "Publish" ボタンは PuckBackend では使わない。
      // 明示保存式 (#683) なので onPublish は不要。
      onPublish={() => {
        // no-op: 明示保存は Designer.tsx の handleSave 経由
      }}
    />
  );
}

// -----------------------------------------------------------------------
// PuckBackend 実装
// -----------------------------------------------------------------------

/**
 * PuckBackend — @measured/puck を container DOM にマウントする EditorBackend 実装。
 *
 * ライフサイクル:
 *   1. load()        — draftRead で Puck Data を取得 (無ければ empty data)
 *   2. renderEditor() — container に React ツリーをマウント
 *   3. save()        — Puck Data を draftWrite に渡す
 *   4. dispose()     — React ルートを unmount してクリーンアップ
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
