import { useState, useCallback, useEffect, useRef } from "react";
import type { Editor as GEditor } from "grapesjs";
import GjsEditor, {
  Canvas,
  BlocksProvider,
  WithEditor,
} from "@grapesjs/react";
import grapesjs from "grapesjs";
import "grapesjs/dist/css/grapes.min.css";

import { registerBlocks } from "../grapes/blocks";
import { registerRemoteStorage } from "../grapes/remoteStorage";
import { Topbar } from "./Topbar";
import { BlocksPanel } from "./BlocksPanel";
import { RightPanel } from "./RightPanel";
import { mcpBridge, type McpStatus } from "../mcp/mcpBridge";
import { loadCustomBlocks, injectCustomBlockCss } from "../store/customBlockStore";

const PANEL_MODE_KEY = "designer-panel-left-mode";
const THEME_KEY = "designer-theme";

export type PanelMode = "pinned" | "autohide" | "hidden";
export type ThemeId = "standard" | "card" | "compact" | "dark";

const THEME_URLS: Record<ThemeId, string | null> = {
  standard: null,
  card: new URL("../styles/theme-card.css", import.meta.url).href,
  compact: new URL("../styles/theme-compact.css", import.meta.url).href,
  dark: new URL("../styles/theme-dark.css", import.meta.url).href,
};

function applyThemeToCanvas(editor: GEditor, themeId: ThemeId) {
  try {
    const canvasDoc = editor.Canvas.getDocument();
    if (!canvasDoc) return;
    const existing = canvasDoc.getElementById("dz-theme-override");
    if (existing) existing.remove();
    const url = THEME_URLS[themeId];
    if (url) {
      const link = canvasDoc.createElement("link");
      link.id = "dz-theme-override";
      link.rel = "stylesheet";
      link.href = url;
      canvasDoc.head.appendChild(link);
    }
  } catch {
    // canvas not ready
  }
}

function buildGjsOptions(screenId: string) {
  return {
    height: "100%",
    width: "auto",
    storageManager: {
      type: "remote",
      autosave: true,
      autoload: true,
      stepsBeforeSave: 1,
    },
    undoManager: { trackSelection: false },
    canvas: {
      styles: [
        "https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css",
        "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css",
        new URL("../styles/common.css", import.meta.url).href,
      ],
      scripts: [
        "https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js",
      ],
    },
    blockManager: { blocks: [] },
  };
}

export interface DesignerProps {
  screenId: string;
  screenName?: string;
  onBack?: () => void;
}

export function Designer({ screenId, screenName, onBack }: DesignerProps) {
  const gjsOptions = buildGjsOptions(screenId);
  const [ready, setReady] = useState(false);
  const [canvasEmpty, setCanvasEmpty] = useState(true);
  const [activeTheme, setActiveThemeState] = useState<ThemeId>(
    () => (localStorage.getItem(THEME_KEY) as ThemeId | null) ?? "standard"
  );
  const [mcpStatus, setMcpStatus] = useState<McpStatus>("disconnected");

  const [panelMode, setPanelModeState] = useState<PanelMode>(() => {
    const saved = localStorage.getItem(PANEL_MODE_KEY) as PanelMode | null;
    return saved ?? "pinned";
  });
  const [prevMode, setPrevMode] = useState<"pinned" | "autohide">("pinned");

  const setPanelMode = useCallback((mode: PanelMode) => {
    setPanelModeState((cur) => {
      if (cur !== "hidden") setPrevMode(cur as "pinned" | "autohide");
      return mode;
    });
    localStorage.setItem(PANEL_MODE_KEY, mode);
  }, []);

  const togglePin = useCallback(() => {
    setPanelMode(panelMode === "pinned" ? "autohide" : "pinned");
  }, [panelMode, setPanelMode]);

  const closePanel = useCallback(() => setPanelMode("hidden"), [setPanelMode]);
  const openPanel = useCallback(() => setPanelMode(prevMode), [prevMode, setPanelMode]);

  const editorRef = useRef<GEditor | null>(null);

  const handleThemeChange = useCallback((themeId: ThemeId) => {
    setActiveThemeState(themeId);
    localStorage.setItem(THEME_KEY, themeId);
    if (editorRef.current) {
      applyThemeToCanvas(editorRef.current, themeId);
    }
  }, []);

  const handleThemeChangeRef = useRef(handleThemeChange);
  useEffect(() => {
    handleThemeChangeRef.current = handleThemeChange;
  }, [handleThemeChange]);

  const onEditor = useCallback((editor: GEditor) => {
    editorRef.current = editor;

    // リモートストレージを登録（GrapesJS がロード前にセットアップ）
    registerRemoteStorage(editor, screenId);

    registerBlocks(editor);
    (window as unknown as { editor?: GEditor }).editor = editor;

    // カスタムブロック復元（非同期で読み込んで GrapesJS に登録）
    loadCustomBlocks().then((customBlocks) => {
      for (const cb of customBlocks) {
        editor.BlockManager.add(cb.id, {
          label: cb.label,
          category: cb.category,
          content: cb.content,
          ...(cb.media ? { media: cb.media } : {}),
        });
      }
    }).catch(console.error);

    editor.on("block:drag:start", () => {
      document.body.setAttribute("data-gjs-dragging", "1");
    });
    editor.on("block:drag:stop", () => {
      document.body.removeAttribute("data-gjs-dragging");
    });

    // MCPブリッジ起動
    const unsubscribe = mcpBridge.onStatusChange(setMcpStatus);
    mcpBridge.setThemeHandler((themeId) =>
      handleThemeChangeRef.current(themeId as ThemeId)
    );
    mcpBridge.start(editor);

    // 他タブで同じ画面が変更されたときにリロード
    const unsubScreenChanged = mcpBridge.onBroadcast("screenChanged", (data) => {
      const d = data as { screenId?: string; deleted?: boolean };
      if (d.screenId === screenId && !d.deleted) {
        console.log("[Designer] screenChanged broadcast, reloading...");
        editor.store().then(() => editor.load()).catch(console.error);
      }
    });

    return () => {
      unsubscribe();
      unsubScreenChanged();
      mcpBridge.setThemeHandler(null);
      mcpBridge.stop();
    };
  }, [screenId]);

  const onReady = useCallback(async () => {
    setReady(true);
    if (editorRef.current) {
      if (activeTheme !== "standard") {
        applyThemeToCanvas(editorRef.current, activeTheme);
      }
      // カスタムブロックの CSS をキャンバスに注入
      try {
        const customBlocks = await loadCustomBlocks();
        if (customBlocks.some((b) => b.styles)) {
          injectCustomBlockCss(editorRef.current, customBlocks);
        }
      } catch { /* ignore */ }
    }
  }, [activeTheme]);

  // キャンバスの空状態を追跡
  useEffect(() => {
    if (!ready || !editorRef.current) return;
    const editor = editorRef.current;
    const check = () => setCanvasEmpty(editor.getComponents().length === 0);
    check();
    editor.on("component:add", check);
    editor.on("component:remove", check);
    return () => {
      editor.off("component:add", check);
      editor.off("component:remove", check);
    };
  }, [ready]);

  // topbar-left の幅を panelMode に合わせて同期
  useEffect(() => {
    const root = document.documentElement;
    if (panelMode === "pinned") {
      root.style.setProperty("--topbar-left-w", "var(--panel-left-w)");
    } else {
      root.style.setProperty("--topbar-left-w", "160px");
    }
  }, [panelMode]);

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
          <Topbar
            ready={ready}
            panelMode={panelMode}
            onOpenPanel={openPanel}
            activeTheme={activeTheme}
            onThemeChange={handleThemeChange}
            mcpStatus={mcpStatus}
            backLink={onBack ? { label: screenName ?? "画面デザイン", onClick: onBack } : undefined}
          />
        </WithEditor>

        <div className="designer-body">
          <div className={`panel-left-wrapper is-${panelMode}`}>
            <aside className="panel-left">
              <div className="panel-section-title">
                <span className="title-text">
                  <i className="bi bi-grid-3x3-gap-fill" /> ブロック
                </span>
                <div className="panel-ctrl-btns">
                  <button
                    className={`panel-ctrl-btn${panelMode === "pinned" ? " pin-active" : ""}`}
                    onClick={togglePin}
                    title={panelMode === "pinned" ? "ピンを外す（ホバー表示に切替）" : "ピンで固定"}
                  >
                    <i className={`bi bi-pin${panelMode === "pinned" ? "-fill" : ""}`} />
                  </button>
                  <button
                    className="panel-ctrl-btn"
                    onClick={closePanel}
                    title="パネルを閉じる"
                  >
                    <i className="bi bi-x-lg" />
                  </button>
                </div>
              </div>
              <BlocksProvider>
                {(props) => <BlocksPanel {...props} />}
              </BlocksProvider>
            </aside>
          </div>

          <main className="panel-canvas">
            <Canvas className="designer-canvas" />
            {canvasEmpty && ready && (
              <div className="canvas-empty-hint">
                <i className="bi bi-grid-1x2" />
                <p>左のパネルからブロックをここにドラッグしてください</p>
              </div>
            )}
          </main>

          <aside className="panel-right">
            <RightPanel />
          </aside>
        </div>
      </div>
    </GjsEditor>
  );
}
