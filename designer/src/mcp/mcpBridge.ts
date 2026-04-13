import type { Editor as GEditor, Component, Block } from "grapesjs";
import html2canvas from "html2canvas";
import { generateUUID } from "../utils/uuid";
import type { ScreenType, TransitionTrigger } from "../types/flow";
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

export type McpStatus = "disconnected" | "connecting" | "connected";
export type ThemeIdLike = "standard" | "card" | "compact" | "dark";

type StatusCallback = (s: McpStatus) => void;
type ThemeHandler = (theme: ThemeIdLike) => void;
type NavigateHandler = (path: string) => void;
type FlowChangeHandler = () => void;
type BroadcastHandler = (data: unknown) => void;
type Command = { id: string; method: string; params?: unknown };
type Response = { id: string; result?: unknown; error?: string };

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

  // ── ハンドラ setter ────────────────────────────────────────────────────

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
    const self = this;

    const flowBackend: FlowStorageBackend = {
      loadProject: () => self.request("loadProject"),
      saveProject: (project) => self.request("saveProject", { project }).then(() => undefined),
      deleteScreenData: (screenId) => self.request("deleteScreen", { screenId }).then(() => undefined),
    };
    setFlowStorageBackend(flowBackend);

    const blocksBackend: CustomBlocksStorageBackend = {
      loadCustomBlocks: () => self.request("loadCustomBlocks").then((r) => (r ?? []) as unknown[]),
      saveCustomBlocks: (blocks) => self.request("saveCustomBlocks", { blocks }).then(() => undefined),
    };
    setCustomBlocksBackend(blocksBackend);

    const tableBackend: TableStorageBackend = {
      loadTable: (tableId) => self.request("loadTable", { tableId }),
      saveTable: (tableId, data) => self.request("saveTable", { tableId, data }).then(() => undefined),
      deleteTable: (tableId) => self.request("deleteTable", { tableId }).then(() => undefined),
    };
    setTableStorageBackend(tableBackend);
  }

  /** 切断時: localStorage フォールバックに戻す */
  private _clearStorageBackends(): void {
    setFlowStorageBackend(null);
    setCustomBlocksBackend(null);
    setTableStorageBackend(null);
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

    // フロー操作はエディター不要
    const flowMethods = [
      "listScreens", "addScreen", "updateScreenMeta", "removeScreenNode",
      "addFlowEdge", "removeFlowEdge", "getFlow", "navigateScreen",
      "listCustomBlocks",
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
            this.navigateHandler(`/design/${screenId}`);
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

        default:
          respondError(`未知のメソッド: ${method}`);
      }
    } catch (e) {
      respondError(e instanceof Error ? e.message : String(e));
    }
  }
}

// ── ヘルパー関数 ────────────────────────────────────────────────────────────

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
