/**
 * Project-level external catalogs (#939 提案 C、2026-05-08)。
 *
 * `harmony/catalogs/external.json` で project 全体の modelEndpoints / secrets /
 * envVars / events / functions / externalSystems を共有定義する。1 sample 内で
 * 複数 ProcessFlow が同じ provider / secret / endpoint を参照する場合、本ファイルに
 * 集約することで重複排除と一括変更を可能にする。
 *
 * flow level (context.catalogs.*) と project level の両方で同じカテゴリ + 同じキー
 * を定義した場合、flow level が project level を override する。
 *
 * schema: schemas/v3/external-catalogs.v3.schema.json
 */
import type { ProcessFlow } from "../types/v3";

export interface ProjectCatalogs {
  modelEndpoints?: Record<string, unknown>;
  secrets?: Record<string, unknown>;
  envVars?: Record<string, unknown>;
  events?: Record<string, unknown>;
  functions?: Record<string, unknown>;
  externalSystems?: Record<string, unknown>;
}

/**
 * flow level の context.catalogs と project level catalogs を merge する。
 * flow level が同名キーを持つ場合は flow level が優先される (override 意図)。
 *
 * 用途: 各 validator が「この flow から見える catalogs」を取得する標準ヘルパー。
 */
export function mergeCatalogsForFlow(
  flow: ProcessFlow,
  projectCatalogs: ProjectCatalogs | undefined,
): ProjectCatalogs {
  const flowCatalogs = (flow.context?.catalogs ?? {}) as Record<
    keyof ProjectCatalogs,
    Record<string, unknown> | undefined
  >;
  const merge = (key: keyof ProjectCatalogs): Record<string, unknown> | undefined => {
    const project = projectCatalogs?.[key];
    const flowEntries = flowCatalogs[key];
    if (!project && !flowEntries) return undefined;
    return { ...(project ?? {}), ...(flowEntries ?? {}) };
  };
  return {
    modelEndpoints: merge("modelEndpoints"),
    secrets: merge("secrets"),
    envVars: merge("envVars"),
    events: merge("events"),
    functions: merge("functions"),
    externalSystems: merge("externalSystems"),
  };
}
