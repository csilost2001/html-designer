import { useState, useCallback, useEffect, useRef } from "react";
import type { Editor as GEditor } from "grapesjs";
import html2canvas from "html2canvas";
import GjsEditor, {
  Canvas,
  BlocksProvider,
  WithEditor,
} from "@grapesjs/react";
import grapesjs from "grapesjs";
import "grapesjs/dist/css/grapes.min.css";

import { registerBlocks } from "../grapes/blocks";
import { registerValidationTraits } from "../grapes/validationTraits";
import { attachDataItemIdAutoAssign } from "../grapes/dataItemId";
import { attachScreenItemsSync, reconcileScreenItems } from "../grapes/screenItemsSync";
import { registerRemoteStorage, saveScreenToFile, hasScreenDraft, clearScreenDraft } from "../grapes/remoteStorage";
import { acknowledgeServerMtime, hasServerBeenUpdated } from "../utils/serverMtime";
import { DesignSubToolbar } from "./design/DesignSubToolbar";
import { BlocksPanel } from "./BlocksPanel";
import { RightPanel } from "./RightPanel";
import { ServerChangeBanner } from "./common/ServerChangeBanner";
import { useErrorDialog } from "./common/ErrorDialogProvider";
import { mcpBridge, type McpStatus } from "../mcp/mcpBridge";
import { loadCustomBlocks, injectCustomBlockCss } from "../store/customBlockStore";
import { loadProject, updateScreenThumbnail } from "../store/flowStore";
import { makeTabId, setDirty } from "../store/tabStore";
import { clearItemsFromCache } from "../store/screenItemsStore";

/**
 * editor.getComponents() は GrapesJS が load() 中の Frame.onRemove 経由で一時的に
 * 内部参照を undefined にするタイミングがあり、そこで `.length` を呼ぶと落ちる (#131)。
 * 取得失敗時は 0 として扱い、listener 側がクラッシュしないようにする。
 */
function safeComponentsLength(editor: GEditor): number {
  try {
    const comps = editor.getComponents?.();
    return comps?.length ?? 0;
  } catch {
    return 0;
  }
}

/** キャンバスの縮小サムネイルを生成して data URL で返す */
async function captureThumbnail(editor: GEditor): Promise<string | null> {
  try {
    const canvasDoc = editor.Canvas.getDocument();
    if (!canvasDoc?.body) return null;
    const canvasEl = await html2canvas(canvasDoc.body, {
      backgroundColor: "#ffffff",
      scale: 0.5,
      logging: false,
      useCORS: true,
      allowTaint: true,
    });
    // 最大幅 320px にリサイズ
    const maxWidth = 320;
    if (canvasEl.width <= maxWidth) {
      return canvasEl.toDataURL("image/jpeg", 0.6);
    }
    const scale = maxWidth / canvasEl.width;
    const resized = document.createElement("canvas");
    resized.width = maxWidth;
    resized.height = Math.round(canvasEl.height * scale);
    resized.getContext("2d")?.drawImage(canvasEl, 0, 0, resized.width, resized.height);
    return resized.toDataURL("image/jpeg", 0.6);
  } catch {
    return null;
  }
}

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

function buildGjsOptions(_screenId: string) {
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
    deviceManager: {
      default: "desktop",
      devices: [
        { id: "desktop",     name: "PC",              width: ""      },
        { id: "tablet",      name: "タブレット",        width: "768px" },
        { id: "smartphone",  name: "スマートフォン",    width: "375px" },
      ],
    },
  };
}

export interface DesignerProps {
  screenId: string;
  screenName?: string;
  onBack?: () => void;
  isActive?: boolean;
}

export function Designer({ screenId, screenName, onBack, isActive }: DesignerProps) {
  const gjsOptions = buildGjsOptions(screenId);
  const [ready, setReady] = useState(false);
  const [canvasEmpty, setCanvasEmpty] = useState(true);
  const [isDirty, setIsDirtyState] = useState(() => hasScreenDraft(screenId));
  const [isSaving, setIsSaving] = useState(false);
  const [serverChanged, setServerChanged] = useState(false);
  const isDirtyRef = useRef(false);
  // 初期ロード中および handleReset 中の component:* イベントは「ユーザー編集」ではないので
  // markDirty を抑制する。初期ロードも同様に抑制するため、初期値を true にし onReady で解除する。
  const isInternalLoadRef = useRef(true);
  // マウント時点での draft 有無を記憶する。onReady で「autosave が初期ロード中に勝手に立てた
  // draftKey」だけを取り除き、ユーザーが前セッションで未保存のまま残した正当な draft は保護するため。
  const hadInitialDraftRef = useRef(hasScreenDraft(screenId));
  const [activeTheme, setActiveThemeState] = useState<ThemeId>(
    () => (localStorage.getItem(THEME_KEY) as ThemeId | null) ?? "standard"
  );
  const [mcpStatus, setMcpStatus] = useState<McpStatus>("disconnected");
  const tabId = makeTabId("design", screenId);

  const [panelMode, setPanelModeState] = useState<PanelMode>(() => {
    const saved = localStorage.getItem(PANEL_MODE_KEY) as PanelMode | null;
    return saved ?? "pinned";
  });
  const [prevMode, setPrevMode] = useState<"pinned" | "autohide">("pinned");
  const { showError } = useErrorDialog();

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
    registerValidationTraits(editor);
    (window as unknown as { editor?: GEditor }).editor = editor;

    // カスタムブロック復元（非同期で読み込んで GrapesJS に登録）
    loadCustomBlocks().then((customBlocks) => {
      for (const cb of customBlocks) {
        editor.BlockManager.add(cb.id, {
          label: cb.label,
          category: cb.category,
          content: cb.content,
          ...(cb.shared ? { shared: true } : {}),
          ...(cb.media ? { media: cb.media } : {}),
        } as Parameters<typeof editor.BlockManager.add>[1]);
      }
    }).catch(console.error);

    editor.on("block:drag:start", () => {
      document.body.setAttribute("data-gjs-dragging", "1");
    });
    editor.on("block:drag:stop", () => {
      document.body.removeAttribute("data-gjs-dragging");
    });

    // 変更検知: component 操作または style 変更でdirtyフラグを立てる
    const markDirty = () => {
      if (isInternalLoadRef.current) return;
      setIsDirtyState(true);
      isDirtyRef.current = true;
      setDirty(tabId, true);
    };
    editor.on("component:add component:remove component:update style:change", markDirty);

    // #322: input/select/textarea ブロック drop 時に data-item-id を自動発番
    const unsubDataItemId = attachDataItemIdAutoAssign(editor);

    // #358: canvas ↔ screen-items 双方向同期 (data-item-id 発番の後に登録)
    const unsubScreenItemsSync = attachScreenItemsSync(editor, screenId, isInternalLoadRef);

    // MCPブリッジ起動
    const unsubscribe = mcpBridge.onStatusChange(setMcpStatus);
    mcpBridge.setThemeHandler((themeId) =>
      handleThemeChangeRef.current(themeId as ThemeId)
    );
    mcpBridge.setCurrentScreenId(screenId);
    mcpBridge.start(editor);

    // 他タブ/クライアントで同じ画面が変更されたとき (broadcast: screenChanged)。
    // - dirty 中: ServerChangeBanner を表示してユーザー判断に委ねる
    // - clean: editor.load() で即時リロード
    //
    // 設計差異 (#576): `useResourceEditor` を使う他の editor (TableEditor / ProcessFlowEditor 等) は
    // 上記の broadcast 受信に加えて、MCP 再接続時 (`onStatusChange("connected")`) にも clean なら
    // 自動 reload する。Designer はこれを意図的に行わない:
    //   - GrapesJS は canvas DOM / undo stack / 選択中コンポーネント / scroll 位置 / 適用中テーマ等の
    //     内部 state を多く保持しており、`editor.load()` 1 回で全てが silently swap される
    //   - 再接続イベント自体ではサーバ側に変更が起きたとは限らず、無条件 reload は UX 上の不連続が大きい
    //   - 「他クライアントによる明示的な変更通知 (broadcast)」だけを clean 時の即時反映トリガにする
    //   - 再接続時にサーバ側で実際に変更があった場合は、初回マウント後の `useEffect` で
    //     `hasServerBeenUpdated` を呼んで ServerChangeBanner を立てるため、ユーザー判断のチャンスは保たれる
    const unsubScreenChanged = mcpBridge.onBroadcast("screenChanged", (data) => {
      const d = data as { screenId?: string; deleted?: boolean };
      if (d.screenId !== screenId || d.deleted) return;
      if (isDirtyRef.current) {
        setServerChanged(true);
      } else {
        console.log("[Designer] screenChanged broadcast, reloading...");
        editor.load().catch(console.error);
      }
    });

    return () => {
      editor.off("component:add component:remove component:update style:change", markDirty);
      unsubDataItemId();
      unsubScreenItemsSync();
      unsubscribe();
      unsubScreenChanged();
      mcpBridge.setThemeHandler(null);
      mcpBridge.setCurrentScreenId(null);
      mcpBridge.stop();
      clearItemsFromCache(screenId);
    };
  }, [screenId, tabId]);

  const onReady = useCallback(async () => {
    setReady(true);
    // マウント時点で draft が無かった場合、初期ロード中の autosave が立てた draftKey は
    // 偽陽性なので解除する。draft があった場合は正当な未保存編集なので維持する。
    if (!hadInitialDraftRef.current) {
      clearScreenDraft(screenId);
      setIsDirtyState(false);
      isDirtyRef.current = false;
      setDirty(tabId, false);
    }
    // GrapesJS が component:add を遅延発火するケース（ensureValidProject による
    // 最小 pages 補正で空データからでも load() 後に 1 回発火する）に備え、
    // 次のマクロタスクでガードを下げる (#131)。
    // #358: ガード解除と同タイミングで canvas ↔ screen-items の初回突合を行う。
    setTimeout(() => {
      isInternalLoadRef.current = false;
      if (editorRef.current) reconcileScreenItems(editorRef.current, screenId);
    }, 0);
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
  }, [activeTheme, screenId, tabId]);

  // タブがアクティブになったときにキャンバスをリフレッシュ（display:none から復帰）
  useEffect(() => {
    if (isActive && editorRef.current) {
      editorRef.current.refresh();
    }
  }, [isActive]);

  // 保存後にサムネイルを撮影してフローノードに反映
  useEffect(() => {
    if (!ready || !editorRef.current) return;
    const editor = editorRef.current;

    const onStoreEnd = () => {
      // 空のキャンバスはスキップ
      if (safeComponentsLength(editor) === 0) return;
      captureThumbnail(editor).then(async (thumbnail) => {
        if (!thumbnail) return;
        try {
          const project = await loadProject();
          await updateScreenThumbnail(project, screenId, thumbnail);
        } catch {
          // サムネイル保存失敗は無視
        }
      });
    };

    editor.on("storage:end:store", onStoreEnd);
    return () => {
      editor.off("storage:end:store", onStoreEnd);
    };
  }, [ready, screenId]);

  // キャンバスの空状態を追跡
  useEffect(() => {
    if (!ready || !editorRef.current) return;
    const editor = editorRef.current;
    const check = () => setCanvasEmpty(safeComponentsLength(editor) === 0);
    check();
    editor.on("component:add", check);
    editor.on("component:remove", check);
    return () => {
      editor.off("component:add", check);
      editor.off("component:remove", check);
    };
  }, [ready]);

  const handleSaveToFile = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      // GrapesJS の最新状態を localStorage に書き出してからファイル保存
      if (editorRef.current) await editorRef.current.store();
      await saveScreenToFile(screenId);
      setIsDirtyState(false);
      isDirtyRef.current = false;
      setDirty(tabId, false);
      setServerChanged(false);
      await acknowledgeServerMtime("screen", screenId);
    } catch (e) {
      console.error("[Designer] saveToFile failed:", e);
      showError({
        title: "画面の保存に失敗しました",
        error: e,
        context: { screenId, tabId },
      });
    } finally {
      setIsSaving(false);
    }
  }, [screenId, tabId, isSaving, showError]);

  const handleReset = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;
    clearScreenDraft(screenId);
    isInternalLoadRef.current = true;
    try {
      await editor.load();
      // autosave が store() を呼んで draftKey を復元するケースを防ぐ
      clearScreenDraft(screenId);
      editor.UndoManager.clear();
      setIsDirtyState(false);
      isDirtyRef.current = false;
      setDirty(tabId, false);
      setServerChanged(false);
      await acknowledgeServerMtime("screen", screenId);
    } catch (e) {
      console.error("[Designer] reset failed:", e);
      showError({
        title: "リセットに失敗しました",
        error: e,
        context: { screenId, tabId },
      });
    } finally {
      // GrapesJS が component:add / autosave を遅延発火するケースに備えて
      // 次のマクロタスクでガードを下げる。遅延中に発火した markDirty も抑制したい。
      // リセット後も canvas ↔ screen-items の整合を保つため reconcile を実行する。
      setTimeout(() => {
        isInternalLoadRef.current = false;
        if (editorRef.current) reconcileScreenItems(editorRef.current, screenId);
      }, 0);
    }
  }, [screenId, tabId, showError]);

  // タブを開いた時点でサーバーに新しい変更がないか確認（初回ロード完了後）
  useEffect(() => {
    if (!ready) return;
    (async () => {
      if (hasScreenDraft(screenId)) {
        if (await hasServerBeenUpdated("screen", screenId)) {
          setServerChanged(true);
        }
      } else {
        await acknowledgeServerMtime("screen", screenId);
      }
    })();
  }, [ready, screenId]);

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
          <DesignSubToolbar
            panelMode={panelMode}
            onOpenPanel={openPanel}
            activeTheme={activeTheme}
            onThemeChange={handleThemeChange}
            mcpStatus={mcpStatus}
            isDirty={isDirty}
            isSaving={isSaving}
            onSaveToFile={handleSaveToFile}
            onReset={handleReset}
            backLink={onBack ? { label: screenName ?? "画面デザイン", onClick: onBack } : undefined}
            screenId={screenId}
          />
        </WithEditor>

        {serverChanged && (
          <ServerChangeBanner
            onReload={handleReset}
            onDismiss={() => setServerChanged(false)}
          />
        )}

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
            <RightPanel screenId={screenId} />
          </aside>
        </div>
      </div>
    </GjsEditor>
  );
}
