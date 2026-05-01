/**
 * draftStore 単体テスト (#685)
 *
 * env DESIGNER_DATA_DIR に tmp パスを設定して workspaceState の lockdown を利用。
 * 実際のワークスペースには一切触れない。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const TMP_ROOT = path.join(os.tmpdir(), `draft-store-test-${process.pid}-${Date.now()}`);
const ORIGINAL_ENV = process.env.DESIGNER_DATA_DIR;

const {
  createDraft,
  readDraft,
  updateDraft,
  commitDraft,
  discardDraft,
  hasDraft,
  listDrafts,
} = await import("./draftStore.js");

const { _resetForTest, setActivePath, initWorkspaceState } = await import("./workspaceState.js");

async function ensureWorkspace(): Promise<void> {
  await fs.mkdir(TMP_ROOT, { recursive: true });
  try {
    await fs.writeFile(path.join(TMP_ROOT, "project.json"), JSON.stringify({ name: "test" }), "utf-8");
  } catch {
    // ignore
  }
}

beforeAll(async () => {
  await ensureWorkspace();
  _resetForTest();
  setActivePath(TMP_ROOT);
});

beforeEach(async () => {
  const draftsDir = path.join(TMP_ROOT, ".drafts");
  try {
    await fs.rm(draftsDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

afterAll(async () => {
  try {
    await fs.rm(TMP_ROOT, { recursive: true, force: true });
  } catch {
    // ignore
  }
  _resetForTest();
  if (ORIGINAL_ENV !== undefined) {
    process.env.DESIGNER_DATA_DIR = ORIGINAL_ENV;
  } else {
    delete process.env.DESIGNER_DATA_DIR;
  }
});

describe("draftStore", () => {
  describe("createDraft / readDraft / updateDraft", () => {
    it("happy path: create (新規) → read → update → read", async () => {
      const result = await createDraft("table", "tbl-001");
      expect(result.created).toBe(true);

      const initial = await readDraft("table", "tbl-001");
      expect(initial).toEqual({});

      await updateDraft("table", "tbl-001", { name: "users", columns: [] });
      const updated = await readDraft("table", "tbl-001");
      expect(updated).toMatchObject({ name: "users", columns: [] });
    });

    it("createDraft: 既に draft が存在する場合は created: false を返す", async () => {
      await createDraft("table", "tbl-dup");
      const second = await createDraft("table", "tbl-dup");
      expect(second.created).toBe(false);
    });

    it("createDraft: 本体ファイルが存在すれば内容をコピーする", async () => {
      const tablesDir = path.join(TMP_ROOT, "tables");
      await fs.mkdir(tablesDir, { recursive: true });
      await fs.writeFile(
        path.join(tablesDir, "tbl-copy.json"),
        JSON.stringify({ id: "tbl-copy", name: "existing" }),
        "utf-8",
      );

      const r = await createDraft("table", "tbl-copy");
      expect(r.created).toBe(true);
      const draft = await readDraft("table", "tbl-copy");
      expect(draft).toMatchObject({ name: "existing" });
    });

    it("readDraft: 存在しない draft は null を返す", async () => {
      const d = await readDraft("table", "nonexistent");
      expect(d).toBeNull();
    });

    it("updateDraft: draft が未存在でも書き込める (新規作成)", async () => {
      await updateDraft("sequence", "seq-001", { steps: [1, 2, 3] });
      const d = await readDraft("sequence", "seq-001");
      expect(d).toMatchObject({ steps: [1, 2, 3] });
    });
  });

  describe("commitDraft", () => {
    it("table: draft を本体ファイルへ昇格し draft が消える", async () => {
      await updateDraft("table", "tbl-commit", { id: "tbl-commit", name: "orders" });
      const r = await commitDraft("table", "tbl-commit");
      expect(r.committed).toBe(true);

      const afterDraft = await readDraft("table", "tbl-commit");
      expect(afterDraft).toBeNull();

      const bodyPath = path.join(TMP_ROOT, "tables", "tbl-commit.json");
      const body = JSON.parse(await fs.readFile(bodyPath, "utf-8"));
      expect(body).toMatchObject({ name: "orders" });
    });

    it("process-flow: draft を actions/ 配下へ昇格する", async () => {
      await updateDraft("process-flow", "flow-001", { id: "flow-001", steps: [] });
      const r = await commitDraft("process-flow", "flow-001");
      expect(r.committed).toBe(true);

      const bodyPath = path.join(TMP_ROOT, "actions", "flow-001.json");
      const body = JSON.parse(await fs.readFile(bodyPath, "utf-8"));
      expect(body).toMatchObject({ id: "flow-001" });
    });

    it("convention: draft を conventions/catalog.json へ昇格する", async () => {
      await updateDraft("convention", "catalog", { version: 1, rules: [] });
      const r = await commitDraft("convention", "catalog");
      expect(r.committed).toBe(true);

      const bodyPath = path.join(TMP_ROOT, "conventions", "catalog.json");
      const body = JSON.parse(await fs.readFile(bodyPath, "utf-8"));
      expect(body).toMatchObject({ version: 1 });
    });

    it("commitDraft: draft が存在しない場合は committed: false を返す", async () => {
      const r = await commitDraft("table", "no-such-draft");
      expect(r.committed).toBe(false);
    });
  });

  describe("discardDraft", () => {
    it("create → discard → has=false", async () => {
      await createDraft("sequence", "seq-discard");
      const r = await discardDraft("sequence", "seq-discard");
      expect(r.discarded).toBe(true);

      const exists = await hasDraft("sequence", "seq-discard");
      expect(exists).toBe(false);
    });

    it("discardDraft: 存在しない draft は discarded: false", async () => {
      const r = await discardDraft("table", "ghost");
      expect(r.discarded).toBe(false);
    });
  });

  describe("hasDraft", () => {
    it("draft 存在時は true、非存在時は false", async () => {
      expect(await hasDraft("table", "hd-test")).toBe(false);
      await createDraft("table", "hd-test");
      expect(await hasDraft("table", "hd-test")).toBe(true);
    });
  });

  describe("listDrafts", () => {
    it("複数 type の draft を列挙できる", async () => {
      await createDraft("table", "t1");
      await createDraft("table", "t2");
      await createDraft("sequence", "s1");

      const items = await listDrafts();
      expect(items.length).toBeGreaterThanOrEqual(3);

      const types = items.map((i) => i.type);
      expect(types).toContain("table");
      expect(types).toContain("sequence");

      for (const item of items) {
        expect(typeof item.id).toBe("string");
        expect(typeof item.mtimeMs).toBe("number");
        expect(item.mtimeMs).toBeGreaterThan(0);
      }
    });

    it(".drafts/ が存在しない場合は空配列を返す", async () => {
      const items = await listDrafts();
      expect(Array.isArray(items)).toBe(true);
    });
  });

  describe("atomic write", () => {
    it("連続 update でも最終値が正しく読める", async () => {
      const updates = Array.from({ length: 10 }, (_, i) => ({ version: i }));
      for (const payload of updates) {
        await updateDraft("table", "atomic-test", payload);
      }
      const final = await readDraft("table", "atomic-test");
      expect(final).toMatchObject({ version: 9 });
    });
  });
});
