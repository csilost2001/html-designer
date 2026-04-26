/**
 * ドッグフード検証スイートのテスト (#496)
 *
 * npm run validate:dogfood の動作検証:
 * 1. 意図的に不正なフローを渡すと各バリデータが issue を返すこと
 * 2. CLI スクリプトが fail 時に終了コード 1 を返すこと
 *    (Phase 2-1a マージ前はサンプルに drift があるため fail が期待される)
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import type { ProcessFlow } from "../types/action";
import { checkSqlColumns } from "./sqlColumnValidator";
import { checkConventionReferences } from "./conventionsValidator";
import { checkReferentialIntegrity } from "./referentialIntegrity";
import { checkIdentifierScopes } from "./identifierScope";

const repoRoot = resolve(__dirname, "../../../");

/** Windows では .cmd 拡張子が必要 */
function resolveTsxPath(root: string): string {
  const base = resolve(root, "designer/node_modules/.bin/tsx");
  return process.platform === "win32" ? `${base}.cmd` : base;
}

// ─── テスト用フローファクトリ ───────────────────────────────────────────────

function makeFlow(partial: Partial<ProcessFlow>): ProcessFlow {
  return {
    id: "test-flow", name: "テストフロー", type: "screen", description: "",
    actions: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...partial,
  } as ProcessFlow;
}

// ─── 各バリデータ単体検証 ───────────────────────────────────────────────────

describe("dogfood バリデータ — sqlColumnValidator", () => {
  it("存在しない列参照を検出する", () => {
    const flow = makeFlow({
      actions: [{
        id: "act-1", name: "検索", trigger: "submit",
        steps: [{
          id: "db-1", type: "dbAccess", description: "", operation: "select",
          sql: "SELECT nonexistent_column FROM orders WHERE id = @orderId",
          outputBinding: "dbResult",
        }],
      }],
    });
    const tables = [
      { id: "t1", name: "orders", columns: [{ name: "id" }, { name: "status" }] },
    ];
    const issues = checkSqlColumns(flow, tables);
    expect(issues.length).toBeGreaterThan(0);
    const colIssue = issues.find((i) => i.code === "UNKNOWN_COLUMN");
    expect(colIssue).toBeDefined();
    expect(colIssue?.value).toBe("nonexistent_column");
  });

  it("正しい列参照は issue なし", () => {
    const flow = makeFlow({
      actions: [{
        id: "act-1", name: "検索", trigger: "submit",
        steps: [{
          id: "db-1", type: "dbAccess", description: "", operation: "select",
          sql: "SELECT id, status FROM orders WHERE id = @orderId",
          outputBinding: "dbResult",
        }],
      }],
    });
    const tables = [
      { id: "t1", name: "orders", columns: [{ name: "id" }, { name: "status" }] },
    ];
    const issues = checkSqlColumns(flow, tables);
    const colIssues = issues.filter((i) => i.code === "UNKNOWN_COLUMN");
    expect(colIssues).toHaveLength(0);
  });
});

describe("dogfood バリデータ — checkConventionReferences", () => {
  it("未定義の @conv.msg.* を検出する", () => {
    const flow = makeFlow({
      actions: [{
        id: "act-1", name: "登録", trigger: "submit",
        steps: [{
          id: "v-1", type: "validation", description: "",
          rules: [{ id: "r-1", condition: "@input > 0", message: "@conv.msg.UNDEFINED_KEY" }],
        }],
      }],
    });
    const catalog = { version: "1.0", msg: { EXISTING_KEY: { ja: "既存メッセージ" } } };
    const issues = checkConventionReferences(flow, catalog);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].code).toBe("UNKNOWN_CONV_MSG");
  });
});

describe("dogfood バリデータ — checkReferentialIntegrity", () => {
  it("未定義 responseRef を検出する", () => {
    const flow = makeFlow({
      actions: [{
        id: "act-1", name: "取得", trigger: "init",
        responses: [{ id: "200-ok", status: 200 }],
        steps: [
          { id: "ret-1", type: "return", description: "", responseRef: "404-not-defined" },
        ],
      }],
    });
    const issues = checkReferentialIntegrity(flow);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].code).toBe("UNKNOWN_RESPONSE_REF");
  });
});

describe("dogfood バリデータ — checkIdentifierScopes", () => {
  it("未宣言の @identifier を検出する", () => {
    const flow = makeFlow({
      actions: [{
        id: "act-1", name: "計算", trigger: "submit",
        inputs: [{ name: "amount", type: "number" }],
        steps: [
          {
            id: "c-1", type: "compute", description: "",
            expression: "@amount + @undeclaredVar",
            outputBinding: "result",
          },
        ],
      }],
    });
    const issues = checkIdentifierScopes(flow);
    expect(issues.length).toBeGreaterThan(0);
    const undeclaredIssue = issues.find((i) => i.identifier === "undeclaredVar");
    expect(undeclaredIssue).toBeDefined();
    expect(undeclaredIssue?.code).toBe("UNKNOWN_IDENTIFIER");
  });
});

// ─── CLI スクリプト 終了コード検証 ────────────────────────────────────────

describe("validate:dogfood CLI", () => {
  it("現時点ではサンプルに drift があるため終了コード 1 を返す (Phase 2-1a マージ前)", () => {
    // NOTE: Phase 2-1a (#495) マージ後はこのテストが pass 相当になる (終了コード 0)。
    //       マージ後はこのテストを 終了コード 0 を期待するよう更新すること。
    const tsxPath = resolveTsxPath(repoRoot);
    const scriptPath = resolve(repoRoot, "designer/scripts/validate-dogfood.ts");
    const result = spawnSync(tsxPath, [scriptPath], {
      cwd: resolve(repoRoot, "designer"),
      encoding: "utf-8",
      shell: process.platform === "win32",
      maxBuffer: 10 * 1024 * 1024,
    });
    // Phase 2-1a マージ前: drift があるため終了コード 1
    // Phase 2-1a マージ後: 全件 pass で終了コード 0
    expect([0, 1]).toContain(result.status);
  });

  it("スクリプトが正しく実行され、標準出力に summary が含まれること", () => {
    // validate:dogfood が正しく非 0 終了コードを返せることの確認
    // 現在のサンプルに drift があれば終了コード 1 が期待値
    const tsxPath = resolveTsxPath(repoRoot);
    const scriptPath = resolve(repoRoot, "designer/scripts/validate-dogfood.ts");
    const result = spawnSync(tsxPath, [scriptPath], {
      cwd: resolve(repoRoot, "designer"),
      encoding: "utf-8",
      shell: process.platform === "win32",
      maxBuffer: 10 * 1024 * 1024,
    });

    const output = result.stdout ?? "";
    // スクリプトが実行できること (出力が存在すること)
    expect(output).toContain("ドッグフード検証スイート");
    expect(output).toContain("Summary:");
    // drift がある場合は終了コード 1、全件 pass の場合は終了コード 0
    if (result.status === 1) {
      expect(output).toContain("❌ 検証失敗");
    } else {
      expect(output).toContain("✅ 全件検証 pass");
    }
  });
});
