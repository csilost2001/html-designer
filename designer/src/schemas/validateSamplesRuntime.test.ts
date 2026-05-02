/**
 * validate-samples.ts runtime 契約整合性チェックのユニットテスト (#714)
 *
 * checkScreenItemsEmbedded / checkDesignFilePresence の 8 ケースを実 filesystem で検証する。
 */
import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkScreenItemsEmbedded, checkDesignFilePresence } from "../../scripts/validate-samples";
import type { Screen } from "../types/v3/screen";

// ─── テスト用一時ディレクトリ管理 ──────────────────────────────────────────

const tempDirs: string[] = [];

function makeTempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "wt714-test-"));
  tempDirs.push(dir);
  mkdirSync(join(dir, "screens"), { recursive: true });
  return dir;
}

afterAll(() => {
  for (const dir of tempDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // cleanup failure は無視
    }
  }
});

// ─── テスト用ヘルパー ────────────────────────────────────────────────────

function makeScreen(id: string, partial: Partial<Screen> = {}): Screen {
  return {
    id: id as Screen["id"],
    name: `テスト画面 ${id}`,
    kind: "form",
    path: `/test/${id}`,
    createdAt: "2026-01-01T00:00:00.000Z" as Screen["createdAt"],
    updatedAt: "2026-01-01T00:00:00.000Z" as Screen["updatedAt"],
    ...partial,
  } as Screen;
}

function makeProject(projectDir: string, screens: Screen[]) {
  return {
    projectId: "test",
    displayName: "test",
    projectDir,
    tables: [],
    conventions: null,
    conventionsV3: null,
    screens,
    viewDefinitions: [],
    screenTransitions: [],
    flowsDir: join(projectDir, "actions"),
  };
}

// ─── Case 1: 正常 case — issues 0 件 ────────────────────────────────────

describe("checkScreenItemsEmbedded — 正常ケース", () => {
  it("items が 1 件以上あり screen-items/ なし → issue なし", () => {
    const dir = makeTempProject();
    const id = "aaaaaaaa-0000-4000-8000-000000000001";
    const screens = [makeScreen(id, { items: [{ id: "field1" as Screen["id"], label: "フィールド1", type: "string", direction: "input" }] })];
    const project = makeProject(dir, screens);
    const issues = checkScreenItemsEmbedded(project);
    expect(issues).toHaveLength(0);
  });
});

describe("checkDesignFilePresence — 正常ケース", () => {
  it("design.json 存在 + designFileRef が <id>.design.json 一致 → issue なし", () => {
    const dir = makeTempProject();
    const id = "aaaaaaaa-0000-4000-8000-000000000002";
    writeFileSync(join(dir, "screens", `${id}.design.json`), "{}");
    const screens = [makeScreen(id, { design: { designFileRef: `${id}.design.json` } })];
    const project = makeProject(dir, screens);
    const issues = checkDesignFilePresence(project);
    expect(issues).toHaveLength(0);
  });
});

// ─── Case 2: items 空配列 → EMPTY_SCREEN_ITEMS warning ─────────────────

describe("checkScreenItemsEmbedded — items 空配列", () => {
  it("items が空配列のとき EMPTY_SCREEN_ITEMS warning が 1 件", () => {
    const dir = makeTempProject();
    const id = "bbbbbbbb-0000-4000-8000-000000000001";
    const screens = [makeScreen(id, { items: [] })];
    const project = makeProject(dir, screens);
    const issues = checkScreenItemsEmbedded(project);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("EMPTY_SCREEN_ITEMS");
    expect(issues[0].severity).toBe("warning");
    expect(issues[0].validator).toBe("runtimeContractValidator");
    expect(issues[0].path).toBe(`screens/${id}.json`);
  });
});

// ─── Case 3: items undefined → EMPTY_SCREEN_ITEMS warning ──────────────

describe("checkScreenItemsEmbedded — items undefined", () => {
  it("items が undefined のとき EMPTY_SCREEN_ITEMS warning が 1 件", () => {
    const dir = makeTempProject();
    const id = "bbbbbbbb-0000-4000-8000-000000000002";
    const screens = [makeScreen(id)]; // items 未設定
    const project = makeProject(dir, screens);
    const issues = checkScreenItemsEmbedded(project);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("EMPTY_SCREEN_ITEMS");
    expect(issues[0].severity).toBe("warning");
  });
});

// ─── Case 4: screen-items/ に .json あり → LEGACY_SCREEN_ITEMS_DIR error ─

describe("checkScreenItemsEmbedded — legacy screen-items/ ディレクトリ", () => {
  it("screen-items/<id>.json が存在するとき LEGACY_SCREEN_ITEMS_DIR error がファイル数分", () => {
    const dir = makeTempProject();
    mkdirSync(join(dir, "screen-items"), { recursive: true });
    const legacyIds = [
      "cccccccc-0000-4000-8000-000000000001",
      "cccccccc-0000-4000-8000-000000000002",
    ];
    for (const lid of legacyIds) {
      writeFileSync(join(dir, "screen-items", `${lid}.json`), "{}");
    }
    // items も持つ screen で Check 1a は出ないようにする
    const id = "cccccccc-0000-4000-8000-000000000003";
    const screens = [makeScreen(id, { items: [{ id: "f1" as Screen["id"], label: "F1", type: "string", direction: "input" }] })];
    const project = makeProject(dir, screens);
    const issues = checkScreenItemsEmbedded(project);
    const legacyIssues = issues.filter((i) => i.code === "LEGACY_SCREEN_ITEMS_DIR");
    expect(legacyIssues).toHaveLength(legacyIds.length);
    for (const i of legacyIssues) {
      expect(i.severity).toBe("error");
      expect(i.validator).toBe("runtimeContractValidator");
    }
  });
});

// ─── Case 5: design.json 不在 → MISSING_DESIGN_FILE warning ────────────

describe("checkDesignFilePresence — design.json 不在", () => {
  it("screens/<id>.design.json が存在しないとき MISSING_DESIGN_FILE warning が 1 件", () => {
    const dir = makeTempProject();
    const id = "dddddddd-0000-4000-8000-000000000001";
    // design.json を作らない
    const screens = [makeScreen(id)];
    const project = makeProject(dir, screens);
    const issues = checkDesignFilePresence(project);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("MISSING_DESIGN_FILE");
    expect(issues[0].severity).toBe("warning");
    expect(issues[0].path).toBe(`screens/${id}.json`);
  });
});

// ─── Case 6: designFileRef が外部参照 → EXTERNAL_DESIGN_REF error ───────

describe("checkDesignFilePresence — designFileRef が外部参照", () => {
  it("designFileRef が 'designs/foo.html' のとき EXTERNAL_DESIGN_REF error が 1 件", () => {
    const dir = makeTempProject();
    const id = "eeeeeeee-0000-4000-8000-000000000001";
    writeFileSync(join(dir, "screens", `${id}.design.json`), "{}");
    const screens = [makeScreen(id, { design: { designFileRef: "designs/foo.html" } })];
    const project = makeProject(dir, screens);
    const issues = checkDesignFilePresence(project);
    const extRefIssues = issues.filter((i) => i.code === "EXTERNAL_DESIGN_REF");
    expect(extRefIssues).toHaveLength(1);
    expect(extRefIssues[0].severity).toBe("error");
    expect(extRefIssues[0].message).toContain("designs/foo.html");
  });
});

// ─── Case 7: designFileRef が <id>.design.json 一致 → error なし ─────────

describe("checkDesignFilePresence — designFileRef が basename 一致", () => {
  it("designFileRef が '<id>.design.json' と一致するとき EXTERNAL_DESIGN_REF は出ない (false positive 防止)", () => {
    const dir = makeTempProject();
    const id = "ffffffff-0000-4000-8000-000000000001";
    writeFileSync(join(dir, "screens", `${id}.design.json`), "{}");
    // フルパス形式でも basename が一致すれば OK
    const screens = [makeScreen(id, { design: { designFileRef: `${id}.design.json` } })];
    const project = makeProject(dir, screens);
    const issues = checkDesignFilePresence(project);
    const extRefIssues = issues.filter((i) => i.code === "EXTERNAL_DESIGN_REF");
    expect(extRefIssues).toHaveLength(0);
  });
});

// ─── Case 8: designFileRef 未指定 → EXTERNAL_DESIGN_REF は出ない ─────────

describe("checkDesignFilePresence — designFileRef 未指定", () => {
  it("designFileRef が未指定のとき EXTERNAL_DESIGN_REF error は出ない", () => {
    const dir = makeTempProject();
    const id = "ffffffff-0000-4000-8000-000000000002";
    writeFileSync(join(dir, "screens", `${id}.design.json`), "{}");
    // design 自体は設定するが designFileRef は指定しない
    const screens = [makeScreen(id, { design: {} })];
    const project = makeProject(dir, screens);
    const issues = checkDesignFilePresence(project);
    const extRefIssues = issues.filter((i) => i.code === "EXTERNAL_DESIGN_REF");
    expect(extRefIssues).toHaveLength(0);
    // MISSING_DESIGN_FILE は出ない (design.json が存在するため)
    const missingIssues = issues.filter((i) => i.code === "MISSING_DESIGN_FILE");
    expect(missingIssues).toHaveLength(0);
  });
});
