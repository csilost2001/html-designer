import type { Editor as GEditor, Component, Block } from "grapesjs";
import html2canvas from "html2canvas";
import { generateUUID } from "../utils/uuid";
import type { ScreenType, TransitionTrigger } from "../types/flow";
import {
  openTab,
  closeTab,
  setActiveTab,
  getTabs,
  getActiveTabId,
  makeTabId,
  setDirty,
} from "../store/tabStore";
import { saveScreenToFile } from "../grapes/remoteStorage";
import {
  loadProject,
  addScreen,
  updateScreen,
  updateScreenThumbnail,
  removeScreen,
  addEdge,
  removeEdge,
  generateMermaid,
  setFlowStorageBackend,
  type FlowStorageBackend,
} from "../store/flowStore";
import {
  loadCustomBlocks,
  upsertCustomBlock,
  deleteCustomBlock,
  injectCustomBlockCss,
  setCustomBlocksBackend,
  type CustomBlocksStorageBackend,
  type CustomBlock,
} from "../store/customBlockStore";
import {
  setTableStorageBackend,
  type TableStorageBackend,
} from "../store/tableStore";
import {
  setErLayoutStorageBackend,
  type ErLayoutStorageBackend,
} from "../store/erLayoutStore";
import {
  setActionStorageBackend,
  type ActionStorageBackend,
} from "../store/actionStore";
import {
  setConventionsStorageBackend,
  type ConventionsStorageBackend,
} from "../store/conventionsStore";
import {
  loadScreenItems,
  setItemsInCache,
  setScreenItemsStorageBackend,
  type ScreenItemsStorageBackend,
} from "../store/screenItemsStore";
import type { ScreenItemsFile } from "../types/screenItem";
import { loadTable } from "../store/tableStore";

export type McpStatus = "disconnected" | "connecting" | "connected";
export type ThemeIdLike = "standard" | "card" | "compact" | "dark";

type StatusCallback = (s: McpStatus) => void;
type ThemeHandler = (theme: ThemeIdLike) => void;
type NavigateHandler = (path: string) => void;
type FlowChangeHandler = () => void;
type BroadcastHandler = (data: unknown) => void;
type Command = { id: string; method: string; params?: unknown };
type Response = { id: string; result?: unknown; error?: string };

type ActionGroupHandler = {
  get: () => unknown;
  mutate: (type: string, params: unknown) => void;
};

const WS_URL = `ws://${window.location.hostname}:5179`;
const RETRY_DELAY_MS = 5000;
const REQUEST_TIMEOUT_MS = 15000;

// HMR 対応: グローバルにインスタンスを保持
declare global {
  interface Window {
    __mcpBridge?: McpBridgeImpl;
  }
}

class McpBridgeImpl {
  private ws: WebSocket | null = null;
  private editor: GEditor | null = null;
  private currentScreenId: string | null = null;
  private actionGroupHandlers = new Map<string, ActionGroupHandler>();
  private status: McpStatus = "disconnected";
  private statusCallbacks: Set<StatusCallback> = new Set();
  private themeHandler: ThemeHandler | null = null;
  private navigateHandler: NavigateHandler | null = null;
  private flowChangeHandler: FlowChangeHandler | null = null;
  private broadcastHandlers = new Map<string, Set<BroadcastHandler>>();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  /** ブラウザセッション固有の一意 ID（再接続でも不変） */
  private readonly clientId = generateUUID();

  /** ブラウザ→サーバーリクエストの応答待ちハンドラ */
  private pendingRequests = new Map<
    string,
    { resolve: (r: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();

  getClientId(): string {
    return this.clientId;
  }

  // ── ハンドラ setter ────────────────────────────────────────────────────

  setCurrentScreenId(screenId: string | null): void {
    this.currentScreenId = screenId;
  }

  setActionGroupHandler(id: string, handler: ActionGroupHandler | null): void {
    if (handler) {
      this.actionGroupHandlers.set(id, handler);
    } else {
      this.actionGroupHandlers.delete(id);
    }
  }

  setThemeHandler(handler: ThemeHandler | null): void {
    this.themeHandler = handler;
  }

  setNavigateHandler(handler: NavigateHandler | null): void {
    this.navigateHandler = handler;
  }

  setFlowChangeHandler(handler: FlowChangeHandler | null): void {
    this.flowChangeHandler = handler;
  }

  onStatusChange(cb: StatusCallback): () => void {
    this.statusCallbacks.add(cb);
    cb(this.status);
    return () => this.statusCallbacks.delete(cb);
  }

  getStatus(): McpStatus {
    return this.status;
  }

  /** ブロードキャストイベントのサブスクライブ */
  onBroadcast(event: string, handler: BroadcastHandler): () => void {
    if (!this.broadcastHandlers.has(event)) {
      this.broadcastHandlers.set(event, new Set());
    }
    this.broadcastHandlers.get(event)!.add(handler);
    return () => this.broadcastHandlers.get(event)?.delete(handler);
  }

  // ── 起動 / 停止 ───────────────────────────────────────────────────────

  start(editor: GEditor): void {
    this.editor = editor;
    this.stopped = false;
    console.log("[mcpBridge] starting...");
    // 既存の接続が生きていればそのまま再利用（FlowEditor からの遷移時にエディターだけ差し替え）
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log("[mcpBridge] reusing existing connection");
      return;
    }
    this._connect();
  }

  /** フロー画面用: エディターなしで WebSocket 接続のみ起動 */
  startWithoutEditor(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    if (this.status === "connecting") return;
    this.stopped = false;
    console.log("[mcpBridge] starting without editor (flow mode)...");
    this._connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._setStatus("disconnected");
    console.log("[mcpBridge] stopped");
  }

  // ── ブラウザ→サーバーリクエスト ──────────────────────────────────────

  /**
   * wsBridge へリクエストを送信し、サーバーファイル操作の結果を受け取る。
   * { type: "request", id, method, params } → { type: "response", id, result/error }
   */
  request(method: string, params?: unknown): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("wsBridge に接続されていません"));
    }

    const id = generateUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`タイムアウト: ${method} (${REQUEST_TIMEOUT_MS}ms)`));
      }, REQUEST_TIMEOUT_MS);

      this.pendingRequests.set(id, { resolve, reject, timer });
      this.ws!.send(JSON.stringify({ type: "request", id, method, params }));
    });
  }

  // ── 内部ユーティリティ ────────────────────────────────────────────────

  private _setStatus(s: McpStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.statusCallbacks.forEach((cb) => cb(s));
  }

  private _connect(): void {
    if (this.stopped) return;
    this._setStatus("connecting");
    console.log("[mcpBridge] connecting to", WS_URL);

    const ws = new WebSocket(WS_URL);
    this.ws = ws;

    ws.addEventListener("open", () => {
      console.log("[mcpBridge] connected");
      // 登録メッセージを送信
      ws.send(JSON.stringify({ type: "register", clientId: this.clientId }));
      // ファイルストレージバックエンドを設定
      this._setStorageBackends();
      this._setStatus("connected");
    });

    ws.addEventListener("message", (event: MessageEvent) => {
      this._handleMessage(event.data as string);
    });

    ws.addEventListener("close", () => {
      if (this.ws !== ws) return;
      this.ws = null;
      console.log("[mcpBridge] disconnected, retrying in", RETRY_DELAY_MS, "ms");
      // バックエンドを localStorage フォールバックに戻す
      this._clearStorageBackends();
      this._setStatus("disconnected");
      // 未解決リクエストを全てリジェクト
      for (const [id, handler] of this.pendingRequests.entries()) {
        clearTimeout(handler.timer);
        handler.reject(new Error("WebSocket が切断されました"));
        this.pendingRequests.delete(id);
      }
      if (!this.stopped) {
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          this._connect();
        }, RETRY_DELAY_MS);
      }
    });

    ws.addEventListener("error", () => {
      console.log("[mcpBridge] connection error");
    });
  }

  /** 接続時: flowStore と customBlockStore にリモートバックエンドをセット */
  private _setStorageBackends(): void {
    // arrow 関数内の this は lexical なので、enclosing method の this (インスタンス) をそのまま使う
    const flowBackend: FlowStorageBackend = {
      loadProject: () => this.request("loadProject"),
      saveProject: (project) => this.request("saveProject", { project }).then(() => undefined),
      deleteScreenData: (screenId) => this.request("deleteScreen", { screenId }).then(() => undefined),
    };
    setFlowStorageBackend(flowBackend);

    const blocksBackend: CustomBlocksStorageBackend = {
      loadCustomBlocks: () => this.request("loadCustomBlocks").then((r) => (r ?? []) as unknown[]),
      saveCustomBlocks: (blocks) => this.request("saveCustomBlocks", { blocks }).then(() => undefined),
    };
    setCustomBlocksBackend(blocksBackend);

    const tableBackend: TableStorageBackend = {
      loadTable: (tableId) => this.request("loadTable", { tableId }),
      saveTable: (tableId, data) => this.request("saveTable", { tableId, data }).then(() => undefined),
      deleteTable: (tableId) => this.request("deleteTable", { tableId }).then(() => undefined),
    };
    setTableStorageBackend(tableBackend);

    const erLayoutBackend: ErLayoutStorageBackend = {
      loadErLayout: () => this.request("loadErLayout"),
      saveErLayout: (data) => this.request("saveErLayout", { data }).then(() => undefined),
    };
    setErLayoutStorageBackend(erLayoutBackend);

    const actionBackend: ActionStorageBackend = {
      loadActionGroup: (id) => this.request("loadActionGroup", { id }),
      saveActionGroup: (id, data) => this.request("saveActionGroup", { id, data }).then(() => undefined),
      deleteActionGroup: (id) => this.request("deleteActionGroup", { id }).then(() => undefined),
      listActionGroups: () => this.request("listActionGroups"),
    };
    setActionStorageBackend(actionBackend);

    const conventionsBackend: ConventionsStorageBackend = {
      loadConventions: () => this.request("loadConventions"),
      saveConventions: (catalog) => this.request("saveConventions", { catalog }).then(() => undefined),
    };
    setConventionsStorageBackend(conventionsBackend);

    const screenItemsBackend: ScreenItemsStorageBackend = {
      loadScreenItems: (screenId) => this.request("loadScreenItems", { screenId }),
      saveScreenItems: (screenId, data) => this.request("saveScreenItems", { screenId, data }).then(() => undefined),
      deleteScreenItems: (screenId) => this.request("deleteScreenItems", { screenId }).then(() => undefined),
    };
    setScreenItemsStorageBackend(screenItemsBackend);
  }

  /** 切断時: localStorage フォールバックに戻す */
  private _clearStorageBackends(): void {
    setFlowStorageBackend(null);
    setCustomBlocksBackend(null);
    setTableStorageBackend(null);
    setErLayoutStorageBackend(null);
    setActionStorageBackend(null);
    setConventionsStorageBackend(null);
    setScreenItemsStorageBackend(null);
  }

  // ── メッセージ受信 ─────────────────────────────────────────────────────

  private _handleMessage(data: string): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(data) as Record<string, unknown>;
    } catch {
      console.error("[mcpBridge] failed to parse message:", data);
      return;
    }

    // ── ブラウザリクエストへのサーバー応答 ──
    if (msg.type === "response") {
      const res = msg as unknown as { type: "response"; id: string; result?: unknown; error?: string };
      const handler = this.pendingRequests.get(res.id);
      if (handler) {
        clearTimeout(handler.timer);
        this.pendingRequests.delete(res.id);
        if (res.error) {
          handler.reject(new Error(res.error));
        } else {
          handler.resolve(res.result);
        }
      }
      return;
    }

    // ── サーバーからのブロードキャスト ──
    if (msg.type === "broadcast") {
      const event = msg.event as string;
      const broadcastData = msg.data;
      console.log("[mcpBridge] broadcast:", event, broadcastData);
      const handlers = this.broadcastHandlers.get(event);
      if (handlers) {
        handlers.forEach((h) => h(broadcastData));
      }
      return;
    }

    // ── MCP コマンド（サーバー→ブラウザ） ──
    this._dispatch(msg as unknown as Command);
  }

  // ── MCP コマンドディスパッチ ──────────────────────────────────────────

  private _dispatch(cmd: Command): void {
    this._dispatchAsync(cmd).catch((e) => {
      console.error("[mcpBridge] unhandled dispatch error:", e);
    });
  }

  private async _dispatchAsync(cmd: Command): Promise<void> {
    const { id, method, params } = cmd;

    const respond = (result: unknown): void => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ id, result } satisfies Response));
      }
    };

    const respondError = (error: string): void => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ id, error } satisfies Response));
      }
    };

    // フロー操作・タブ操作・AG ハンドラはエディター不要
    const flowMethods = [
      "listScreens", "addScreen", "updateScreenMeta", "removeScreenNode",
      "addFlowEdge", "removeFlowEdge", "getFlow", "navigateScreen",
      "listCustomBlocks",
      "openTab", "closeTab", "switchTab", "listTabs", "saveScreen", "saveAll",
      "getActionGroup", "applyActionGroupMutation",
    ];

    if (!this.editor && !flowMethods.includes(method)) {
      respondError("エディターが初期化されていません");
      return;
    }

    const editor = this.editor!;

    try {
      switch (method) {
        case "getHtml": {
          const html = editor.getHtml();
          const css = editor.getCss() ?? "";
          respond({ html, css });
          break;
        }

        case "setComponents": {
          const { html } = params as { html: string };
          editor.setComponents(html);
          respond({ success: true });
          break;
        }

        case "screenshot": {
          captureScreenshot(editor)
            .then((png) => respond({ png }))
            .catch((e: unknown) => respondError(String(e)));
          break;
        }

        case "listBlocks": {
          const all = editor.Blocks.getAll();
          const blocks = all.map((b: Block) => ({
            id: b.getId(),
            label: stripHtml(String(b.get("label") ?? "")),
            category: categoryLabel(b.get("category")),
          }));
          respond({ blocks });
          break;
        }

        case "addBlock": {
          const { blockId, targetId, position } = (params ?? {}) as {
            blockId: string;
            targetId?: string;
            position?: "before" | "after" | "inside" | "append";
          };
          const block = editor.Blocks.get(blockId);
          if (!block) {
            respondError(`ブロックが見つかりません: ${blockId}`);
            break;
          }
          const content = block.get("content");
          const wrapper = editor.DomComponents.getWrapper();
          if (!wrapper) {
            respondError("キャンバスが初期化されていません");
            break;
          }

          let parent: Component = wrapper;
          let at: number | undefined = undefined;

          if (targetId) {
            const target = findComponentById(wrapper, targetId);
            if (!target) {
              respondError(`対象要素が見つかりません: ${targetId}`);
              break;
            }
            const pos = position ?? "after";
            if (pos === "inside" || pos === "append") {
              parent = target;
            } else {
              const tParent = target.parent();
              if (!tParent) {
                respondError("対象要素の親が見つかりません");
                break;
              }
              parent = tParent;
              const siblings = tParent.components();
              const idx = siblings.indexOf(target);
              at = pos === "before" ? idx : idx + 1;
            }
          }

          const added = parent.append(content as never, { at }) as unknown as Component[];
          const first = Array.isArray(added) ? added[0] : (added as unknown as Component);
          const addedId = first && typeof (first as Component).getId === "function"
            ? (first as Component).getId()
            : "";
          respond({ addedId });
          break;
        }

        case "removeElement": {
          const { id: elId } = (params ?? {}) as { id: string };
          const wrapper = editor.DomComponents.getWrapper();
          if (!wrapper) {
            respondError("キャンバスが初期化されていません");
            break;
          }
          const target = findComponentById(wrapper, elId);
          if (!target) {
            respondError(`要素が見つかりません: ${elId}`);
            break;
          }
          target.remove();
          respond({ success: true });
          break;
        }

        case "updateElement": {
          const { id: elId, attributes, style, text, classes } = (params ?? {}) as {
            id: string;
            attributes?: Record<string, string>;
            style?: Record<string, string>;
            text?: string;
            classes?: string[];
          };
          const wrapper = editor.DomComponents.getWrapper();
          if (!wrapper) {
            respondError("キャンバスが初期化されていません");
            break;
          }
          const target = findComponentById(wrapper, elId);
          if (!target) {
            respondError(`要素が見つかりません: ${elId}`);
            break;
          }
          if (attributes && typeof attributes === "object") {
            target.addAttributes(attributes);
          }
          if (style && typeof style === "object") {
            target.addStyle(style);
          }
          if (Array.isArray(classes)) {
            target.setClass(classes);
          }
          if (typeof text === "string") {
            const leaf = findFirstTextLeaf(target);
            if (leaf) {
              leaf.components(text);
            } else if (target.components().length === 0) {
              target.components(text);
            } else {
              respondError(
                `要素 ${elId} にテキストを含む子孫が見つかりません。`,
              );
              break;
            }
          }
          respond({ success: true });
          break;
        }

        case "setTheme": {
          const { theme } = (params ?? {}) as { theme: ThemeIdLike };
          if (!["standard", "card", "compact", "dark"].includes(theme)) {
            respondError(`不正なテーマID: ${theme}`);
            break;
          }
          if (!this.themeHandler) {
            respondError("テーマハンドラが登録されていません");
            break;
          }
          this.themeHandler(theme);
          respond({ success: true });
          break;
        }

        // ── フロー操作（エディター不要） ──────────────────────────────

        case "listScreens": {
          const project = await loadProject();
          const screens = project.screens.map((s) => ({
            id: s.id,
            name: s.name,
            type: s.type,
            path: s.path,
            hasDesign: s.hasDesign,
          }));
          respond({ screens });
          break;
        }

        case "addScreen": {
          const { name, type, path: screenPath, position } = (params ?? {}) as {
            name: string;
            type?: ScreenType;
            path?: string;
            position?: { x: number; y: number };
          };
          if (!name) {
            respondError("name は必須です");
            break;
          }
          const project = await loadProject();
          const screen = await addScreen(project, name, type ?? "other", screenPath, position);
          this.flowChangeHandler?.();
          respond({ screenId: screen.id });
          break;
        }

        case "updateScreenMeta": {
          const { screenId, thumbnail, ...patch } = (params ?? {}) as {
            screenId: string;
            name?: string;
            type?: ScreenType;
            description?: string;
            path?: string;
            thumbnail?: string;
          };
          if (!screenId) {
            respondError("screenId は必須です");
            break;
          }
          const project = await loadProject();
          if (thumbnail !== undefined) {
            await updateScreenThumbnail(project, screenId, thumbnail);
          }
          if (Object.keys(patch).length > 0) {
            const updated = await updateScreen(project, screenId, patch);
            if (!updated) {
              respondError(`画面が見つかりません: ${screenId}`);
              break;
            }
          }
          this.flowChangeHandler?.();
          respond({ success: true });
          break;
        }

        case "removeScreenNode": {
          const { screenId } = (params ?? {}) as { screenId: string };
          if (!screenId) {
            respondError("screenId は必須です");
            break;
          }
          const project = await loadProject();
          const ok = await removeScreen(project, screenId);
          if (!ok) {
            respondError(`画面が見つかりません: ${screenId}`);
            break;
          }
          this.flowChangeHandler?.();
          respond({ success: true });
          break;
        }

        case "addFlowEdge": {
          const { source, target, label, trigger } = (params ?? {}) as {
            source: string;
            target: string;
            label: string;
            trigger?: TransitionTrigger;
          };
          if (!source || !target) {
            respondError("source と target は必須です");
            break;
          }
          const project = await loadProject();
          const edge = await addEdge(project, source, target, label ?? "", trigger ?? "click");
          this.flowChangeHandler?.();
          respond({ edgeId: edge.id });
          break;
        }

        case "removeFlowEdge": {
          const { edgeId } = (params ?? {}) as { edgeId: string };
          if (!edgeId) {
            respondError("edgeId は必須です");
            break;
          }
          const project = await loadProject();
          const ok = await removeEdge(project, edgeId);
          if (!ok) {
            respondError(`エッジが見つかりません: ${edgeId}`);
            break;
          }
          this.flowChangeHandler?.();
          respond({ success: true });
          break;
        }

        case "getFlow": {
          const project = await loadProject();
          const mermaid = generateMermaid(project);
          respond({ project, mermaid });
          break;
        }

        case "navigateScreen": {
          const { screenId } = (params ?? {}) as { screenId: string };
          if (!screenId) {
            respondError("screenId は必須です");
            break;
          }
          if (this.navigateHandler) {
            this.navigateHandler(`/screen/design/${screenId}`);
            respond({ success: true });
          } else {
            respondError("ナビゲーションハンドラが登録されていません");
          }
          break;
        }

        // ── カスタムブロック管理 ──────────────────────────────────────

        case "defineBlock": {
          const { id: blockId, label, category, content, styles, media } = (params ?? {}) as {
            id: string;
            label: string;
            category: string;
            content: string;
            styles?: string;
            media?: string;
          };

          const existing = editor.Blocks.get(blockId);
          const customBlocks = await loadCustomBlocks();
          const isCustom = customBlocks.some((b) => b.id === blockId);
          if (existing && !isCustom) {
            respondError(
              `ブロックID "${blockId}" はビルトインブロックと衝突します。別のIDを使用してください。`,
            );
            break;
          }

          editor.BlockManager.add(blockId, {
            label,
            category,
            content,
            ...(media ? { media } : {}),
          });

          const blockNow = new Date().toISOString();
          const prev = customBlocks.find((b) => b.id === blockId);
          await upsertCustomBlock({
            id: blockId,
            label,
            category,
            content,
            styles,
            media,
            createdAt: prev?.createdAt ?? blockNow,
            updatedAt: blockNow,
          } as CustomBlock);

          injectCustomBlockCss(editor, await loadCustomBlocks());
          respond({ success: true });
          break;
        }

        case "removeCustomBlock": {
          const { id: blockId } = (params ?? {}) as { id: string };
          const ok = await deleteCustomBlock(blockId);
          if (!ok) {
            respondError(`カスタムブロック "${blockId}" が見つかりません`);
            break;
          }
          editor.BlockManager.remove(blockId);
          injectCustomBlockCss(editor, await loadCustomBlocks());
          respond({ success: true });
          break;
        }

        case "listCustomBlocks": {
          const all = await loadCustomBlocks();
          const blocks = all.map((b) => ({
            id: b.id,
            label: b.label,
            category: b.category,
            hasStyles: !!b.styles,
          }));
          respond({ blocks });
          break;
        }

        // ── React エクスポート ────────────────────────────────────────

        case "exportScreen": {
          const { screenId } = (params ?? {}) as { screenId: string };
          const html = editor.getHtml();
          const css = editor.getCss() ?? "";
          const project = await loadProject();
          const screen = project.screens.find((s) => s.id === screenId);
          const screenName = screen?.name ?? "Screen";
          respond({ html, css, screenName });
          break;
        }

        // ── タブ操作 ──────────────────────────────────────────────────────

        case "openTab": {
          const { screenId: tScreenId, tableId: tTableId } = (params ?? {}) as {
            screenId?: string;
            tableId?: string;
          };
          if (tScreenId) {
            const project = await loadProject();
            const screen = project.screens.find((s) => s.id === tScreenId);
            if (!screen) { respondError(`画面が見つかりません: ${tScreenId}`); break; }
            openTab({ id: makeTabId("design", tScreenId), type: "design", resourceId: tScreenId, label: screen.name });
            if (this.navigateHandler) this.navigateHandler(`/screen/design/${tScreenId}`);
          } else if (tTableId) {
            const table = await loadTable(tTableId);
            if (!table) { respondError(`テーブルが見つかりません: ${tTableId}`); break; }
            openTab({ id: makeTabId("table", tTableId), type: "table", resourceId: tTableId, label: table.logicalName ?? table.name });
            if (this.navigateHandler) this.navigateHandler(`/table/edit/${tTableId}`);
          } else {
            respondError("screenId または tableId が必要です");
            break;
          }
          respond({ success: true });
          break;
        }

        case "closeTab": {
          const { tabId: cTabId, force } = (params ?? {}) as { tabId: string; force?: boolean };
          if (!cTabId) { respondError("tabId は必須です"); break; }
          const closed = closeTab(cTabId, force ?? false);
          if (!closed) { respondError("未保存の変更があります。force: true を指定して強制閉じできます"); break; }
          respond({ success: true });
          break;
        }

        case "switchTab": {
          const { tabId: sTabId } = (params ?? {}) as { tabId: string };
          if (!sTabId) { respondError("tabId は必須です"); break; }
          const tabs = getTabs();
          if (!tabs.find((t) => t.id === sTabId)) { respondError(`タブが見つかりません: ${sTabId}`); break; }
          setActiveTab(sTabId);
          const tab = tabs.find((t) => t.id === sTabId)!;
          if (this.navigateHandler) {
            const path =
              tab.type === "design" ? `/screen/design/${tab.resourceId}`
              : tab.type === "table" ? `/table/edit/${tab.resourceId}`
              : tab.type === "action" ? `/process-flow/edit/${tab.resourceId}`
              : `/screen/flow`;
            this.navigateHandler(path);
          }
          respond({ success: true });
          break;
        }

        case "listTabs": {
          const allTabs = getTabs().map((t) => ({
            id: t.id,
            type: t.type,
            resourceId: t.resourceId,
            label: t.label,
            isDirty: t.isDirty,
            isPinned: t.isPinned,
            isActive: t.id === getActiveTabId(),
          }));
          respond({ tabs: allTabs, activeTabId: getActiveTabId() });
          break;
        }

        case "saveScreen": {
          const { screenId: saveScreenId } = (params ?? {}) as { screenId: string };
          if (!saveScreenId) { respondError("screenId は必須です"); break; }
          await saveScreenToFile(saveScreenId);
          setDirty(makeTabId("design", saveScreenId), false);
          respond({ success: true });
          break;
        }

        case "saveAll": {
          const dirtyTabs = getTabs().filter((t) => t.isDirty && t.type === "design");
          const results: { screenId: string; success: boolean; error?: string }[] = [];
          for (const tab of dirtyTabs) {
            try {
              await saveScreenToFile(tab.resourceId);
              setDirty(tab.id, false);
              results.push({ screenId: tab.resourceId, success: true });
            } catch (e) {
              results.push({ screenId: tab.resourceId, success: false, error: String(e) });
            }
          }
          respond({ saved: results.filter((r) => r.success).length, total: dirtyTabs.length, results });
          break;
        }

        // ── browser-first 処理フロー操作 ──────────────────────────────

        case "getActionGroup": {
          const { id: agId } = (params ?? {}) as { id: string };
          const handler = this.actionGroupHandlers.get(agId);
          if (!handler) {
            respondError(`ActionEditor が開かれていません: ${agId}`);
            break;
          }
          respond(handler.get());
          break;
        }

        case "applyActionGroupMutation": {
          const { id: agId, type: mutType, params: mutParams } = (params ?? {}) as {
            id: string;
            type: string;
            params: unknown;
          };
          const handler = this.actionGroupHandlers.get(agId);
          if (!handler) {
            respondError(`ActionEditor が開かれていません: ${agId}`);
            break;
          }
          try {
            handler.mutate(mutType, mutParams);
            respond({ success: true });
          } catch (e) {
            respondError(String(e));
          }
          break;
        }

        // ── browser-first 命名支援 ─────────────────────────────────────

        case "getCanvasSnapshot": {
          const { screenId: reqScreenId } = (params ?? {}) as { screenId: string };
          if (this.currentScreenId !== reqScreenId) {
            respondError(`画面 ${reqScreenId} はブラウザで開かれていません (current: ${this.currentScreenId ?? "none"})`);
            break;
          }
          const html = editor.getHtml();
          let screenItems: ScreenItemsFile | null = null;
          try {
            screenItems = await loadScreenItems(reqScreenId);
          } catch { /* ignore */ }
          respond({ html, screenItems });
          break;
        }

        case "applyRenameInBrowser": {
          const { screenId: reqScreenId, mapping } = (params ?? {}) as {
            screenId: string;
            mapping: Record<string, string>;
          };
          if (this.currentScreenId !== reqScreenId) {
            respondError(`画面 ${reqScreenId} はブラウザで開かれていません`);
            break;
          }

          let siFile: ScreenItemsFile | null = null;
          try {
            siFile = await loadScreenItems(reqScreenId);
          } catch (e) {
            respondError(`screenItems の読み込みに失敗: ${e}`);
            break;
          }

          const succeeded: string[] = [];
          const failed: Array<{ oldId: string; error: string }> = [];
          const wrapper = editor.DomComponents.getWrapper();

          // UndoManager を停止して直接更新
          const um = editor.UndoManager;
          um.stop();
          try {
            for (const [oldId, newId] of Object.entries(mapping)) {
              try {
                if (wrapper) updateComponentIds(wrapper, oldId, newId);
                if (siFile) {
                  const item = siFile.items.find((i) => i.id === oldId);
                  if (item) item.id = newId;
                }
                succeeded.push(oldId);
              } catch (e) {
                failed.push({ oldId, error: String(e) });
              }
            }
          } finally {
            um.start();
          }

          if (succeeded.length > 0) {
            if (siFile) setItemsInCache(siFile);
            setDirty(makeTabId("design", reqScreenId), true);
          }

          respond({ succeeded, failed });
          break;
        }

        default:
          respondError(`未知のメソッド: ${method}`);
      }
    } catch (e) {
      respondError(e instanceof Error ? e.message : String(e));
    }
  }
}

// ── ヘルパー関数 ────────────────────────────────────────────────────────────

function updateComponentIds(component: Component, oldId: string, newId: string): void {
  const attrs = component.getAttributes();
  const updates: Record<string, string> = {};
  if (attrs.name === oldId) updates.name = newId;
  if (attrs.id === oldId) updates.id = newId;
  if (Object.keys(updates).length > 0) component.addAttributes(updates);
  const children = component.components();
  for (let i = 0; i < children.length; i++) {
    updateComponentIds(children.at(i) as Component, oldId, newId);
  }
}

function findFirstTextLeaf(c: Component): Component | null {
  const children = c.components();
  if (
    children.length > 0 &&
    children.at(0).get("type") === "textnode" &&
    children.length === 1
  ) {
    return c;
  }
  for (let i = 0; i < children.length; i++) {
    const child = children.at(i) as Component;
    if (child.get("type") === "textnode") continue;
    const found = findFirstTextLeaf(child);
    if (found) return found;
  }
  return null;
}

function findComponentById(root: Component, id: string): Component | null {
  if (root.getId() === id) return root;
  const children = root.components();
  for (let i = 0; i < children.length; i++) {
    const found = findComponentById(children.at(i) as Component, id);
    if (found) return found;
  }
  return null;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "").trim();
}

function categoryLabel(cat: unknown): string {
  if (!cat) return "";
  if (typeof cat === "string") return cat;
  if (typeof cat === "object" && cat !== null) {
    const obj = cat as { id?: string; label?: string };
    return obj.label ?? obj.id ?? "";
  }
  return String(cat);
}

async function captureScreenshot(editor: GEditor): Promise<string> {
  const canvasDoc = editor.Canvas.getDocument();
  if (!canvasDoc || !canvasDoc.body) {
    throw new Error("キャンバスのドキュメントにアクセスできません");
  }
  const body = canvasDoc.body;
  const canvasEl = await html2canvas(body, {
    backgroundColor: null,
    scale: 1,
    logging: false,
    useCORS: true,
    allowTaint: true,
  });
  return canvasEl.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
}

// ── HMR 対応: 既存インスタンスを再利用 ────────────────────────────────────

if (window.__mcpBridge) {
  window.__mcpBridge.stop();
}
const bridge = new McpBridgeImpl();
window.__mcpBridge = bridge;

export const mcpBridge = bridge;
