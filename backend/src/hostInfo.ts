/**
 * hostInfo.ts (#858)
 *
 * Backend が動作しているホスト OS を判定し、ワークスペース選択画面の placeholder /
 * パス入力ヒントを切り替えるための情報を提供する。
 *
 * - platform: process.platform を "linux" / "win32" / "darwin" / "other" に正規化
 * - isWSL: /proc/version に "Microsoft" / "WSL" 文字列が含まれるか
 * - homeDir: os.homedir() (frontend が user 名を埋め込んだプレースホルダを生成するのに使う)
 *
 * frontend は WSL 環境で「フォルダ参照」が Windows ファイルダイアログを出してしまい
 * Linux パス (/home/<user>/...) に navigate できない問題に遭遇していた。本情報をもとに
 * 入力欄の placeholder を切り替えることで、設計者が即座に正しいパス形式を入れられるようにする。
 */
import os from "node:os";
import fs from "node:fs/promises";

export interface HostInfo {
  platform: "linux" | "win32" | "darwin" | "other";
  isWSL: boolean;
  homeDir: string;
}

let _cache: HostInfo | null = null;

function normalizePlatform(p: NodeJS.Platform): HostInfo["platform"] {
  if (p === "linux" || p === "win32" || p === "darwin") return p;
  return "other";
}

async function detectWSL(): Promise<boolean> {
  if (process.platform !== "linux") return false;
  try {
    const content = await fs.readFile("/proc/version", "utf-8");
    return /Microsoft|WSL/i.test(content);
  } catch {
    return false;
  }
}

export async function getHostInfo(): Promise<HostInfo> {
  if (_cache) return _cache;
  const isWSL = await detectWSL();
  _cache = {
    platform: normalizePlatform(process.platform),
    isWSL,
    homeDir: os.homedir(),
  };
  return _cache;
}

export function __resetHostInfoCacheForTest(): void {
  _cache = null;
}
