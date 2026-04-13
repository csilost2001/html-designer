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
export const PROJECT_FILE = path.join(DATA_DIR, "project.json");
export const CUSTOM_BLOCKS_FILE = path.join(DATA_DIR, "custom-blocks.json");

/** data/ と data/screens/ と data/tables/ を作成（既存なら無視） */
export async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(SCREENS_DIR, { recursive: true });
  await fs.mkdir(TABLES_DIR, { recursive: true });
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
