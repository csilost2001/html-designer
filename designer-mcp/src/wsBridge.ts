import { WebSocketServer, WebSocket } from "ws";
import { EventEmitter } from "events";
import { randomUUID } from "crypto";

type Command = { id: string; method: string; params?: unknown };
type Response = { id: string; result?: unknown; error?: string };

const WS_PORT = 5179;
const TIMEOUT_MS = 10000;

class WsBridge extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private client: WebSocket | null = null;
  private pending = new Map<string, { resolve: (r: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();

  get isConnected(): boolean {
    return this.client !== null && this.client.readyState === WebSocket.OPEN;
  }

  start(): void {
    this.wss = new WebSocketServer({ host: "127.0.0.1", port: WS_PORT });
    console.error(`[WsBridge] WebSocket server listening on ws://127.0.0.1:${WS_PORT}`);

    this.wss.on("connection", (ws: WebSocket) => {
      // 既存接続があれば切断
      if (this.client) {
        console.error("[WsBridge] New connection — closing previous client");
        try {
          this.client.send(JSON.stringify({ type: "replaced", message: "別のタブが接続しました" }));
          this.client.close();
        } catch { /* ignore */ }
        this._clearPending(new Error("接続が別タブに切り替わりました"));
      }

      this.client = ws;
      console.error("[WsBridge] Designer connected");
      this.emit("connected");

      ws.on("message", (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString()) as Response;
          const handler = this.pending.get(msg.id);
          if (handler) {
            clearTimeout(handler.timer);
            this.pending.delete(msg.id);
            if (msg.error) {
              handler.reject(new Error(msg.error));
            } else {
              handler.resolve(msg.result);
            }
          }
        } catch (e) {
          console.error("[WsBridge] Failed to parse message:", e);
        }
      });

      ws.on("close", () => {
        if (this.client === ws) {
          this.client = null;
          console.error("[WsBridge] Designer disconnected");
          this.emit("disconnected");
          this._clearPending(new Error("デザイナーが切断されました"));
        }
      });

      ws.on("error", (err) => {
        console.error("[WsBridge] WebSocket error:", err);
      });
    });

    this.wss.on("error", (err) => {
      console.error("[WsBridge] Server error:", err);
    });
  }

  async sendCommand(method: string, params?: unknown): Promise<unknown> {
    if (!this.isConnected) {
      throw new Error(
        "デザイナーがブラウザで開かれていません。http://localhost:5173 を開いてください"
      );
    }

    const id = randomUUID();
    const command: Command = { id, method, params };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`タイムアウト: ${method} が ${TIMEOUT_MS}ms 以内に応答しませんでした`));
      }, TIMEOUT_MS);

      this.pending.set(id, { resolve, reject, timer });
      this.client!.send(JSON.stringify(command));
    });
  }

  private _clearPending(err: Error): void {
    for (const [id, handler] of this.pending.entries()) {
      clearTimeout(handler.timer);
      handler.reject(err);
      this.pending.delete(id);
    }
  }
}

export const wsBridge = new WsBridge();
