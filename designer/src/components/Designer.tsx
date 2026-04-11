import { useState, useCallback } from "react";
import type { Editor as GEditor } from "grapesjs";
import GjsEditor, {
  Canvas,
  BlocksProvider,
  StylesProvider,
  LayersProvider,
  TraitsProvider,
  SelectorsProvider,
  WithEditor,
} from "@grapesjs/react";
import grapesjs from "grapesjs";
import "grapesjs/dist/css/grapes.min.css";

import { registerBlocks } from "../grapes/blocks";
import { Topbar } from "./Topbar";
import { BlocksPanel } from "./BlocksPanel";
import { RightPanel } from "./RightPanel";

const STORAGE_KEY = "gjs-designer-project";

const gjsOptions = {
  height: "100%",
  width: "auto",
  storageManager: {
    type: "local",
    autosave: true,
    autoload: true,
    stepsBeforeSave: 1,
    options: {
      local: { key: STORAGE_KEY },
    },
  },
  undoManager: { trackSelection: false },
  canvas: {
    styles: [
      "https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css",
      "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css",
      // キャンバス内に共通CSSを注入
      new URL("../styles/common.css", import.meta.url).href,
    ],
    scripts: [
      "https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js",
    ],
  },
  // GrapesJSのデフォルトUIは使わずカスタムパネルでレンダリングするため
  // blockManager/styleManager等の appendTo は指定しない
  blockManager: { blocks: [] },
};

export function Designer() {
  const [ready, setReady] = useState(false);

  const onEditor = useCallback((editor: GEditor) => {
    registerBlocks(editor);
    // ドラッグ中の見た目を少し改善
    editor.on("component:selected", () => {
      /* no-op hook */
    });
    (window as unknown as { editor?: GEditor }).editor = editor;
  }, []);

  const onReady = useCallback(() => setReady(true), []);

  return (
    <GjsEditor
      className="designer-root"
      grapesjs={grapesjs}
      options={gjsOptions}
      onEditor={onEditor}
      onReady={onReady}
      waitReady={
        <div className="loading-screen">
          <div className="spinner" />
          <p>デザイナーを起動中...</p>
        </div>
      }
    >
      <div className="designer-layout">
        <WithEditor>
          <Topbar ready={ready} />
        </WithEditor>

        <div className="designer-body">
          <aside className="panel-left">
            <div className="panel-section-title">
              <i className="bi bi-grid-3x3-gap-fill" /> ブロック
            </div>
            <BlocksProvider>
              {(props) => <BlocksPanel {...props} />}
            </BlocksProvider>
          </aside>

          <main className="panel-canvas">
            <Canvas className="designer-canvas" />
          </main>

          <aside className="panel-right">
            <WithEditor>
              <RightPanel
                StylesProvider={StylesProvider}
                SelectorsProvider={SelectorsProvider}
                TraitsProvider={TraitsProvider}
                LayersProvider={LayersProvider}
              />
            </WithEditor>
          </aside>
        </div>
      </div>
    </GjsEditor>
  );
}
