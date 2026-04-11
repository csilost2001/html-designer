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

// WebSocketブリッジを起動
wsBridge.start();
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
