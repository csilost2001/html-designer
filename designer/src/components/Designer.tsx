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
import { registerRemoteStorage } from "../grapes/remoteStorage";
import { checkLegacyLocalStorage, executeRescue, clearLegacyLocalStorage } from "../grapes/legacyLocalStorageRescue";
import { acknowledgeServerMtime } from "../utils/serverMtime";
import { DesignSubToolbar } from "./design/DesignSubToolbar";
import { BlocksPanel } from "./BlocksPanel";
import { RightPanel } from "./RightPanel";
import { ServerChangeBanner } from "./common/ServerChangeBanner";
import { useErrorDialog } from "./common/ErrorDialogProvider";
import { mcpBridge, type McpStatus } from "../mcp/mcpBridge";
import { loadCustomBlocks, injectCustomBlockCss } from "../store/customBlockStore";
import { loadProject, loadRawProject, updateScreenThumbnail } from "../store/flowStore";
import { loadScreenEntity } from "../store/screenStore";
import { makeTabId, setDirty } from "../store/tabStore";
import type { CssFramework } from "../types/v3/project";
import { resolveCssFramework } from "../utils/resolveCssFramework";
import { clearItemsFromCache } from "../store/screenItemsStore";
import { useEditSession } from "../hooks/useEditSession";
import { EditModeToolbar } from "./editing/EditModeToolbar";
import {
  DiscardConfirmDialog,
  ForceReleaseConfirmDialog,
  ForcedOutChoiceDialog,
  AfterForceUnlockChoiceDialog,
} from "./editing/ConfirmDialogs";
import { ResumeOrDiscardDialog } from "./editing/ResumeOrDiscardDialog";
import "../styles/editMode.css";

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

/**
 * CSS framework 軸 (#793 子 5)。
 * project.design.cssFramework に応じて canvas iframe に読み込む framework CSS。
 * - bootstrap: Bootstrap 5 + common.css (theme-bootstrap.css)
 * - tailwind: Tailwind utility-first @apply theme (theme-tailwind.css)
 */
const FRAMEWORK_URLS: Record<CssFramework, string> = {
  bootstrap: new URL("../styles/themes/theme-bootstrap.css", import.meta.url).href,
  tailwind: new URL("../styles/themes/theme-tailwind.css", import.meta.url).href,
};

/**
 * variant 軸 (従来の THEME_URLS を rename)。
 * standard は framework デフォルトの見た目そのまま (上書きなし)。
 */
const VARIANT_URLS: Record<ThemeId, string | null> = {
  standard: null,
  card: new URL("../styles/theme-card.css", import.meta.url).href,
  compact: new URL("../styles/theme-compact.css", import.meta.url).href,
  dark: new URL("../styles/theme-dark.css", import.meta.url).href,
};

/**
 * canvas iframe に framework × variant の 2 軸 CSS を注入する (#793 子 5)。
 *
 * 注入順:
 *   1. dz-framework-css  ← FRAMEWORK_URLS[framework] (Bootstrap または Tailwind theme)
 *   2. dz-variant-override ← VARIANT_URLS[variant] (card/compact/dark の上書き、standard は省略)
 *
 * MVP 制約: tailwind framework は standard variant のみサポート。
 * card/compact/dark × tailwind は仕様書 7.3 節で future work と明記。
 */
function applyThemeToCanvas(editor: GEditor, variant: ThemeId, framework: CssFramework) {
  try {
    const canvasDoc = editor.Canvas.getDocument();
    if (!canvasDoc) return;

    // 1. framework CSS (bootstrap or tailwind)
    const existingFw = canvasDoc.getElementById("dz-framework-css");
    if (existingFw) existingFw.remove();
    const fwLink = canvasDoc.createElement("link");
    fwLink.id = "dz-framework-css";
    fwLink.rel = "stylesheet";
    fwLink.href = FRAMEWORK_URLS[framework];
    canvasDoc.head.appendChild(fwLink);

    // 2. variant CSS (standard は省略 = framework 既定の見た目)
    const existingVariant = canvasDoc.getElementById("dz-variant-override");
    if (existingVariant) existingVariant.remove();
    const variantUrl = VARIANT_URLS[variant];
    if (variantUrl) {
      const variantLink = canvasDoc.createElement("link");
      variantLink.id = "dz-variant-override";
      variantLink.rel = "stylesheet";
      variantLink.href = variantUrl;
      canvasDoc.head.appendChild(variantLink);
    }
  } catch {
    // canvas not ready
  }
}

function buildGjsOptions() {
  return {
    height: "100%",
    width: "auto",
    storageManager: {
      type: "remote",
      autosave: false,
      autoload: true,
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
  const gjsOptions = buildGjsOptions();
  const [ready, setReady] = useState(false);
  const [canvasEmpty, setCanvasEmpty] = useState(true);
  const [isDirty, setIsDirtyState] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [serverChanged, setServerChanged] = useState(false);
  const isDirtyRef = useRef(false);
  // 初期ロード中および handleDiscard 中の component:* イベントは「ユーザー編集」ではないので
  // markDirty を抑制する。初期ロードも同様に抑制するため、初期値を true にし onReady で解除する。
  const isInternalLoadRef = useRef(true);
  const [activeTheme, setActiveThemeState] = useState<ThemeId>(
    () => (localStorage.getItem(THEME_KEY) as ThemeId | null) ?? "standard"
  );
  // project.design.cssFramework (#793 子 5): 省略時は "bootstrap" (schema default と一致)
  const [cssFramework, setCssFramework] = useState<CssFramework>("bootstrap");
  const cssFrameworkRef = useRef<CssFramework>("bootstrap");
  const [mcpStatus, setMcpStatus] = useState<McpStatus>("disconnected");
  const tabId = makeTabId("design", screenId);

  // ダイアログ表示状態
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [showForceReleaseDialog, setShowForceReleaseDialog] = useState(false);
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  // localStorage 救済確認ダイアログ
  const [showLegacyRescueDialog, setShowLegacyRescueDialog] = useState(false);
  const legacyDataRef = useRef<unknown>(null);
  // localStorage 救済は mount 1 回のみ
  const legacyRescueCheckedRef = useRef(false);

  // draftUpdateTimer (300ms debounce で updateDraft を呼ぶ)
  const draftUpdateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // useEditSession — TableEditor:77 と同型
  const sessionId = mcpBridge.getSessionId();
  const { mode, loading: sessionLoading, isDirtyForTab, actions: editActions } = useEditSession({
    resourceType: "screen",
    resourceId: screenId,
    sessionId,
  });

  const isReadonly = mode.kind !== "editing";
  const lockedByOther = mode.kind === "locked-by-other" ? mode : null;

  // dirty 連携: isDirtyForTab (編集セッション中) || isDirty (canvas 変更あり)
  useEffect(() => {
    setDirty(tabId, isDirtyForTab || isDirty);
  }, [tabId, isDirtyForTab, isDirty]);

  // resume ダイアログ: readonly + sessionLoading 解除後に draft があれば表示
  useEffect(() => {
    if (!screenId || sessionLoading) return;
    if (mode.kind !== "readonly") return;
    let cancelled = false;
    (async () => {
      const res = await mcpBridge.hasDraft("screen", screenId) as { exists: boolean } | null;
      if (cancelled) return;
      if (res?.exists) setShowResumeDialog(true);
    })().catch(console.error);
    return () => { cancelled = true; };
  }, [screenId, sessionLoading, mode.kind]);

  // cssFramework を画面 + プロジェクトから読み込む (screenId が変わるたびに再解決)。
  // 解決順序: screen.design.cssFramework ?? project.design.cssFramework ?? "bootstrap"
  // (css-framework-switching.md § 1.3.1 / multi-editor-puck.md § 2.3 / #806 子 2)
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadRawProject(),
      loadScreenEntity(screenId),
    ]).then(([raw, screen]) => {
      if (cancelled) return;
      const fw = resolveCssFramework(screen.design, raw.design);
      setCssFramework(fw);
      cssFrameworkRef.current = fw;
    }).catch((e) => {
      console.warn("[Designer] cssFramework resolve failed, using default 'bootstrap'", e);
    });
    return () => { cancelled = true; };
  }, [screenId]);

  // cssFrameworkRef を cssFramework state と同期 (onReady closure から参照するため)
  useEffect(() => {
    cssFrameworkRef.current = cssFramework;
  }, [cssFramework]);

  const handleThemeChange = useCallback((themeId: ThemeId) => {
    setActiveThemeState(themeId);
    localStorage.setItem(THEME_KEY, themeId);
    if (editorRef.current) {
      applyThemeToCanvas(editorRef.current, themeId, cssFrameworkRef.current);
    }
  // cssFrameworkRef は ref なので依存配列不要
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

    // 変更検知: component 操作または style 変更で draft を更新する
    const markDirty = () => {
      if (isInternalLoadRef.current) return;
      if (isReadonlyRef.current) return;
      setIsDirtyState(true);
      isDirtyRef.current = true;
      // 300ms debounce で updateDraft を呼ぶ (TableEditor:91-98 と同型)
      if (draftUpdateTimer.current) clearTimeout(draftUpdateTimer.current);
      draftUpdateTimer.current = setTimeout(() => {
        if (!editorRef.current) return;
        const data = editorRef.current.getProjectData();
        mcpBridge.updateDraft("screen", screenId, data).catch(console.error);
      }, 300);
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
    // dirty 中: ServerChangeBanner を表示してユーザー判断に委ねる
    // clean: editor.load() で即時リロード
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
      if (draftUpdateTimer.current) clearTimeout(draftUpdateTimer.current);
      unsubDataItemId();
      unsubScreenItemsSync();
      unsubscribe();
      unsubScreenChanged();
      mcpBridge.setThemeHandler(null);
      mcpBridge.setCurrentScreenId(null);
      clearItemsFromCache(screenId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenId, tabId]);

  // isReadonly の ref 版 (onEditor closure からアクセスするため)
  const isReadonlyRef = useRef(isReadonly);
  useEffect(() => {
    isReadonlyRef.current = isReadonly;
  }, [isReadonly]);

  const onReady = useCallback(async () => {
    setReady(true);
    // GrapesJS が component:add を遅延発火するケース（ensureValidProject による
    // 最小 pages 補正で空データからでも load() 後に 1 回発火する）に備え、
    // 次のマクロタスクでガードを下げる (#131)。
    // #358: ガード解除と同タイミングで canvas ↔ screen-items の初回突合を行う。
    setTimeout(() => {
      isInternalLoadRef.current = false;
      if (editorRef.current) reconcileScreenItems(editorRef.current, screenId);
    }, 0);
    if (editorRef.current) {
      // framework × variant の 2 軸 CSS を注入 (#793 子 5)。
      // standard variant でも framework CSS は常に注入する (bootstrap/tailwind の選択を canvas に反映)。
      applyThemeToCanvas(editorRef.current, activeTheme, cssFrameworkRef.current);
      // カスタムブロックの CSS をキャンバスに注入
      try {
        const customBlocks = await loadCustomBlocks();
        if (customBlocks.some((b) => b.styles)) {
          injectCustomBlockCss(editorRef.current, customBlocks);
        }
      } catch { /* ignore */ }
    }

    // localStorage 救済チェック (mount 1 回のみ)
    if (!legacyRescueCheckedRef.current) {
      legacyRescueCheckedRef.current = true;
      checkLegacyLocalStorage(screenId).then((result) => {
        if (result.hasLegacy) {
          legacyDataRef.current = result.data;
          setShowLegacyRescueDialog(true);
        }
      }).catch(console.error);
    }
  }, [activeTheme, screenId]);

  // タブがアクティブになったときにキャンバスをリフレッシュ（display:none から復帰）
  useEffect(() => {
    if (isActive && editorRef.current) {
      editorRef.current.refresh();
    }
  }, [isActive]);


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

  /** 保存: 保留中の debounce を flush してから commitDraft + releaseLock */
  const handleSave = useCallback(async () => {
    if (isReadonly || isSaving) return;
    setIsSaving(true);
    try {
      // 保留中の debounce timer があれば即時 flush
      if (draftUpdateTimer.current) {
        clearTimeout(draftUpdateTimer.current);
        draftUpdateTimer.current = null;
        if (editorRef.current) {
          await mcpBridge.updateDraft("screen", screenId, editorRef.current.getProjectData());
        }
      }
      await editActions.save();
      setIsDirtyState(false);
      isDirtyRef.current = false;
      setDirty(tabId, false);
      setServerChanged(false);
      await acknowledgeServerMtime("screen", screenId);
      // サムネイル生成 (旧 storage:end:store ハンドラから移植)
      if (editorRef.current && safeComponentsLength(editorRef.current) > 0) {
        captureThumbnail(editorRef.current).then(async (thumbnail) => {
          if (!thumbnail) return;
          try {
            const project = await loadProject();
            await updateScreenThumbnail(project, screenId, thumbnail);
          } catch {
            // サムネイル保存失敗は無視
          }
        });
      }
    } catch (e) {
      console.error("[Designer] save failed:", e);
      showError({
        title: "画面の保存に失敗しました",
        error: e,
        context: { screenId, tabId },
      });
    } finally {
      setIsSaving(false);
    }
  }, [screenId, tabId, isReadonly, isSaving, editActions, showError]);

  /** 破棄: discardDraft + releaseLock → 本体ファイル再読込 */
  const handleDiscard = useCallback(async () => {
    setShowDiscardDialog(false);
    const editor = editorRef.current;
    isInternalLoadRef.current = true;
    try {
      await editActions.discard();
      if (editor) {
        await editor.load();
        editor.UndoManager.clear();
      }
      setIsDirtyState(false);
      isDirtyRef.current = false;
      setDirty(tabId, false);
      setServerChanged(false);
      await acknowledgeServerMtime("screen", screenId);
    } catch (e) {
      console.error("[Designer] discard failed:", e);
      showError({
        title: "破棄に失敗しました",
        error: e,
        context: { screenId, tabId },
      });
    } finally {
      setTimeout(() => {
        isInternalLoadRef.current = false;
        if (editorRef.current) reconcileScreenItems(editorRef.current, screenId);
      }, 0);
    }
  }, [screenId, tabId, editActions, showError]);

  const handleForceRelease = useCallback(async () => {
    setShowForceReleaseDialog(false);
    await editActions.forceReleaseOther();
  }, [editActions]);

  const handleResumeContinue = useCallback(async () => {
    setShowResumeDialog(false);
    await editActions.startEditing();
  }, [editActions]);

  const handleResumeDiscard = useCallback(async () => {
    setShowResumeDialog(false);
    await mcpBridge.discardDraft("screen", screenId);
    const editor = editorRef.current;
    if (editor) {
      isInternalLoadRef.current = true;
      await editor.load();
      setTimeout(() => {
        isInternalLoadRef.current = false;
        if (editorRef.current) reconcileScreenItems(editorRef.current, screenId);
      }, 0);
    }
  }, [screenId]);

  // ServerChangeBanner からの reload はページ本体への戻り
  const handleServerChangeReload = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;
    isInternalLoadRef.current = true;
    try {
      await editor.load();
      editor.UndoManager.clear();
      setIsDirtyState(false);
      isDirtyRef.current = false;
      setDirty(tabId, false);
      setServerChanged(false);
      await acknowledgeServerMtime("screen", screenId);
    } catch (e) {
      console.error("[Designer] server change reload failed:", e);
    } finally {
      setTimeout(() => {
        isInternalLoadRef.current = false;
        if (editorRef.current) reconcileScreenItems(editorRef.current, screenId);
      }, 0);
    }
  }, [screenId, tabId]);

  // localStorage 救済: 採用
  const handleLegacyRescueAdopt = useCallback(async () => {
    setShowLegacyRescueDialog(false);
    try {
      await executeRescue(screenId, "adopt", legacyDataRef.current);
      legacyDataRef.current = null;
      // draft が作成されたのでリロードして draft を表示
      const editor = editorRef.current;
      if (editor) {
        isInternalLoadRef.current = true;
        await editor.load();
        setTimeout(() => {
          isInternalLoadRef.current = false;
          if (editorRef.current) reconcileScreenItems(editorRef.current, screenId);
        }, 0);
      }
      // resume ダイアログを表示 (draft が存在するので続きを選ばせる)
      setShowResumeDialog(true);
    } catch (e) {
      console.error("[Designer] legacy rescue adopt failed:", e);
    }
  }, [screenId]);

  // localStorage 救済: 破棄
  const handleLegacyRescueDiscard = useCallback(() => {
    setShowLegacyRescueDialog(false);
    clearLegacyLocalStorage(screenId);
    legacyDataRef.current = null;
  }, [screenId]);

  return (
    <GjsEditor
      className={`designer-root${isReadonly ? " is-readonly" : ""}`}
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
            onSaveToFile={handleSave}
            onReset={async () => setShowDiscardDialog(true)}
            backLink={onBack ? { label: screenName ?? "画面デザイン", onClick: onBack } : undefined}
            screenId={screenId}
            isReadonly={isReadonly}
          />
        </WithEditor>

        {/* 編集モードツールバー (EditModeToolbar) */}
        <EditModeToolbar
          mode={mode}
          onStartEditing={editActions.startEditing}
          onSave={handleSave}
          onDiscardClick={() => setShowDiscardDialog(true)}
          onForceReleaseClick={() => setShowForceReleaseDialog(true)}
          saving={isSaving}
          ownerLabel={lockedByOther?.ownerSessionId}
        />

        {/* 強制解除 / ForcedOut / AfterForceUnlock ダイアログ */}
        {mode.kind === "force-released-pending" && (
          <ForcedOutChoiceDialog
            previousDraftExists={mode.previousDraftExists}
            onChoice={(choice) => editActions.handleForcedOut(choice)}
          />
        )}
        {mode.kind === "after-force-unlock" && (
          <AfterForceUnlockChoiceDialog
            previousOwner={mode.previousOwner}
            onChoice={(choice) => editActions.handleAfterForceUnlock(choice)}
          />
        )}

        {showResumeDialog && (
          <ResumeOrDiscardDialog
            onResume={handleResumeContinue}
            onDiscard={handleResumeDiscard}
            onCancel={() => setShowResumeDialog(false)}
          />
        )}

        {showDiscardDialog && (
          <DiscardConfirmDialog
            onConfirm={handleDiscard}
            onCancel={() => setShowDiscardDialog(false)}
          />
        )}

        {showForceReleaseDialog && lockedByOther && (
          <ForceReleaseConfirmDialog
            ownerSessionId={lockedByOther.ownerSessionId}
            onConfirm={handleForceRelease}
            onCancel={() => setShowForceReleaseDialog(false)}
          />
        )}

        {showLegacyRescueDialog && (
          <LegacyRescueDialog
            onAdopt={handleLegacyRescueAdopt}
            onDiscard={handleLegacyRescueDiscard}
          />
        )}

        {serverChanged && (
          <ServerChangeBanner
            onReload={handleServerChangeReload}
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
            {/* read-only オーバーレイ: 編集中でないときに canvas 中央に「編集開始」ボタンを表示 */}
            {isReadonly && ready && (
              <div className="canvas-readonly-overlay" data-testid="canvas-readonly-overlay">
                <button
                  type="button"
                  className="canvas-readonly-start-btn"
                  onClick={editActions.startEditing}
                  data-testid="canvas-readonly-start"
                >
                  <i className="bi bi-pencil-fill" />
                  編集開始
                </button>
              </div>
            )}
            {canvasEmpty && ready && !isReadonly && (
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

// ---------------------------------------------------------------------------
// LocalStorage 救済確認ダイアログ
// ---------------------------------------------------------------------------

interface LegacyRescueDialogProps {
  onAdopt: () => void;
  onDiscard: () => void;
}

function LegacyRescueDialog({ onAdopt, onDiscard }: LegacyRescueDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDiscard();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onDiscard]);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  return (
    <div
      className="edit-mode-modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onDiscard(); }}
      role="presentation"
    >
      <div
        className="edit-mode-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legacy-rescue-title"
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className="edit-mode-modal-header">
          <h5 id="legacy-rescue-title" className="edit-mode-modal-title">
            未保存の旧データが見つかりました
          </h5>
          <button
            type="button"
            className="btn-close"
            onClick={onDiscard}
            aria-label="閉じる"
          />
        </div>
        <div className="edit-mode-modal-body">
          <p>
            以前の編集セッションで保存されなかったデータ (localStorage) が残っています。
            draft に変換して編集を継続しますか？
          </p>
          <div className="edit-mode-modal-footer">
            <button
              type="button"
              className="btn btn-outline-danger btn-sm"
              onClick={onDiscard}
              data-testid="legacy-rescue-discard"
            >
              破棄する
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onAdopt}
              data-testid="legacy-rescue-adopt"
            >
              draft に変換して続ける
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
