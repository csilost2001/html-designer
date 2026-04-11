import type { Editor as GEditor, Component, Block } from "grapesjs";
import html2canvas from "html2canvas";

export type McpStatus = "disconnected" | "connecting" | "connected";
export type ThemeIdLike = "standard" | "card" | "compact" | "dark";

type StatusCallback = (s: McpStatus) => void;
type ThemeHandler = (theme: ThemeIdLike) => void;
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
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  setThemeHandler(handler: ThemeHandler | null): void {
    this.themeHandler = handler;
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

    if (!this.editor) {
      respondError("エディターが初期化されていません");
      return;
    }

    const editor = this.editor;

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
            target.components(text);
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

      default:
        respondError(`未知のメソッド: ${method}`);
    }
  }
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
