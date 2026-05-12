/**
 * fsBrowse.ts (#1056)
 *
 * backend filesystem browser - workspace.browseFs MCP tool の実装。
 *
 * 目的: container / リモート開発で「ブラウザ側 file picker が使えない」状況に対し、
 * backend が自身の filesystem をリストして frontend に tree UI を渡す。
 *
 * 設計判断 (L1):
 * - **path 範囲は限定しない** (allowlist 不在)。container 内で動く前提なので、fs 全体に
 *   意味のあるアクセス制御をかける必要が薄い。SaaS / multi-tenant 化時には
 *   `HARMONY_ALLOWED_BROWSE_ROOTS` 等を別 ISSUE で追加する。
 * - `path.resolve` で正規化して `..` 経由の relative escape は除去する。
 * - `harmony.json` を含むフォルダは `isWorkspace=true` で frontend に強調表示させる。
 *
 * 詳細仕様: docs/spec/path-conventions.md §8
 */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export type FsEntry = {
  name: string;
  isDir: boolean;
  /** `harmony.json` を含むディレクトリの場合 true (isDir が true の時のみ意味を持つ) */
  isWorkspace: boolean;
  /** ISO 8601 形式の最終更新時刻 (取得失敗時は null) */
  mtime: string | null;
};

export type BrowseResult = {
  /** 解決された絶対パス (正規化済) */
  path: string;
  /** 親ディレクトリの絶対パス。root の場合 null */
  parent: string | null;
  /** ディレクトリ内のエントリ一覧。alphabetical sort、dir 優先 */
  entries: FsEntry[];
};

export class BrowseFsError extends Error {
  constructor(message: string, public readonly code: "notFound" | "notDir" | "permission" | "io") {
    super(message);
    this.name = "BrowseFsError";
  }
}

/**
 * `browseFs` の default 開始 path を解決する。
 * 優先順位:
 *   1. env `HARMONY_WORKSPACES_DIR` — 配布時のワークスペース親ディレクトリ規約
 *   2. env `HARMONY_HOME` の 1 階層上 — state 配置場所の親 (例: `/home/node`)
 *   3. `os.homedir()` — fallback
 */
export function resolveDefaultBrowsePath(): string {
  const wsDir = process.env.HARMONY_WORKSPACES_DIR?.trim();
  if (wsDir && wsDir.length > 0) return path.resolve(wsDir);
  const harmonyHome = process.env.HARMONY_HOME?.trim();
  if (harmonyHome && harmonyHome.length > 0) {
    return path.resolve(path.dirname(harmonyHome));
  }
  return os.homedir();
}

/**
 * 指定パスのディレクトリ内容をリストする。
 *
 * symlink の扱い:
 *   - **target (引数 `targetPath`)** は `fs.stat` で follow する。ユーザーが明示的に
 *     navigation した path のため、たとえ symlink 経由でも実体ディレクトリを開く。
 *   - **子エントリ** は `fs.lstat` で follow しない。symlink loop / 意図しない外部
 *     path への誘導を避けるため、子は symlink ファイル (isDir=false) として表示する。
 *
 * @param targetPath - 絶対 or 相対パス。省略時は default 開始位置 (`resolveDefaultBrowsePath`)
 * @throws BrowseFsError - notFound / notDir / permission / io
 */
export async function browseFs(targetPath?: string): Promise<BrowseResult> {
  const raw = (targetPath ?? "").trim();
  const abs = raw.length > 0 ? path.resolve(raw) : resolveDefaultBrowsePath();

  // target は fs.stat で symlink を follow (上記 docstring 参照)
  let stat: import("node:fs").Stats;
  try {
    stat = await fs.stat(abs);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new BrowseFsError(`フォルダが見つかりません: ${abs}`, "notFound");
    }
    if (code === "EACCES" || code === "EPERM") {
      throw new BrowseFsError(`アクセス権限がありません: ${abs}`, "permission");
    }
    throw new BrowseFsError(`stat 失敗: ${e instanceof Error ? e.message : String(e)}`, "io");
  }

  if (!stat.isDirectory()) {
    throw new BrowseFsError(`ディレクトリではありません: ${abs}`, "notDir");
  }

  let names: string[];
  try {
    names = await fs.readdir(abs);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "EACCES" || code === "EPERM") {
      throw new BrowseFsError(`ディレクトリ読み取り権限がありません: ${abs}`, "permission");
    }
    throw new BrowseFsError(`readdir 失敗: ${e instanceof Error ? e.message : String(e)}`, "io");
  }

  // 各エントリの stat と harmony.json 存在チェックを並列実行
  const entries = await Promise.all(names.map(async (name): Promise<FsEntry | null> => {
    if (name === "." || name === "..") return null;
    const child = path.join(abs, name);
    let childStat: import("node:fs").Stats;
    try {
      // symlink を follow しない: symlink loop / 隠し外部 path への意図しない誘導を避ける
      childStat = await fs.lstat(child);
    } catch {
      return null; // 読めないエントリは静かに skip
    }
    const isDir = childStat.isDirectory();
    let isWorkspace = false;
    if (isDir) {
      try {
        const harmonyStat = await fs.stat(path.join(child, "harmony.json"));
        isWorkspace = harmonyStat.isFile();
      } catch {
        isWorkspace = false;
      }
    }
    return {
      name,
      isDir,
      isWorkspace,
      mtime: childStat.mtime.toISOString(),
    };
  }));

  const validEntries = entries.filter((e): e is FsEntry => e !== null);

  // sort: ディレクトリを先、各カテゴリ内は name 昇順 (locale-aware)
  validEntries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name, "ja");
  });

  // parent: root では null。Linux/macOS の `/`、Windows の `C:\` 等は path.dirname が
  // 自分自身を返すので、その場合 null にする
  const parentCandidate = path.dirname(abs);
  const parent = parentCandidate === abs ? null : parentCandidate;

  return {
    path: abs,
    parent,
    entries: validEntries,
  };
}
