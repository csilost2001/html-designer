import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "node:crypto";
import { handleMarkerTool } from "./handlers/marker.js";
import { handleActionGroupTool } from "./handlers/actionGroup.js";
import { renameScreenItemId, checkScreenItemRefs, updateActionGroupRefs } from "./renameScreenItem.js";
import { getRenameContext, applyRenameMapping } from "./renameContext.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { wsBridge } from "./wsBridge.js";
import { tools } from "./tools.js";
import { handleAuthCheck, handlePropose } from "./aiRename.js";
import { htmlToReact, toPascalCase } from "./reactExporter.js";
import { readProject, readCustomBlocks, readTable, writeTable, deleteTable as deleteTableFile, writeProject, readErLayout, readActionGroup, writeActionGroup, deleteActionGroup as deleteActionGroupFile, listActionGroups as listActionGroupFiles } from "./projectStorage.js";

// 常駐バックエンドなので停止 signal (SIGTERM/SIGINT/disconnect) のみ監視。
// stdin は監視しない (#302: HTTP transport に統一、stdio 廃止)。
function setupLifecycle(): void {
  const exitHandler = (reason: string) => {
    console.error(`[MCP] Exiting: ${reason}`);
    process.exit(0);
  };
  process.on("SIGTERM", () => exitHandler("SIGTERM"));
  process.on("SIGINT", () => exitHandler("SIGINT"));
  process.on("disconnect", () => exitHandler("disconnected from parent"));
}

setupLifecycle();

// HTTP + WebSocket サーバ起動 (port 5179 に両方同居)
await wsBridge.start();
wsBridge.on("connected", () => console.error("[MCP] Designer connected via WebSocket"));
wsBridge.on("disconnected", () => console.error("[MCP] Designer disconnected"));

// MCPサーバーのファクトリ (#302): HTTP リクエスト毎に fresh な Server インスタンスを
// 作成することで、複数クライアントが同時接続しても互いの initialize 状態と干渉しない
// (Server.connect(transport) は 1:1 関係、1 Server を複数 transport に share はできないため)
function createMcpServer(): Server {
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
  const argRecord = (args ?? {}) as Record<string, unknown>;

  // 分離済ハンドラーに委譲 (#302 後のリファクタ): 該当すれば結果を返す、無ければ下の switch へ
  const markerResult = await handleMarkerTool(name, argRecord);
  if (markerResult) return markerResult;
  const agResult = await handleActionGroupTool(name, argRecord);
  if (agResult) return agResult;

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

      // ── フロー図操作 ──

      case "designer__list_screens": {
        // ファイルから直接読み込み（ブラウザ不要）。ファイルがない場合はブラウザ経由
        const fileProject = await readProject() as { screens?: Array<{ id: string; name: string; type: string; path: string; hasDesign: boolean }> } | null;
        let screens: Array<{ id: string; name: string; type: string; path: string; hasDesign: boolean }>;
        if (fileProject?.screens) {
          screens = fileProject.screens;
        } else {
          const result = (await wsBridge.sendCommand("listScreens")) as {
            screens: Array<{ id: string; name: string; type: string; path: string; hasDesign: boolean }>;
          };
          screens = result.screens;
        }
        const lines = screens.map(
          (s) => `- ${s.id}  ${s.name} (${s.type})${s.path ? ` [${s.path}]` : ""}${s.hasDesign ? " ✓デザイン済み" : ""}`
        );
        return {
          content: [
            {
              type: "text",
              text: lines.length > 0
                ? `画面一覧 (${screens.length}件):\n${lines.join("\n")}`
                : "画面はまだ登録されていません。",
            },
          ],
        };
      }

      case "designer__add_screen": {
        const a = (args ?? {}) as Record<string, unknown>;
        if (typeof a.name !== "string") {
          throw new McpError(ErrorCode.InvalidParams, "name は必須です");
        }
        const result = (await wsBridge.sendCommand("addScreen", {
          name: a.name,
          type: typeof a.type === "string" ? a.type : undefined,
          path: typeof a.path === "string" ? a.path : undefined,
          position: a.position,
        })) as { screenId: string };
        return {
          content: [
            {
              type: "text",
              text: `画面「${a.name}」を追加しました（ID: ${result.screenId}）`,
            },
          ],
        };
      }

      case "designer__update_screen": {
        const a = (args ?? {}) as Record<string, unknown>;
        if (typeof a.screenId !== "string") {
          throw new McpError(ErrorCode.InvalidParams, "screenId は必須です");
        }
        await wsBridge.sendCommand("updateScreenMeta", {
          screenId: a.screenId,
          name: a.name,
          type: a.type,
          description: a.description,
          path: a.path,
        });
        return {
          content: [
            { type: "text", text: `画面 ${a.screenId} を更新しました。` },
          ],
        };
      }

      case "designer__remove_screen": {
        const a = (args ?? {}) as Record<string, unknown>;
        if (typeof a.screenId !== "string") {
          throw new McpError(ErrorCode.InvalidParams, "screenId は必須です");
        }
        await wsBridge.sendCommand("removeScreenNode", { screenId: a.screenId });
        return {
          content: [
            { type: "text", text: `画面 ${a.screenId} を削除しました。` },
          ],
        };
      }

      case "designer__add_edge": {
        const a = (args ?? {}) as Record<string, unknown>;
        if (typeof a.source !== "string" || typeof a.target !== "string") {
          throw new McpError(ErrorCode.InvalidParams, "source と target は必須です");
        }
        const result = (await wsBridge.sendCommand("addFlowEdge", {
          source: a.source,
          target: a.target,
          label: typeof a.label === "string" ? a.label : "",
          trigger: typeof a.trigger === "string" ? a.trigger : undefined,
        })) as { edgeId: string };
        return {
          content: [
            {
              type: "text",
              text: `遷移エッジを追加しました（ID: ${result.edgeId}）`,
            },
          ],
        };
      }

      case "designer__remove_edge": {
        const a = (args ?? {}) as Record<string, unknown>;
        if (typeof a.edgeId !== "string") {
          throw new McpError(ErrorCode.InvalidParams, "edgeId は必須です");
        }
        await wsBridge.sendCommand("removeFlowEdge", { edgeId: a.edgeId });
        return {
          content: [
            { type: "text", text: `エッジ ${a.edgeId} を削除しました。` },
          ],
        };
      }

      case "designer__get_flow": {
        // ファイルから直接読み込み（ブラウザ不要）。ファイルがない場合はブラウザ経由
        type FlowResult = {
          project: {
            name: string;
            screens: Array<{ id: string; name: string; type: string; path: string; hasDesign: boolean }>;
            edges: Array<{ id: string; source: string; target: string; label: string; trigger: string }>;
          };
          mermaid: string;
        };
        let result: FlowResult;
        const fileData = await readProject() as FlowResult["project"] | null;
        if (fileData?.screens) {
          // ファイルから読んで Mermaid を生成
          const p = fileData;
          const idMap = new Map<string, string>();
          (p.screens ?? []).forEach((s, i) => idMap.set(s.id, `S${i}`));
          const mLines = ["flowchart TD"];
          for (const s of (p.screens ?? [])) {
            const sid = idMap.get(s.id)!;
            mLines.push(`    ${sid}["${s.name}"]`);
          }
          for (const e of (p.edges ?? [])) {
            const src = idMap.get(e.source);
            const tgt = idMap.get(e.target);
            if (src && tgt) {
              mLines.push(e.label ? `    ${src} -->|${e.label}| ${tgt}` : `    ${src} --> ${tgt}`);
            }
          }
          result = { project: p, mermaid: mLines.join("\n") };
        } else {
          result = (await wsBridge.sendCommand("getFlow")) as FlowResult;
        }
        const p = result.project;
        const screenLines = p.screens.map(
          (s) => `  - ${s.id}  ${s.name} (${s.type})${s.path ? ` [${s.path}]` : ""}`
        );
        const edgeLines = p.edges.map((e) => {
          const src = p.screens.find((s) => s.id === e.source)?.name ?? e.source;
          const tgt = p.screens.find((s) => s.id === e.target)?.name ?? e.target;
          return `  - ${e.id}  ${src} → ${tgt}${e.label ? ` "${e.label}"` : ""} (${e.trigger})`;
        });
        return {
          content: [
            {
              type: "text",
              text: [
                `# プロジェクト: ${p.name}`,
                `\n## 画面 (${p.screens.length}件)`,
                ...screenLines,
                `\n## 遷移 (${p.edges.length}件)`,
                ...edgeLines,
                `\n## Mermaid`,
                "```mermaid",
                result.mermaid,
                "```",
              ].join("\n"),
            },
          ],
        };
      }

      case "designer__navigate_screen": {
        const a = (args ?? {}) as Record<string, unknown>;
        if (typeof a.screenId !== "string") {
          throw new McpError(ErrorCode.InvalidParams, "screenId は必須です");
        }
        await wsBridge.sendCommand("navigateScreen", { screenId: a.screenId });
        return {
          content: [
            {
              type: "text",
              text: `画面 ${a.screenId} のデザイナーへ遷移しました。`,
            },
          ],
        };
      }

      // ── React エクスポート ──

      // ── カスタムブロック管理 ──

      case "designer__define_block": {
        const a = (args ?? {}) as Record<string, unknown>;
        if (
          typeof a.id !== "string" ||
          typeof a.label !== "string" ||
          typeof a.content !== "string"
        ) {
          throw new McpError(ErrorCode.InvalidParams, "id, label, content は必須です");
        }
        await wsBridge.sendCommand("defineBlock", {
          id: a.id,
          label: a.label,
          category: typeof a.category === "string" ? a.category : "カスタム",
          content: a.content,
          styles: typeof a.styles === "string" ? a.styles : undefined,
          media: typeof a.media === "string" ? a.media : undefined,
        });
        return {
          content: [
            {
              type: "text",
              text: `カスタムブロック「${a.label}」(${a.id}) を登録しました。`,
            },
          ],
        };
      }

      case "designer__remove_custom_block": {
        const a = (args ?? {}) as Record<string, unknown>;
        if (typeof a.id !== "string") {
          throw new McpError(ErrorCode.InvalidParams, "id は必須です");
        }
        await wsBridge.sendCommand("removeCustomBlock", { id: a.id });
        return {
          content: [
            { type: "text", text: `カスタムブロック ${a.id} を削除しました。` },
          ],
        };
      }

      case "designer__list_custom_blocks": {
        // ファイルから直接読み込み。ファイルがない場合はブラウザ経由
        type BlockEntry = { id: string; label: string; category: string; styles?: string; hasStyles?: boolean };
        let blocks: BlockEntry[];
        const fileBlocks = (await readCustomBlocks()) as BlockEntry[];
        if (fileBlocks.length > 0) {
          blocks = fileBlocks.map((b) => ({ ...b, hasStyles: !!b.styles }));
        } else {
          const result = (await wsBridge.sendCommand("listCustomBlocks")) as {
            blocks: BlockEntry[];
          };
          blocks = result.blocks;
        }
        if (blocks.length === 0) {
          return {
            content: [
              { type: "text", text: "カスタムブロックはまだ定義されていません。" },
            ],
          };
        }
        const lines = blocks.map(
          (b) =>
            `- ${b.id} — ${b.label} [${b.category}]${b.hasStyles ? " (CSS付き)" : ""}`
        );
        return {
          content: [
            {
              type: "text",
              text: `カスタムブロック (${blocks.length}件):\n${lines.join("\n")}`,
            },
          ],
        };
      }

      case "designer__export_screen": {
        const a = (args ?? {}) as Record<string, unknown>;
        if (typeof a.screenId !== "string") {
          throw new McpError(ErrorCode.InvalidParams, "screenId は必須です");
        }

        // ブラウザ側から HTML + 画面名を取得
        const result = (await wsBridge.sendCommand("exportScreen", {
          screenId: a.screenId,
        })) as { html: string; css: string; screenName: string };

        // コンポーネント名を決定
        const rawName =
          typeof a.componentName === "string" && a.componentName.trim()
            ? a.componentName.trim()
            : toPascalCase(result.screenName);

        // JSX 変換
        const { code, warnings } = htmlToReact(result.html, rawName);

        const warningText =
          warnings.length > 0
            ? `\n\n> **変換警告:**\n${warnings.map((w) => `> - ${w}`).join("\n")}`
            : "";

        return {
          content: [
            {
              type: "text",
              text: `## ${rawName}.tsx\n\n\`\`\`tsx\n${code}\n\`\`\`${warningText}`,
            },
          ],
        };
      }

      // ── テーブル設計書 ──

      case "designer__list_tables": {
        const fileProject = await readProject() as { tables?: Array<{ id: string; name: string; logicalName: string; category?: string; columnCount: number; updatedAt: string }> } | null;
        const tables = fileProject?.tables ?? [];
        if (tables.length === 0) {
          return { content: [{ type: "text", text: "テーブルはまだ定義されていません。" }] };
        }
        const lines = tables.map(
          (t) => `- ${t.id}  ${t.name}（${t.logicalName}）${t.category ? ` [${t.category}]` : ""} カラム:${t.columnCount}`
        );
        return { content: [{ type: "text", text: `テーブル一覧 (${tables.length}件):\n${lines.join("\n")}` }] };
      }

      case "designer__get_table": {
        const a = (args ?? {}) as Record<string, unknown>;
        if (typeof a.tableId !== "string") {
          throw new McpError(ErrorCode.InvalidParams, "tableId は必須です");
        }
        const tableData = await readTable(a.tableId);
        if (!tableData) {
          throw new McpError(ErrorCode.InvalidParams, `テーブル ${a.tableId} が見つかりません`);
        }
        return { content: [{ type: "text", text: JSON.stringify(tableData, null, 2) }] };
      }

      case "designer__add_table": {
        const a = (args ?? {}) as Record<string, unknown>;
        if (typeof a.name !== "string" || typeof a.logicalName !== "string") {
          throw new McpError(ErrorCode.InvalidParams, "name, logicalName は必須です");
        }
        const id = `table-${Date.now()}`;
        const now = new Date().toISOString();
        const tableDef = {
          id,
          name: a.name,
          logicalName: a.logicalName,
          description: typeof a.description === "string" ? a.description : "",
          category: typeof a.category === "string" ? a.category : undefined,
          columns: [],
          indexes: [],
          createdAt: now,
          updatedAt: now,
        };
        await writeTable(id, tableDef);
        // project.json のテーブルメタも更新
        const project = (await readProject() ?? {}) as Record<string, unknown>;
        const tables = (project.tables ?? []) as Array<Record<string, unknown>>;
        tables.push({ id, name: a.name, logicalName: a.logicalName, category: a.category, columnCount: 0, updatedAt: now });
        project.tables = tables;
        project.updatedAt = now;
        await writeProject(project);
        return { content: [{ type: "text", text: `テーブル「${a.logicalName}」(${a.name}) を追加しました（ID: ${id}）` }] };
      }

      case "designer__update_table": {
        const a = (args ?? {}) as Record<string, unknown>;
        if (typeof a.tableId !== "string" || !a.definition) {
          throw new McpError(ErrorCode.InvalidParams, "tableId, definition は必須です");
        }
        const def = a.definition as Record<string, unknown>;
        def.updatedAt = new Date().toISOString();
        await writeTable(a.tableId, def);
        // project.json メタ更新
        const project = (await readProject() ?? {}) as Record<string, unknown>;
        const tables = (project.tables ?? []) as Array<Record<string, unknown>>;
        const idx = tables.findIndex((t) => t.id === a.tableId);
        const columns = (def.columns ?? []) as unknown[];
        const meta = { id: a.tableId, name: def.name, logicalName: def.logicalName, category: def.category, columnCount: columns.length, updatedAt: def.updatedAt };
        if (idx >= 0) tables[idx] = meta; else tables.push(meta);
        project.tables = tables;
        project.updatedAt = def.updatedAt as string;
        await writeProject(project);
        return { content: [{ type: "text", text: `テーブル ${a.tableId} を更新しました。` }] };
      }

      case "designer__remove_table": {
        const a = (args ?? {}) as Record<string, unknown>;
        if (typeof a.tableId !== "string") {
          throw new McpError(ErrorCode.InvalidParams, "tableId は必須です");
        }
        await deleteTableFile(a.tableId);
        const project = (await readProject() ?? {}) as Record<string, unknown>;
        const tables = ((project.tables ?? []) as Array<Record<string, unknown>>).filter((t) => t.id !== a.tableId);
        project.tables = tables;
        project.updatedAt = new Date().toISOString();
        await writeProject(project);
        return { content: [{ type: "text", text: `テーブル ${a.tableId} を削除しました。` }] };
      }

      case "designer__generate_ddl": {
        const a = (args ?? {}) as Record<string, unknown>;
        const dialect = (typeof a.dialect === "string" ? a.dialect : "standard") as string;
        const project = (await readProject() ?? {}) as Record<string, unknown>;
        const tableMetas = ((project.tables ?? []) as Array<{ id: string; name: string }>);
        const tableIds = typeof a.tableId === "string" ? [a.tableId] : tableMetas.map((t) => t.id);

        const ddlParts: string[] = [];
        for (const tid of tableIds) {
          const td = await readTable(tid) as Record<string, unknown> | null;
          if (!td) continue;
          ddlParts.push(generateDdl(td, dialect));
        }
        if (ddlParts.length === 0) {
          return { content: [{ type: "text", text: "DDL生成対象のテーブルが見つかりません。" }] };
        }
        return { content: [{ type: "text", text: `\`\`\`sql\n${ddlParts.join("\n\n")}\n\`\`\`` }] };
      }

      // ── ER図 ──

      case "designer__export_spec": {
        const specProject = (await readProject() ?? {}) as Record<string, unknown>;
        const specTableMetas = ((specProject.tables ?? []) as Array<{ id: string }>);
        const specTables: Array<Record<string, unknown>> = [];
        for (const tm of specTableMetas) {
          const td = await readTable(tm.id);
          if (td) specTables.push(td as Record<string, unknown>);
        }
        const specErLayout = await readErLayout() as Record<string, unknown> | null;

        // Build spec
        const spec: Record<string, unknown> = {
          projectName: specProject.name,
          generatedAt: new Date().toISOString(),
          tables: specTables.map((t) => {
            const cols = (t.columns ?? []) as Array<Record<string, unknown>>;
            return {
              name: t.name,
              logicalName: t.logicalName,
              description: t.description,
              category: t.category,
              columns: cols.map((c) => {
                const col: Record<string, unknown> = {
                  name: c.name, logicalName: c.logicalName, dataType: c.dataType,
                  ...(c.length != null ? { length: c.length } : {}),
                  ...(c.scale != null ? { scale: c.scale } : {}),
                  notNull: c.notNull, primaryKey: c.primaryKey, unique: c.unique,
                  ...(c.autoIncrement ? { autoIncrement: true } : {}),
                  ...(c.defaultValue ? { defaultValue: c.defaultValue } : {}),
                  ...(c.comment ? { comment: c.comment } : {}),
                };
                if (c.foreignKey) {
                  const fk = c.foreignKey as { tableId: string; columnName: string; noConstraint?: boolean };
                  col.reference = { table: fk.tableId, column: fk.columnName, type: fk.noConstraint ? "logical" : "physical" };
                }
                return col;
              }),
              indexes: ((t.indexes ?? []) as Array<Record<string, unknown>>).map((idx) => {
                const rawCols = (idx.columns ?? []) as Array<string | { name?: string; order?: string }>;
                const colNames = rawCols.map((c) => {
                  if (typeof c === "string") {
                    const col = cols.find((cc) => cc.id === c);
                    return col ? col.name : c;
                  }
                  return (c as { name?: string }).name ?? "";
                });
                return {
                  name: (idx.id ?? idx.name) as string,
                  columns: colNames,
                  unique: idx.unique,
                };
              }),
            };
          }),
          relations: [] as Array<Record<string, unknown>>,
          screens: ((specProject.screens ?? []) as Array<Record<string, unknown>>).map((s) => ({
            name: s.name, type: s.type, path: s.path, description: s.description, hasDesign: s.hasDesign,
          })),
          transitions: ((specProject.edges ?? []) as Array<Record<string, unknown>>).map((e) => {
            const screens = (specProject.screens ?? []) as Array<Record<string, unknown>>;
            const src = screens.find((s) => s.id === e.source);
            const tgt = screens.find((s) => s.id === e.target);
            return { from: src?.name ?? e.source, to: tgt?.name ?? e.target, label: e.label, trigger: e.trigger };
          }),
        };

        // Build relations from FK + logical
        const rels: Array<Record<string, unknown>> = [];
        const tNameMap = new Map(specTables.map((t) => [t.name as string, t]));
        for (const table of specTables) {
          for (const col of (table.columns ?? []) as Array<Record<string, unknown>>) {
            const fk = col.foreignKey as { tableId: string; columnName: string; noConstraint?: boolean } | undefined;
            if (!fk) continue;
            rels.push({
              from: `${table.name}.${col.name}`, to: `${fk.tableId}.${fk.columnName}`,
              cardinality: "one-to-many", constraintType: fk.noConstraint ? "logical" : "physical",
            });
          }
        }
        for (const lr of ((specErLayout?.logicalRelations ?? []) as Array<Record<string, unknown>>)) {
          const srcT = specTables.find((t) => t.id === lr.sourceTableId);
          const tgtT = specTables.find((t) => t.id === lr.targetTableId);
          if (!srcT || !tgtT) continue;
          const hasCol = lr.sourceColumnName && lr.targetColumnName;
          rels.push({
            from: hasCol ? `${srcT.name}.${lr.sourceColumnName}` : srcT.name,
            to: hasCol ? `${tgtT.name}.${lr.targetColumnName}` : tgtT.name,
            cardinality: lr.cardinality ?? "one-to-many",
            constraintType: hasCol ? "logical" : "conceptual",
            memo: lr.label,
          });
        }
        spec.relations = rels;

        return { content: [{ type: "text", text: JSON.stringify(spec, null, 2) }] };
      }

      case "designer__get_er_diagram":
      case "designer__generate_er_mermaid": {
        const project = (await readProject() ?? {}) as Record<string, unknown>;
        const tableMetas = ((project.tables ?? []) as Array<{ id: string; name: string }>);
        const allTables: Array<Record<string, unknown>> = [];
        for (const tm of tableMetas) {
          const td = await readTable(tm.id);
          if (td) allTables.push(td as Record<string, unknown>);
        }
        const erLayout = await readErLayout() as { logicalRelations?: Array<Record<string, unknown>> } | null;

        // Derive relations from FK
        const relations: Array<{ source: string; sourceCol: string; target: string; targetCol: string; physical: boolean }> = [];
        const tableNameMap = new Map(allTables.map((t) => [t.name as string, t]));
        for (const table of allTables) {
          const cols = (table.columns ?? []) as Array<Record<string, unknown>>;
          for (const col of cols) {
            const fk = col.foreignKey as { tableId: string; columnName: string } | undefined;
            if (!fk) continue;
            const target = tableNameMap.get(fk.tableId);
            if (!target) continue;
            relations.push({
              source: table.name as string,
              sourceCol: col.name as string,
              target: target.name as string,
              targetCol: fk.columnName,
              physical: true,
            });
          }
        }
        // Add logical relations
        for (const lr of erLayout?.logicalRelations ?? []) {
          const srcTable = allTables.find((t) => t.id === lr.sourceTableId);
          const tgtTable = allTables.find((t) => t.id === lr.targetTableId);
          if (srcTable && tgtTable) {
            relations.push({
              source: srcTable.name as string,
              sourceCol: lr.sourceColumnName as string,
              target: tgtTable.name as string,
              targetCol: lr.targetColumnName as string,
              physical: false,
            });
          }
        }

        // Build Mermaid
        const mLines = ["erDiagram"];
        for (const table of allTables) {
          mLines.push(`    ${table.name} {`);
          for (const col of (table.columns ?? []) as Array<Record<string, unknown>>) {
            const markers: string[] = [];
            if (col.primaryKey) markers.push("PK");
            if (col.foreignKey) markers.push("FK");
            const m = markers.length > 0 ? ` ${markers.join(",")}` : "";
            mLines.push(`        ${col.dataType} ${col.name}${m}`);
          }
          mLines.push("    }");
        }
        for (const rel of relations) {
          const card = rel.physical ? "||--o{" : "..o{";
          mLines.push(`    ${rel.target} ${card} ${rel.source} : "${rel.sourceCol}"`);
        }
        const mermaid = mLines.join("\n");

        if (name === "designer__generate_er_mermaid") {
          return { content: [{ type: "text", text: `\`\`\`mermaid\n${mermaid}\n\`\`\`` }] };
        }

        // Full ER data
        const relLines = relations.map(
          (r) => `  - ${r.source}.${r.sourceCol} → ${r.target}.${r.targetCol}${r.physical ? "" : " (論理)"}`
        );
        const tableLines = allTables.map(
          (t) => `  - ${t.name}（${t.logicalName}）${(t.columns as unknown[]).length}カラム`
        );
        return {
          content: [{
            type: "text",
            text: [
              `# ER図`,
              `\n## テーブル (${allTables.length}件)`,
              ...tableLines,
              `\n## リレーション (${relations.length}件)`,
              ...relLines,
              `\n## Mermaid`,
              "```mermaid",
              mermaid,
              "```",
            ].join("\n"),
          }],
        };
      }

      // ── 処理フロー定義 (list/get/add/update/delete/add_action/add_step/update_step/remove_step/move_step/set_maturity/add_step_note/add_catalog_entry/remove_catalog_entry) は handlers/actionGroup.ts に移設

      // marker 関連 (list/find_all/add/resolve/remove) は handlers/marker.ts に移設

      // ── タブ管理・保存操作 ──

      case "designer__open_tab": {
        const a = (args ?? {}) as Record<string, unknown>;
        if (!a.screenId && !a.tableId) {
          throw new McpError(ErrorCode.InvalidParams, "screenId または tableId が必要です");
        }
        const result = await wsBridge.sendCommand("openTab", {
          screenId: a.screenId,
          tableId: a.tableId,
        }) as { success: boolean };
        const target = a.screenId ? `画面 ${a.screenId}` : `テーブル ${a.tableId}`;
        return { content: [{ type: "text", text: `${target} をタブで開きました。` }] };
      }

      case "designer__close_tab": {
        const a = (args ?? {}) as Record<string, unknown>;
        if (typeof a.tabId !== "string") {
          throw new McpError(ErrorCode.InvalidParams, "tabId は必須です");
        }
        await wsBridge.sendCommand("closeTab", { tabId: a.tabId, force: a.force ?? false });
        return { content: [{ type: "text", text: `タブ ${a.tabId} を閉じました。` }] };
      }

      case "designer__list_tabs": {
        const result = await wsBridge.sendCommand("listTabs") as {
          tabs: Array<{ id: string; type: string; label: string; isDirty: boolean; isPinned: boolean; isActive: boolean }>;
          activeTabId: string;
        };
        const lines = result.tabs.map((t) =>
          `- [${t.isActive ? "●" : " "}] ${t.id} (${t.type}) — ${t.label}${t.isDirty ? " [未保存]" : ""}${t.isPinned ? " [ピン]" : ""}`
        );
        return {
          content: [{
            type: "text",
            text: lines.length > 0
              ? `開いているタブ (${lines.length}件):\n${lines.join("\n")}`
              : "開いているタブはありません。",
          }],
        };
      }

      case "designer__switch_tab": {
        const a = (args ?? {}) as Record<string, unknown>;
        if (typeof a.tabId !== "string") {
          throw new McpError(ErrorCode.InvalidParams, "tabId は必須です");
        }
        await wsBridge.sendCommand("switchTab", { tabId: a.tabId });
        return { content: [{ type: "text", text: `タブ ${a.tabId} に切り替えました。` }] };
      }

      case "designer__save_screen": {
        const a = (args ?? {}) as Record<string, unknown>;
        if (typeof a.screenId !== "string") {
          throw new McpError(ErrorCode.InvalidParams, "screenId は必須です");
        }
        await wsBridge.sendCommand("saveScreen", { screenId: a.screenId });
        return { content: [{ type: "text", text: `画面 ${a.screenId} を保存しました。` }] };
      }

      case "designer__save_all": {
        const result = await wsBridge.sendCommand("saveAll") as {
          saved: number;
          total: number;
          results: Array<{ screenId: string; success: boolean; error?: string }>;
        };
        return {
          content: [{
            type: "text",
            text: `${result.total}件中${result.saved}件を保存しました。${
              result.results.filter((r) => !r.success).map((r) => `\nエラー(${r.screenId}): ${r.error}`).join("")
            }`,
          }],
        };
      }

      case "designer__rename_screen_item": {
        const a = (args ?? {}) as Record<string, unknown>;
        if (typeof a.screenId !== "string" || typeof a.oldId !== "string" || typeof a.newId !== "string") {
          throw new McpError(ErrorCode.InvalidParams, "screenId, oldId, newId は必須です");
        }
        const renameRes = await renameScreenItemId(a.screenId, a.oldId, a.newId);
        wsBridge.broadcast("screenItemsChanged", { screenId: a.screenId });
        for (const agId of renameRes.actionGroupsUpdated) {
          wsBridge.broadcast("actionGroupChanged", { id: agId });
        }
        if (renameRes.screenHtmlUpdated) {
          wsBridge.broadcast("screenChanged", { screenId: a.screenId });
        }
        const lines = [
          `"${a.oldId}" → "${a.newId}" のリネームが完了しました。`,
          `  - screen-items: 更新済み`,
          `  - 画面 HTML: ${renameRes.screenHtmlUpdated ? "更新済み" : "変更なし"}`,
          `  - 処理フロー: ${renameRes.actionGroupsUpdated.length} 件更新 (参照 ${renameRes.refsRenamed} 箇所)`,
        ];
        if (renameRes.warnings.length > 0) {
          lines.push(...renameRes.warnings.map((w) => `  ⚠ ${w}`));
        }
        return { content: [{ type: "text", text: lines.join("\n") }] };
      }

      case "designer__check_screen_item_refs": {
        const a = (args ?? {}) as Record<string, unknown>;
        if (typeof a.screenId !== "string" || typeof a.itemId !== "string") {
          throw new McpError(ErrorCode.InvalidParams, "screenId, itemId は必須です");
        }
        const checkRes = await checkScreenItemRefs(a.screenId, a.itemId);
        if (checkRes.totalRefs === 0) {
          return { content: [{ type: "text", text: `"${a.itemId}" を参照する処理フローはありません。` }] };
        }
        const lines = [
          `"${a.itemId}" を参照する処理フロー: ${checkRes.affectedActionGroups.length} 件 (合計 ${checkRes.totalRefs} 箇所)`,
          ...checkRes.affectedActionGroups.map((ag) => `  - ${ag.name} (${ag.id}): ${ag.refCount} 箇所`),
        ];
        return { content: [{ type: "text", text: lines.join("\n") }] };
      }

      case "designer__get_rename_context": {
        const a = (args ?? {}) as Record<string, unknown>;
        if (typeof a.screenId !== "string") {
          throw new McpError(ErrorCode.InvalidParams, "screenId は必須です");
        }
        const ctx = await getRenameContext(a.screenId);
        const summary = [
          `画面 ${a.screenId} の未命名項目: ${ctx.unnamedItems.length} 件 (命名済み: ${ctx.namedCount} 件)`,
        ];
        return {
          content: [{
            type: "text",
            text: summary.join("\n") + "\n\n" + JSON.stringify(ctx, null, 2),
          }],
        };
      }

      case "designer__apply_rename_mapping": {
        const a = (args ?? {}) as Record<string, unknown>;
        if (typeof a.screenId !== "string") {
          throw new McpError(ErrorCode.InvalidParams, "screenId は必須です");
        }
        if (!a.mapping || typeof a.mapping !== "object" || Array.isArray(a.mapping)) {
          throw new McpError(ErrorCode.InvalidParams, "mapping は {oldId: newId} オブジェクトが必須です");
        }
        const mapping = a.mapping as Record<string, string>;

        // browser-first: ブラウザで in-memory 適用を試みる
        const browserResult = await wsBridge.tryCommand("applyRenameInBrowser", {
          screenId: a.screenId,
          mapping,
        }) as { succeeded: string[]; failed: Array<{ oldId: string; error: string }> } | null;

        if (browserResult) {
          // ブラウザ側で適用済み → action group refs のみファイル更新
          const { actionGroupsUpdated } = await updateActionGroupRefs(a.screenId, mapping);
          for (const agId of actionGroupsUpdated) {
            wsBridge.broadcast("actionGroupChanged", { id: agId });
          }
          // screenChanged / screenItemsChanged は broadcast しない (browser dirty、ファイルは古いまま)

          const lines: string[] = [
            `リネーム完了 (browser): 成功 ${browserResult.succeeded.length} 件 / 失敗 ${browserResult.failed.length} 件`,
            `処理フロー参照更新: ${actionGroupsUpdated.length} 件`,
          ];
          for (const oldId of browserResult.succeeded) {
            lines.push(`  ✓ "${oldId}" → "${mapping[oldId]}"`);
          }
          for (const f of browserResult.failed) {
            lines.push(`  ✗ "${f.oldId}": ${f.error}`);
          }
          return { content: [{ type: "text", text: lines.join("\n") }] };
        }

        // fallback: 従来のファイル全書き
        const result = await applyRenameMapping(a.screenId, mapping);

        if (result.succeeded.length > 0) {
          wsBridge.broadcast("screenItemsChanged", { screenId: a.screenId });
          const allAgs = new Set(result.succeeded.flatMap((s) => s.actionGroupsUpdated));
          for (const agId of allAgs) {
            wsBridge.broadcast("actionGroupChanged", { id: agId });
          }
          if (result.succeeded.some((s) => s.screenHtmlUpdated)) {
            wsBridge.broadcast("screenChanged", { screenId: a.screenId });
          }
        }

        const lines: string[] = [
          `リネーム完了: 成功 ${result.succeeded.length} 件 / 失敗 ${result.failed.length} 件`,
        ];
        for (const s of result.succeeded) {
          const warn = s.warnings.length > 0 ? ` ⚠ ${s.warnings.join(" ")}` : "";
          lines.push(`  ✓ "${s.oldId}" → "${s.newId}" (処理フロー参照 ${s.refsRenamed} 箇所)${warn}`);
        }
        for (const f of result.failed) {
          lines.push(`  ✗ "${f.oldId}" → "${f.newId}": ${f.error}`);
        }
        return { content: [{ type: "text", text: lines.join("\n") }] };
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

  return server;
}

// ── DDL 生成ヘルパー ──

function generateDdl(table: Record<string, unknown>, dialect: string): string {
  const name = table.name as string;
  const columns = (table.columns ?? []) as Array<Record<string, unknown>>;
  const indexes = (table.indexes ?? []) as Array<Record<string, unknown>>;

  const colDefs: string[] = [];
  const pks: string[] = [];

  for (const col of columns) {
    let typeStr = mapDataType(col.dataType as string, col.length as number | undefined, col.scale as number | undefined, dialect);
    if (col.autoIncrement) typeStr = autoIncrementType(col.dataType as string, dialect);

    let line = `  ${col.name} ${typeStr}`;
    if (col.notNull) line += " NOT NULL";
    if (col.unique) line += " UNIQUE";
    if (col.defaultValue && !col.autoIncrement) {
      line += ` DEFAULT ${col.defaultValue}`;
    }
    if (col.comment && (dialect === "mysql" || dialect === "postgresql")) {
      // MySQL supports inline COMMENT, others need separate statements
      if (dialect === "mysql") line += ` COMMENT '${(col.comment as string).replace(/'/g, "''")}'`;
    }
    colDefs.push(line);
    if (col.primaryKey) pks.push(col.name as string);
  }

  if (pks.length > 0) {
    colDefs.push(`  PRIMARY KEY (${pks.join(", ")})`);
  }

  // Foreign keys (物理FK制約のみ出力、noConstraint=true は除外)
  for (const col of columns) {
    if (col.foreignKey) {
      const fk = col.foreignKey as { tableId: string; columnName: string; noConstraint?: boolean };
      if (fk.noConstraint) continue;
      colDefs.push(`  FOREIGN KEY (${col.name}) REFERENCES ${fk.columnName ? fk.tableId + "(" + fk.columnName + ")" : fk.tableId}`);
    }
  }

  let ddl = `CREATE TABLE ${name} (\n${colDefs.join(",\n")}\n)`;

  if (dialect === "mysql") ddl += " ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";
  ddl += ";";

  // Indexes (新形式 IndexDefinition + 旧形式 TableIndex 両対応)
  for (const idx of indexes) {
    const rawCols = (idx.columns ?? []) as Array<string | { name?: string; order?: string }>;
    const colNames = rawCols.map((c) => {
      if (typeof c === "string") {
        // 旧形式: 列 ID → 列名に解決
        const col = columns.find((cc) => cc.id === c);
        return col ? col.name as string : c;
      }
      // 新形式: IndexColumn { name, order? }
      const colName = (c as { name?: string }).name ?? "";
      const ord = (c as { order?: string }).order === "desc" ? " DESC" : "";
      return `${colName}${ord}`;
    });
    const unique = idx.unique ? "UNIQUE " : "";
    const idxName = ((idx.id ?? idx.name) as string | undefined) ?? "";
    ddl += `\n\nCREATE ${unique}INDEX ${idxName} ON ${name} (${colNames.join(", ")});`;
  }

  // PostgreSQL / Oracle comments
  if (dialect === "postgresql" || dialect === "oracle") {
    const logicalName = table.logicalName as string | undefined;
    if (logicalName) {
      ddl += `\n\nCOMMENT ON TABLE ${name} IS '${logicalName.replace(/'/g, "''")}';`;
    }
    for (const col of columns) {
      if (col.comment || col.logicalName) {
        const cmt = (col.comment || col.logicalName) as string;
        ddl += `\nCOMMENT ON COLUMN ${name}.${col.name} IS '${cmt.replace(/'/g, "''")}';`;
      }
    }
  }

  return ddl;
}

function mapDataType(dt: string, length?: number, scale?: number, dialect?: string): string {
  const d = dialect ?? "standard";
  switch (dt) {
    case "VARCHAR": return `VARCHAR(${length ?? 255})`;
    case "CHAR": return `CHAR(${length ?? 1})`;
    case "TEXT": return d === "oracle" ? "CLOB" : "TEXT";
    case "INTEGER": return d === "oracle" ? "NUMBER(10)" : "INTEGER";
    case "BIGINT": return d === "oracle" ? "NUMBER(19)" : "BIGINT";
    case "SMALLINT": return d === "oracle" ? "NUMBER(5)" : "SMALLINT";
    case "DECIMAL": return `DECIMAL(${length ?? 10}, ${scale ?? 2})`;
    case "FLOAT": return d === "oracle" ? "BINARY_FLOAT" : "FLOAT";
    case "BOOLEAN": {
      if (d === "oracle") return "NUMBER(1)";
      if (d === "mysql") return "TINYINT(1)";
      return "BOOLEAN";
    }
    case "DATE": return "DATE";
    case "TIME": return d === "oracle" ? "DATE" : "TIME";
    case "TIMESTAMP": {
      if (d === "oracle") return "TIMESTAMP";
      if (d === "mysql") return "DATETIME";
      return "TIMESTAMP";
    }
    case "BLOB": return d === "oracle" ? "BLOB" : "BLOB";
    case "JSON": {
      if (d === "oracle") return "CLOB";
      if (d === "mysql") return "JSON";
      if (d === "postgresql") return "JSONB";
      return "TEXT";
    }
    default: return dt;
  }
}

function autoIncrementType(dt: string, dialect: string): string {
  switch (dialect) {
    case "mysql": return `${mapDataType(dt, undefined, undefined, dialect)} AUTO_INCREMENT`;
    case "postgresql": return dt === "BIGINT" ? "BIGSERIAL" : "SERIAL";
    case "oracle": return `${mapDataType(dt, undefined, undefined, dialect)} GENERATED ALWAYS AS IDENTITY`;
    case "sqlite": return "INTEGER"; // SQLite auto-increments INTEGER PRIMARY KEY
    default: return mapDataType(dt, undefined, undefined, dialect);
  }
}

// 起動 (#302): HTTP transport のみ。port 5179 の `/mcp` endpoint を公開、常駐バックエンド。
// 複数クライアント (Claude Code 複数セッション) が同時接続できるよう、リクエスト毎に
// fresh な Server + transport を作成する。tools の登録は軽量 (JSON schema + 関数参照)
// なので per-request コストは無視できる。
async function main() {
  wsBridge.registerHttpHandler("/mcp", async (req, res) => {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (e) {
      console.error("[MCP/HTTP] handler error:", e);
      if (!res.writableEnded) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end(`Internal error: ${e instanceof Error ? e.message : String(e)}`);
      }
    } finally {
      try { await transport.close(); } catch { /* ignore */ }
      try { await server.close(); } catch { /* ignore */ }
    }
  });

  // AI 命名 endpoints (#337)
  wsBridge.registerHttpHandler("/ai/rename-screen-ids/auth-check", handleAuthCheck);
  wsBridge.registerHttpHandler("/ai/rename-screen-ids/propose", handlePropose);

  console.error(`[MCP] designer-mcp HTTP transport mounted at http://localhost:${process.env.DESIGNER_MCP_PORT ?? 5179}/mcp`);
}

main().catch((err) => {
  console.error("[MCP] Fatal error:", err);
  process.exit(1);
});
