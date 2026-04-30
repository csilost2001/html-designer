/**
 * recentStore 単体テスト (#671)
 *
 * RECENT_FILE は ~/.designer/recent-workspaces.json に固定されているため、
 * テストでは tmp dir を HOME として被せる手間を避け、テスト前後で実ファイルを
 * 退避 / 復元する戦略をとる。
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  upsertWorkspace,
  removeWorkspace,
  findById,
  findByPath,
  listWorkspaces,
  setLastActive,
  readRecent,
  _internals,
} from "./recentStore.js";

const RECENT_FILE = _internals.RECENT_FILE;
const BACKUP = `${RECENT_FILE}.test-backup-${Date.now()}`;

async function backupExistingFile(): Promise<void> {
  try {
    await fs.copyFile(RECENT_FILE, BACKUP);
  } catch {
    /* file does not exist, no backup needed */
  }
}

async function restoreExistingFile(): Promise<void> {
  try {
    await fs.copyFile(BACKUP, RECENT_FILE);
    await fs.unlink(BACKUP);
  } catch {
    try { await fs.unlink(RECENT_FILE); } catch { /* ignore */ }
  }
}

async function clearFile(): Promise<void> {
  try {
    await fs.unlink(RECENT_FILE);
  } catch { /* not found is OK */ }
}

await backupExistingFile();

beforeEach(async () => {
  await clearFile();
});

afterAll(async () => {
  await restoreExistingFile();
});

describe("recentStore", () => {
  it("readRecent: ファイル無しなら empty を返す", async () => {
    const r = await readRecent();
    expect(r.workspaces).toEqual([]);
    expect(r.lastActiveId).toBeNull();
    expect(r.version).toBe(1);
  });

  it("upsertWorkspace: 新規エントリは uuid 採番 + 末尾追加", async () => {
    const e1 = await upsertWorkspace("/tmp/ws1", "Workspace1");
    expect(e1.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(e1.path).toBe(path.resolve("/tmp/ws1"));
    expect(e1.name).toBe("Workspace1");
    const r = await readRecent();
    expect(r.workspaces.length).toBe(1);
  });

  it("upsertWorkspace: 同じ path は id 維持で name と lastOpenedAt 更新", async () => {
    const e1 = await upsertWorkspace("/tmp/ws1", "Old Name");
    await new Promise((r) => setTimeout(r, 5));
    const e2 = await upsertWorkspace("/tmp/ws1", "New Name");
    expect(e2.id).toBe(e1.id);
    expect(e2.name).toBe("New Name");
    expect(new Date(e2.lastOpenedAt).getTime()).toBeGreaterThan(new Date(e1.lastOpenedAt).getTime());
    const r = await readRecent();
    expect(r.workspaces.length).toBe(1);
  });

  it("findByPath: 大文字小文字を含めた絶対パス正規化で一致", async () => {
    await upsertWorkspace("/tmp/ws1", "WS1");
    const found = await findByPath("/tmp/./ws1");
    expect(found).not.toBeNull();
    expect(found?.name).toBe("WS1");
  });

  it("findById: 存在しない id は null", async () => {
    const r = await findById("nope");
    expect(r).toBeNull();
  });

  it("setLastActive: lastActiveId を更新", async () => {
    const e1 = await upsertWorkspace("/tmp/ws1", "WS1");
    await setLastActive(e1.id);
    const r = await readRecent();
    expect(r.lastActiveId).toBe(e1.id);
    await setLastActive(null);
    const r2 = await readRecent();
    expect(r2.lastActiveId).toBeNull();
  });

  it("removeWorkspace: 存在する id は true、lastActiveId が同じなら null に", async () => {
    const e1 = await upsertWorkspace("/tmp/ws1", "WS1");
    await setLastActive(e1.id);
    const removed = await removeWorkspace(e1.id);
    expect(removed).toBe(true);
    const r = await readRecent();
    expect(r.workspaces.length).toBe(0);
    expect(r.lastActiveId).toBeNull();
  });

  it("removeWorkspace: 存在しない id は false", async () => {
    const r = await removeWorkspace("missing");
    expect(r).toBe(false);
  });

  it("listWorkspaces: 全件 + lastActiveId を返す", async () => {
    const e1 = await upsertWorkspace("/tmp/ws1", "WS1");
    await upsertWorkspace("/tmp/ws2", "WS2");
    await setLastActive(e1.id);
    const { workspaces, lastActiveId } = await listWorkspaces();
    expect(workspaces.length).toBe(2);
    expect(lastActiveId).toBe(e1.id);
  });

  it("RECENT_FILE は ~/.designer/recent-workspaces.json", () => {
    expect(RECENT_FILE).toBe(path.join(os.homedir(), ".designer", "recent-workspaces.json"));
  });
});
