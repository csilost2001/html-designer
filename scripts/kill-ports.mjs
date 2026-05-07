/**
 * scripts/kill-ports.mjs
 *
 * 5173 / 5179 を占有しているプロセスを強制終了する。
 * `npm run kill` または `npm run restart` の前置ステップとして使用。
 */

import { execSync } from "node:child_process";

const PORTS = [5173, 5179];
let killed = false;

for (const port of PORTS) {
  try {
    const pids = execSync(`lsof -ti:${port}`, { encoding: "utf8" }).trim();
    if (pids) {
      const pidList = pids.split("\n").filter(Boolean);
      execSync(`kill -9 ${pidList.join(" ")}`);
      console.log(`\x1b[33m[kill-ports]\x1b[0m Port ${port} のプロセスを終了しました (PID: ${pidList.join(", ")})`);
      killed = true;
    }
  } catch {
    // lsof が 0 件のときも非ゼロ終了するため握り潰す
  }
}

if (!killed) {
  console.log("\x1b[32m[kill-ports]\x1b[0m 5173 / 5179 は使用中ではありません");
}
