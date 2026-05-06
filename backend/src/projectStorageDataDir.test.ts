/**
 * projectStorage R-2 (#851) — dataDir ベース path resolve の unit test
 *
 * 受け入れ基準:
 * 1. 異なる dataDir 値 ("harmony" / "design/spec" / "納品物") の workspace を tmp dir に fixture で作成
 * 2. 各 dataDir で screen / table / processFlow / extension の read/write が正しい path に向くことを検証
 * 3. 旧 project.json への参照が完全に消えたことを grep で検証する test 1 件
 * 4. harmonyFile(root) が root/harmony.json を返すことの確認
 * 5. resolveDataRoot が harmony.json の dataDir に応じた正しい path を返すことの確認
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import {
  harmonyFile,
  resolveDataRoot,
  ensureDataDir,
  readProject,
  writeProject,
  readTable,
  writeTable,
  readProcessFlow,
  writeProcessFlow,
  readScreen,
  writeScreen,
  readScreenEntity,
  writeScreenEntity,
  readConventions,
  writeConventions,
  readSequence,
  writeSequence,
  readView,
  writeView,
  readCustomBlocks,
  writeCustomBlocks,
  readErLayout,
  writeErLayout,
} from "./projectStorage.js";

const TMP_ROOT = path.join(os.tmpdir(), `proj-storage-r2-test-${process.pid}-${Date.now()}`);

/** 最小限の有効な harmony.json を指定の dataDir で作成し、サブディレクトリ群も作成する */
async function makeWorkspace(root: string, dataDirVal: string): Promise<void> {
  await fs.mkdir(root, { recursive: true });
  const harmony = {
    schemaVersion: "v3",
    dataDir: dataDirVal,
    meta: {
      id: `00000000-0000-4000-8000-${Date.now().toString().padStart(12, "0")}`,
      name: `test-${dataDirVal}`,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    extensionsApplied: [],
    entities: {},
  };
  await fs.writeFile(harmonyFile(root), JSON.stringify(harmony, null, 2), "utf-8");
  await ensureDataDir(root, dataDirVal);
}

afterAll(async () => {
  await fs.rm(TMP_ROOT, { recursive: true, force: true }).catch(() => {});
});

// ── 1. harmonyFile のパス確認 ──────────────────────────────────────────────────

describe("harmonyFile", () => {
  it("workspace root 直下の harmony.json パスを返す (dataDir 配下ではない)", () => {
    const root = "/some/workspace";
    const result = harmonyFile(root);
    expect(result).toBe(path.join("/some/workspace", "harmony.json"));
    // project.json への参照を返さないこと
    expect(result).not.toContain("project.json");
  });
});

// ── 2. resolveDataRoot ─────────────────────────────────────────────────────────

describe("resolveDataRoot", () => {
  const rootA = path.join(TMP_ROOT, "resolve-test");

  beforeAll(async () => {
    await makeWorkspace(rootA, "my-data");
  });

  it("harmony.json の dataDir に応じた正しい dataRoot を返す", async () => {
    const result = await resolveDataRoot(rootA);
    expect(result).toBe(path.join(rootA, "my-data"));
  });

  it("harmony.json が存在しない場合は Error を throw する", async () => {
    const missing = path.join(TMP_ROOT, "no-harmony");
    await fs.mkdir(missing, { recursive: true });
    await expect(resolveDataRoot(missing)).rejects.toThrow("harmony.json が見つかりません");
  });

  it("dataDir が空文字の harmony.json では Error を throw する", async () => {
    const rootBad = path.join(TMP_ROOT, "bad-datadir");
    await fs.mkdir(rootBad, { recursive: true });
    await fs.writeFile(
      harmonyFile(rootBad),
      JSON.stringify({ schemaVersion: "v3", dataDir: "", meta: {}, extensionsApplied: [], entities: {} }),
      "utf-8",
    );
    await expect(resolveDataRoot(rootBad)).rejects.toThrow("dataDir フィールドが不正");
  });
});

// ── 3. dataDir = "harmony" (デフォルト) でのデータ読み書き ────────────────────

describe("dataDir = 'harmony' (デフォルト)", () => {
  const root = path.join(TMP_ROOT, "ws-harmony");

  beforeAll(async () => {
    await makeWorkspace(root, "harmony");
  });

  it("harmony.json を readProject で読み込める", async () => {
    const proj = await readProject(root);
    expect(proj).not.toBeNull();
    expect((proj as Record<string, unknown>).dataDir).toBe("harmony");
  });

  it("writeProject → readProject で harmony.json に永続化される", async () => {
    const updated = { schemaVersion: "v3", dataDir: "harmony", meta: { id: "x", name: "updated", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" }, extensionsApplied: [], entities: {} };
    await writeProject(updated, root);
    const result = await readProject(root);
    expect((result as Record<string, unknown>).meta).toMatchObject({ name: "updated" });
    // project.json は存在しないこと
    await expect(fs.access(path.join(root, "project.json"))).rejects.toThrow();
  });

  it("writeTable → readTable で <dataDir>/tables/ に書き込まれる", async () => {
    await writeTable("tbl-001", { id: "tbl-001", name: "orders" }, root);
    const data = await readTable("tbl-001", root);
    expect(data).toMatchObject({ id: "tbl-001", name: "orders" });
    // 物理ファイルの位置を確認
    await fs.access(path.join(root, "harmony", "tables", "tbl-001.json"));
  });

  it("writeProcessFlow → readProcessFlow で <dataDir>/actions/ に書き込まれる", async () => {
    await writeProcessFlow("flow-001", { id: "flow-001", steps: [] }, root);
    const data = await readProcessFlow("flow-001", root);
    expect(data).toMatchObject({ id: "flow-001" });
    // 物理ファイルの位置を確認
    await fs.access(path.join(root, "harmony", "actions", "flow-001.json"));
  });

  it("writeScreen / readScreen で <dataDir>/screens/ に書き込まれる", async () => {
    await writeScreen("scr-001", { assets: [], styles: [], pages: [] }, root);
    // readScreen は .design.json を読む
    const design = await readScreen("scr-001", root);
    expect(design).toMatchObject({ assets: [], pages: [] });
    // entity ファイルの物理位置を確認
    await fs.access(path.join(root, "harmony", "screens", "scr-001.json"));
  });

  it("writeConventions → readConventions で <dataDir>/conventions/ に書き込まれる", async () => {
    await writeConventions({ version: 1, rules: [] }, root);
    const data = await readConventions(root);
    expect(data).toMatchObject({ version: 1 });
    await fs.access(path.join(root, "harmony", "conventions", "catalog.json"));
  });

  it("writeErLayout → readErLayout で <dataDir>/er-layout.json に書き込まれる", async () => {
    await writeErLayout({ nodes: [], edges: [] }, root);
    const data = await readErLayout(root);
    expect(data).toMatchObject({ nodes: [] });
    await fs.access(path.join(root, "harmony", "er-layout.json"));
  });
});

// ── 4. dataDir = "design/spec" (multi-segment) でのデータ読み書き ───────────────

describe("dataDir = 'design/spec' (multi-segment path)", () => {
  const root = path.join(TMP_ROOT, "ws-design-spec");

  beforeAll(async () => {
    await makeWorkspace(root, "design/spec");
  });

  it("writeTable → 物理ファイルが <root>/design/spec/tables/ に作成される", async () => {
    await writeTable("tbl-spec", { id: "tbl-spec", name: "spec-table" }, root);
    await fs.access(path.join(root, "design", "spec", "tables", "tbl-spec.json"));
    // root/tables/ には作成されないこと
    await expect(fs.access(path.join(root, "tables", "tbl-spec.json"))).rejects.toThrow();
  });

  it("writeProcessFlow → 物理ファイルが <root>/design/spec/actions/ に作成される", async () => {
    await writeProcessFlow("flow-spec", { id: "flow-spec", steps: [] }, root);
    await fs.access(path.join(root, "design", "spec", "actions", "flow-spec.json"));
    // root/actions/ には作成されないこと
    await expect(fs.access(path.join(root, "actions", "flow-spec.json"))).rejects.toThrow();
  });

  it("writeView → 物理ファイルが <root>/design/spec/views/ に作成される", async () => {
    await writeView("view-spec", { id: "view-spec" }, root);
    await fs.access(path.join(root, "design", "spec", "views", "view-spec.json"));
  });

  it("writeCustomBlocks → 物理ファイルが <root>/design/spec/custom-blocks.json に作成される", async () => {
    await writeCustomBlocks([{ id: "block-1" }], root);
    await fs.access(path.join(root, "design", "spec", "custom-blocks.json"));
  });
});

// ── 5. dataDir = "納品物" (日本語フォルダ名) でのデータ読み書き ─────────────────

describe("dataDir = '納品物' (日本語フォルダ名)", () => {
  const root = path.join(TMP_ROOT, "ws-japanese");

  beforeAll(async () => {
    await makeWorkspace(root, "納品物");
  });

  it("writeTable → 物理ファイルが <root>/納品物/tables/ に作成される", async () => {
    await writeTable("tbl-jp", { id: "tbl-jp", name: "日本語テーブル" }, root);
    await fs.access(path.join(root, "納品物", "tables", "tbl-jp.json"));
  });

  it("readTable で正しいデータを読み込める", async () => {
    const data = await readTable("tbl-jp", root);
    expect(data).toMatchObject({ id: "tbl-jp", name: "日本語テーブル" });
  });

  it("writeSequence / readSequence で <dataDir>/sequences/ に書き込まれる", async () => {
    await writeSequence("seq-jp", { id: "seq-jp", currentValue: 1 }, root);
    const data = await readSequence("seq-jp", root);
    expect(data).toMatchObject({ id: "seq-jp" });
    await fs.access(path.join(root, "納品物", "sequences", "seq-jp.json"));
  });
});

// ── 6. dataDir が異なる 2 workspace は互いに干渉しない ─────────────────────────

describe("複数 workspace の dataDir 隔離", () => {
  const rootX = path.join(TMP_ROOT, "ws-iso-x");
  const rootY = path.join(TMP_ROOT, "ws-iso-y");

  beforeAll(async () => {
    await makeWorkspace(rootX, "data-x");
    await makeWorkspace(rootY, "data-y");
  });

  it("workspace X と Y で同じ tableId に書いても互いに影響しない", async () => {
    await writeTable("common-tbl", { id: "common-tbl", name: "from-X" }, rootX);
    await writeTable("common-tbl", { id: "common-tbl", name: "from-Y" }, rootY);

    const fromX = await readTable("common-tbl", rootX);
    const fromY = await readTable("common-tbl", rootY);
    expect((fromX as Record<string, unknown>).name).toBe("from-X");
    expect((fromY as Record<string, unknown>).name).toBe("from-Y");
  });

  it("workspace X のファイルは workspace Y の dataDir 配下には存在しない", async () => {
    await writeTable("only-in-x", { id: "only-in-x" }, rootX);
    // rootY/data-y/tables/only-in-x.json は存在しないはず
    await expect(fs.access(path.join(rootY, "data-y", "tables", "only-in-x.json"))).rejects.toThrow();
  });
});

// ── 7. 旧 project.json 参照が projectStorage.ts から完全に消えたことを確認 ────────

describe("旧 project.json 参照の撤廃確認", () => {
  it("projectStorage.ts に文字列 'project.json' が含まれないこと", async () => {
    const filePath = path.resolve(import.meta.dirname, "projectStorage.ts");
    const content = await fs.readFile(filePath, "utf-8");
    // "project.json" というリテラル文字列が含まれていないことを確認
    expect(content).not.toContain('"project.json"');
    expect(content).not.toContain("'project.json'");
  });

  it("projectStorage.ts に 'projectFile' という export が含まれないこと", async () => {
    const filePath = path.resolve(import.meta.dirname, "projectStorage.ts");
    const content = await fs.readFile(filePath, "utf-8");
    // export function/const 'projectFile' が無いことを確認
    expect(content).not.toMatch(/export\s+(const|function)\s+projectFile\b/);
  });

  it("projectStorage.ts に 'harmonyFile' export が存在すること", async () => {
    const filePath = path.resolve(import.meta.dirname, "projectStorage.ts");
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toContain("export const harmonyFile");
  });

  it("projectStorage.ts に 'resolveDataRoot' export が存在すること", async () => {
    const filePath = path.resolve(import.meta.dirname, "projectStorage.ts");
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toContain("export async function resolveDataRoot");
  });
});

// ── 8. ensureDataDir のディレクトリ作成確認 ─────────────────────────────────────

describe("ensureDataDir (root, dataDirVal)", () => {
  it("指定した dataDir 配下にサブディレクトリ群が作成される", async () => {
    const root = path.join(TMP_ROOT, "ws-ensure");
    await fs.mkdir(root, { recursive: true });
    await ensureDataDir(root, "my-dir");

    const expectedDirs = ["screens", "tables", "actions", "conventions", "sequences", "views", "view-definitions", "extensions"];
    for (const sub of expectedDirs) {
      const stat = await fs.stat(path.join(root, "my-dir", sub));
      expect(stat.isDirectory()).toBe(true);
    }
  });

  it("root 直下には余分なディレクトリが作成されない", async () => {
    const root = path.join(TMP_ROOT, "ws-ensure-check");
    await fs.mkdir(root, { recursive: true });
    await ensureDataDir(root, "subdir");

    // root 直下に screens/ などが作られないこと
    await expect(fs.access(path.join(root, "screens"))).rejects.toThrow();
    await expect(fs.access(path.join(root, "tables"))).rejects.toThrow();
  });
});
