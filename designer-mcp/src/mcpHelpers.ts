/**
 * MCP tool handler 群で共有する helper (#302 以降のリファクタで切り出し)。
 *
 * designer-mcp のツール実装がファイルに分散した時 (handlers/*.ts) にも
 * 同じロジックを呼べるよう、クロスカッティングな補助関数をここに集約。
 */
import { wsBridge } from "./wsBridge.js";
import { writeProcessFlow } from "./projectStorage.js";
import type { ProcessFlowDoc } from "./processFlowEdits.js";

/** ProcessFlow を保存してブラウザに変更通知 */
export async function saveAndBroadcast(agId: string, ag: ProcessFlowDoc): Promise<void> {
  ag.updatedAt = new Date().toISOString();
  await writeProcessFlow(agId, ag);
  wsBridge.broadcast("processFlowChanged", { id: agId });
}

/**
 * Tool call の戻り値の共通形。MCP SDK の実際の型は複雑なため、
 * dispatcher との接続を容易にする loose な定義にする。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ToolResult = any;

/** 各 handler モジュールの共通 signature: 該当しなければ null を返して dispatcher に次を試させる */
export type ToolHandler = (
  name: string,
  args: Record<string, unknown>,
) => Promise<ToolResult | null>;
