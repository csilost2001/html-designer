/**
 * projectStorage.ts
 * ファイルベースのプロジェクトデータ永続化ユーティリティ。
 *
 * #671 以降、active workspace path は `workspaceState` モジュールが保持する。
 * 本モジュール内の path 解決はすべて `requireActivePath()` 経由で行うため、
 * active 未選択時は WorkspaceUnsetError を throw する。
 *
 * #700 R-2: per-session active state 対応。`resolveRoot(clientId?)` ヘルパーを追加し、
 * clientId が渡された場合は WorkspaceContextManager 経由で root を解決する。
 * clientId が渡されない場合は LEGACY global API (requireActivePath()) に fallback する。
 */
import fs from "fs/promises";
import path from "path";
import Ajv, { type ValidateFunction } from "ajv";
import { requireActivePath, workspaceContextManager } from "./workspaceState.js";

// ── path 解決ヘルパー (#671 + #700 R-2) ─────────────────────────────────────
// workspace 切替に追従するため、絶対パス constant を廃止し getter 関数化。
//
// レース対策 (#676 review 7 周目): 各 getter は optional root を受け、未指定なら
// requireActivePath() からフォールバック取得する。複数 path を生成する公開関数は
// 関数開始時に root を 1 度だけスナップショットし、すべての helper にそれを渡す
// ことで、操作中に workspace 切替が起きても書き込み先が分散しないようにする。
//
// #700 R-2: clientId が渡された場合は WorkspaceContextManager 経由で per-session root を解決。
// clientId なしの呼び出しは LEGACY global API に fallback (MCP tool 等の互換維持)。

/**
 * clientId から per-session active root を解決するヘルパー (#700 R-2)。
 * clientId が渡された場合は WorkspaceContextManager を使用。
 * clientId が渡されない場合は LEGACY global requireActivePath() に fallback。
 */
export function resolveRoot(clientId?: string): string {
  if (clientId) {
    return workspaceContextManager.requireActivePath(clientId);
  }
  return requireActivePath();
}

/** 現在 active な workspace のルート絶対パスを返す。未選択なら throw */
export function dataDir(root?: string): string {
  return root ?? requireActivePath();
}

const screensDir       = (root?: string) => path.join(dataDir(root), "screens");
const tablesDir        = (root?: string) => path.join(dataDir(root), "tables");
const actionsDir       = (root?: string) => path.join(dataDir(root), "actions");
const conventionsDir   = (root?: string) => path.join(dataDir(root), "conventions");
const screenItemsDir   = (root?: string) => path.join(dataDir(root), "screen-items");
const sequencesDir     = (root?: string) => path.join(dataDir(root), "sequences");
const viewsDir         = (root?: string) => path.join(dataDir(root), "views");
const viewDefsDir      = (root?: string) => path.join(dataDir(root), "view-definitions");
export const extensionsDir = (root?: string) => path.join(dataDir(root), "extensions");
export const projectFile      = (root?: string) => path.join(dataDir(root), "project.json");
export const customBlocksFile = (root?: string) => path.join(dataDir(root), "custom-blocks.json");
export const erLayoutFile     = (root?: string) => path.join(dataDir(root), "er-layout.json");
export const screenLayoutFile = (root?: string) => path.join(dataDir(root), "screen-layout.json");
export const conventionsFile  = (root?: string) => path.join(conventionsDir(root), "catalog.json");

const EXTENSION_FILE_NAMES = {
  steps: "steps.json",
  fieldTypes: "field-types.json",
  triggers: "triggers.json",
  dbOperations: "db-operations.json",
  responseTypes: "response-types.json",
} as const;

export type ExtensionFileKind = keyof typeof EXTENSION_FILE_NAMES;

/** スキーマルートディレクトリ: designer-mcp/src/ から 2 段上がって schemas/ */
const SCHEMAS_DIR = path.resolve(import.meta.dirname, "../../schemas");
const SCREEN_SCHEMA_REF = "../schemas/v3/screen.v3.schema.json";

/** ExtensionFileKind → extensions-*.schema.json ファイル名スラグの変換 */
function kindToSchemaSlug(kind: ExtensionFileKind): string {
  switch (kind) {
    case "steps": return "steps";
    case "fieldTypes": return "field-types";
    case "triggers": return "triggers";
    case "dbOperations": return "db-operations";
    case "responseTypes": return "response-types";
  }
}

/** Ajv インスタンスとバリデーター関数のモジュールレベルキャッシュ (#455) */
const _ajv = new Ajv({ allErrors: true });
const _validatorCache = new Map<ExtensionFileKind, ValidateFunction>();

async function getExtensionValidator(kind: ExtensionFileKind): Promise<ValidateFunction> {
  if (!_validatorCache.has(kind)) {
    const schemaPath = path.join(SCHEMAS_DIR, `extensions-${kindToSchemaSlug(kind)}.schema.json`);
    const schemaText = await fs.readFile(schemaPath, "utf-8");
    const schema = JSON.parse(schemaText) as object;
    _validatorCache.set(kind, _ajv.compile(schema));
  }
  return _validatorCache.get(kind)!;
}

/** extensions/*.json の JSON Schema 検証 (#455) */
async function validateExtensionFile(kind: ExtensionFileKind, data: unknown): Promise<void> {
  const validate = await getExtensionValidator(kind);
  if (!validate(data)) {
    throw new Error(
      `extensions/${kind}.json schema 違反: ${_ajv.errorsText(validate.errors)}`
    );
  }
}

/** active workspace 配下のディレクトリ群を作成（既存なら無視） */
export async function ensureDataDir(root?: string): Promise<void> {
  const r = dataDir(root);
  await fs.mkdir(r, { recursive: true });
  await fs.mkdir(screensDir(r), { recursive: true });
  await fs.mkdir(tablesDir(r), { recursive: true });
  await fs.mkdir(actionsDir(r), { recursive: true });
  await fs.mkdir(conventionsDir(r), { recursive: true });
  // screen-items/ は Phase 4-β migration 後に廃止済み — 再作成しない
  await fs.mkdir(sequencesDir(r), { recursive: true });
  await fs.mkdir(viewsDir(r), { recursive: true });
  await fs.mkdir(viewDefsDir(r), { recursive: true });
  await fs.mkdir(extensionsDir(r), { recursive: true });
}

async function readJSON<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJSON(filePath: string, data: unknown): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  await fs.writeFile(filePath, json, "utf-8");
}

/** project.json を読み込み（存在しない場合は null） */
export async function readProject(root?: string): Promise<unknown | null> {
  // 他の read 関数と一貫させるため明示的に root snapshot (#676 Sonnet re-review Nit)。
  // 引数 root が指定されていればそれを優先、未指定時は requireActivePath() で確定。
  const r = root ?? requireActivePath();
  return readJSON<unknown>(projectFile(r));
}

/** project.json を書き込み */
export async function writeProject(project: unknown, root?: string): Promise<void> {
  const r = root ?? requireActivePath();
  await ensureDataDir(r);
  const projFile = projectFile(r);
  const next = project as Record<string, unknown>;
  if (next.schemaVersion === "v3") {
    const current = await readJSON<Record<string, unknown>>(projFile);
    if (current && current.schemaVersion !== "v3") {
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      await fs.copyFile(projFile, `${projFile}.bak.${ts}`);
    }
  }
  await writeJSON(projFile, project);
}

/** 各種データファイルの更新時刻を取得（存在しないなら null） */
export async function getFileMtime(kind: string, id?: string, root?: string): Promise<number | null> {
  const r = root ?? requireActivePath();
  const filePath = resolveDataFile(kind, r, id);
  if (!filePath) return null;
  try {
    const stat = await fs.stat(filePath);
    return stat.mtimeMs;
  } catch {
    return null;
  }
}

function resolveDataFile(kind: string, root: string, id?: string): string | null {
  switch (kind) {
    case "project": return projectFile(root);
    case "erLayout": return erLayoutFile(root);
    case "customBlocks": return customBlocksFile(root);
    case "conventions": return conventionsFile(root);
    case "screen": return id ? path.join(screensDir(root), `${id}.design.json`) : null;
    case "screenEntity": return id ? path.join(screensDir(root), `${id}.json`) : null;
    case "table": return id ? path.join(tablesDir(root), `${id}.json`) : null;
    case "processFlow": return id ? path.join(actionsDir(root), `${id}.json`) : null;
    case "screenItems": return id ? path.join(screenItemsDir(root), `${id}.json`) : null;
    case "sequence": return id ? path.join(sequencesDir(root), `${id}.json`) : null;
    case "view": return id ? path.join(viewsDir(root), `${id}.json`) : null;
    case "viewDefinition": return id ? path.join(viewDefsDir(root), `${id}.json`) : null;
    default: return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLegacyGrapesScreen(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return Array.isArray(value.pages) || "frames" in value || "component" in value || "styles" in value;
}

function isScreenEntity(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return value.$schema === SCREEN_SCHEMA_REF || (
    typeof value.kind === "string" &&
    typeof value.path === "string" &&
    ("items" in value || "design" in value || "id" in value)
  );
}

function getScreenEntry(project: unknown, screenId: string): Record<string, unknown> | null {
  if (!isRecord(project)) return null;
  const entities = isRecord(project.entities) ? project.entities : null;
  const v3Screens = Array.isArray(entities?.screens) ? entities.screens : null;
  const legacyScreens = Array.isArray(project.screens) ? project.screens : null;
  const screens = v3Screens ?? legacyScreens ?? [];
  const found = screens.find((s) => isRecord(s) && s.id === screenId);
  return isRecord(found) ? found : null;
}

function extractItems(value: unknown): unknown[] {
  return isRecord(value) && Array.isArray(value.items) ? value.items : [];
}

function buildDefaultScreenEntity(
  screenId: string,
  entry: Record<string, unknown> | null,
  items: unknown[],
): Record<string, unknown> {
  const ts = new Date().toISOString();
  const updatedAt = typeof entry?.updatedAt === "string" ? entry.updatedAt : ts;
  return {
    $schema: SCREEN_SCHEMA_REF,
    id: screenId,
    name: typeof entry?.name === "string" && entry.name ? entry.name : screenId,
    ...(typeof entry?.description === "string" && entry.description ? { description: entry.description } : {}),
    ...(typeof entry?.maturity === "string" ? { maturity: entry.maturity } : {}),
    createdAt: typeof entry?.createdAt === "string" ? entry.createdAt : updatedAt,
    updatedAt,
    kind: typeof entry?.kind === "string" && entry.kind ? entry.kind : "other",
    path: typeof entry?.path === "string" ? entry.path : "",
    ...(typeof entry?.groupId === "string" ? { groupId: entry.groupId } : {}),
    items,
    design: { designFileRef: `${screenId}.design.json` },
  };
}

/** per-(root, screenId) の in-flight migration を 1 つに集約する Promise キャッシュ。
 * key を root::screenId にすることで、workspace 切替後も別 root の migration と独立に動く。 */
const _inflightMigrations = new Map<string, Promise<Record<string, unknown> | null>>();

async function _migrateScreenCore(screenId: string, root: string): Promise<Record<string, unknown> | null> {
  await ensureDataDir(root);
  const entityPath = path.join(screensDir(root), `${screenId}.json`);
  const designPath = path.join(screensDir(root), `${screenId}.design.json`);
  const legacyItemsPath = path.join(screenItemsDir(root), `${screenId}.json`);
  const current = await readJSON<unknown>(entityPath);

  if (isScreenEntity(current) && !isLegacyGrapesScreen(current)) {
    return current as Record<string, unknown>;
  }

  if (isLegacyGrapesScreen(current)) {
    try {
      await fs.rename(entityPath, designPath);
    } catch {
      await writeJSON(designPath, current);
    }
    const project = await readProject(root);
    const itemsFile = await readJSON<unknown>(legacyItemsPath);
    const entity = buildDefaultScreenEntity(screenId, getScreenEntry(project, screenId), extractItems(itemsFile));
    await writeJSON(entityPath, entity);
    try { await fs.unlink(legacyItemsPath); } catch { /* ignore */ }
    return entity;
  }

  const design = await readJSON<unknown>(designPath);
  const itemsFile = await readJSON<unknown>(legacyItemsPath);
  if (design || itemsFile) {
    const project = await readProject(root);
    const entity = buildDefaultScreenEntity(screenId, getScreenEntry(project, screenId), extractItems(itemsFile));
    await writeJSON(entityPath, entity);
    try { await fs.unlink(legacyItemsPath); } catch { /* ignore */ }
    return entity;
  }

  return null;
}

async function migrateScreenIfNeeded(screenId: string, root?: string): Promise<Record<string, unknown> | null> {
  const r = dataDir(root);
  const key = `${r}::${screenId}`;
  const existing = _inflightMigrations.get(key);
  if (existing) return existing;

  const promise = _migrateScreenCore(screenId, r).finally(() => {
    _inflightMigrations.delete(key);
  });
  _inflightMigrations.set(key, promise);
  return promise;
}

/** data/extensions/*.json を生 JSON バンドルとして読み込み (#444) */
export async function readExtensionsBundle(root?: string): Promise<Record<ExtensionFileKind, unknown | null>> {
  const r = root ?? requireActivePath();
  await ensureDataDir(r);
  const extDir = extensionsDir(r);
  const entries = await Promise.all(
    Object.entries(EXTENSION_FILE_NAMES).map(async ([kind, fileName]) => {
      const data = await readJSON<unknown>(path.join(extDir, fileName));
      return [kind, data] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<ExtensionFileKind, unknown | null>;
}

/** data/extensions/{type}.json を単体書き込み (validation 付き、broadcast コールバック対応) (#455) */
export async function writeExtensionsFile(
  type: ExtensionFileKind,
  content: unknown,
  options?: { onAfterWrite?: () => void; skipValidation?: boolean; root?: string },
): Promise<void> {
  const r = options?.root ?? requireActivePath();
  await ensureDataDir(r);
  if (!options?.skipValidation) {
    await validateExtensionFile(type, content);
  }
  await writeJSON(path.join(extensionsDir(r), EXTENSION_FILE_NAMES[type]), content);
  options?.onAfterWrite?.();
}

/** screens/{screenId}.json を読み込み */
export async function readScreen(screenId: string, root?: string): Promise<unknown | null> {
  const r = root ?? requireActivePath();
  await migrateScreenIfNeeded(screenId, r);
  return readJSON<unknown>(path.join(screensDir(r), `${screenId}.design.json`));
}

/** screens/{screenId}.json を書き込み */
export async function writeScreen(screenId: string, data: unknown, root?: string): Promise<void> {
  const r = root ?? requireActivePath();
  await ensureDataDir(r);
  let entity = await migrateScreenIfNeeded(screenId, r);
  if (!entity) {
    const project = await readProject(r);
    entity = buildDefaultScreenEntity(screenId, getScreenEntry(project, screenId), []);
  }
  entity = {
    ...entity,
    $schema: SCREEN_SCHEMA_REF,
    updatedAt: new Date().toISOString(),
    design: {
      ...(isRecord(entity.design) ? entity.design : {}),
      designFileRef: `${screenId}.design.json`,
    },
  };
  const sDir = screensDir(r);
  await writeJSON(path.join(sDir, `${screenId}.json`), entity);
  await writeJSON(path.join(sDir, `${screenId}.design.json`), data);
}

export async function readScreenEntity(screenId: string, root?: string): Promise<unknown | null> {
  return migrateScreenIfNeeded(screenId, root);
}

export async function writeScreenEntity(screenId: string, data: unknown, root?: string): Promise<void> {
  const r = root ?? requireActivePath();
  await ensureDataDir(r);
  const current = isRecord(data) ? data : {};
  const project = await readProject(r);
  const entry = getScreenEntry(project, screenId);
  const toSave = {
    ...buildDefaultScreenEntity(screenId, entry, []),
    ...current,
    $schema: SCREEN_SCHEMA_REF,
    id: typeof current.id === "string" ? current.id : screenId,
    kind: typeof current.kind === "string" ? current.kind : (typeof entry?.kind === "string" ? entry.kind : "other"),
    path: typeof current.path === "string" ? current.path : (typeof entry?.path === "string" ? entry.path : ""),
    updatedAt: new Date().toISOString(),
    design: {
      ...(isRecord(current.design) ? current.design : {}),
      designFileRef: `${screenId}.design.json`,
    },
  };
  await writeJSON(path.join(screensDir(r), `${screenId}.json`), toSave);
}

/** screens/{screenId}.json を削除（存在しない場合は無視） */
export async function deleteScreen(screenId: string, root?: string): Promise<void> {
  const r = root ?? requireActivePath();
  const sDir = screensDir(r);
  const siDir = screenItemsDir(r);
  try {
    await fs.unlink(path.join(sDir, `${screenId}.json`));
  } catch { /* file not found is OK */ }
  try {
    await fs.unlink(path.join(sDir, `${screenId}.design.json`));
  } catch { /* file not found is OK */ }
  try {
    await fs.unlink(path.join(siDir, `${screenId}.json`));
  } catch { /* file not found is OK */ }
}

/** custom-blocks.json を読み込み */
export async function readCustomBlocks(root?: string): Promise<unknown[]> {
  const r = root ?? requireActivePath();
  return (await readJSON<unknown[]>(customBlocksFile(r))) ?? [];
}

/** custom-blocks.json を書き込み */
export async function writeCustomBlocks(blocks: unknown[], root?: string): Promise<void> {
  const r = root ?? requireActivePath();
  await ensureDataDir(r);
  await writeJSON(customBlocksFile(r), blocks);
}

/** er-layout.json を読み込み */
export async function readErLayout(root?: string): Promise<unknown | null> {
  const r = root ?? requireActivePath();
  return readJSON<unknown>(erLayoutFile(r));
}

/** er-layout.json を書き込み */
export async function writeErLayout(data: unknown, root?: string): Promise<void> {
  const r = root ?? requireActivePath();
  await ensureDataDir(r);
  await writeJSON(erLayoutFile(r), data);
}

/** screen-layout.json を読み込み (Phase 3-β、#561) */
export async function readScreenLayout(root?: string): Promise<unknown | null> {
  const r = root ?? requireActivePath();
  return readJSON<unknown>(screenLayoutFile(r));
}

/** screen-layout.json を書き込み (Phase 3-β、#561) */
export async function writeScreenLayout(data: unknown, root?: string): Promise<void> {
  const r = root ?? requireActivePath();
  await ensureDataDir(r);
  await writeJSON(screenLayoutFile(r), data);
}

/** tables/{tableId}.json を読み込み */
export async function readTable(tableId: string, root?: string): Promise<unknown | null> {
  const r = root ?? requireActivePath();
  return readJSON<unknown>(path.join(tablesDir(r), `${tableId}.json`));
}

/** tables/{tableId}.json を書き込み */
export async function writeTable(tableId: string, data: unknown, root?: string): Promise<void> {
  const r = root ?? requireActivePath();
  await ensureDataDir(r);
  await writeJSON(path.join(tablesDir(r), `${tableId}.json`), data);
}

/** tables/{tableId}.json を削除（存在しない場合は無視） */
export async function deleteTable(tableId: string, root?: string): Promise<void> {
  const r = root ?? requireActivePath();
  try {
    await fs.unlink(path.join(tablesDir(r), `${tableId}.json`));
  } catch { /* file not found is OK */ }
}

/** tables/ ディレクトリ内の全テーブル定義を読み込み (#587) */
export async function listAllTables(root?: string): Promise<unknown[]> {
  try {
    const r = root ?? requireActivePath();
    await ensureDataDir(r);
    const tDir = tablesDir(r);
    const files = await fs.readdir(tDir);
    const results: unknown[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const data = await readJSON<unknown>(path.join(tDir, file));
      if (data) results.push(data);
    }
    return results;
  } catch {
    return [];
  }
}

/** actions/{processFlowId}.json を読み込み */
export async function readProcessFlow(processFlowId: string, root?: string): Promise<unknown | null> {
  const r = root ?? requireActivePath();
  return readJSON<unknown>(path.join(actionsDir(r), `${processFlowId}.json`));
}

/** actions/{processFlowId}.json を書き込み */
export async function writeProcessFlow(processFlowId: string, data: unknown, root?: string): Promise<void> {
  const r = root ?? requireActivePath();
  await ensureDataDir(r);
  await writeJSON(path.join(actionsDir(r), `${processFlowId}.json`), data);
}

/** actions/{processFlowId}.json を削除（存在しない場合は無視） */
export async function deleteProcessFlow(processFlowId: string, root?: string): Promise<void> {
  const r = root ?? requireActivePath();
  try {
    await fs.unlink(path.join(actionsDir(r), `${processFlowId}.json`));
  } catch { /* file not found is OK */ }
}

/** conventions/catalog.json を読み込み (#317) */
export async function readConventions(root?: string): Promise<unknown | null> {
  const r = root ?? requireActivePath();
  return readJSON<unknown>(conventionsFile(r));
}

/** conventions/catalog.json を書き込み (#317) */
export async function writeConventions(data: unknown, root?: string): Promise<void> {
  const r = root ?? requireActivePath();
  await ensureDataDir(r);
  await writeJSON(conventionsFile(r), data);
}

/** screen-items/{screenId}.json を読み込み (#318) */
export async function readScreenItems(screenId: string, root?: string): Promise<unknown | null> {
  const screen = await readScreenEntity(screenId, root);
  if (!isRecord(screen)) return null;
  return {
    screenId,
    updatedAt: typeof screen.updatedAt === "string" ? screen.updatedAt : new Date().toISOString(),
    items: Array.isArray(screen.items) ? screen.items : [],
  };
}

/** screen-items/{screenId}.json を書き込み (#318) */
export async function writeScreenItems(screenId: string, data: unknown, root?: string): Promise<void> {
  const r = root ?? requireActivePath();
  const current = (await migrateScreenIfNeeded(screenId, r)) as Record<string, unknown> | null;
  const project = await readProject(r);
  const items = extractItems(data);
  const next = {
    ...(current ?? buildDefaultScreenEntity(screenId, getScreenEntry(project, screenId), [])),
    items,
    updatedAt: new Date().toISOString(),
  };
  await writeScreenEntity(screenId, next, r);
  try { await fs.unlink(path.join(screenItemsDir(r), `${screenId}.json`)); } catch { /* ignore */ }
}

/** screen-items/{screenId}.json を削除 (#318) */
export async function deleteScreenItems(screenId: string, root?: string): Promise<void> {
  const r = root ?? requireActivePath();
  const current = (await migrateScreenIfNeeded(screenId, r)) as Record<string, unknown> | null;
  if (current) {
    await writeScreenEntity(screenId, { ...current, items: [] }, r);
  }
  try {
    await fs.unlink(path.join(screenItemsDir(r), `${screenId}.json`));
  } catch { /* file not found is OK */ }
}

/** sequences/{sequenceId}.json を読み込み (#374) */
export async function readSequence(sequenceId: string, root?: string): Promise<unknown | null> {
  const r = root ?? requireActivePath();
  return readJSON<unknown>(path.join(sequencesDir(r), `${sequenceId}.json`));
}

/** sequences/{sequenceId}.json を書き込み (#374) */
export async function writeSequence(sequenceId: string, data: unknown, root?: string): Promise<void> {
  const r = root ?? requireActivePath();
  await ensureDataDir(r);
  await writeJSON(path.join(sequencesDir(r), `${sequenceId}.json`), data);
}

/** sequences/{sequenceId}.json を削除（存在しない場合は無視） (#374) */
export async function deleteSequence(sequenceId: string, root?: string): Promise<void> {
  const r = root ?? requireActivePath();
  try {
    await fs.unlink(path.join(sequencesDir(r), `${sequenceId}.json`));
  } catch { /* file not found is OK */ }
}

/** views/ ディレクトリ内の全ビュー定義を読み込み (#587) */
export async function listAllViews(root?: string): Promise<unknown[]> {
  try {
    const r = root ?? requireActivePath();
    await ensureDataDir(r);
    const vDir = viewsDir(r);
    const files = await fs.readdir(vDir);
    const results: unknown[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const data = await readJSON<unknown>(path.join(vDir, file));
      if (data) results.push(data);
    }
    return results;
  } catch {
    return [];
  }
}

/** views/{viewId}.json を読み込み (v3 per-entity #549) */
export async function readView(viewId: string, root?: string): Promise<unknown | null> {
  const r = root ?? requireActivePath();
  return readJSON<unknown>(path.join(viewsDir(r), `${viewId}.json`));
}

/** views/{viewId}.json を書き込み (v3 per-entity #549) */
export async function writeView(viewId: string, data: unknown, root?: string): Promise<void> {
  const r = root ?? requireActivePath();
  await ensureDataDir(r);
  await writeJSON(path.join(viewsDir(r), `${viewId}.json`), data);
}

/** views/{viewId}.json を削除（存在しない場合は無視） (v3 per-entity #549) */
export async function deleteView(viewId: string, root?: string): Promise<void> {
  const r = root ?? requireActivePath();
  try {
    await fs.unlink(path.join(viewsDir(r), `${viewId}.json`));
  } catch { /* file not found is OK */ }
}

export async function listAllViewDefinitions(root?: string): Promise<unknown[]> {
  try {
    const r = root ?? requireActivePath();
    await ensureDataDir(r);
    const vdDir = viewDefsDir(r);
    const files = await fs.readdir(vdDir);
    const results: unknown[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const data = await readJSON<unknown>(path.join(vdDir, file));
      if (data) results.push(data);
    }
    return results;
  } catch {
    return [];
  }
}

export async function readViewDefinition(viewDefinitionId: string, root?: string): Promise<unknown | null> {
  const r = root ?? requireActivePath();
  return readJSON<unknown>(path.join(viewDefsDir(r), `${viewDefinitionId}.json`));
}

export async function writeViewDefinition(viewDefinitionId: string, data: unknown, root?: string): Promise<void> {
  const r = root ?? requireActivePath();
  await ensureDataDir(r);
  await writeJSON(path.join(viewDefsDir(r), `${viewDefinitionId}.json`), data);
}

export async function deleteViewDefinition(viewDefinitionId: string, root?: string): Promise<void> {
  const r = root ?? requireActivePath();
  try {
    await fs.unlink(path.join(viewDefsDir(r), `${viewDefinitionId}.json`));
  } catch { /* file not found is OK */ }
}

/** actions/ ディレクトリ内の全処理フローを読み込み */
export async function listProcessFlows(root?: string): Promise<unknown[]> {
  try {
    const r = root ?? requireActivePath();
    await ensureDataDir(r);
    const aDir = actionsDir(r);
    const files = await fs.readdir(aDir);
    const results: unknown[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const data = await readJSON<unknown>(path.join(aDir, file));
      if (data) results.push(data);
    }
    return results;
  } catch {
    return [];
  }
}
