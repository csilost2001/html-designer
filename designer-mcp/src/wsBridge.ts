import { WebSocketServer, WebSocket } from "ws";
import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import { execSync } from "child_process";
import { createServer, type IncomingMessage, type ServerResponse, type Server as HttpServer } from "node:http";
import { renameScreenItemId, checkScreenItemRefs } from "./renameScreenItem.js";
import {
  ensureDataDir,
  readProject,
  writeProject,
  readScreen,
  writeScreen,
  deleteScreen as deleteScreenFile,
  readCustomBlocks,
  writeCustomBlocks,
  readTable,
  writeTable,
  deleteTable as deleteTableFile,
  readErLayout,
  writeErLayout,
  readActionGroup,
  writeActionGroup,
  deleteActionGroup as deleteActionGroupFile,
  listActionGroups as listActionGroupFiles,
  readConventions,
  writeConventions,
  readScreenItems,
  writeScreenItems,
  deleteScreenItems,
  readSequence,
  writeSequence,
  deleteSequence as deleteSequenceFile,
  getFileMtime,
} from "./projectStorage.js";

type Command = { id: string; method: string; params?: unknown };
type Response = { id: string; result?: unknown; error?: string };
type BrowserRequest = { type: "request"; id: string; method: string; params?: unknown };

// Port は env var で上書き可能 (テスト用に任意 port を使う想定)。未指定なら 5179 (#302)
const WS_PORT = parseInt(process.env.DESIGNER_MCP_PORT ?? "5179", 10);
const TIMEOUT_MS = 10000;

/** ポートを占有している古い designer-mcp プロセスを強制終了 */
function killStaleProcessOnPort(port: number): boolean {
  try {
    const output = execSync(`netstat -ano -p tcp`, { encoding: "utf8", windowsHide: true });
    const lines = output.split(/\r?\n/);
    const ownPid = process.pid;
    const pids = new Set<number>();

    for (const line of lines) {
      if (!/LISTENING/.test(line)) continue;
      // 127.0.0.1 / 0.0.0.0 / [::] いずれの bind でも検出 (#302 対応で HTTP サーバは 0.0.0.0 bind)
      const match = line.match(/(?:127\.0\.0\.1|0\.0\.0\.0|\[::\]|\[::1\]):(\d+)\s+\S+\s+LISTENING\s+(\d+)/);
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

/** HTTP request handler (index.ts が MCP endpoint 等を register するために使用) */
type HttpRequestHandler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;

class WsBridge extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private httpServer: HttpServer | null = null;
  private httpRoutes: Array<{ pathPrefix: string; handler: HttpRequestHandler }> = [];
  /** clientId → WebSocket（登録済みクライアント） */
  private clients = new Map<string, WebSocket>();
  /** 接続順（最後が最新）。MCP コマンドの送信先選択に使用 */
  private clientOrder: string[] = [];
  /** MCP コマンドの応答待ちハンドラ */
  private pending = new Map<
    string,
    { resolve: (r: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
  >();

  get isConnected(): boolean {
    return this.clients.size > 0;
  }

  /** MCP コマンドを送る先: 最後に接続した有効なクライアント */
  private get activeClient(): WebSocket | null {
    for (let i = this.clientOrder.length - 1; i >= 0; i--) {
      const ws = this.clients.get(this.clientOrder[i]);
      if (ws && ws.readyState === WebSocket.OPEN) return ws;
    }
    return null;
  }

  async start(): Promise<void> {
    await ensureDataDir();
    if (killStaleProcessOnPort(WS_PORT)) {
      await delay(500);
    }
    await this._bind();
  }

  private async _bind(retries = 3): Promise<void> {
    return new Promise((resolve, reject) => {
      // HTTP サーバに WS をアタッチ (同一 port で HTTP + WS を提供 — #302)
      const httpServer = createServer((req, res) => this._handleHttp(req, res));
      const wss = new WebSocketServer({ server: httpServer });

      const onError = async (err: NodeJS.ErrnoException) => {
        httpServer.off("listening", onListening);
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
        httpServer.off("error", onError);
        this.httpServer = httpServer;
        this.wss = wss;
        console.error(`[WsBridge] HTTP + WebSocket listening on 0.0.0.0:${WS_PORT} (ws:// and http://)`);
        this._attachHandlers();
        resolve();
      };

      httpServer.once("error", onError);
      httpServer.once("listening", onListening);
      httpServer.listen(WS_PORT, "0.0.0.0");
    });
  }

  /**
   * index.ts 側が特定 path prefix 用の HTTP ハンドラを登録する (#302: MCP HTTP transport)。
   * 登録順にマッチ判定、先にマッチしたものが処理。
   */
  registerHttpHandler(pathPrefix: string, handler: HttpRequestHandler): void {
    this.httpRoutes.push({ pathPrefix, handler });
  }

  private async _handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? "/";
    for (const route of this.httpRoutes) {
      if (url === route.pathPrefix || url.startsWith(route.pathPrefix + "/") || url.startsWith(route.pathPrefix + "?")) {
        try {
          await route.handler(req, res);
        } catch (e) {
          console.error(`[WsBridge] HTTP handler error (${route.pathPrefix}):`, e);
          if (!res.writableEnded) {
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end(`Internal error: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        return;
      }
    }
    // Simple health check endpoint
    if (url === "/" || url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", service: "designer-mcp", port: WS_PORT }));
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  }

  private _attachHandlers(): void {
    if (!this.wss) return;

    this.wss.on("connection", (ws: WebSocket) => {
      // 登録前は一時 ID で管理
      let clientId = `temp-${randomUUID()}`;
      this.clients.set(clientId, ws);
      this.clientOrder.push(clientId);
      console.error(`[WsBridge] New connection (${clientId.substring(0, 12)}..., total: ${this.clients.size})`);
      if (this.clients.size === 1) this.emit("connected");

      ws.on("message", (data: Buffer) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(data.toString()) as Record<string, unknown>;
        } catch (e) {
          console.error("[WsBridge] Failed to parse message:", e);
          return;
        }

        // ── register: ブラウザが接続直後に送る登録メッセージ ──
        if (msg.type === "register") {
          const newId = msg.clientId as string;

          // 同じ clientId が既に存在する場合（再接続）は古い接続を閉じる
          const existingWs = this.clients.get(newId);
          if (existingWs && existingWs !== ws) {
            try { existingWs.close(); } catch { /* ignore */ }
            this.clients.delete(newId);
            const eIdx = this.clientOrder.indexOf(newId);
            if (eIdx >= 0) this.clientOrder.splice(eIdx, 1);
          }

          // 一時 ID → 実 ID に置き換え
          this.clients.delete(clientId);
          const tIdx = this.clientOrder.indexOf(clientId);
          if (tIdx >= 0) this.clientOrder[tIdx] = newId;
          clientId = newId;
          this.clients.set(clientId, ws);
          console.error(`[WsBridge] Client registered: ${clientId.substring(0, 8)}... (total: ${this.clients.size})`);
          return;
        }

        // ── request: ブラウザからのファイル操作リクエスト ──
        if (msg.type === "request") {
          const req = msg as unknown as BrowserRequest;
          this._handleBrowserRequest(ws, clientId, req).catch((e) => {
            console.error("[WsBridge] Browser request error:", e);
            try {
              ws.send(JSON.stringify({ type: "response", id: req.id, error: String(e) }));
            } catch { /* ignore */ }
          });
          return;
        }

        // ── それ以外: MCP コマンドへの応答 ──
        const response = msg as unknown as Response;
        const handler = this.pending.get(response.id);
        if (handler) {
          clearTimeout(handler.timer);
          this.pending.delete(response.id);
          if (response.error) {
            handler.reject(new Error(response.error));
          } else {
            handler.resolve(response.result);
          }
        }
      });

      ws.on("close", () => {
        if (this.clients.get(clientId) === ws) {
          this.clients.delete(clientId);
          const idx = this.clientOrder.indexOf(clientId);
          if (idx >= 0) this.clientOrder.splice(idx, 1);
          console.error(`[WsBridge] Client disconnected: ${clientId.substring(0, 8)}... (remaining: ${this.clients.size})`);
          if (this.clients.size === 0) {
            this.emit("disconnected");
            this._clearPending(new Error("デザイナーが切断されました"));
          }
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

  /** 特定クライアントへイベントを送信 */
  sendToClient(clientId: string, event: string, data: unknown): void {
    const ws = this.clients.get(clientId);
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify({ type: "broadcast", event, data }));
    } catch { /* ignore */ }
  }

  /** 全クライアント（送信元除く）へブロードキャスト */
  broadcast(event: string, data: unknown, excludeClientId?: string): void {
    const msg = JSON.stringify({ type: "broadcast", event, data });
    for (const [id, ws] of this.clients) {
      if (id === excludeClientId) continue;
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(msg); } catch { /* ignore */ }
      }
    }
  }

  /** ブラウザからのファイル操作リクエストを処理 */
  private async _handleBrowserRequest(
    ws: WebSocket,
    clientId: string,
    req: BrowserRequest,
  ): Promise<void> {
    const { id, method, params } = req;

    const respond = (result: unknown): void => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "response", id, result }));
      }
    };
    const respondError = (error: string): void => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "response", id, error }));
      }
    };

    try {
      switch (method) {
        case "loadProject": {
          const project = await readProject();
          respond(project);
          break;
        }
        case "saveProject": {
          const { project } = (params ?? {}) as { project: unknown };
          await writeProject(project);
          respond({ success: true });
          this.broadcast("projectChanged", {}, clientId);
          break;
        }
        case "loadScreen": {
          const { screenId } = (params ?? {}) as { screenId: string };
          const data = await readScreen(screenId);
          respond(data);
          break;
        }
        case "saveScreen": {
          const { screenId, data } = (params ?? {}) as { screenId: string; data: unknown };
          await writeScreen(screenId, data);
          // 初回デザイン保存時に project の hasDesign フラグを更新
          try {
            const project = await readProject() as { screens?: Array<{ id: string; hasDesign?: boolean; updatedAt?: string }>; updatedAt?: string } | null;
            if (project?.screens) {
              const screen = project.screens.find((s) => s.id === screenId);
              if (screen && !screen.hasDesign) {
                screen.hasDesign = true;
                screen.updatedAt = new Date().toISOString();
                project.updatedAt = new Date().toISOString();
                await writeProject(project);
                this.broadcast("projectChanged", {}, clientId);
              }
            }
          } catch (e) {
            console.error("[WsBridge] Failed to update hasDesign:", e);
          }
          respond({ success: true });
          this.broadcast("screenChanged", { screenId }, clientId);
          break;
        }
        case "deleteScreen": {
          const { screenId } = (params ?? {}) as { screenId: string };
          await deleteScreenFile(screenId);
          respond({ success: true });
          this.broadcast("screenChanged", { screenId, deleted: true }, clientId);
          break;
        }
        case "loadCustomBlocks": {
          const blocks = await readCustomBlocks();
          respond(blocks);
          break;
        }
        case "saveCustomBlocks": {
          const { blocks } = (params ?? {}) as { blocks: unknown[] };
          await writeCustomBlocks(blocks);
          respond({ success: true });
          this.broadcast("customBlocksChanged", {}, clientId);
          break;
        }
        case "loadTable": {
          const { tableId } = (params ?? {}) as { tableId: string };
          const tableData = await readTable(tableId);
          respond(tableData);
          break;
        }
        case "saveTable": {
          const { tableId, data } = (params ?? {}) as { tableId: string; data: unknown };
          await writeTable(tableId, data);
          respond({ success: true });
          this.broadcast("tableChanged", { tableId }, clientId);
          break;
        }
        case "deleteTable": {
          const { tableId } = (params ?? {}) as { tableId: string };
          await deleteTableFile(tableId);
          respond({ success: true });
          this.broadcast("tableChanged", { tableId, deleted: true }, clientId);
          break;
        }
        case "loadErLayout": {
          const layoutData = await readErLayout();
          respond(layoutData);
          break;
        }
        case "saveErLayout": {
          const { data } = (params ?? {}) as { data: unknown };
          await writeErLayout(data);
          respond({ success: true });
          this.broadcast("erLayoutChanged", {}, clientId);
          break;
        }
        case "loadActionGroup": {
          const { id: agId } = (params ?? {}) as { id: string };
          const agData = await readActionGroup(agId);
          respond(agData);
          break;
        }
        case "saveActionGroup": {
          const { id: agId, data: agData } = (params ?? {}) as { id: string; data: unknown };
          await writeActionGroup(agId, agData);
          respond({ success: true });
          this.broadcast("actionGroupChanged", { id: agId }, clientId);
          break;
        }
        case "deleteActionGroup": {
          const { id: agId } = (params ?? {}) as { id: string };
          await deleteActionGroupFile(agId);
          respond({ success: true });
          this.broadcast("actionGroupChanged", { id: agId, deleted: true }, clientId);
          break;
        }
        case "listActionGroups": {
          const agList = await listActionGroupFiles();
          const metas = (agList as Array<{ id: string; name: string; type: string; screenId?: string; actions?: unknown[]; updatedAt: string }>).map((ag) => ({
            id: ag.id,
            name: ag.name,
            type: ag.type,
            screenId: ag.screenId,
            actionCount: ag.actions?.length ?? 0,
            updatedAt: ag.updatedAt,
          }));
          respond(metas);
          break;
        }
        case "loadConventions": {
          const catalog = await readConventions();
          respond(catalog);
          break;
        }
        case "saveConventions": {
          const { catalog } = (params ?? {}) as { catalog: unknown };
          await writeConventions(catalog);
          respond({ success: true });
          this.broadcast("conventionsChanged", {}, clientId);
          break;
        }
        case "loadScreenItems": {
          const { screenId } = (params ?? {}) as { screenId: string };
          const items = await readScreenItems(screenId);
          respond(items);
          break;
        }
        case "saveScreenItems": {
          const { screenId, data } = (params ?? {}) as { screenId: string; data: unknown };
          await writeScreenItems(screenId, data);
          respond({ success: true });
          this.broadcast("screenItemsChanged", { screenId }, clientId);
          break;
        }
        case "deleteScreenItems": {
          const { screenId } = (params ?? {}) as { screenId: string };
          await deleteScreenItems(screenId);
          respond({ success: true });
          this.broadcast("screenItemsChanged", { screenId, deleted: true }, clientId);
          break;
        }
        case "loadSequence": {
          const { sequenceId } = (params ?? {}) as { sequenceId: string };
          const seqData = await readSequence(sequenceId);
          respond(seqData);
          break;
        }
        case "saveSequence": {
          const { sequenceId, data } = (params ?? {}) as { sequenceId: string; data: unknown };
          await writeSequence(sequenceId, data);
          respond({ success: true });
          this.broadcast("sequenceChanged", { sequenceId }, clientId);
          break;
        }
        case "deleteSequence": {
          const { sequenceId } = (params ?? {}) as { sequenceId: string };
          await deleteSequenceFile(sequenceId);
          respond({ success: true });
          this.broadcast("sequenceChanged", { sequenceId, deleted: true }, clientId);
          break;
        }
        case "getFileMtime": {
          const { kind, id: fid } = (params ?? {}) as { kind: string; id?: string };
          const mtime = await getFileMtime(kind, fid);
          respond({ mtime });
          break;
        }
        case "renameScreenItem": {
          const { screenId, oldId, newId } = (params ?? {}) as {
            screenId: string; oldId: string; newId: string;
          };
          const result = await renameScreenItemId(screenId, oldId, newId);
          respond(result);
          this.broadcast("screenItemsChanged", { screenId }, clientId);
          for (const agId of result.actionGroupsUpdated) {
            this.broadcast("actionGroupChanged", { id: agId }, clientId);
          }
          if (result.screenHtmlUpdated) {
            this.broadcast("screenChanged", { screenId }, clientId);
          }
          break;
        }
        case "checkScreenItemRefs": {
          const { screenId, itemId } = (params ?? {}) as { screenId: string; itemId: string };
          const result = await checkScreenItemRefs(screenId, itemId);
          respond(result);
          break;
        }
        default:
          respondError(`未知のリクエストメソッド: ${method}`);
      }
    } catch (e) {
      respondError(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * sendCommand のラッパー。ブラウザ未接続・エラー時は null を返す (browser-first fallback 用)。
   */
  async tryCommand(method: string, params?: unknown): Promise<unknown | null> {
    try {
      return await this.sendCommand(method, params);
    } catch (e) {
      if (process.env.NODE_ENV !== "production") {
        console.error(`[WsBridge] tryCommand(${method}) failed, falling back to file:`, e);
      }
      return null;
    }
  }

  /** MCP コマンドをアクティブクライアントへ送信 */
  async sendCommand(method: string, params?: unknown): Promise<unknown> {
    const ws = this.activeClient;
    if (!ws) {
      throw new Error(
        "デザイナーがブラウザで開かれていません。http://localhost:5173 を開いてください",
      );
    }

    const id = randomUUID();
    const command: Command = { id, method, params };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(`タイムアウト: ${method} が ${TIMEOUT_MS}ms 以内に応答しませんでした`),
        );
      }, TIMEOUT_MS);

      this.pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify(command));
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
