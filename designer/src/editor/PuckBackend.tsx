/* eslint-disable react-refresh/only-export-components */
/**
 * PuckBackend — EditorBackend の Puck 実装。
 *
 * 子 3 の HeadingBlock 単体 Config を廃止し、子 4 で実装した全 primitive
 * (20 個) を buildPuckConfig() 経由で組み込む。
 *
 * 子 5: 動的コンポーネント (customComponents) を buildPuckConfig() に渡し、
 * workspace 永続化のカスタムコンポーネントを Puck Config に反映する。
 * puckComponentsChanged broadcast event を購読し、コンポーネント変更時に Config 再構築。
 *
 * CssFrameworkContext.Provider で Puck コンポーネントツリーを wrap することで、
 * 各 primitive の render 関数が useCssFramework() で cssFramework を参照できる。
 *
 * 詳細仕様: docs/spec/multi-editor-puck.md § 3 / § 4.2 / § 4.3
 *
 * #806 子 4 / 子 5
 */

import React from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { Puck } from "@measured/puck";
import type { Data, Config } from "@measured/puck";
import "@measured/puck/puck.css";

import type {
  EditorBackend,
  EditorState,
  RenderOpts,
  Disposable,
} from "./EditorBackend";
import { CssFrameworkProvider } from "../puck/CssFrameworkContext";
import { buildPuckConfig } from "../puck/buildConfig";
import {
  loadCustomPuckComponents,
  type CustomPuckComponentDef,
} from "../store/puckComponentsStore";
import { RegisterComponentDialog } from "../components/puck/RegisterComponentDialog";
import { mcpBridge } from "../mcp/mcpBridge";

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
// buildPuckConfig with custom components (§ 4.2)
// -----------------------------------------------------------------------

/**
 * カスタムコンポーネント定義を Puck Config に動的追加する。
 * ビルトイン primitive の config をベースに、個別 propsSchema + 共通 LAYOUT_FIELDS をマージ。
 */
function buildConfigWithCustomComponents(customComponents: CustomPuckComponentDef[]): Config {
  const base = buildPuckConfig();

  if (customComponents.length === 0) return base;

  // カスタムコンポーネントを components に追加
  const extraComponents: Config["components"] = {};

  for (const def of customComponents) {
    // primitive に対応するビルトイン config を取得
    const primitiveKey = Object.keys(base.components).find(
      (k) => k.toLowerCase() === def.primitive.toLowerCase().replace(/-/g, ""),
    );
    const baseComponentConfig = primitiveKey ? base.components[primitiveKey] : undefined;

    // propsSchema から Puck fields を動的構築
    const customFields: Config["components"][string]["fields"] = {};
    for (const [fieldName, fieldDef] of Object.entries(def.propsSchema)) {
      if (fieldDef.type === "enum" && fieldDef.enum && fieldDef.enum.length > 0) {
        customFields[fieldName] = {
          type: "select" as const,
          label: fieldDef.label ?? fieldName,
          options: fieldDef.enum.map((opt) => ({ label: opt.label, value: opt.value })),
        };
      } else if (fieldDef.type === "boolean") {
        customFields[fieldName] = {
          type: "radio" as const,
          label: fieldDef.label ?? fieldName,
          options: [
            { label: "はい", value: "true" },
            { label: "いいえ", value: "false" },
          ],
        };
      } else {
        // string / number → text フィールド
        customFields[fieldName] = {
          type: "text" as const,
          label: fieldDef.label ?? fieldName,
        };
      }
    }

    // default props を構築
    const defaultProps: Record<string, unknown> = {};
    for (const [fieldName, fieldDef] of Object.entries(def.propsSchema)) {
      if (fieldDef.default !== undefined) {
        defaultProps[fieldName] = fieldDef.default;
      }
    }

    // ベース config があれば render / fields をマージ
    if (baseComponentConfig) {
      extraComponents[def.id] = {
        ...baseComponentConfig,
        label: `(カスタム) ${def.label}`,
        fields: {
          ...customFields,
          ...(baseComponentConfig.fields ?? {}),
        },
        defaultProps: {
          ...(baseComponentConfig.defaultProps ?? {}),
          ...defaultProps,
        },
      };
    } else {
      // ビルトイン primitive が見つからない場合は最小 config
      extraComponents[def.id] = {
        label: `(カスタム) ${def.label}`,
        fields: customFields,
        defaultProps,
        render: (props: Record<string, unknown>) => (
          <div data-custom-component={def.id} data-primitive={def.primitive}>
            {JSON.stringify(props)}
          </div>
        ),
      };
    }
  }

  return {
    ...base,
    components: {
      ...base.components,
      ...extraComponents,
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
  onCustomComponentsChange?: () => void;
}

function PuckEditorWrapper({
  initialData,
  cssFramework,
  onChange,
  onCustomComponentsChange,
}: PuckEditorWrapperProps) {
  const [customComponents, setCustomComponents] = React.useState<CustomPuckComponentDef[]>([]);
  const [showRegisterDialog, setShowRegisterDialog] = React.useState(false);

  // 初回 + puckComponentsChanged 受信時に カスタムコンポーネントを再ロード
  const reloadCustomComponents = React.useCallback(async () => {
    try {
      const loaded = await loadCustomPuckComponents();
      setCustomComponents(loaded);
    } catch (e) {
      console.warn("[PuckBackend] Failed to load custom puck components:", e);
    }
  }, []);

  React.useEffect(() => {
    void reloadCustomComponents();
  }, [reloadCustomComponents]);

  // buildPuckConfig は cssFramework 非依存 (全 primitive を含む)。
  // cssFramework は CssFrameworkContext 経由で各 primitive の render に伝わる。
  // カスタムコンポーネントが変わったら config を再構築。
  const config = React.useMemo(
    () => buildConfigWithCustomComponents(customComponents),
    [customComponents],
  );

  const handleChange = React.useCallback(
    (data: Data) => {
      if (onChange) {
        onChange({ payload: data });
      }
    },
    [onChange],
  );

  const handleComponentSaved = React.useCallback(() => {
    void reloadCustomComponents();
    onCustomComponentsChange?.();
  }, [reloadCustomComponents, onCustomComponentsChange]);

  return (
    // CssFrameworkProvider で Puck ツリー全体を wrap。
    // 各 primitive の render は useCssFramework() でここの値を参照する。
    <CssFrameworkProvider value={cssFramework}>
      {/* 新規コンポーネント登録ボタン (パレット上部相当) */}
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          zIndex: 100,
        }}
      >
        <button
          type="button"
          onClick={() => setShowRegisterDialog(true)}
          style={{
            padding: "6px 12px",
            background: "#0070f3",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          + 新規コンポーネント
        </button>
      </div>

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

      {showRegisterDialog && (
        <RegisterComponentDialog
          onClose={() => setShowRegisterDialog(false)}
          onSaved={handleComponentSaved}
        />
      )}
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
 *
 * 子 5: puckComponentsChanged broadcast event を購読して config を再構築する。
 * broadcast 購読は renderEditor() 内で行い、dispose() で解除する。
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

    // puckComponentsChanged broadcast 購読 (mcpBridge 経由)
    let unsubscribePuckComponentsChanged: (() => void) | null = null;

    // React コンポーネントに ref を渡して re-mount をトリガーする仕組み
    // puckComponentsChanged 時に key を変えて Puck を再マウントする
    let configKey = 0;

    // A-S-1: 現在の Puck data state を追跡する。
    // onChange callback で最新データを保持し、rerender 時に initialData として渡すことで
    // カスタムコンポーネント登録時 (puckComponentsChanged) に未保存の編集内容を保持する。
    let currentPuckData: Data = puckData;

    // A-S-1: onChange を wrap して currentPuckData を更新しながら opts.onChange を呼ぶ
    const wrappedOnChange = opts.onChange
      ? (editorState: EditorState) => {
          currentPuckData = toPuckData(editorState.payload);
          opts.onChange!(editorState);
        }
      : undefined;

    const rerender = () => {
      configKey++;
      if (root) {
        root.render(
          <PuckEditorWrapper
            key={configKey}
            initialData={currentPuckData}
            cssFramework={opts.cssFramework}
            onChange={wrappedOnChange}
          />,
        );
      }
    };

    // puckComponentsChanged 購読
    unsubscribePuckComponentsChanged = mcpBridge.onBroadcast(
      "puckComponentsChanged",
      () => { rerender(); },
    );

    root.render(
      <PuckEditorWrapper
        key={configKey}
        initialData={currentPuckData}
        cssFramework={opts.cssFramework}
        onChange={wrappedOnChange}
        onCustomComponentsChange={rerender}
      />,
    );

    return {
      dispose() {
        if (unsubscribePuckComponentsChanged) {
          unsubscribePuckComponentsChanged();
          unsubscribePuckComponentsChanged = null;
        }
        if (root) {
          root.unmount();
          root = null;
        }
      },
    };
  }
}
