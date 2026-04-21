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

beforeAll(async () => {
  server = spawn("npx", ["tsx", "src/index.ts"], {
    cwd: __dirname + "/..", // designer-mcp/ dir
    env: { ...process.env, DESIGNER_MCP_PORT: String(TEST_PORT) },
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
  });
  server.on("error", (e) => console.error("[test] spawn error:", e));
  await waitForReady();
}, 30000);

afterAll(async () => {
  if (server && !server.killed) {
    server.kill("SIGTERM");
    // Windows ではすぐに解放されないことがあるので少し待つ
    await delay(500);
    if (!server.killed) server.kill("SIGKILL");
  }
}, 10000);

describe("designer-mcp HTTP transport (#302)", () => {
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

  it("tools/list で 20 件以上のツールが返る (stateless なので initialize 直後に呼べる)", async () => {
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
    expect(parsed.result!.tools.length).toBeGreaterThanOrEqual(20);
    const names = parsed.result!.tools.map((t) => t.name);
    expect(names).toContain("designer__list_action_groups");
    expect(names).toContain("designer__list_markers");
    expect(names).toContain("designer__find_all_markers");
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
});
