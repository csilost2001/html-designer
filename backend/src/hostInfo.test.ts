/**
 * hostInfo 単体テスト (#858)
 */
import { describe, it, expect, beforeEach } from "vitest";
import os from "node:os";
import { getHostInfo, __resetHostInfoCacheForTest } from "./hostInfo.js";

describe("getHostInfo", () => {
  beforeEach(() => {
    __resetHostInfoCacheForTest();
  });

  it("platform / homeDir を返す", async () => {
    const info = await getHostInfo();
    expect(["linux", "win32", "darwin", "other"]).toContain(info.platform);
    expect(info.homeDir).toBe(os.homedir());
    expect(typeof info.isWSL).toBe("boolean");
  });

  it("Linux 以外 (win32 / darwin) では isWSL=false", async () => {
    if (process.platform === "linux") {
      // Linux 環境では実 /proc/version を読むので skip (動作環境に依存)
      return;
    }
    const info = await getHostInfo();
    expect(info.isWSL).toBe(false);
  });

  it("結果がキャッシュされる (2 回目は同一インスタンス)", async () => {
    const a = await getHostInfo();
    const b = await getHostInfo();
    expect(b).toBe(a);
  });
});
