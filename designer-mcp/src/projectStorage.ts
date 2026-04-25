/**
 * projectStorage.ts
 * ファイルベースのプロジェクトデータ永続化ユーティリティ
 *
 * データディレクトリ: $DESIGNER_DATA_DIR または ../data（ワークスペースルート）
 */
import fs from "fs/promises";
import path from "path";

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
export const EXTENSIONS_DIR = path.join(DATA_DIR, "extensions");
export const VIEWS_FILE = path.join(DATA_DIR, "views.json");
export const PROJECT_FILE = path.join(DATA_DIR, "project.json");
export const CUSTOM_BLOCKS_FILE = path.join(DATA_DIR, "custom-blocks.json");
export const ER_LAYOUT_FILE = path.join(DATA_DIR, "er-layout.json");
export const CONVENTIONS_FILE = path.join(CONVENTIONS_DIR, "catalog.json");

const EXTENSION_FILE_NAMES = {
  steps: "steps.json",
  fieldTypes: "field-types.json",
  triggers: "triggers.json",
  dbOperations: "db-operations.json",
  responseTypes: "response-types.json",
} as const;

export type ExtensionFileKind = keyof typeof EXTENSION_FILE_NAMES;

/** data/ ディレクトリ群を作成（既存なら無視） */
export async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(SCREENS_DIR, { recursive: true });
  await fs.mkdir(TABLES_DIR, { recursive: true });
  await fs.mkdir(ACTIONS_DIR, { recursive: true });
  await fs.mkdir(CONVENTIONS_DIR, { recursive: true });
  await fs.mkdir(SCREEN_ITEMS_DIR, { recursive: true });
  await fs.mkdir(SEQUENCES_DIR, { recursive: true });
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
    case "screen": return id ? path.join(SCREENS_DIR, `${id}.json`) : null;
    case "table": return id ? path.join(TABLES_DIR, `${id}.json`) : null;
    case "processFlow": return id ? path.join(ACTIONS_DIR, `${id}.json`) : null;
    case "screenItems": return id ? path.join(SCREEN_ITEMS_DIR, `${id}.json`) : null;
    case "sequence": return id ? path.join(SEQUENCES_DIR, `${id}.json`) : null;
    case "view": return VIEWS_FILE;
    case "extensions": return EXTENSIONS_DIR;
    default: return null;
  }
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

/** data/extensions/{type}.json を単体書き込み (#447 で利用予定) */
export async function writeExtensionsFile(type: ExtensionFileKind, content: unknown): Promise<void> {
  await ensureDataDir();
  await writeJSON(path.join(EXTENSIONS_DIR, EXTENSION_FILE_NAMES[type]), content);
}

/** screens/{screenId}.json を読み込み */
export async function readScreen(screenId: string): Promise<unknown | null> {
  return readJSON<unknown>(path.join(SCREENS_DIR, `${screenId}.json`));
}

/** screens/{screenId}.json を書き込み */
export async function writeScreen(screenId: string, data: unknown): Promise<void> {
  await ensureDataDir();
  await writeJSON(path.join(SCREENS_DIR, `${screenId}.json`), data);
}

/** screens/{screenId}.json を削除（存在しない場合は無視） */
export async function deleteScreen(screenId: string): Promise<void> {
  try {
    await fs.unlink(path.join(SCREENS_DIR, `${screenId}.json`));
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
  return readJSON<unknown>(path.join(SCREEN_ITEMS_DIR, `${screenId}.json`));
}

/** screen-items/{screenId}.json を書き込み (#318) */
export async function writeScreenItems(screenId: string, data: unknown): Promise<void> {
  await ensureDataDir();
  await writeJSON(path.join(SCREEN_ITEMS_DIR, `${screenId}.json`), data);
}

/** screen-items/{screenId}.json を削除 (#318) */
export async function deleteScreenItems(screenId: string): Promise<void> {
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

/** views.json を読み込み (#376) */
export async function readViewsFile(): Promise<unknown | null> {
  return readJSON<unknown>(VIEWS_FILE);
}

/** views.json を書き込み (#376) */
export async function writeViewsFile(data: unknown): Promise<void> {
  await ensureDataDir();
  await writeJSON(VIEWS_FILE, data);
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
