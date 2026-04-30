/**
 * サンプルプロジェクト発見モジュール (#617)
 *
 * docs/sample-project (v1 legacy) および docs/sample-project-v3/<project>/ 配下の
 * 各サンプルプロジェクトを発見してプロジェクト識別子・ディレクトリ・
 * リソース子ディレクトリパスをまとめて返す。
 *
 * 元実装は scripts/validate-dogfood.ts:126 にあった discoverProjects()。
 * generate-dogfood.ts でも per-project 構造で出力先を解決するため、共通 module 化。
 *
 * spec: docs/spec/sample-project-structure.md
 */

import { existsSync, readdirSync } from "node:fs";
import { resolve, join, relative } from "node:path";

/**
 * サンプルプロジェクト 1 件分の情報。
 *
 * v1 (flat) と v3 (per-project subdirectory) の両方を統一的に扱う。
 */
export interface SampleProjectInfo {
  /** 識別子。v1 は "v1"、v3 は subdir 名 (finance / retail 等) */
  projectId: string;
  /** schema バージョン区分 */
  variant: "v1" | "v3";
  /** repoRoot からの相対パス (Windows path 区切りは正規化済み) */
  displayName: string;
  /** プロジェクトディレクトリの絶対パス */
  projectDir: string;
  /** tables ディレクトリの絶対パス (存在しなくても返す。loader 側で existsSync 必須) */
  tablesDir: string;
  /** screens ディレクトリの絶対パス (v1 では未配置の場合あり) */
  screensDir: string;
  /** process-flows ディレクトリの絶対パス */
  flowsDir: string;
  /** 規約カタログファイルの絶対パス (v1 / v3 で命名規則が異なる) */
  conventionsCatalogFile: string;
  /** extensions ディレクトリの絶対パス (v1 のみ flat 配置、v3 は per-project) */
  extensionsDir: string;
}

export interface DiscoverProjectsOptions {
  /** v1 を結果に含めるか (デフォルト true) */
  includeV1?: boolean;
  /** v3 を結果に含めるか (デフォルト true) */
  includeV3?: boolean;
}

/**
 * リポジトリルート (designer/.. = repoRoot) を解決する。
 *
 * scripts は CJS モード (scripts/package.json で "type": "commonjs") のため
 * __dirname が使用可能。呼び出し元は import 後に repoRoot 引数で上書き可能。
 */
export function defaultRepoRoot(): string {
  return resolve(__dirname, "../..");
}

/**
 * v1 + v3 のサンプルプロジェクトを発見してリソース情報を返す。
 *
 * 発見規則:
 *   - v1: docs/sample-project/ 直下に conventions/process-flows/tables のいずれか
 *         (project.json を持たない legacy 構造)
 *   - v3: docs/sample-project-v3/<subdir>/ に project.json があれば 1 project
 *
 * spec: docs/spec/sample-project-structure.md
 */
export function discoverProjects(
  repoRoot: string = defaultRepoRoot(),
  options: DiscoverProjectsOptions = {},
): SampleProjectInfo[] {
  const includeV1 = options.includeV1 !== false;
  const includeV3 = options.includeV3 !== false;

  const samplesV1Dir = resolve(repoRoot, "docs/sample-project");
  const samplesV3Dir = resolve(repoRoot, "docs/sample-project-v3");

  const projects: SampleProjectInfo[] = [];

  if (includeV1) {
    if (
      existsSync(join(samplesV1Dir, "project.json")) ||
      existsSync(join(samplesV1Dir, "process-flows")) ||
      existsSync(join(samplesV1Dir, "conventions")) ||
      existsSync(join(samplesV1Dir, "tables"))
    ) {
      projects.push({
        projectId: "v1",
        variant: "v1",
        displayName: relative(repoRoot, samplesV1Dir).replace(/\\/g, "/"),
        projectDir: samplesV1Dir,
        tablesDir: join(samplesV1Dir, "tables"),
        screensDir: join(samplesV1Dir, "screens"),
        flowsDir: join(samplesV1Dir, "process-flows"),
        conventionsCatalogFile: join(samplesV1Dir, "conventions/conventions-catalog.json"),
        extensionsDir: join(samplesV1Dir, "extensions"),
      });
    }
  }

  if (includeV3 && existsSync(samplesV3Dir)) {
    for (const entry of readdirSync(samplesV3Dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const projectDir = join(samplesV3Dir, entry.name);
      if (!existsSync(join(projectDir, "project.json"))) continue;
      projects.push({
        projectId: entry.name,
        variant: "v3",
        displayName: relative(repoRoot, projectDir).replace(/\\/g, "/"),
        projectDir,
        tablesDir: join(projectDir, "tables"),
        screensDir: join(projectDir, "screens"),
        flowsDir: join(projectDir, "process-flows"),
        conventionsCatalogFile: join(projectDir, "conventions-catalog.v3.json"),
        extensionsDir: join(projectDir, "extensions"),
      });
    }
  }

  return projects;
}

/**
 * projectId (例: "finance" / "retail" / "v1") からプロジェクト情報を取得する。
 * 見つからない場合は null。
 */
export function findProjectById(
  projectId: string,
  repoRoot: string = defaultRepoRoot(),
  options: DiscoverProjectsOptions = {},
): SampleProjectInfo | null {
  const projects = discoverProjects(repoRoot, options);
  return projects.find((p) => p.projectId === projectId) ?? null;
}
