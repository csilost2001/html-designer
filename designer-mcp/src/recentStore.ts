/**
 * recentStore.ts (#671)
 *
 * 最近使ったワークスペースを `~/.designer/recent-workspaces.json` に永続化。
 *
 * 構造:
 * {
 *   "$schema": "designer-recent-workspaces-v1",
 *   "version": 1,
 *   "workspaces": [
 *     { "id": "<uuid>", "path": "<absolute>", "name": "<display>", "lastOpenedAt": "<iso>" }
 *   ],
 *   "lastActiveId": "<uuid|null>"
 * }
 *
 * lockdown モード (env DESIGNER_DATA_DIR 指定) 時はこのファイルを読み書きしない。
 * 呼び出し側 (workspace.* MCP tool ハンドラ) が isLockdown() を確認した上で本モジュールを使う。
 */
import fs from "fs/promises";
import path from "path";
import os from "os";
import { randomUUID } from "node:crypto";

export type WorkspaceEntry = {
  id: string;
  path: string;
  name: string;
  lastOpenedAt: string;
};

type RecentFile = {
  $schema: string;
  version: 1;
  workspaces: WorkspaceEntry[];
  lastActiveId: string | null;
};

const SCHEMA_TAG = "designer-recent-workspaces-v1";
const RECENT_DIR = path.join(os.homedir(), ".designer");
const RECENT_FILE = path.join(RECENT_DIR, "recent-workspaces.json");

function emptyFile(): RecentFile {
  return { $schema: SCHEMA_TAG, version: 1, workspaces: [], lastActiveId: null };
}

function isRecentFile(value: unknown): value is RecentFile {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.version !== 1) return false;
  if (!Array.isArray(v.workspaces)) return false;
  if (v.lastActiveId !== null && typeof v.lastActiveId !== "string") return false;
  return v.workspaces.every((w) => {
    if (typeof w !== "object" || w === null) return false;
    const e = w as Record<string, unknown>;
    return typeof e.id === "string"
      && typeof e.path === "string"
      && typeof e.name === "string"
      && typeof e.lastOpenedAt === "string";
  });
}

export async function readRecent(): Promise<RecentFile> {
  try {
    const raw = await fs.readFile(RECENT_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (isRecentFile(parsed)) return parsed;
  } catch {
    /* not found or malformed → return empty */
  }
  return emptyFile();
}

async function writeRecent(file: RecentFile): Promise<void> {
  await fs.mkdir(RECENT_DIR, { recursive: true });
  await fs.writeFile(RECENT_FILE, JSON.stringify(file, null, 2), "utf-8");
}

function normalizePath(p: string): string {
  return path.resolve(p);
}

/**
 * 指定 path のエントリを upsert (既存なら lastOpenedAt と name を更新、無ければ追加)。
 * 戻り値は upsert 後のエントリ。lastActiveId は呼び出し側で setLastActive を別途呼ぶ。
 */
export async function upsertWorkspace(
  workspacePath: string,
  name: string,
): Promise<WorkspaceEntry> {
  const file = await readRecent();
  const norm = normalizePath(workspacePath);
  const now = new Date().toISOString();
  const existing = file.workspaces.find((w) => normalizePath(w.path) === norm);
  let entry: WorkspaceEntry;
  if (existing) {
    existing.path = norm;
    existing.name = name;
    existing.lastOpenedAt = now;
    entry = existing;
  } else {
    entry = { id: randomUUID(), path: norm, name, lastOpenedAt: now };
    file.workspaces.push(entry);
  }
  await writeRecent(file);
  return entry;
}

export async function setLastActive(id: string | null): Promise<void> {
  const file = await readRecent();
  file.lastActiveId = id;
  await writeRecent(file);
}

export async function removeWorkspace(id: string): Promise<boolean> {
  const file = await readRecent();
  const before = file.workspaces.length;
  file.workspaces = file.workspaces.filter((w) => w.id !== id);
  if (file.lastActiveId === id) file.lastActiveId = null;
  if (file.workspaces.length === before) return false;
  await writeRecent(file);
  return true;
}

export async function findById(id: string): Promise<WorkspaceEntry | null> {
  const file = await readRecent();
  return file.workspaces.find((w) => w.id === id) ?? null;
}

export async function findByPath(workspacePath: string): Promise<WorkspaceEntry | null> {
  const norm = normalizePath(workspacePath);
  const file = await readRecent();
  return file.workspaces.find((w) => normalizePath(w.path) === norm) ?? null;
}

export async function listWorkspaces(): Promise<{
  workspaces: WorkspaceEntry[];
  lastActiveId: string | null;
}> {
  const file = await readRecent();
  return { workspaces: file.workspaces, lastActiveId: file.lastActiveId };
}

/** test-only */
export const _internals = {
  RECENT_FILE,
  RECENT_DIR,
  emptyFile,
  isRecentFile,
};
