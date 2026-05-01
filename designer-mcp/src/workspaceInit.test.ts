/**
 * workspaceInit 単体テスト (#672, #677-C)
 */
import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  inspectWorkspacePath,
  initializeWorkspace,
  _internals,
} from "./workspaceInit.js";

const TMP_ROOT = path.join(os.tmpdir(), `workspace-init-test-${process.pid}-${Date.now()}`);

beforeEach(async () => {
  await fs.mkdir(TMP_ROOT, { recursive: true });
});

afterEach(async () => {
  try {
    await fs.rm(TMP_ROOT, { recursive: true, force: true });
  } catch { /* ignore */ }
});

afterAll(async () => {
  try {
    await fs.rm(TMP_ROOT, { recursive: true, force: true });
  } catch { /* ignore */ }
});

describe("inspectWorkspacePath", () => {
  it("存在しない path → notFound", async () => {
    const r = await inspectWorkspacePath(path.join(TMP_ROOT, "missing"));
    expect(r.status).toBe("notFound");
  });

  it("空フォルダ → needsInit", async () => {
    const dir = path.join(TMP_ROOT, "empty");
    await fs.mkdir(dir);
    const r = await inspectWorkspacePath(dir);
    expect(r.status).toBe("needsInit");
  });

  it("project.json あり → ready + name 抽出", async () => {
    const dir = path.join(TMP_ROOT, "ready");
    await fs.mkdir(dir);
    await fs.writeFile(
      path.join(dir, "project.json"),
      JSON.stringify({ meta: { name: "テストプロジェクト" } }),
    );
    const r = await inspectWorkspacePath(dir);
    expect(r.status).toBe("ready");
    if (r.status === "ready") {
      expect(r.name).toBe("テストプロジェクト");
    }
  });

  it("project.json があるが meta.name 無し → name は basename", async () => {
    const dir = path.join(TMP_ROOT, "no-name");
    await fs.mkdir(dir);
    await fs.writeFile(path.join(dir, "project.json"), JSON.stringify({ meta: {} }));
    const r = await inspectWorkspacePath(dir);
    expect(r.status).toBe("ready");
    if (r.status === "ready") {
      expect(r.name).toBe("no-name");
    }
  });

  it("path がファイルでフォルダではない → notFound", async () => {
    const file = path.join(TMP_ROOT, "file.txt");
    await fs.writeFile(file, "x");
    const r = await inspectWorkspacePath(file);
    expect(r.status).toBe("notFound");
  });
});

describe("initializeWorkspace", () => {
  it("空フォルダに project.json + サブディレクトリ群を生成", async () => {
    const dir = path.join(TMP_ROOT, "init-target");
    const r = await initializeWorkspace(dir);
    expect(r.path).toBe(path.resolve(dir));
    expect(r.name).toBe("init-target");
    expect(r.projectId).toMatch(/^[0-9a-f-]{36}$/);

    // project.json 存在
    const projPath = path.join(dir, "project.json");
    const proj = JSON.parse(await fs.readFile(projPath, "utf-8"));
    expect(proj.schemaVersion).toBe("v3");
    expect(proj.meta.id).toBe(r.projectId);
    expect(proj.meta.name).toBe("init-target");
    expect(proj.meta.createdAt).toMatch(/Z$/);

    // サブディレクトリ
    for (const sub of ["screens", "tables", "actions", "conventions", "sequences", "views", "view-definitions", "extensions"]) {
      const stat = await fs.stat(path.join(dir, sub));
      expect(stat.isDirectory()).toBe(true);
    }
  });

  it("存在しない path も mkdir -p で作る", async () => {
    const dir = path.join(TMP_ROOT, "deep", "nested", "ws");
    const r = await initializeWorkspace(dir);
    expect(r.name).toBe("ws");
    const stat = await fs.stat(path.join(dir, "project.json"));
    expect(stat.isFile()).toBe(true);
  });

  it("既に project.json があれば idempotent (上書きしない)", async () => {
    const dir = path.join(TMP_ROOT, "existing");
    await fs.mkdir(dir);
    const original = {
      schemaVersion: "v3",
      meta: { id: "11111111-1111-4111-8111-111111111111", name: "Existing", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      entities: {},
    };
    await fs.writeFile(path.join(dir, "project.json"), JSON.stringify(original, null, 2));
    const r = await initializeWorkspace(dir);
    expect(r.projectId).toBe("11111111-1111-4111-8111-111111111111");
    const re = JSON.parse(await fs.readFile(path.join(dir, "project.json"), "utf-8"));
    expect(re.meta.name).toBe("Existing");
  });

  it("生成された project.json は schemas/v3/project.v3.schema.json で検証 pass", async () => {
    const dir = path.join(TMP_ROOT, "validated");
    await initializeWorkspace(dir);
    // 検証は initializeWorkspace 内で実行済 (失敗時は throw)。ここでは追加のスキーマ違反例を
    // 再度通すことはしない。pass = この時点で例外無く戻ってきたこと。
    const proj = JSON.parse(await fs.readFile(path.join(dir, "project.json"), "utf-8"));
    expect(proj.meta.maturity).toBe("draft");
    expect(proj.meta.mode).toBe("upstream");
    expect(Array.isArray(proj.entities.screens)).toBe(true);
  });
});

describe("resolveLegacyDataDir (C: 動的解決 + env override)", () => {
  const origEnv = process.env.DESIGNER_LEGACY_DATA_DIR;

  afterEach(() => {
    // 環境変数を元に戻す
    if (origEnv === undefined) {
      delete process.env.DESIGNER_LEGACY_DATA_DIR;
    } else {
      process.env.DESIGNER_LEGACY_DATA_DIR = origEnv;
    }
  });

  it("env 未設定の場合はリポジトリ root の data/ (絶対パス、末尾が data) が返る", () => {
    delete process.env.DESIGNER_LEGACY_DATA_DIR;
    const result = _internals.resolveLegacyDataDir();
    // import.meta.dirname/../../data に相当する絶対パスが返る。
    // テスト自体の dirname とは異なるが、絶対パスで末尾が "data" であることを検証する。
    expect(path.isAbsolute(result)).toBe(true);
    expect(path.basename(result)).toBe("data");
    // process.cwd()/data ではないことを確認 (regression 防止)
    expect(result).not.toBe(path.resolve(process.cwd(), "data"));
  });

  it("env DESIGNER_LEGACY_DATA_DIR 設定時はその値 (resolve 済み) が返る", () => {
    const custom = path.join(os.tmpdir(), "my-legacy-data");
    process.env.DESIGNER_LEGACY_DATA_DIR = custom;
    const result = _internals.resolveLegacyDataDir();
    expect(result).toBe(path.resolve(custom));
  });
});
