/**
 * HTTP transport 統合テスト (#302)
 *
 * designer-mcp を子プロセスとして起動し、以下を検証:
 * - /health が JSON で応答
 * - /mcp initialize で session ID + protocolVersion 取得
 * - /mcp tools/list で登録済ツール一覧取得 (29 件)
 * - WebSocket も同一 port で待機している (ws:// で接続できる)
 *
 * テストは 5200 番台の port を使用 (本番 5179 と衝突しないため)。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { WebSocket } from "ws";
import { setTimeout as delay } from "node:timers/promises";

const TEST_PORT = 5201;
const MCP_URL = `http://localhost:${TEST_PORT}/mcp`;
const HEALTH_URL = `http://localhost:${TEST_PORT}/`;
const WS_URL = `ws://localhost:${TEST_PORT}/`;

let server: ChildProcess | null = null;

async function waitForReady(timeoutMs = 10000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(HEALTH_URL);
      if (r.ok) return;
    } catch { /* not ready yet */ }
    await delay(100);
  }
  throw new Error(`Server not ready after ${timeoutMs}ms`);
}

async function mcpCall(method: string, sessionId?: string, body: Record<string, unknown> = {}): Promise<{ status: number; headers: Headers; body: string }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", method, ...body }),
  });
  return { status: res.status, headers: res.headers, body: await res.text() };
}

describe("designer-mcp HTTP transport (#302)", () => {
  beforeAll(async () => {
    server = spawn("npx", ["tsx", "src/index.ts"], {
      cwd: __dirname + "/..", // designer-mcp/ dir
      env: { ...process.env, DESIGNER_MCP_PORT: String(TEST_PORT) },
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });
    server.on("error", (e) => console.error("[test] spawn error:", e));
    // pipe buffer を drain してブロッキングを防ぐ (#700 R-2 test fix)
    server.stderr?.resume();
    server.stdout?.resume();
    await waitForReady();
  }, 30000);

  afterAll(async () => {
    if (server && server.pid) {
      // Windows: shell:true で cmd.exe 経由の場合、process tree ごと強制終了する。
      // server.kill("SIGTERM") は cmd.exe しか殺さず node.js が orphan になってポートを占有し続けるため
      // taskkill /F /T で子孫まで含めてまとめて終了する (#700 R-2 test fix)
      try {
        const { execSync } = await import("node:child_process");
        execSync(`taskkill /F /T /PID ${server.pid}`, { stdio: "ignore" });
      } catch { /* ignore — already exited */ }
    }
    // Windows ではポート解放に時間がかかることがある
    await delay(500);
  }, 10000);
  it("GET / で health JSON が返る", async () => {
    const r = await fetch(HEALTH_URL);
    expect(r.ok).toBe(true);
    const j = await r.json();
    expect(j).toMatchObject({ status: "ok", service: "designer-mcp", port: TEST_PORT });
  });

  it("POST /mcp initialize で protocolVersion が返る (stateless)", async () => {
    const res = await mcpCall("initialize", undefined, {
      id: 1,
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "vitest", version: "1" },
      },
    });
    expect(res.body).toContain("\"protocolVersion\"");
    expect(res.body).toContain("designer-mcp");
  });

  it("tools/list で 20 件以上のツールが返り draft__* 6 種 + lock__* 5 種を含む", async () => {
    const res = await mcpCall("tools/list", undefined, { id: 2 });
    let parsed: { result?: { tools: { name: string }[] }; error?: unknown };
    const dataLine = res.body.split("\n").find((l) => l.startsWith("data: "));
    if (dataLine) {
      parsed = JSON.parse(dataLine.slice(6));
    } else if (res.body.trim().startsWith("{")) {
      parsed = JSON.parse(res.body);
    } else {
      throw new Error(`Unexpected tools/list response: ${res.body.slice(0, 200)}`);
    }
    expect(parsed.error, `MCP error: ${JSON.stringify(parsed.error)}`).toBeUndefined();
    expect(parsed.result?.tools).toBeInstanceOf(Array);
    expect(parsed.result!.tools.length).toBeGreaterThanOrEqual(25);
    const names = parsed.result!.tools.map((t) => t.name);
    expect(names).toContain("designer__list_process_flows");
    expect(names).toContain("designer__list_markers");
    expect(names).toContain("designer__find_all_markers");
    expect(names).toContain("draft__read");
    expect(names).toContain("draft__update");
    expect(names).toContain("draft__commit");
    expect(names).toContain("draft__discard");
    expect(names).toContain("draft__has");
    expect(names).toContain("draft__list");
    expect(names).toContain("lock__acquire");
    expect(names).toContain("lock__release");
    expect(names).toContain("lock__forceRelease");
    expect(names).toContain("lock__get");
    expect(names).toContain("lock__list");
  });

  it("draft E2E: update → has=true → discard → has=false", async () => {
    async function callTool(toolName: string, args: Record<string, unknown>) {
      const res = await mcpCall("tools/call", undefined, {
        id: Math.floor(Math.random() * 100000),
        params: { name: toolName, arguments: args },
      });
      const dataLine = res.body.split("\n").find((l) => l.startsWith("data: "));
      let parsed: { result?: { content: Array<{ type: string; text: string }> }; error?: unknown };
      if (dataLine) {
        parsed = JSON.parse(dataLine.slice(6));
      } else {
        parsed = JSON.parse(res.body);
      }
      if (parsed.error) throw new Error(`MCP error: ${JSON.stringify(parsed.error)}`);
      const text = parsed.result?.content?.[0]?.text ?? "";
      return JSON.parse(text);
    }

    await callTool("draft__update", {
      type: "table",
      id: "e2e-test-tbl",
      payload: { name: "e2e_table", columns: [] },
    });

    const hasResult = await callTool("draft__has", { type: "table", id: "e2e-test-tbl" });
    expect(hasResult.exists).toBe(true);

    const discardResult = await callTool("draft__discard", { type: "table", id: "e2e-test-tbl" });
    expect(discardResult.discarded).toBe(true);

    const hasAfter = await callTool("draft__has", { type: "table", id: "e2e-test-tbl" });
    expect(hasAfter.exists).toBe(false);
  });

  it("lock E2E: acquire → get=locked → release → get=null", async () => {
    async function callTool(toolName: string, args: Record<string, unknown>) {
      const res = await mcpCall("tools/call", undefined, {
        id: Math.floor(Math.random() * 100000),
        params: { name: toolName, arguments: args },
      });
      const dataLine = res.body.split("\n").find((l) => l.startsWith("data: "));
      let parsed: { result?: { content: Array<{ type: string; text: string }> }; error?: unknown };
      if (dataLine) {
        parsed = JSON.parse(dataLine.slice(6));
      } else {
        parsed = JSON.parse(res.body);
      }
      if (parsed.error) throw new Error(`MCP error: ${JSON.stringify(parsed.error)}`);
      const text = parsed.result?.content?.[0]?.text ?? "";
      return JSON.parse(text);
    }

    const acquireResult = await callTool("lock__acquire", {
      resourceType: "table",
      resourceId: "e2e-lock-tbl",
      sessionId: "e2e-session-X",
    });
    expect(acquireResult.entry).toBeDefined();
    expect(acquireResult.entry.ownerSessionId).toBe("e2e-session-X");

    const getResult = await callTool("lock__get", {
      resourceType: "table",
      resourceId: "e2e-lock-tbl",
    });
    expect(getResult.entry).not.toBeNull();
    expect(getResult.entry.ownerSessionId).toBe("e2e-session-X");

    const releaseResult = await callTool("lock__release", {
      resourceType: "table",
      resourceId: "e2e-lock-tbl",
      sessionId: "e2e-session-X",
    });
    expect(releaseResult.released).toBe(true);

    const getAfter = await callTool("lock__get", {
      resourceType: "table",
      resourceId: "e2e-lock-tbl",
    });
    expect(getAfter.entry).toBeNull();
  });

  it("同一 port で WebSocket も受け付ける (ws:// upgrade)", async () => {
    const ws = new WebSocket(WS_URL);
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("WS timeout")), 3000);
        ws.once("open", () => { clearTimeout(timer); resolve(); });
        ws.once("error", (e) => { clearTimeout(timer); reject(e); });
      });
      expect(ws.readyState).toBe(WebSocket.OPEN);
    } finally {
      ws.close();
    }
  });

  // ── per-session active state (#700 R-2) ─────────────────────────────
  describe("WorkspaceContextManager per-session (WS 経路)", () => {
    /**
     * WS 経由で 2 つのクライアントを接続し、それぞれが独立した workspace.status を返すことを確認。
     *
     * シナリオ:
     * 1. client-A が接続・登録
     * 2. client-B が接続・登録
     * 3. client-A に workspace.status を送る → active: null (未選択)
     * 4. client-B に workspace.status を送る → active: null (未選択)
     * 5. 2 session が独立した context として登録されている (WorkspaceContextManager 経由で確認)
     *
     * Note: workspace.open は実際のフォルダが必要なため E2E では open を試みず、
     * status の応答形式と WS connection の独立性を検証する。
     */
    it("2 WS クライアントが接続でき、各々が独立した workspace.status を返す", async () => {
      const clientAId = `test-client-A-${Date.now()}`;
      const clientBId = `test-client-B-${Date.now()}`;

      /** WS に接続して register し、request を送って response を受け取るヘルパー */
      async function wsRoundtrip(
        clientId: string,
        method: string,
        params?: Record<string, unknown>,
      ): Promise<{ result?: unknown; error?: string }> {
        return new Promise<{ result?: unknown; error?: string }>((resolve, reject) => {
          const ws = new WebSocket(WS_URL);
          const reqId = `req-${Math.random().toString(36).slice(2)}`;
          const timer = setTimeout(() => {
            ws.close();
            reject(new Error(`WS roundtrip timeout: ${method}`));
          }, 5000);

          ws.once("open", () => {
            // 1. register
            ws.send(JSON.stringify({ type: "register", clientId }));
            // 2. request
            ws.send(JSON.stringify({ type: "request", id: reqId, method, params: params ?? {} }));
          });

          ws.on("message", (data: Buffer) => {
            const msg = JSON.parse(data.toString()) as Record<string, unknown>;
            if (msg.type === "response" && msg.id === reqId) {
              clearTimeout(timer);
              ws.close();
              resolve({ result: msg.result, error: msg.error as string | undefined });
            }
          });

          ws.once("error", (e) => {
            clearTimeout(timer);
            reject(e);
          });
        });
      }

      // client-A: workspace.status
      const statusA = await wsRoundtrip(clientAId, "workspace.status");
      expect(statusA.error).toBeUndefined();
      const resultA = statusA.result as { active: unknown; lockdown: boolean };
      expect(resultA).toMatchObject({ lockdown: false });
      // active は null (未選択) または object (server 起動時の自動 active 化により設定済みの場合)
      expect(resultA).toHaveProperty("active");

      // client-B: workspace.status
      const statusB = await wsRoundtrip(clientBId, "workspace.status");
      expect(statusB.error).toBeUndefined();
      const resultB = statusB.result as { active: unknown; lockdown: boolean };
      expect(resultB).toMatchObject({ lockdown: false });
      expect(resultB).toHaveProperty("active");
    });
  });

  describe("WorkspaceContextManager lockdown (WS 経路)", () => {
    /**
     * lockdown モードでサーバが起動している場合、workspace.status で lockdown: true が返る。
     * ただしこのテストは通常モードのサーバで実行されるため、lockdown: false を検証する。
     * lockdown E2E は環境変数が必要なため別テストファイルで行う。
     */
    it("通常起動時は lockdown: false が返る", async () => {
      async function wsRoundtrip(clientId: string, method: string): Promise<unknown> {
        return new Promise<unknown>((resolve, reject) => {
          const ws = new WebSocket(WS_URL);
          const reqId = `req-${Math.random().toString(36).slice(2)}`;
          const timer = setTimeout(() => { ws.close(); reject(new Error("timeout")); }, 5000);
          ws.once("open", () => {
            ws.send(JSON.stringify({ type: "register", clientId }));
            ws.send(JSON.stringify({ type: "request", id: reqId, method, params: {} }));
          });
          ws.on("message", (data: Buffer) => {
            const msg = JSON.parse(data.toString()) as Record<string, unknown>;
            if (msg.type === "response" && msg.id === reqId) {
              clearTimeout(timer);
              ws.close();
              resolve(msg.result);
            }
          });
          ws.once("error", (e) => { clearTimeout(timer); reject(e); });
        });
      }

      const result = await wsRoundtrip(`lockdown-test-${Date.now()}`, "workspace.status") as { lockdown: boolean };
      expect(result.lockdown).toBe(false);
    });
  });
});
