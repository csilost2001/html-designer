import type { Editor as GEditor, Component, Block } from "grapesjs";
import html2canvas from "html2canvas";
import type { ScreenType, TransitionTrigger } from "../types/flow";
import {
  loadProject,
  saveProject,
  addScreen,
  updateScreen,
  removeScreen,
  addEdge,
  removeEdge,
  generateMermaid,
} from "../store/flowStore";

export type McpStatus = "disconnected" | "connecting" | "connected";
export type ThemeIdLike = "standard" | "card" | "compact" | "dark";

type StatusCallback = (s: McpStatus) => void;
type ThemeHandler = (theme: ThemeIdLike) => void;
type NavigateHandler = (path: string) => void;
type FlowChangeHandler = () => void;
type Command = { id: string; method: string; params?: unknown };
type Response = { id: string; result?: unknown; error?: string };

const WS_URL = "ws://127.0.0.1:5179";
const RETRY_DELAY_MS = 5000;

// HMR対応: グローバルにインスタンスを保持
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
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

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
    cb(this.status); // 現在の状態を即時通知
    return () => this.statusCallbacks.delete(cb);
  }

  getStatus(): McpStatus {
    return this.status;
  }

  start(editor: GEditor): void {
    this.editor = editor;
    this.stopped = false;
    console.log("[mcpBridge] starting...");
    this._connect();
  }

  /** フロー画面用: エディターなしでWebSocket接続のみ起動 */
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
      this._setStatus("connected");
    });

    ws.addEventListener("message", (event: MessageEvent) => {
      this._handleMessage(event.data as string);
    });

    ws.addEventListener("close", () => {
      if (this.ws !== ws) return; // 別の接続に切り替わった
      this.ws = null;
      console.log("[mcpBridge] disconnected, retrying in", RETRY_DELAY_MS, "ms");
      this._setStatus("disconnected");
      if (!this.stopped) {
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          this._connect();
        }, RETRY_DELAY_MS);
      }
    });

    ws.addEventListener("error", () => {
      // closeイベントも続いて発火するので、ここではログのみ
      console.log("[mcpBridge] connection error");
    });
  }

  private _handleMessage(data: string): void {
    let msg: Command;
    try {
      msg = JSON.parse(data) as Command;
    } catch {
      console.error("[mcpBridge] failed to parse message:", data);
      return;
    }

    // 置き換え通知（別タブが接続）
    if ((msg as unknown as { type: string }).type === "replaced") {
      console.log("[mcpBridge] replaced by another tab");
      return;
    }

    this._dispatch(msg);
  }

  private _dispatch(cmd: Command): void {
    const { id, method, params } = cmd;

    const respond = (result: unknown) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ id, result } satisfies Response));
      }
    };

    const respondError = (error: string) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ id, error } satisfies Response));
      }
    };

    // フロー操作はエディター不要なので先にチェック
    const flowMethods = [
      "listScreens", "addScreen", "updateScreenMeta", "removeScreenNode",
      "addFlowEdge", "removeFlowEdge", "getFlow", "navigateScreen",
    ];

    if (!this.editor && !flowMethods.includes(method)) {
      respondError("エディターが初期化されていません");
      return;
    }

    const editor = this.editor!;

    switch (method) {
      case "getHtml": {
        try {
          const html = editor.getHtml();
          const css = editor.getCss() ?? "";
          respond({ html, css });
        } catch (e) {
          respondError(String(e));
        }
        break;
      }

      case "setComponents": {
        try {
          const { html } = params as { html: string };
          editor.setComponents(html);
          respond({ success: true });
        } catch (e) {
          respondError(String(e));
        }
        break;
      }

      case "screenshot": {
        captureScreenshot(editor)
          .then((png) => respond({ png }))
          .catch((e: unknown) => respondError(String(e)));
        break;
      }

      case "listBlocks": {
        try {
          const all = editor.Blocks.getAll();
          const blocks = all.map((b: Block) => ({
            id: b.getId(),
            label: stripHtml(String(b.get("label") ?? "")),
            category: categoryLabel(b.get("category")),
          }));
          respond({ blocks });
        } catch (e) {
          respondError(String(e));
        }
        break;
      }

      case "addBlock": {
        try {
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
              at = undefined;
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
        } catch (e) {
          respondError(String(e));
        }
        break;
      }

      case "removeElement": {
        try {
          const { id } = (params ?? {}) as { id: string };
          const wrapper = editor.DomComponents.getWrapper();
          if (!wrapper) {
            respondError("キャンバスが初期化されていません");
            break;
          }
          const target = findComponentById(wrapper, id);
          if (!target) {
            respondError(`要素が見つかりません: ${id}`);
            break;
          }
          target.remove();
          respond({ success: true });
        } catch (e) {
          respondError(String(e));
        }
        break;
      }

      case "updateElement": {
        try {
          const { id, attributes, style, text, classes } = (params ?? {}) as {
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
          const target = findComponentById(wrapper, id);
          if (!target) {
            respondError(`要素が見つかりません: ${id}`);
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
                `要素 ${id} にテキストを含む子孫が見つかりません。text 更新対象には、テキストを含む要素または末端要素を指定してください`
              );
              break;
            }
          }
          respond({ success: true });
        } catch (e) {
          respondError(String(e));
        }
        break;
      }

      case "setTheme": {
        try {
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
        } catch (e) {
          respondError(String(e));
        }
        break;
      }

      // ── フロー操作（エディター不要） ──

      case "listScreens": {
        try {
          const project = loadProject();
          const screens = project.screens.map((s) => ({
            id: s.id,
            name: s.name,
            type: s.type,
            path: s.path,
            hasDesign: s.hasDesign,
          }));
          respond({ screens });
        } catch (e) {
          respondError(String(e));
        }
        break;
      }

      case "addScreen": {
        try {
          const { name, type, path, position } = (params ?? {}) as {
            name: string;
            type?: ScreenType;
            path?: string;
            position?: { x: number; y: number };
          };
          if (!name) {
            respondError("name は必須です");
            break;
          }
          const project = loadProject();
          const screen = addScreen(project, name, type ?? "other", path, position);
          this.flowChangeHandler?.();
          respond({ screenId: screen.id });
        } catch (e) {
          respondError(String(e));
        }
        break;
      }

      case "updateScreenMeta": {
        try {
          const { screenId, ...patch } = (params ?? {}) as {
            screenId: string;
            name?: string;
            type?: ScreenType;
            description?: string;
            path?: string;
          };
          if (!screenId) {
            respondError("screenId は必須です");
            break;
          }
          const project = loadProject();
          const updated = updateScreen(project, screenId, patch);
          if (!updated) {
            respondError(`画面が見つかりません: ${screenId}`);
            break;
          }
          this.flowChangeHandler?.();
          respond({ success: true });
        } catch (e) {
          respondError(String(e));
        }
        break;
      }

      case "removeScreenNode": {
        try {
          const { screenId } = (params ?? {}) as { screenId: string };
          if (!screenId) {
            respondError("screenId は必須です");
            break;
          }
          const project = loadProject();
          const ok = removeScreen(project, screenId);
          if (!ok) {
            respondError(`画面が見つかりません: ${screenId}`);
            break;
          }
          this.flowChangeHandler?.();
          respond({ success: true });
        } catch (e) {
          respondError(String(e));
        }
        break;
      }

      case "addFlowEdge": {
        try {
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
          const project = loadProject();
          const edge = addEdge(project, source, target, label ?? "", trigger ?? "click");
          this.flowChangeHandler?.();
          respond({ edgeId: edge.id });
        } catch (e) {
          respondError(String(e));
        }
        break;
      }

      case "removeFlowEdge": {
        try {
          const { edgeId } = (params ?? {}) as { edgeId: string };
          if (!edgeId) {
            respondError("edgeId は必須です");
            break;
          }
          const project = loadProject();
          const ok = removeEdge(project, edgeId);
          if (!ok) {
            respondError(`エッジが見つかりません: ${edgeId}`);
            break;
          }
          this.flowChangeHandler?.();
          respond({ success: true });
        } catch (e) {
          respondError(String(e));
        }
        break;
      }

      case "getFlow": {
        try {
          const project = loadProject();
          const mermaid = generateMermaid(project);
          respond({ project, mermaid });
        } catch (e) {
          respondError(String(e));
        }
        break;
      }

      case "navigateScreen": {
        try {
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
        } catch (e) {
          respondError(String(e));
        }
        break;
      }

      default:
        respondError(`未知のメソッド: ${method}`);
    }
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

// HMR対応: 既存インスタンスを再利用
if (window.__mcpBridge) {
  window.__mcpBridge.stop();
}
const bridge = new McpBridgeImpl();
window.__mcpBridge = bridge;

export const mcpBridge = bridge;
