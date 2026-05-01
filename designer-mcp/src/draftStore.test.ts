/**
 * draftStore 単体テスト (#685)
 *
 * per-session API (#700 R-2): connect(clientId, path) を使って workspace を設定。
 * 実際のワークスペースには一切触れない。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const TMP_ROOT = path.join(os.tmpdir(), `draft-store-test-${process.pid}-${Date.now()}`);
const TEST_CLIENT_ID = "test-client";

const {
  createDraft,
  readDraft,
  updateDraft,
  commitDraft,
  discardDraft,
  hasDraft,
  listDrafts,
} = await import("./draftStore.js");

const { _resetForTest, connect, initWorkspaceState } = await import("./workspaceState.js");

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
  initWorkspaceState();
  connect(TEST_CLIENT_ID, TMP_ROOT);
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
});

describe("draftStore", () => {
  describe("createDraft / readDraft / updateDraft", () => {
    it("happy path: create (新規) → read → update → read", async () => {
      const result = await createDraft(TEST_CLIENT_ID, "table", "tbl-001");
      expect(result.created).toBe(true);

      const initial = await readDraft(TEST_CLIENT_ID, "table", "tbl-001");
      expect(initial).toEqual({});

      await updateDraft(TEST_CLIENT_ID, "table", "tbl-001", { name: "users", columns: [] });
      const updated = await readDraft(TEST_CLIENT_ID, "table", "tbl-001");
      expect(updated).toMatchObject({ name: "users", columns: [] });
    });

    it("createDraft: 既に draft が存在する場合は created: false を返す", async () => {
      await createDraft(TEST_CLIENT_ID, "table", "tbl-dup");
      const second = await createDraft(TEST_CLIENT_ID, "table", "tbl-dup");
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

      const r = await createDraft(TEST_CLIENT_ID, "table", "tbl-copy");
      expect(r.created).toBe(true);
      const draft = await readDraft(TEST_CLIENT_ID, "table", "tbl-copy");
      expect(draft).toMatchObject({ name: "existing" });
    });

    it("readDraft: 存在しない draft は null を返す", async () => {
      const d = await readDraft(TEST_CLIENT_ID, "table", "nonexistent");
      expect(d).toBeNull();
    });

    it("updateDraft: draft が未存在でも書き込める (新規作成)", async () => {
      await updateDraft(TEST_CLIENT_ID, "sequence", "seq-001", { steps: [1, 2, 3] });
      const d = await readDraft(TEST_CLIENT_ID, "sequence", "seq-001");
      expect(d).toMatchObject({ steps: [1, 2, 3] });
    });
  });

  describe("commitDraft", () => {
    it("table: draft を本体ファイルへ昇格し draft が消える", async () => {
      await updateDraft(TEST_CLIENT_ID, "table", "tbl-commit", { id: "tbl-commit", name: "orders" });
      const r = await commitDraft(TEST_CLIENT_ID, "table", "tbl-commit");
      expect(r.committed).toBe(true);

      const afterDraft = await readDraft(TEST_CLIENT_ID, "table", "tbl-commit");
      expect(afterDraft).toBeNull();

      const bodyPath = path.join(TMP_ROOT, "tables", "tbl-commit.json");
      const body = JSON.parse(await fs.readFile(bodyPath, "utf-8"));
      expect(body).toMatchObject({ name: "orders" });
    });

    it("process-flow: draft を actions/ 配下へ昇格する", async () => {
      await updateDraft(TEST_CLIENT_ID, "process-flow", "flow-001", { id: "flow-001", steps: [] });
      const r = await commitDraft(TEST_CLIENT_ID, "process-flow", "flow-001");
      expect(r.committed).toBe(true);

      const bodyPath = path.join(TMP_ROOT, "actions", "flow-001.json");
      const body = JSON.parse(await fs.readFile(bodyPath, "utf-8"));
      expect(body).toMatchObject({ id: "flow-001" });
    });

    it("convention: draft を conventions/catalog.json へ昇格する", async () => {
      await updateDraft(TEST_CLIENT_ID, "convention", "catalog", { version: 1, rules: [] });
      const r = await commitDraft(TEST_CLIENT_ID, "convention", "catalog");
      expect(r.committed).toBe(true);

      const bodyPath = path.join(TMP_ROOT, "conventions", "catalog.json");
      const body = JSON.parse(await fs.readFile(bodyPath, "utf-8"));
      expect(body).toMatchObject({ version: 1 });
    });

    it("commitDraft: draft が存在しない場合は committed: false を返す", async () => {
      const r = await commitDraft(TEST_CLIENT_ID, "table", "no-such-draft");
      expect(r.committed).toBe(false);
    });

    it("screen-item: commitDraft は writeScreenItems を呼び出して committed: true を返す", async () => {
      await updateDraft(TEST_CLIENT_ID, "screen-item", "si-001", { screenId: "si-001", items: [] });
      const r = await commitDraft(TEST_CLIENT_ID, "screen-item", "si-001");
      expect(r.committed).toBe(true);
      // draft が削除されていること
      const afterDraft = await readDraft(TEST_CLIENT_ID, "screen-item", "si-001");
      expect(afterDraft).toBeNull();
    });

    it("screen-item: payload.screenId が指す screen に書き込まれる", async () => {
      const screenId = "scr-abc123";
      // 書き込み先 screen が存在するよう事前にディレクトリを作成
      const screensDir = path.join(TMP_ROOT, "screens");
      await fs.mkdir(screensDir, { recursive: true });
      await fs.writeFile(
        path.join(screensDir, `${screenId}.design.json`),
        JSON.stringify({ id: screenId, name: "テスト画面", items: [] }),
        "utf-8",
      );

      // singleton id で draft を作成・commit
      await updateDraft(TEST_CLIENT_ID, "screen-item", "singleton", {
        screenId,
        items: [{ id: "item-1", label: "ラベル" }],
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
      const r = await commitDraft(TEST_CLIENT_ID, "screen-item", "singleton");
      expect(r.committed).toBe(true);

      // draft が削除されていること
      const afterDraft = await readDraft(TEST_CLIENT_ID, "screen-item", "singleton");
      expect(afterDraft).toBeNull();

      // 正しい screenId のファイルに書き込まれていること ("singleton" ではない)
      // writeScreenItems → writeScreenEntity は screens/{screenId}.json に items を保存する
      const bodyPath = path.join(TMP_ROOT, "screens", `${screenId}.json`);
      const body = JSON.parse(await fs.readFile(bodyPath, "utf-8"));
      expect(body).toMatchObject({ id: screenId, items: [{ id: "item-1" }] });
    });

    it("screen-item: payload.screenId が空文字のときエラーを投げる", async () => {
      await updateDraft(TEST_CLIENT_ID, "screen-item", "singleton", {
        screenId: "",
        items: [],
      });
      await expect(commitDraft(TEST_CLIENT_ID, "screen-item", "singleton")).rejects.toThrow(
        "screen-item draft payload に screenId がありません",
      );
    });

    it("screen-item: payload.screenId が存在しないときエラーを投げる", async () => {
      await updateDraft(TEST_CLIENT_ID, "screen-item", "singleton", { items: [] });
      await expect(commitDraft(TEST_CLIENT_ID, "screen-item", "singleton")).rejects.toThrow(
        "screen-item draft payload に screenId がありません",
      );
    });
  });

  describe("discardDraft", () => {
    it("create → discard → has=false", async () => {
      await createDraft(TEST_CLIENT_ID, "sequence", "seq-discard");
      const r = await discardDraft(TEST_CLIENT_ID, "sequence", "seq-discard");
      expect(r.discarded).toBe(true);

      const exists = await hasDraft(TEST_CLIENT_ID, "sequence", "seq-discard");
      expect(exists).toBe(false);
    });

    it("discardDraft: 存在しない draft は discarded: false", async () => {
      const r = await discardDraft(TEST_CLIENT_ID, "table", "ghost");
      expect(r.discarded).toBe(false);
    });
  });

  describe("hasDraft", () => {
    it("draft 存在時は true、非存在時は false", async () => {
      expect(await hasDraft(TEST_CLIENT_ID, "table", "hd-test")).toBe(false);
      await createDraft(TEST_CLIENT_ID, "table", "hd-test");
      expect(await hasDraft(TEST_CLIENT_ID, "table", "hd-test")).toBe(true);
    });
  });

  describe("listDrafts", () => {
    it("複数 type の draft を列挙できる", async () => {
      await createDraft(TEST_CLIENT_ID, "table", "t1");
      await createDraft(TEST_CLIENT_ID, "table", "t2");
      await createDraft(TEST_CLIENT_ID, "sequence", "s1");

      const items = await listDrafts(TEST_CLIENT_ID);
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
      const items = await listDrafts(TEST_CLIENT_ID);
      expect(Array.isArray(items)).toBe(true);
    });
  });

  describe("atomic write", () => {
    it("連続 update でも最終値が正しく読める", async () => {
      const updates = Array.from({ length: 10 }, (_, i) => ({ version: i }));
      for (const payload of updates) {
        await updateDraft(TEST_CLIENT_ID, "table", "atomic-test", payload);
      }
      const final = await readDraft(TEST_CLIENT_ID, "table", "atomic-test");
      expect(final).toMatchObject({ version: 9 });
    });
  });
});
