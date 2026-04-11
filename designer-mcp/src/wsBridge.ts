import { WebSocketServer, WebSocket } from "ws";
import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import { execSync } from "child_process";

type Command = { id: string; method: string; params?: unknown };
type Response = { id: string; result?: unknown; error?: string };

const WS_PORT = 5179;
const TIMEOUT_MS = 10000;

/** ポートを占有している古いdesigner-mcpプロセスを検出して強制終了する */
function killStaleProcessOnPort(port: number): boolean {
  try {
    // netstatでポート使用中のPIDを特定
    const output = execSync(`netstat -ano -p tcp`, { encoding: "utf8", windowsHide: true });
    const lines = output.split(/\r?\n/);
    const ownPid = process.pid;
    const pids = new Set<number>();

    for (const line of lines) {
      // LISTENING行のみ、かつ該当ポート
      if (!/LISTENING/.test(line)) continue;
      const match = line.match(/127\.0\.0\.1:(\d+)\s+\S+\s+LISTENING\s+(\d+)/);
      if (!match) continue;
      if (parseInt(match[1], 10) !== port) continue;
      const pid = parseInt(match[2], 10);
      if (pid !== ownPid) pids.add(pid);
    }

    if (pids.size === 0) return false;

    for (const pid of pids) {
      console.error(`[WsBridge] Killing stale process PID=${pid} on port ${port}`);
      try {
        execSync(`taskkill /F /PID ${pid}`, { windowsHide: true, stdio: "ignore" });
      } catch (e) {
        console.error(`[WsBridge] Failed to kill PID=${pid}:`, e);
      }
    }
    return true;
  } catch (e) {
    console.error("[WsBridge] killStaleProcessOnPort error:", e);
    return false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class WsBridge extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private client: WebSocket | null = null;
  private pending = new Map<string, { resolve: (r: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();

  get isConnected(): boolean {
    return this.client !== null && this.client.readyState === WebSocket.OPEN;
  }

  async start(): Promise<void> {
    // 起動時に古いdesigner-mcpプロセスを強制終了
    if (killStaleProcessOnPort(WS_PORT)) {
      // プロセス終了後、ポート解放を待つ
      await delay(500);
    }

    await this._bind();
  }

  private async _bind(retries = 3): Promise<void> {
    return new Promise((resolve, reject) => {
      const wss = new WebSocketServer({ host: "127.0.0.1", port: WS_PORT });

      const onError = async (err: NodeJS.ErrnoException) => {
        wss.off("listening", onListening);
        if (err.code === "EADDRINUSE" && retries > 0) {
          console.error(`[WsBridge] Port ${WS_PORT} busy, retrying (${retries} left)...`);
          killStaleProcessOnPort(WS_PORT);
          await delay(500);
          try {
            await this._bind(retries - 1);
            resolve();
          } catch (e) {
            reject(e);
          }
        } else {
          console.error("[WsBridge] Failed to bind:", err);
          reject(err);
        }
      };

      const onListening = () => {
        wss.off("error", onError);
        this.wss = wss;
        console.error(`[WsBridge] WebSocket server listening on ws://127.0.0.1:${WS_PORT}`);
        this._attachHandlers();
        resolve();
      };

      wss.once("error", onError);
      wss.once("listening", onListening);
    });
  }

  private _attachHandlers(): void {
    if (!this.wss) return;

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

    this.wss.on("error", (err: NodeJS.ErrnoException) => {
      console.error("[WsBridge] Server runtime error:", err);
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
