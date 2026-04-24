/**
 * ProcessFlow / step / catalog 関連 MCP tool handler (#261)
 *
 * 対象 (14 ツール):
 * - designer__list_process_flows / get_process_flow
 * - designer__add_process_flow / update_process_flow / delete_process_flow
 * - designer__add_action / add_step / update_step / remove_step / move_step
 * - designer__set_maturity / add_step_note
 * - designer__add_catalog_entry / remove_catalog_entry
 */
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import {
  readProcessFlow,
  writeProcessFlow,
  deleteProcessFlow as deleteProcessFlowFile,
  listProcessFlows as listProcessFlowFiles,
  readProject,
  writeProject,
} from "../projectStorage.js";
import {
  updateStep as editUpdateStep,
  removeStep as editRemoveStep,
  moveStep as editMoveStep,
  setMaturity as editSetMaturity,
  addStepNote as editAddStepNote,
  addCatalogEntry as editAddCatalogEntry,
  removeCatalogEntry as editRemoveCatalogEntry,
  insertStepAt as editInsertStepAt,
  type ProcessFlowDoc,
  type CatalogName,
} from "../processFlowEdits.js";
import { saveAndBroadcast, type ToolHandler } from "../mcpHelpers.js";
import { wsBridge } from "../wsBridge.js";

export const handleProcessFlowTool: ToolHandler = async (name, args) => {
  const a = args ?? {};

  switch (name) {
    case "designer__list_process_flows": {
      const agList = await listProcessFlowFiles() as Array<{ id: string; name: string; type: string; screenId?: string; actions?: unknown[]; updatedAt: string }>;
      if (agList.length === 0) {
        return { content: [{ type: "text", text: "処理フロー定義はまだありません。" }] };
      }
      const lines = agList.map(
        (ag) => `- ${ag.id}  ${ag.name}（${ag.type}）アクション:${ag.actions?.length ?? 0}件`
      );
      return { content: [{ type: "text", text: `処理フロー一覧 (${agList.length}件):\n${lines.join("\n")}` }] };
    }

    case "designer__get_process_flow": {
      if (typeof a.processFlowId !== "string") {
        throw new McpError(ErrorCode.InvalidParams, "processFlowId は必須です");
      }
      // browser-first: ProcessFlowEditor が開いていれば live 状態を取得
      const liveData = await wsBridge.tryCommand("getProcessFlow", { id: a.processFlowId });
      const agData = liveData ?? await readProcessFlow(a.processFlowId);
      if (!agData) {
        throw new McpError(ErrorCode.InvalidParams, `処理フロー ${a.processFlowId} が見つかりません`);
      }
      const source = liveData ? "browser live (unsaved 変更を含む)" : "file";
      const enriched = { _mcpSource: source, ...(agData as Record<string, unknown>) };
      return { content: [{ type: "text", text: JSON.stringify(enriched, null, 2) }] };
    }

    case "designer__add_process_flow": {
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
      await writeProcessFlow(agId, agDef);
      const agProject = (await readProject() ?? {}) as Record<string, unknown>;
      const agMetas = (agProject.processFlows ?? []) as Array<Record<string, unknown>>;
      agMetas.push({ id: agId, name: a.name, type: a.type, screenId: a.screenId, actionCount: 0, updatedAt: agNow });
      agProject.processFlows = agMetas;
      agProject.updatedAt = agNow;
      await writeProject(agProject);
      return { content: [{ type: "text", text: `処理フロー「${a.name}」(${a.type}) を追加しました（ID: ${agId}）` }] };
    }

    case "designer__update_process_flow": {
      if (typeof a.processFlowId !== "string" || !a.definition) {
        throw new McpError(ErrorCode.InvalidParams, "processFlowId, definition は必須です");
      }
      const agDef = a.definition as Record<string, unknown>;
      agDef.updatedAt = new Date().toISOString();
      await writeProcessFlow(a.processFlowId, agDef);
      const agProject = (await readProject() ?? {}) as Record<string, unknown>;
      const agMetas = (agProject.processFlows ?? []) as Array<Record<string, unknown>>;
      const agIdx = agMetas.findIndex((m) => m.id === a.processFlowId);
      const agActions = (agDef.actions ?? []) as unknown[];
      const agMeta = { id: a.processFlowId, name: agDef.name, type: agDef.type, screenId: agDef.screenId, actionCount: agActions.length, updatedAt: agDef.updatedAt };
      if (agIdx >= 0) agMetas[agIdx] = agMeta; else agMetas.push(agMeta);
      agProject.processFlows = agMetas;
      agProject.updatedAt = agDef.updatedAt as string;
      await writeProject(agProject);
      return { content: [{ type: "text", text: `処理フロー ${a.processFlowId} を更新しました。` }] };
    }

    case "designer__delete_process_flow": {
      if (typeof a.processFlowId !== "string") {
        throw new McpError(ErrorCode.InvalidParams, "processFlowId は必須です");
      }
      await deleteProcessFlowFile(a.processFlowId);
      const agProject = (await readProject() ?? {}) as Record<string, unknown>;
      const agMetas = ((agProject.processFlows ?? []) as Array<Record<string, unknown>>).filter((m) => m.id !== a.processFlowId);
      agProject.processFlows = agMetas;
      agProject.updatedAt = new Date().toISOString();
      await writeProject(agProject);
      return { content: [{ type: "text", text: `処理フロー ${a.processFlowId} を削除しました。` }] };
    }

    case "designer__add_action": {
      if (typeof a.processFlowId !== "string" || typeof a.name !== "string" || typeof a.trigger !== "string") {
        throw new McpError(ErrorCode.InvalidParams, "processFlowId, name, trigger は必須です");
      }
      const ag = await readProcessFlow(a.processFlowId) as Record<string, unknown> | null;
      if (!ag) throw new McpError(ErrorCode.InvalidParams, `処理フロー ${a.processFlowId} が見つかりません`);
      const actions = (ag.actions ?? []) as Array<Record<string, unknown>>;
      const actionId = `act-${Date.now()}`;
      actions.push({ id: actionId, name: a.name, trigger: a.trigger, steps: [] });
      ag.actions = actions;
      ag.updatedAt = new Date().toISOString();
      await writeProcessFlow(a.processFlowId, ag);
      return { content: [{ type: "text", text: `アクション「${a.name}」を追加しました（ID: ${actionId}）` }] };
    }

    case "designer__add_step": {
      if (typeof a.processFlowId !== "string" || typeof a.actionId !== "string" || typeof a.type !== "string") {
        throw new McpError(ErrorCode.InvalidParams, "processFlowId, actionId, type は必須です");
      }
      // browser-first: ProcessFlowEditor が開いていれば in-memory に適用
      const addApplied = await wsBridge.tryCommand("applyProcessFlowMutation", {
        id: a.processFlowId, type: "designer__add_step", params: a,
      });
      if (addApplied) {
        return { content: [{ type: "text", text: `ステップ（${a.type}）をブラウザで追加しました（保存で確定）` }] };
      }
      // fallback: ファイル書き
      const ag = await readProcessFlow(a.processFlowId) as ProcessFlowDoc | null;
      if (!ag) throw new McpError(ErrorCode.InvalidParams, `処理フロー ${a.processFlowId} が見つかりません`);
      const stepId = `step-${Date.now()}`;
      const detail = (a.detail ?? {}) as Record<string, unknown>;
      const step = { id: stepId, type: a.type as string, description: (a.description as string) ?? "", ...detail };
      editInsertStepAt(ag, a.actionId as string, step, typeof a.position === "number" ? a.position : undefined);
      await saveAndBroadcast(a.processFlowId, ag);
      return { content: [{ type: "text", text: `ステップ（${a.type}）を追加しました（ID: ${stepId}）` }] };
    }

    case "designer__update_step": {
      if (typeof a.processFlowId !== "string" || typeof a.stepId !== "string" || typeof a.patch !== "object" || a.patch === null) {
        throw new McpError(ErrorCode.InvalidParams, "processFlowId, stepId, patch は必須です");
      }
      const updApplied = await wsBridge.tryCommand("applyProcessFlowMutation", {
        id: a.processFlowId, type: "designer__update_step", params: a,
      });
      if (updApplied) {
        return { content: [{ type: "text", text: `ステップ ${a.stepId} をブラウザで更新しました（保存で確定）` }] };
      }
      // fallback
      const updAg = await readProcessFlow(a.processFlowId) as ProcessFlowDoc | null;
      if (!updAg) throw new McpError(ErrorCode.InvalidParams, `処理フロー ${a.processFlowId} が見つかりません`);
      try {
        editUpdateStep(updAg, a.stepId, a.patch as Record<string, unknown>);
      } catch (e) {
        throw new McpError(ErrorCode.InvalidParams, (e as Error).message);
      }
      await saveAndBroadcast(a.processFlowId, updAg);
      return { content: [{ type: "text", text: `ステップ ${a.stepId} を更新しました。` }] };
    }

    case "designer__remove_step": {
      if (typeof a.processFlowId !== "string" || typeof a.stepId !== "string") {
        throw new McpError(ErrorCode.InvalidParams, "processFlowId, stepId は必須です");
      }
      const rmApplied = await wsBridge.tryCommand("applyProcessFlowMutation", {
        id: a.processFlowId, type: "designer__remove_step", params: a,
      });
      if (rmApplied) {
        return { content: [{ type: "text", text: `ステップ ${a.stepId} をブラウザで削除しました（保存で確定）` }] };
      }
      // fallback
      const rmAg = await readProcessFlow(a.processFlowId) as ProcessFlowDoc | null;
      if (!rmAg) throw new McpError(ErrorCode.InvalidParams, `処理フロー ${a.processFlowId} が見つかりません`);
      try {
        editRemoveStep(rmAg, a.stepId);
      } catch (e) {
        throw new McpError(ErrorCode.InvalidParams, (e as Error).message);
      }
      await saveAndBroadcast(a.processFlowId, rmAg);
      return { content: [{ type: "text", text: `ステップ ${a.stepId} を削除しました。` }] };
    }

    case "designer__move_step": {
      if (typeof a.processFlowId !== "string" || typeof a.stepId !== "string" || typeof a.newIndex !== "number") {
        throw new McpError(ErrorCode.InvalidParams, "processFlowId, stepId, newIndex は必須です");
      }
      const mvApplied = await wsBridge.tryCommand("applyProcessFlowMutation", {
        id: a.processFlowId, type: "designer__move_step", params: a,
      });
      if (mvApplied) {
        return { content: [{ type: "text", text: `ステップ ${a.stepId} をブラウザで位置 ${a.newIndex} に移動しました（保存で確定）` }] };
      }
      // fallback
      const mvAg = await readProcessFlow(a.processFlowId) as ProcessFlowDoc | null;
      if (!mvAg) throw new McpError(ErrorCode.InvalidParams, `処理フロー ${a.processFlowId} が見つかりません`);
      try {
        editMoveStep(mvAg, a.stepId, a.newIndex);
      } catch (e) {
        throw new McpError(ErrorCode.InvalidParams, (e as Error).message);
      }
      await saveAndBroadcast(a.processFlowId, mvAg);
      return { content: [{ type: "text", text: `ステップ ${a.stepId} を位置 ${a.newIndex} に移動しました。` }] };
    }

    case "designer__set_maturity": {
      if (typeof a.processFlowId !== "string" || typeof a.target !== "string" || typeof a.maturity !== "string") {
        throw new McpError(ErrorCode.InvalidParams, "processFlowId, target, maturity は必須です");
      }
      const ag = await readProcessFlow(a.processFlowId) as ProcessFlowDoc | null;
      if (!ag) throw new McpError(ErrorCode.InvalidParams, `処理フロー ${a.processFlowId} が見つかりません`);
      try {
        editSetMaturity(ag, a.target as "group" | "action" | "step", a.targetId as string | undefined, a.maturity as "draft" | "provisional" | "committed");
      } catch (e) {
        throw new McpError(ErrorCode.InvalidParams, (e as Error).message);
      }
      await saveAndBroadcast(a.processFlowId, ag);
      return { content: [{ type: "text", text: `maturity を ${a.maturity} に更新しました。` }] };
    }

    case "designer__add_step_note": {
      if (typeof a.processFlowId !== "string" || typeof a.stepId !== "string" || typeof a.type !== "string" || typeof a.body !== "string") {
        throw new McpError(ErrorCode.InvalidParams, "processFlowId, stepId, type, body は必須です");
      }
      const ag = await readProcessFlow(a.processFlowId) as ProcessFlowDoc | null;
      if (!ag) throw new McpError(ErrorCode.InvalidParams, `処理フロー ${a.processFlowId} が見つかりません`);
      try {
        const res = editAddStepNote(ag, a.stepId, a.type as string, a.body as string);
        await saveAndBroadcast(a.processFlowId, ag);
        return { content: [{ type: "text", text: `付箋を追加しました (ID: ${res.id})` }] };
      } catch (e) {
        throw new McpError(ErrorCode.InvalidParams, (e as Error).message);
      }
    }

    case "designer__add_catalog_entry": {
      if (typeof a.processFlowId !== "string" || typeof a.catalog !== "string" || typeof a.key !== "string" || typeof a.value !== "object" || a.value === null) {
        throw new McpError(ErrorCode.InvalidParams, "processFlowId, catalog, key, value は必須です");
      }
      const ag = await readProcessFlow(a.processFlowId) as ProcessFlowDoc | null;
      if (!ag) throw new McpError(ErrorCode.InvalidParams, `処理フロー ${a.processFlowId} が見つかりません`);
      editAddCatalogEntry(ag, a.catalog as CatalogName, a.key as string, a.value as Record<string, unknown>);
      await saveAndBroadcast(a.processFlowId, ag);
      return { content: [{ type: "text", text: `${a.catalog}.${a.key} を追加/更新しました。` }] };
    }

    case "designer__remove_catalog_entry": {
      if (typeof a.processFlowId !== "string" || typeof a.catalog !== "string" || typeof a.key !== "string") {
        throw new McpError(ErrorCode.InvalidParams, "processFlowId, catalog, key は必須です");
      }
      const ag = await readProcessFlow(a.processFlowId) as ProcessFlowDoc | null;
      if (!ag) throw new McpError(ErrorCode.InvalidParams, `処理フロー ${a.processFlowId} が見つかりません`);
      editRemoveCatalogEntry(ag, a.catalog as CatalogName, a.key as string);
      await saveAndBroadcast(a.processFlowId, ag);
      return { content: [{ type: "text", text: `${a.catalog}.${a.key} を削除しました。` }] };
    }

    default:
      return null;
  }
};
