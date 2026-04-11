import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { wsBridge } from "./wsBridge.js";
import { tools } from "./tools.js";

// 親プロセス（Claude Code）が死んだら自動終了
function setupLifecycle(): void {
  const exitHandler = (reason: string) => {
    console.error(`[MCP] Exiting: ${reason}`);
    process.exit(0);
  };
  process.stdin.on("end", () => exitHandler("stdin ended"));
  process.stdin.on("close", () => exitHandler("stdin closed"));
  process.on("SIGTERM", () => exitHandler("SIGTERM"));
  process.on("SIGINT", () => exitHandler("SIGINT"));
  process.on("disconnect", () => exitHandler("disconnected from parent"));
}

setupLifecycle();

// WebSocketブリッジを起動（古いプロセスが残っていれば自動終了を待つ）
await wsBridge.start();
wsBridge.on("connected", () => console.error("[MCP] Designer connected via WebSocket"));
wsBridge.on("disconnected", () => console.error("[MCP] Designer disconnected"));

// MCPサーバーを初期化
const server = new Server(
  { name: "designer-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

// ツール一覧
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// ツール呼び出し
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "designer__get_html": {
        const result = (await wsBridge.sendCommand("getHtml")) as {
          html: string;
          css: string;
        };
        return {
          content: [
            {
              type: "text",
              text: `## HTML\n\`\`\`html\n${result.html}\n\`\`\`\n\n## CSS\n\`\`\`css\n${result.css}\n\`\`\``,
            },
          ],
        };
      }

      case "designer__set_components": {
        if (!args || typeof (args as Record<string, unknown>).html !== "string") {
          throw new McpError(ErrorCode.InvalidParams, "html パラメータが必要です");
        }
        const html = (args as Record<string, unknown>).html as string;
        await wsBridge.sendCommand("setComponents", { html });
        return {
          content: [
            {
              type: "text",
              text: "デザイナーのコンテンツを更新しました。",
            },
          ],
        };
      }

      case "designer__screenshot": {
        const result = (await wsBridge.sendCommand("screenshot")) as {
          png: string;
        };
        return {
          content: [
            {
              type: "image",
              data: result.png,
              mimeType: "image/png",
            },
          ],
        };
      }

      case "designer__list_blocks": {
        const result = (await wsBridge.sendCommand("listBlocks")) as {
          blocks: Array<{ id: string; label: string; category: string }>;
        };
        const lines = result.blocks.map(
          (b) => `- [${b.category}] ${b.id} — ${b.label}`
        );
        return {
          content: [
            {
              type: "text",
              text: `利用可能ブロック (${result.blocks.length}件):\n${lines.join("\n")}`,
            },
          ],
        };
      }

      case "designer__add_block": {
        const a = (args ?? {}) as Record<string, unknown>;
        if (typeof a.blockId !== "string") {
          throw new McpError(ErrorCode.InvalidParams, "blockId は必須です");
        }
        const result = (await wsBridge.sendCommand("addBlock", {
          blockId: a.blockId,
          targetId: typeof a.targetId === "string" ? a.targetId : undefined,
          position: typeof a.position === "string" ? a.position : undefined,
        })) as { addedId: string };
        return {
          content: [
            {
              type: "text",
              text: `ブロック ${a.blockId} を追加しました（新要素ID: ${result.addedId}）`,
            },
          ],
        };
      }

      case "designer__remove_element": {
        const a = (args ?? {}) as Record<string, unknown>;
        if (typeof a.id !== "string") {
          throw new McpError(ErrorCode.InvalidParams, "id は必須です");
        }
        await wsBridge.sendCommand("removeElement", { id: a.id });
        return {
          content: [
            { type: "text", text: `要素 ${a.id} を削除しました。` },
          ],
        };
      }

      case "designer__update_element": {
        const a = (args ?? {}) as Record<string, unknown>;
        if (typeof a.id !== "string") {
          throw new McpError(ErrorCode.InvalidParams, "id は必須です");
        }
        await wsBridge.sendCommand("updateElement", {
          id: a.id,
          attributes: a.attributes,
          style: a.style,
          text: a.text,
          classes: a.classes,
        });
        return {
          content: [
            { type: "text", text: `要素 ${a.id} を更新しました。` },
          ],
        };
      }

      case "designer__set_theme": {
        const a = (args ?? {}) as Record<string, unknown>;
        if (typeof a.theme !== "string") {
          throw new McpError(ErrorCode.InvalidParams, "theme は必須です");
        }
        await wsBridge.sendCommand("setTheme", { theme: a.theme });
        return {
          content: [
            { type: "text", text: `テーマを ${a.theme} に切り替えました。` },
          ],
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `未知のツール: ${name}`);
    }
  } catch (err) {
    if (err instanceof McpError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `エラー: ${message}` }],
      isError: true,
    };
  }
});

// 起動
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[MCP] designer-mcp server started (stdio)");
}

main().catch((err) => {
  console.error("[MCP] Fatal error:", err);
  process.exit(1);
});
