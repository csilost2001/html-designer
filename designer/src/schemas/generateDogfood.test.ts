/**
 * generate-dogfood スクリプト基盤のテスト (#501 / #504)
 *
 * generate 関数の動作を直接テストする:
 * 1. dry-run 実行 → ファイル非生成・エラーなし
 * 2. 実際の生成 → 出力ディレクトリとファイルが作成されること
 * 3. 生成された ProcessFlow JSON が最小スキーマ要件を満たすこと
 * 4. (AI モード) dry-run でログ確認
 * 5. (AI モード) 実行で _briefing.md が生成される
 * 6. (AI モード) briefing 内に必須セクションが含まれること
 */
import { describe, it, expect, afterAll } from "vitest";
import { existsSync, readFileSync, rmSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(__dirname, "../../../");
const designerDir = resolve(repoRoot, "designer");

/** Windows では .cmd 拡張子が必要 */
function resolveTsxPath(root: string): string {
  const base = resolve(root, "designer/node_modules/.bin/tsx");
  return process.platform === "win32" ? `${base}.cmd` : base;
}

const tempDirs: string[] = [];

afterAll(() => {
  // テスト後に生成した一時ディレクトリをクリーンアップ
  for (const dir of tempDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
});

describe("generate-dogfood スクリプト基盤", () => {
  it("--dry-run モードは終了コード 0 で終了し、ファイルを生成しない", () => {
    const outDir = join(tmpdir(), `dogfood-test-dryrun-${randomUUID()}`);
    tempDirs.push(outDir);

    const scriptPath = resolve(repoRoot, "designer/scripts/generate-dogfood.ts");
    const tsxPath = resolveTsxPath(repoRoot);

    const result = spawnSync(
      tsxPath,
      [scriptPath, "--industry", "テスト業界", "--scenarios", "テストシナリオ", "--output", outDir, "--dry-run"],
      {
        cwd: designerDir,
        encoding: "utf-8",
        shell: process.platform === "win32",
        maxBuffer: 5 * 1024 * 1024,
      },
    );

    // 終了コード 0
    expect(result.status).toBe(0);

    // dry-run なのでディレクトリは作成されない
    expect(existsSync(outDir)).toBe(false);

    // 出力に dry-run 関連のメッセージが含まれる
    const output = result.stdout ?? "";
    expect(output).toContain("dry-run");
  });

  it("--dry-run ログに process-flows / tables / extensions / conventions のパスが出力される", () => {
    const outDir = join(tmpdir(), `dogfood-test-log-${randomUUID()}`);
    tempDirs.push(outDir);

    const scriptPath = resolve(repoRoot, "designer/scripts/generate-dogfood.ts");
    const tsxPath = resolveTsxPath(repoRoot);

    const result = spawnSync(
      tsxPath,
      [
        scriptPath,
        "--industry", "テスト",
        "--scenarios", "テストシナリオ",
        "--output", outDir,
        "--dry-run",
      ],
      {
        cwd: designerDir,
        encoding: "utf-8",
        shell: process.platform === "win32",
        maxBuffer: 5 * 1024 * 1024,
      },
    );

    expect(result.status).toBe(0);
    const output = result.stdout ?? "";
    // 期待するディレクトリ名がログに出力されていること
    expect(output).toContain("process-flows");
    expect(output).toContain("tables");
    expect(output).toContain("extensions");
    expect(output).toContain("conventions");
  });

  it("出力ディレクトリに process-flows/ tables/ extensions/ conventions/ が作成される (実生成)", () => {
    const outDir = join(tmpdir(), `dogfood-test-real-${randomUUID()}`);
    tempDirs.push(outDir);

    const scriptPath = resolve(repoRoot, "designer/scripts/generate-dogfood.ts");
    const tsxPath = resolveTsxPath(repoRoot);

    // --dry-run なしで実際に生成
    // validate:dogfood は docs/sample-project/ を見るため、終了コードは 0 or 1 どちらもあり得る
    const result = spawnSync(
      tsxPath,
      [
        scriptPath,
        "--industry", "医療",
        "--scenarios", "患者管理",
        "--output", outDir,
      ],
      {
        cwd: designerDir,
        encoding: "utf-8",
        shell: process.platform === "win32",
        maxBuffer: 5 * 1024 * 1024,
        timeout: 60000, // validate:dogfood も含むため 60 秒
      },
    );

    // process-flows ディレクトリが作成されていること
    expect(existsSync(join(outDir, "process-flows"))).toBe(true);
    // tables ディレクトリが作成されていること
    expect(existsSync(join(outDir, "tables"))).toBe(true);
    // extensions ディレクトリが作成されていること
    expect(existsSync(join(outDir, "extensions"))).toBe(true);
    // conventions ディレクトリが作成されていること
    expect(existsSync(join(outDir, "conventions"))).toBe(true);

    // 各ディレクトリに JSON ファイルが 1 件以上生成されていること
    const flows = readdirSync(join(outDir, "process-flows")).filter((f) => f.endsWith(".json"));
    expect(flows.length).toBeGreaterThanOrEqual(1);

    const tables = readdirSync(join(outDir, "tables")).filter((f) => f.endsWith(".json"));
    expect(tables.length).toBeGreaterThanOrEqual(1);

    // 生成された ProcessFlow JSON が最低限の構造を持つこと
    const flowJson = JSON.parse(
      readFileSync(join(outDir, "process-flows", flows[0]), "utf-8"),
    ) as Record<string, unknown>;
    expect(typeof flowJson.id).toBe("string");
    expect(typeof flowJson.name).toBe("string");
    expect(flowJson.type).toBe("screen");
    expect(Array.isArray(flowJson.actions)).toBe(true);

    // 生成されたテーブル JSON が最低限の構造を持つこと
    const tableJson = JSON.parse(
      readFileSync(join(outDir, "tables", tables[0]), "utf-8"),
    ) as Record<string, unknown>;
    expect(typeof tableJson.id).toBe("string");
    expect(typeof tableJson.name).toBe("string");
    expect(Array.isArray(tableJson.columns)).toBe(true);

    // conventions ファイルが存在すること
    expect(existsSync(join(outDir, "conventions", "conventions-catalog.json"))).toBe(true);

    // スクリプト自体の出力に完了メッセージが含まれること
    const output = result.stdout ?? "";
    expect(output).toContain("generate-dogfood 完了");
    // 終了コードは validate:dogfood の結果次第 (0 or 1)
    expect([0, 1]).toContain(result.status);
  });

  it("--industry フラグなしで実行するとエラーメッセージを出力して終了コード 1", () => {
    const outDir = join(tmpdir(), `dogfood-test-noargs-${randomUUID()}`);
    tempDirs.push(outDir);

    const scriptPath = resolve(repoRoot, "designer/scripts/generate-dogfood.ts");
    const tsxPath = resolveTsxPath(repoRoot);

    const result = spawnSync(
      tsxPath,
      [scriptPath, "--output", outDir],
      {
        cwd: designerDir,
        encoding: "utf-8",
        shell: process.platform === "win32",
        maxBuffer: 1 * 1024 * 1024,
      },
    );

    expect(result.status).toBe(1);
    const output = (result.stderr ?? "") + (result.stdout ?? "");
    expect(output).toContain("--industry");
  });
});

describe("generate-dogfood --mode ai (AI 推論モード, #504)", () => {
  it("--mode ai --dry-run は終了コード 0 で終了し、ファイルを生成しない", () => {
    const outDir = join(tmpdir(), `dogfood-ai-dryrun-${randomUUID()}`);
    tempDirs.push(outDir);

    const scriptPath = resolve(repoRoot, "designer/scripts/generate-dogfood.ts");
    const tsxPath = resolveTsxPath(repoRoot);

    const result = spawnSync(
      tsxPath,
      [
        scriptPath,
        "--industry", "小売",
        "--scenarios", "商品検索,カート追加,注文確定",
        "--output", outDir,
        "--mode", "ai",
        "--dry-run",
      ],
      {
        cwd: designerDir,
        encoding: "utf-8",
        shell: process.platform === "win32",
        maxBuffer: 5 * 1024 * 1024,
      },
    );

    // 終了コード 0
    expect(result.status).toBe(0);

    // dry-run なのでディレクトリは作成されない
    expect(existsSync(outDir)).toBe(false);

    // dry-run メッセージが含まれること
    const output = result.stdout ?? "";
    expect(output).toContain("dry-run");
    expect(output).toContain("_briefing.md");
  });

  it("--mode ai ログに process-flows / tables / extensions / conventions のパスが出力される (dry-run)", () => {
    const outDir = join(tmpdir(), `dogfood-ai-log-${randomUUID()}`);
    tempDirs.push(outDir);

    const scriptPath = resolve(repoRoot, "designer/scripts/generate-dogfood.ts");
    const tsxPath = resolveTsxPath(repoRoot);

    const result = spawnSync(
      tsxPath,
      [
        scriptPath,
        "--industry", "物流",
        "--scenarios", "出荷指示,配送追跡",
        "--output", outDir,
        "--mode", "ai",
        "--dry-run",
      ],
      {
        cwd: designerDir,
        encoding: "utf-8",
        shell: process.platform === "win32",
        maxBuffer: 5 * 1024 * 1024,
      },
    );

    expect(result.status).toBe(0);
    const output = result.stdout ?? "";
    // AI モードのディレクトリパスがログに出力されていること
    expect(output).toContain("process-flows");
    expect(output).toContain("tables");
    expect(output).toContain("extensions");
    expect(output).toContain("conventions");
    // AI モードを示す文言
    expect(output).toContain("AI");
  });

  it("--mode ai 実行で _briefing.md とディレクトリ骨格が生成される", () => {
    const outDir = join(tmpdir(), `dogfood-ai-real-${randomUUID()}`);
    tempDirs.push(outDir);

    const scriptPath = resolve(repoRoot, "designer/scripts/generate-dogfood.ts");
    const tsxPath = resolveTsxPath(repoRoot);

    const result = spawnSync(
      tsxPath,
      [
        scriptPath,
        "--industry", "retail",
        "--scenarios", "店舗在庫照会,カート追加,注文確定",
        "--output", outDir,
        "--mode", "ai",
      ],
      {
        cwd: designerDir,
        encoding: "utf-8",
        shell: process.platform === "win32",
        maxBuffer: 5 * 1024 * 1024,
        timeout: 30000,
      },
    );

    // 終了コード 0 (AI モードは validate:dogfood を実行しないので常に 0)
    expect(result.status).toBe(0);

    // _briefing.md が生成されること
    expect(existsSync(join(outDir, "_briefing.md"))).toBe(true);

    // ディレクトリ骨格が作成されること
    expect(existsSync(join(outDir, "process-flows"))).toBe(true);
    expect(existsSync(join(outDir, "tables"))).toBe(true);
    expect(existsSync(join(outDir, "extensions"))).toBe(true);
    expect(existsSync(join(outDir, "conventions"))).toBe(true);

    // AI モードでは JSON ファイルは生成されない (briefing のみ)
    const flows = readdirSync(join(outDir, "process-flows")).filter((f) => f.endsWith(".json"));
    expect(flows.length).toBe(0);

    // スクリプト出力に AI モードの完了メッセージが含まれること
    const output = result.stdout ?? "";
    expect(output).toContain("AI モード");
  });

  it("--mode ai で生成された _briefing.md に必須セクションが含まれる", () => {
    const outDir = join(tmpdir(), `dogfood-ai-content-${randomUUID()}`);
    tempDirs.push(outDir);

    const scriptPath = resolve(repoRoot, "designer/scripts/generate-dogfood.ts");
    const tsxPath = resolveTsxPath(repoRoot);

    const result = spawnSync(
      tsxPath,
      [
        scriptPath,
        "--industry", "金融",
        "--scenarios", "口座開設,残高照会,振込",
        "--output", outDir,
        "--mode", "ai",
      ],
      {
        cwd: designerDir,
        encoding: "utf-8",
        shell: process.platform === "win32",
        maxBuffer: 5 * 1024 * 1024,
        timeout: 30000,
      },
    );

    expect(result.status).toBe(0);

    const briefingPath = join(outDir, "_briefing.md");
    expect(existsSync(briefingPath)).toBe(true);

    const content = readFileSync(briefingPath, "utf-8");

    // 業界 namespace セクション
    expect(content).toContain("業界 namespace");
    expect(content).toContain("金融");

    // シナリオ分解セクション
    expect(content).toContain("業務概要");
    expect(content).toContain("口座開設");
    expect(content).toContain("残高照会");
    expect(content).toContain("振込");

    // 14 ルール
    expect(content).toContain("14 ルール");
    expect(content).toContain("変数ライフサイクル");
    expect(content).toContain("TransactionScope");
    expect(content).toContain("runIf");
    expect(content).toContain("branch");
    expect(content).toContain("compensatesFor");
    expect(content).toContain("eventsCatalog");
    expect(content).toContain("rollbackOn");
    expect(content).toContain("SQL SELECT");
    expect(content).toContain("@conv.");
    expect(content).toContain("affectedRowsCheck");

    // validate:dogfood 検証手順
    expect(content).toContain("validate:dogfood");

    // AI Orchestrator への依頼
    expect(content).toContain("AI Orchestrator");

    // 既知制約
    expect(content).toContain("node-sql-parser");
    expect(content).toContain("CONCAT");
  });

  it("--mode ai は --mode=ai 形式でも動作する", () => {
    const outDir = join(tmpdir(), `dogfood-ai-eqsign-${randomUUID()}`);
    tempDirs.push(outDir);

    const scriptPath = resolve(repoRoot, "designer/scripts/generate-dogfood.ts");
    const tsxPath = resolveTsxPath(repoRoot);

    const result = spawnSync(
      tsxPath,
      [
        scriptPath,
        "--industry", "医療",
        "--scenarios", "患者登録",
        `--output=${outDir}`,
        "--mode=ai",
        "--dry-run",
      ],
      {
        cwd: designerDir,
        encoding: "utf-8",
        shell: process.platform === "win32",
        maxBuffer: 5 * 1024 * 1024,
      },
    );

    expect(result.status).toBe(0);
    const output = result.stdout ?? "";
    expect(output).toContain("AI");
  });

  it("--mode に不正な値を指定するとエラーメッセージを出力して終了コード 1", () => {
    const outDir = join(tmpdir(), `dogfood-ai-badmode-${randomUUID()}`);
    tempDirs.push(outDir);

    const scriptPath = resolve(repoRoot, "designer/scripts/generate-dogfood.ts");
    const tsxPath = resolveTsxPath(repoRoot);

    const result = spawnSync(
      tsxPath,
      [
        scriptPath,
        "--industry", "テスト",
        "--output", outDir,
        "--mode", "invalid-mode",
      ],
      {
        cwd: designerDir,
        encoding: "utf-8",
        shell: process.platform === "win32",
        maxBuffer: 1 * 1024 * 1024,
      },
    );

    expect(result.status).toBe(1);
    const output = (result.stderr ?? "") + (result.stdout ?? "");
    expect(output).toContain("--mode");
  });
});
