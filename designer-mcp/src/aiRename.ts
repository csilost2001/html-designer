/**
 * ブラウザからの「IDを AI で再命名」ボタン用 HTTP endpoints (#337)。
 *
 * GET  /ai/rename-screen-ids/auth-check  → { authenticated: boolean, message?: string }
 * POST /ai/rename-screen-ids/propose     → { mapping: Record<string,string> }
 *
 * propose は SKILL.md を読み込み `claude -p` を spawn し、
 * stream-json を readline で parse しながら aiRenameProgress を対象 clientId へ送信する。
 * 完了後に FINAL_MAPPING: {...} 行から mapping を抽出して返す。
 */
import { execFileSync, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { wsBridge } from "./wsBridge.js";

const SKILL_PATH = ".claude/skills/rename-screen-ids/SKILL.md";
const TIMEOUT_MS = 60_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AiRenameProgressEvent {
  stage: "auth-check" | "analyzing" | "inferring" | "proposed" | "applying" | "done" | "error";
  message: string;
  error?: string;
  mapping?: Record<string, string>;
}

function sendProgress(clientId: string, event: AiRenameProgressEvent): void {
  wsBridge.sendToClient(clientId, "aiRenameProgress", event);
}

function jsonBody(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(json);
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

/** claude auth status で認証確認 */
function checkAuth(): boolean {
  try {
    execFileSync("claude", ["auth", "status"], { encoding: "utf8", windowsHide: true, timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

/** GET /ai/rename-screen-ids/auth-check */
export async function handleAuthCheck(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const authenticated = checkAuth();
  jsonBody(res, authenticated ? 200 : 503, {
    authenticated,
    message: authenticated
      ? "claude CLI に認証されています"
      : "claude CLI が未認証です。ターミナルで `claude login` を実行してください。",
  });
}

/** POST /ai/rename-screen-ids/propose */
export async function handlePropose(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: { screenId?: string; clientId?: string };
  try {
    body = JSON.parse(await readBody(req)) as { screenId?: string; clientId?: string };
  } catch {
    jsonBody(res, 400, { error: "リクエストボディが不正です" });
    return;
  }

  const { screenId, clientId } = body;

  if (typeof screenId !== "string" || !UUID_RE.test(screenId)) {
    jsonBody(res, 400, { error: "screenId は UUID 形式で指定してください" });
    return;
  }
  if (typeof clientId !== "string") {
    jsonBody(res, 400, { error: "clientId は必須です" });
    return;
  }

  if (!checkAuth()) {
    sendProgress(clientId, {
      stage: "error",
      message: "claude CLI が未認証です",
      error: "claude login を実行してください",
    });
    jsonBody(res, 503, { error: "claude CLI が未認証です。`claude login` を実行してください。" });
    return;
  }

  let skillContent: string;
  try {
    skillContent = await fs.readFile(path.resolve(SKILL_PATH), "utf-8");
  } catch {
    jsonBody(res, 500, { error: `SKILL.md が見つかりません: ${SKILL_PATH}` });
    return;
  }

  const prompt =
    skillContent +
    `\n\n引数 $ARGUMENTS = "${screenId}"\n\n` +
    "**重要**: ブラウザから起動のため Step 4/5 のユーザー対話と apply はスキップ。\n" +
    "Step 1-3 を実行し、推論した mapping を最終行に `FINAL_MAPPING: {\"oldId\": \"newId\", ...}` の JSON 形式で出力。\n" +
    "apply_rename_mapping は呼ばない (ブラウザ側で確認後に別途実行される)。";

  sendProgress(clientId, { stage: "analyzing", message: "未命名項目を取得中..." });

  let mapping: Record<string, string> = {};
  let timedOut = false;

  await new Promise<void>((resolve) => {
    const child = spawn(
      "claude",
      ["-p", prompt, "--mcp-config", "./.mcp.json", "--output-format", "stream-json", "--max-turns", "20"],
      { cwd: process.cwd(), windowsHide: true },
    );

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, TIMEOUT_MS);

    const rl = createInterface({ input: child.stdout });
    let inferringNotified = false;

    rl.on("line", (line) => {
      if (!line.trim()) return;

      // FINAL_MAPPING 行を捕捉
      const finalMatch = /FINAL_MAPPING:\s*(\{[^}]*\})/.exec(line);
      if (finalMatch) {
        try {
          mapping = JSON.parse(finalMatch[1]) as Record<string, string>;
        } catch { /* ignore */ }
        return;
      }

      // stream-json イベントを parse して進捗通知
      try {
        const evt = JSON.parse(line) as Record<string, unknown>;
        const type = evt.type as string;

        if (type === "assistant" && !inferringNotified) {
          inferringNotified = true;
          sendProgress(clientId, { stage: "inferring", message: "業務名を推論中..." });
        }

        // content_block_delta に text があれば進捗として流す
        if (type === "content_block_delta") {
          const delta = evt.delta as Record<string, unknown> | undefined;
          if (delta?.type === "text_delta") {
            const text = (delta.text as string ?? "").trim();
            if (text) {
              // FINAL_MAPPING 行も delta 内に来る場合に備えて再チェック
              const fm = /FINAL_MAPPING:\s*(\{[^}]*\})/.exec(text);
              if (fm) {
                try { mapping = JSON.parse(fm[1]) as Record<string, string>; } catch { /* ignore */ }
              }
            }
          }
        }
      } catch { /* non-JSON lines are ignored */ }
    });

    child.stderr.on("data", (_d: Buffer) => { /* suppress stderr */ });

    child.on("close", () => {
      clearTimeout(timeout);
      resolve();
    });

    child.on("error", () => {
      clearTimeout(timeout);
      resolve();
    });
  });

  if (timedOut) {
    sendProgress(clientId, {
      stage: "error",
      message: "タイムアウト (60秒) しました",
      error: "claude CLI の実行がタイムアウトしました",
    });
    jsonBody(res, 504, { error: "タイムアウト" });
    return;
  }

  sendProgress(clientId, {
    stage: "proposed",
    message: `${Object.keys(mapping).length} 件のリネームを提案します`,
    mapping,
  });

  jsonBody(res, 200, { mapping });
}
