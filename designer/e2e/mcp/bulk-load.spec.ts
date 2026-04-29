import { test, expect } from "@playwright/test";
import * as net from "net";

async function isMcpRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(500);
    socket.connect(5179, "127.0.0.1", () => { socket.destroy(); resolve(true); });
    socket.on("error", () => resolve(false));
    socket.on("timeout", () => resolve(false));
  });
}

function sendBrowserRequest(method: string, params: unknown = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket("ws://localhost:5179");
    const clientId = `test-client-${Date.now()}`;
    const reqId = `req-${Date.now()}`;

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error(`Timeout waiting for response to ${method}`));
    }, 10000);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "register", clientId }));
      ws.send(JSON.stringify({ type: "request", id: reqId, method, params }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.type === "response" && msg.id === reqId) {
          clearTimeout(timeout);
          ws.close();
          if (msg.error) reject(new Error(msg.error));
          else resolve(msg.result);
        }
      } catch { /* ignore unrelated messages */ }
    };

    ws.onerror = () => reject(new Error("WebSocket error"));
  });
}

test.describe("wsBridge bulk load (#587)", () => {
  test.beforeEach(async () => {
    const running = await isMcpRunning();
    if (!running) test.skip();
  });

  test("listAllTables は配列を返す", async () => {
    const result = await sendBrowserRequest("listAllTables");
    expect(Array.isArray(result)).toBe(true);
  });

  test("listAllViews は配列を返す", async () => {
    const result = await sendBrowserRequest("listAllViews");
    expect(Array.isArray(result)).toBe(true);
  });
});
