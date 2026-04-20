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
import { htmlToReact, toPascalCase } from "./reactExporter.js";
import { readProject, readCustomBlocks, readTable, writeTable, deleteTable as deleteTableFile, writeProject, readErLayout, readActionGroup, writeActionGroup, deleteActionGroup as deleteActionGroupFile, listActionGroups as listActionGroupFiles } from "./projectStorage.js";
import {
  updateStep as editUpdateStep,
  removeStep as editRemoveStep,
  moveStep as editMoveStep,
  setMaturity as editSetMaturity,
  addStepNote as editAddStepNote,
  addCatalogEntry as editAddCatalogEntry,
  removeCatalogEntry as editRemoveCatalogEntry,
  insertStepAt as editInsertStepAt,
  type ActionGroupDoc,
  type CatalogName,
} from "./actionGroupEdits.js";

async function saveAndBroadcast(agId: string, ag: ActionGroupDoc): Promise<void> {
  ag.updatedAt = new Date().toISOString();
  await writeActionGroup(agId, ag);
  wsBridge.broadcast("actionGroupChanged", { id: agId });
}

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
              indexes: ((t.indexes ?? []) as Array<Record<string, unknown>>).map((idx) => ({
                name: idx.name,
                columns: ((idx.columns ?? []) as string[]).map((cid) => {
                  const c = cols.find((cc) => cc.id === cid);
                  return c ? c.name : cid;
                }),
                unique: idx.unique,
              })),
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

      // ── 処理フロー定義 ──

      case "designer__list_action_groups": {
        const agList = await listActionGroupFiles() as Array<{ id: string; name: string; type: string; screenId?: string; actions?: unknown[]; updatedAt: string }>;
        if (agList.length === 0) {
          return { content: [{ type: "text", text: "処理フロー定義はまだありません。" }] };
        }
        const lines = agList.map(
          (ag) => `- ${ag.id}  ${ag.name}（${ag.type}）アクション:${ag.actions?.length ?? 0}件`
        );
        return { content: [{ type: "text", text: `処理フロー一覧 (${agList.length}件):\n${lines.join("\n")}` }] };
      }

      case "designer__get_action_group": {
        const a = (args ?? {}) as Record<string, unknown>;
        if (typeof a.actionGroupId !== "string") {
          throw new McpError(ErrorCode.InvalidParams, "actionGroupId は必須です");
        }
        const agData = await readActionGroup(a.actionGroupId);
        if (!agData) {
          throw new McpError(ErrorCode.InvalidParams, `処理フロー ${a.actionGroupId} が見つかりません`);
        }
        return { content: [{ type: "text", text: JSON.stringify(agData, null, 2) }] };
      }

      case "designer__add_action_group": {
        const a = (args ?? {}) as Record<string, unknown>;
        if (typeof a.name !== "string" || typeof a.type !== "string") {
          throw new McpError(ErrorCode.InvalidParams, "name, type は必須です");
        }
        const agId = `ag-${Date.now()}`;
        const agNow = new Date().toISOString();
        const agDef = {
          id: agId,
          name: a.name,
          type: a.type,
          screenId: typeof a.screenId === "string" ? a.screenId : undefined,
          description: typeof a.description === "string" ? a.description : "",
          actions: [],
          createdAt: agNow,
          updatedAt: agNow,
        };
        await writeActionGroup(agId, agDef);
        // project.json メタ更新
        const agProject = (await readProject() ?? {}) as Record<string, unknown>;
        const agMetas = (agProject.actionGroups ?? []) as Array<Record<string, unknown>>;
        agMetas.push({ id: agId, name: a.name, type: a.type, screenId: a.screenId, actionCount: 0, updatedAt: agNow });
        agProject.actionGroups = agMetas;
        agProject.updatedAt = agNow;
        await writeProject(agProject);
        return { content: [{ type: "text", text: `処理フロー「${a.name}」(${a.type}) を追加しました（ID: ${agId}）` }] };
      }

      case "designer__update_action_group": {
        const a = (args ?? {}) as Record<string, unknown>;
        if (typeof a.actionGroupId !== "string" || !a.definition) {
          throw new McpError(ErrorCode.InvalidParams, "actionGroupId, definition は必須です");
        }
        const agDef = a.definition as Record<string, unknown>;
        agDef.updatedAt = new Date().toISOString();
        await writeActionGroup(a.actionGroupId, agDef);
        // project.json メタ更新
        const agProject = (await readProject() ?? {}) as Record<string, unknown>;
        const agMetas = (agProject.actionGroups ?? []) as Array<Record<string, unknown>>;
        const agIdx = agMetas.findIndex((m) => m.id === a.actionGroupId);
        const agActions = (agDef.actions ?? []) as unknown[];
        const agMeta = { id: a.actionGroupId, name: agDef.name, type: agDef.type, screenId: agDef.screenId, actionCount: agActions.length, updatedAt: agDef.updatedAt };
        if (agIdx >= 0) agMetas[agIdx] = agMeta; else agMetas.push(agMeta);
        agProject.actionGroups = agMetas;
        agProject.updatedAt = agDef.updatedAt as string;
        await writeProject(agProject);
        return { content: [{ type: "text", text: `処理フロー ${a.actionGroupId} を更新しました。` }] };
      }

      case "designer__delete_action_group": {
        const a = (args ?? {}) as Record<string, unknown>;
        if (typeof a.actionGroupId !== "string") {
          throw new McpError(ErrorCode.InvalidParams, "actionGroupId は必須です");
        }
        await deleteActionGroupFile(a.actionGroupId);
        const agProject = (await readProject() ?? {}) as Record<string, unknown>;
        const agMetas = ((agProject.actionGroups ?? []) as Array<Record<string, unknown>>).filter((m) => m.id !== a.actionGroupId);
        agProject.actionGroups = agMetas;
        agProject.updatedAt = new Date().toISOString();
        await writeProject(agProject);
        return { content: [{ type: "text", text: `処理フロー ${a.actionGroupId} を削除しました。` }] };
      }

      case "designer__add_action": {
        const a = (args ?? {}) as Record<string, unknown>;
        if (typeof a.actionGroupId !== "string" || typeof a.name !== "string" || typeof a.trigger !== "string") {
          throw new McpError(ErrorCode.InvalidParams, "actionGroupId, name, trigger は必須です");
        }
        const ag = await readActionGroup(a.actionGroupId) as Record<string, unknown> | null;
        if (!ag) throw new McpError(ErrorCode.InvalidParams, `処理フロー ${a.actionGroupId} が見つかりません`);
        const actions = (ag.actions ?? []) as Array<Record<string, unknown>>;
        const actionId = `act-${Date.now()}`;
        actions.push({ id: actionId, name: a.name, trigger: a.trigger, steps: [] });
        ag.actions = actions;
        ag.updatedAt = new Date().toISOString();
        await writeActionGroup(a.actionGroupId, ag);
        return { content: [{ type: "text", text: `アクション「${a.name}」を追加しました（ID: ${actionId}）` }] };
      }

      case "designer__add_step": {
        const a = (args ?? {}) as Record<string, unknown>;
        if (typeof a.actionGroupId !== "string" || typeof a.actionId !== "string" || typeof a.type !== "string") {
          throw new McpError(ErrorCode.InvalidParams, "actionGroupId, actionId, type は必須です");
        }
        const ag = await readActionGroup(a.actionGroupId) as ActionGroupDoc | null;
        if (!ag) throw new McpError(ErrorCode.InvalidParams, `処理フロー ${a.actionGroupId} が見つかりません`);
        const stepId = `step-${Date.now()}`;
        const detail = (a.detail ?? {}) as Record<string, unknown>;
        const step = { id: stepId, type: a.type as string, description: (a.description as string) ?? "", ...detail };
        editInsertStepAt(ag, a.actionId, step, typeof a.position === "number" ? a.position : undefined);
        await saveAndBroadcast(a.actionGroupId, ag);
        return { content: [{ type: "text", text: `ステップ（${a.type}）を追加しました（ID: ${stepId}）` }] };
      }

      case "designer__update_step": {
        const a = (args ?? {}) as Record<string, unknown>;
        if (typeof a.actionGroupId !== "string" || typeof a.stepId !== "string" || typeof a.patch !== "object" || a.patch === null) {
          throw new McpError(ErrorCode.InvalidParams, "actionGroupId, stepId, patch は必須です");
        }
        const ag = await readActionGroup(a.actionGroupId) as ActionGroupDoc | null;
        if (!ag) throw new McpError(ErrorCode.InvalidParams, `処理フロー ${a.actionGroupId} が見つかりません`);
        try {
          editUpdateStep(ag, a.stepId, a.patch as Record<string, unknown>);
        } catch (e) {
          throw new McpError(ErrorCode.InvalidParams, (e as Error).message);
        }
        await saveAndBroadcast(a.actionGroupId, ag);
        return { content: [{ type: "text", text: `ステップ ${a.stepId} を更新しました。` }] };
      }

      case "designer__remove_step": {
        const a = (args ?? {}) as Record<string, unknown>;
        if (typeof a.actionGroupId !== "string" || typeof a.stepId !== "string") {
          throw new McpError(ErrorCode.InvalidParams, "actionGroupId, stepId は必須です");
        }
        const ag = await readActionGroup(a.actionGroupId) as ActionGroupDoc | null;
        if (!ag) throw new McpError(ErrorCode.InvalidParams, `処理フロー ${a.actionGroupId} が見つかりません`);
        try {
          editRemoveStep(ag, a.stepId);
        } catch (e) {
          throw new McpError(ErrorCode.InvalidParams, (e as Error).message);
        }
        await saveAndBroadcast(a.actionGroupId, ag);
        return { content: [{ type: "text", text: `ステップ ${a.stepId} を削除しました。` }] };
      }

      case "designer__move_step": {
        const a = (args ?? {}) as Record<string, unknown>;
        if (typeof a.actionGroupId !== "string" || typeof a.stepId !== "string" || typeof a.newIndex !== "number") {
          throw new McpError(ErrorCode.InvalidParams, "actionGroupId, stepId, newIndex は必須です");
        }
        const ag = await readActionGroup(a.actionGroupId) as ActionGroupDoc | null;
        if (!ag) throw new McpError(ErrorCode.InvalidParams, `処理フロー ${a.actionGroupId} が見つかりません`);
        try {
          editMoveStep(ag, a.stepId, a.newIndex);
        } catch (e) {
          throw new McpError(ErrorCode.InvalidParams, (e as Error).message);
        }
        await saveAndBroadcast(a.actionGroupId, ag);
        return { content: [{ type: "text", text: `ステップ ${a.stepId} を位置 ${a.newIndex} に移動しました。` }] };
      }

      case "designer__set_maturity": {
        const a = (args ?? {}) as Record<string, unknown>;
        if (typeof a.actionGroupId !== "string" || typeof a.target !== "string" || typeof a.maturity !== "string") {
          throw new McpError(ErrorCode.InvalidParams, "actionGroupId, target, maturity は必須です");
        }
        const ag = await readActionGroup(a.actionGroupId) as ActionGroupDoc | null;
        if (!ag) throw new McpError(ErrorCode.InvalidParams, `処理フロー ${a.actionGroupId} が見つかりません`);
        try {
          editSetMaturity(ag, a.target as "group" | "action" | "step", a.targetId as string | undefined, a.maturity as "draft" | "provisional" | "committed");
        } catch (e) {
          throw new McpError(ErrorCode.InvalidParams, (e as Error).message);
        }
        await saveAndBroadcast(a.actionGroupId, ag);
        return { content: [{ type: "text", text: `maturity を ${a.maturity} に更新しました。` }] };
      }

      case "designer__add_step_note": {
        const a = (args ?? {}) as Record<string, unknown>;
        if (typeof a.actionGroupId !== "string" || typeof a.stepId !== "string" || typeof a.type !== "string" || typeof a.body !== "string") {
          throw new McpError(ErrorCode.InvalidParams, "actionGroupId, stepId, type, body は必須です");
        }
        const ag = await readActionGroup(a.actionGroupId) as ActionGroupDoc | null;
        if (!ag) throw new McpError(ErrorCode.InvalidParams, `処理フロー ${a.actionGroupId} が見つかりません`);
        try {
          const res = editAddStepNote(ag, a.stepId, a.type as string, a.body as string);
          await saveAndBroadcast(a.actionGroupId, ag);
          return { content: [{ type: "text", text: `付箋を追加しました (ID: ${res.id})` }] };
        } catch (e) {
          throw new McpError(ErrorCode.InvalidParams, (e as Error).message);
        }
      }

      case "designer__add_catalog_entry": {
        const a = (args ?? {}) as Record<string, unknown>;
        if (typeof a.actionGroupId !== "string" || typeof a.catalog !== "string" || typeof a.key !== "string" || typeof a.value !== "object" || a.value === null) {
          throw new McpError(ErrorCode.InvalidParams, "actionGroupId, catalog, key, value は必須です");
        }
        const ag = await readActionGroup(a.actionGroupId) as ActionGroupDoc | null;
        if (!ag) throw new McpError(ErrorCode.InvalidParams, `処理フロー ${a.actionGroupId} が見つかりません`);
        editAddCatalogEntry(ag, a.catalog as CatalogName, a.key as string, a.value as Record<string, unknown>);
        await saveAndBroadcast(a.actionGroupId, ag);
        return { content: [{ type: "text", text: `${a.catalog}.${a.key} を追加/更新しました。` }] };
      }

      case "designer__remove_catalog_entry": {
        const a = (args ?? {}) as Record<string, unknown>;
        if (typeof a.actionGroupId !== "string" || typeof a.catalog !== "string" || typeof a.key !== "string") {
          throw new McpError(ErrorCode.InvalidParams, "actionGroupId, catalog, key は必須です");
        }
        const ag = await readActionGroup(a.actionGroupId) as ActionGroupDoc | null;
        if (!ag) throw new McpError(ErrorCode.InvalidParams, `処理フロー ${a.actionGroupId} が見つかりません`);
        editRemoveCatalogEntry(ag, a.catalog as CatalogName, a.key as string);
        await saveAndBroadcast(a.actionGroupId, ag);
        return { content: [{ type: "text", text: `${a.catalog}.${a.key} を削除しました。` }] };
      }

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

  // Indexes
  for (const idx of indexes) {
    const idxCols = (idx.columns ?? []) as string[];
    // resolve column IDs to names
    const colNames = idxCols.map((cid) => {
      const c = columns.find((cc) => cc.id === cid);
      return c ? c.name as string : cid;
    });
    const unique = idx.unique ? "UNIQUE " : "";
    ddl += `\n\nCREATE ${unique}INDEX ${idx.name} ON ${name} (${colNames.join(", ")});`;
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
