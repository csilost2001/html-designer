/**
 * projectStorage.ts
 * ファイルベースのプロジェクトデータ永続化ユーティリティ
 *
 * データディレクトリ: $DESIGNER_DATA_DIR または ../data（ワークスペースルート）
 */
import fs from "fs/promises";
import path from "path";
import Ajv, { type ValidateFunction } from "ajv";

// DATA_DIR: 環境変数で上書き可能
// デフォルト: designer-mcp/src/ から 2 段上がって data/
export const DATA_DIR =
  process.env.DESIGNER_DATA_DIR ??
  path.resolve(import.meta.dirname, "../../data");

const SCREENS_DIR = path.join(DATA_DIR, "screens");
const TABLES_DIR = path.join(DATA_DIR, "tables");
const ACTIONS_DIR = path.join(DATA_DIR, "actions");
const CONVENTIONS_DIR = path.join(DATA_DIR, "conventions");
const SCREEN_ITEMS_DIR = path.join(DATA_DIR, "screen-items");
const SEQUENCES_DIR = path.join(DATA_DIR, "sequences");
const VIEWS_DIR = path.join(DATA_DIR, "views");
export const EXTENSIONS_DIR = path.join(DATA_DIR, "extensions");
export const PROJECT_FILE = path.join(DATA_DIR, "project.json");
export const CUSTOM_BLOCKS_FILE = path.join(DATA_DIR, "custom-blocks.json");
export const ER_LAYOUT_FILE = path.join(DATA_DIR, "er-layout.json");
export const SCREEN_LAYOUT_FILE = path.join(DATA_DIR, "screen-layout.json");
export const CONVENTIONS_FILE = path.join(CONVENTIONS_DIR, "catalog.json");

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

/** data/ ディレクトリ群を作成（既存なら無視） */
export async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(SCREENS_DIR, { recursive: true });
  await fs.mkdir(TABLES_DIR, { recursive: true });
  await fs.mkdir(ACTIONS_DIR, { recursive: true });
  await fs.mkdir(CONVENTIONS_DIR, { recursive: true });
  await fs.mkdir(SCREEN_ITEMS_DIR, { recursive: true });
  await fs.mkdir(SEQUENCES_DIR, { recursive: true });
  await fs.mkdir(VIEWS_DIR, { recursive: true });
  await fs.mkdir(EXTENSIONS_DIR, { recursive: true });
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
export async function readProject(): Promise<unknown | null> {
  return readJSON<unknown>(PROJECT_FILE);
}

/** project.json を書き込み */
export async function writeProject(project: unknown): Promise<void> {
  await ensureDataDir();
  const next = project as Record<string, unknown>;
  if (next.schemaVersion === "v3") {
    const current = await readJSON<Record<string, unknown>>(PROJECT_FILE);
    if (current && current.schemaVersion !== "v3") {
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      await fs.copyFile(PROJECT_FILE, `${PROJECT_FILE}.bak.${ts}`);
    }
  }
  await writeJSON(PROJECT_FILE, project);
}

/** 各種データファイルの更新時刻を取得（存在しないなら null） */
export async function getFileMtime(kind: string, id?: string): Promise<number | null> {
  const filePath = resolveDataFile(kind, id);
  if (!filePath) return null;
  try {
    const stat = await fs.stat(filePath);
    return stat.mtimeMs;
  } catch {
    return null;
  }
}

function resolveDataFile(kind: string, id?: string): string | null {
  switch (kind) {
    case "project": return PROJECT_FILE;
    case "erLayout": return ER_LAYOUT_FILE;
    case "customBlocks": return CUSTOM_BLOCKS_FILE;
    case "conventions": return CONVENTIONS_FILE;
    case "screen": return id ? path.join(SCREENS_DIR, `${id}.design.json`) : null;
    case "screenEntity": return id ? path.join(SCREENS_DIR, `${id}.json`) : null;
    case "table": return id ? path.join(TABLES_DIR, `${id}.json`) : null;
    case "processFlow": return id ? path.join(ACTIONS_DIR, `${id}.json`) : null;
    case "screenItems": return id ? path.join(SCREEN_ITEMS_DIR, `${id}.json`) : null;
    case "sequence": return id ? path.join(SEQUENCES_DIR, `${id}.json`) : null;
    case "view": return id ? path.join(VIEWS_DIR, `${id}.json`) : null;
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

async function migrateScreenIfNeeded(screenId: string): Promise<Record<string, unknown> | null> {
  await ensureDataDir();
  const entityPath = path.join(SCREENS_DIR, `${screenId}.json`);
  const designPath = path.join(SCREENS_DIR, `${screenId}.design.json`);
  const legacyItemsPath = path.join(SCREEN_ITEMS_DIR, `${screenId}.json`);
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
    const project = await readProject();
    const itemsFile = await readJSON<unknown>(legacyItemsPath);
    const entity = buildDefaultScreenEntity(screenId, getScreenEntry(project, screenId), extractItems(itemsFile));
    await writeJSON(entityPath, entity);
    try { await fs.unlink(legacyItemsPath); } catch { /* ignore */ }
    return entity;
  }

  const design = await readJSON<unknown>(designPath);
  const itemsFile = await readJSON<unknown>(legacyItemsPath);
  if (design || itemsFile) {
    const project = await readProject();
    const entity = buildDefaultScreenEntity(screenId, getScreenEntry(project, screenId), extractItems(itemsFile));
    await writeJSON(entityPath, entity);
    try { await fs.unlink(legacyItemsPath); } catch { /* ignore */ }
    return entity;
  }

  return null;
}

/** data/extensions/*.json を生 JSON バンドルとして読み込み (#444) */
export async function readExtensionsBundle(): Promise<Record<ExtensionFileKind, unknown | null>> {
  await ensureDataDir();
  const entries = await Promise.all(
    Object.entries(EXTENSION_FILE_NAMES).map(async ([kind, fileName]) => {
      const data = await readJSON<unknown>(path.join(EXTENSIONS_DIR, fileName));
      return [kind, data] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<ExtensionFileKind, unknown | null>;
}

/** data/extensions/{type}.json を単体書き込み (validation 付き、broadcast コールバック対応) (#455) */
export async function writeExtensionsFile(
  type: ExtensionFileKind,
  content: unknown,
  options?: { onAfterWrite?: () => void; skipValidation?: boolean },
): Promise<void> {
  await ensureDataDir();
  if (!options?.skipValidation) {
    await validateExtensionFile(type, content);
  }
  await writeJSON(path.join(EXTENSIONS_DIR, EXTENSION_FILE_NAMES[type]), content);
  options?.onAfterWrite?.();
}

/** screens/{screenId}.json を読み込み */
export async function readScreen(screenId: string): Promise<unknown | null> {
  await migrateScreenIfNeeded(screenId);
  return readJSON<unknown>(path.join(SCREENS_DIR, `${screenId}.design.json`));
}

/** screens/{screenId}.json を書き込み */
export async function writeScreen(screenId: string, data: unknown): Promise<void> {
  await ensureDataDir();
  let entity = await migrateScreenIfNeeded(screenId);
  if (!entity) {
    const project = await readProject();
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
  await writeJSON(path.join(SCREENS_DIR, `${screenId}.json`), entity);
  await writeJSON(path.join(SCREENS_DIR, `${screenId}.design.json`), data);
}

export async function readScreenEntity(screenId: string): Promise<unknown | null> {
  return migrateScreenIfNeeded(screenId);
}

export async function writeScreenEntity(screenId: string, data: unknown): Promise<void> {
  await ensureDataDir();
  const current = isRecord(data) ? data : {};
  const project = await readProject();
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
  await writeJSON(path.join(SCREENS_DIR, `${screenId}.json`), toSave);
}

/** screens/{screenId}.json を削除（存在しない場合は無視） */
export async function deleteScreen(screenId: string): Promise<void> {
  try {
    await fs.unlink(path.join(SCREENS_DIR, `${screenId}.json`));
  } catch { /* file not found is OK */ }
  try {
    await fs.unlink(path.join(SCREENS_DIR, `${screenId}.design.json`));
  } catch { /* file not found is OK */ }
  try {
    await fs.unlink(path.join(SCREEN_ITEMS_DIR, `${screenId}.json`));
  } catch { /* file not found is OK */ }
}

/** custom-blocks.json を読み込み */
export async function readCustomBlocks(): Promise<unknown[]> {
  return (await readJSON<unknown[]>(CUSTOM_BLOCKS_FILE)) ?? [];
}

/** custom-blocks.json を書き込み */
export async function writeCustomBlocks(blocks: unknown[]): Promise<void> {
  await ensureDataDir();
  await writeJSON(CUSTOM_BLOCKS_FILE, blocks);
}

/** er-layout.json を読み込み */
export async function readErLayout(): Promise<unknown | null> {
  return readJSON<unknown>(ER_LAYOUT_FILE);
}

/** er-layout.json を書き込み */
export async function writeErLayout(data: unknown): Promise<void> {
  await ensureDataDir();
  await writeJSON(ER_LAYOUT_FILE, data);
}

/** screen-layout.json を読み込み (Phase 3-β、#561) */
export async function readScreenLayout(): Promise<unknown | null> {
  return readJSON<unknown>(SCREEN_LAYOUT_FILE);
}

/** screen-layout.json を書き込み (Phase 3-β、#561) */
export async function writeScreenLayout(data: unknown): Promise<void> {
  await ensureDataDir();
  await writeJSON(SCREEN_LAYOUT_FILE, data);
}

/** tables/{tableId}.json を読み込み */
export async function readTable(tableId: string): Promise<unknown | null> {
  return readJSON<unknown>(path.join(TABLES_DIR, `${tableId}.json`));
}

/** tables/{tableId}.json を書き込み */
export async function writeTable(tableId: string, data: unknown): Promise<void> {
  await ensureDataDir();
  await writeJSON(path.join(TABLES_DIR, `${tableId}.json`), data);
}

/** tables/{tableId}.json を削除（存在しない場合は無視） */
export async function deleteTable(tableId: string): Promise<void> {
  try {
    await fs.unlink(path.join(TABLES_DIR, `${tableId}.json`));
  } catch { /* file not found is OK */ }
}

/** actions/{processFlowId}.json を読み込み */
export async function readProcessFlow(processFlowId: string): Promise<unknown | null> {
  return readJSON<unknown>(path.join(ACTIONS_DIR, `${processFlowId}.json`));
}

/** actions/{processFlowId}.json を書き込み */
export async function writeProcessFlow(processFlowId: string, data: unknown): Promise<void> {
  await ensureDataDir();
  await writeJSON(path.join(ACTIONS_DIR, `${processFlowId}.json`), data);
}

/** actions/{processFlowId}.json を削除（存在しない場合は無視） */
export async function deleteProcessFlow(processFlowId: string): Promise<void> {
  try {
    await fs.unlink(path.join(ACTIONS_DIR, `${processFlowId}.json`));
  } catch { /* file not found is OK */ }
}

/** conventions/catalog.json を読み込み (#317) */
export async function readConventions(): Promise<unknown | null> {
  return readJSON<unknown>(CONVENTIONS_FILE);
}

/** conventions/catalog.json を書き込み (#317) */
export async function writeConventions(data: unknown): Promise<void> {
  await ensureDataDir();
  await writeJSON(CONVENTIONS_FILE, data);
}

/** screen-items/{screenId}.json を読み込み (#318) */
export async function readScreenItems(screenId: string): Promise<unknown | null> {
  const screen = await readScreenEntity(screenId);
  if (!isRecord(screen)) return null;
  return {
    screenId,
    version: "0.1.0",
    updatedAt: typeof screen.updatedAt === "string" ? screen.updatedAt : new Date().toISOString(),
    items: Array.isArray(screen.items) ? screen.items : [],
  };
}

/** screen-items/{screenId}.json を書き込み (#318) */
export async function writeScreenItems(screenId: string, data: unknown): Promise<void> {
  const current = (await readScreenEntity(screenId)) as Record<string, unknown> | null;
  const project = await readProject();
  const items = extractItems(data);
  const next = {
    ...(current ?? buildDefaultScreenEntity(screenId, getScreenEntry(project, screenId), [])),
    items,
    updatedAt: new Date().toISOString(),
  };
  await writeScreenEntity(screenId, next);
  try { await fs.unlink(path.join(SCREEN_ITEMS_DIR, `${screenId}.json`)); } catch { /* ignore */ }
}

/** screen-items/{screenId}.json を削除 (#318) */
export async function deleteScreenItems(screenId: string): Promise<void> {
  const current = (await readScreenEntity(screenId)) as Record<string, unknown> | null;
  if (current) {
    await writeScreenEntity(screenId, { ...current, items: [] });
  }
  try {
    await fs.unlink(path.join(SCREEN_ITEMS_DIR, `${screenId}.json`));
  } catch { /* file not found is OK */ }
}

/** sequences/{sequenceId}.json を読み込み (#374) */
export async function readSequence(sequenceId: string): Promise<unknown | null> {
  return readJSON<unknown>(path.join(SEQUENCES_DIR, `${sequenceId}.json`));
}

/** sequences/{sequenceId}.json を書き込み (#374) */
export async function writeSequence(sequenceId: string, data: unknown): Promise<void> {
  await ensureDataDir();
  await writeJSON(path.join(SEQUENCES_DIR, `${sequenceId}.json`), data);
}

/** sequences/{sequenceId}.json を削除（存在しない場合は無視） (#374) */
export async function deleteSequence(sequenceId: string): Promise<void> {
  try {
    await fs.unlink(path.join(SEQUENCES_DIR, `${sequenceId}.json`));
  } catch { /* file not found is OK */ }
}

/** views/{viewId}.json を読み込み (v3 per-entity #549) */
export async function readView(viewId: string): Promise<unknown | null> {
  return readJSON<unknown>(path.join(VIEWS_DIR, `${viewId}.json`));
}

/** views/{viewId}.json を書き込み (v3 per-entity #549) */
export async function writeView(viewId: string, data: unknown): Promise<void> {
  await ensureDataDir();
  await writeJSON(path.join(VIEWS_DIR, `${viewId}.json`), data);
}

/** views/{viewId}.json を削除（存在しない場合は無視） (v3 per-entity #549) */
export async function deleteView(viewId: string): Promise<void> {
  try {
    await fs.unlink(path.join(VIEWS_DIR, `${viewId}.json`));
  } catch { /* file not found is OK */ }
}

/** actions/ ディレクトリ内の全処理フローを読み込み */
export async function listProcessFlows(): Promise<unknown[]> {
  try {
    await ensureDataDir();
    const files = await fs.readdir(ACTIONS_DIR);
    const results: unknown[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const data = await readJSON<unknown>(path.join(ACTIONS_DIR, file));
      if (data) results.push(data);
    }
    return results;
  } catch {
    return [];
  }
}
