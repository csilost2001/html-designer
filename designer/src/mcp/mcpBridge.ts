import type { Editor as GEditor } from "grapesjs";
import html2canvas from "html2canvas";

export type McpStatus = "disconnected" | "connecting" | "connected";

type StatusCallback = (s: McpStatus) => void;
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
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

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

      default:
        respondError(`未知のメソッド: ${method}`);
    }
  }
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
