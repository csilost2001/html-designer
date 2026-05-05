/**
 * resolveEditorKind のユニットテスト。
 *
 * 解決優先順序 (multi-editor-puck.md § 2.3):
 *   1. screen.design.editorKind
 *   2. project.design.editorKind
 *   3. "grapesjs" (最終 default)
 *
 * #806 子 3 — resolveCssFramework.test.ts と同パターンで 5 ケース
 */
import { describe, it, expect } from "vitest";
import { resolveEditorKind } from "./resolveEditorKind";

describe("resolveEditorKind", () => {
  it("ケース 1: screen に editorKind が指定されていれば screen 優先で返す (puck)", () => {
    const result = resolveEditorKind(
      { editorKind: "puck" },
      { editorKind: "grapesjs" },
    );
    expect(result).toBe("puck");
  });

  it("ケース 2: screen に editorKind が指定されていれば screen 優先で返す (grapesjs)", () => {
    const result = resolveEditorKind(
      { editorKind: "grapesjs" },
      { editorKind: "puck" },
    );
    expect(result).toBe("grapesjs");
  });

  it("ケース 3: screen に editorKind がなく project に指定があれば project の値を返す", () => {
    const result = resolveEditorKind(
      { editorKind: undefined },
      { editorKind: "puck" },
    );
    expect(result).toBe("puck");
  });

  it("ケース 4: screen も project も undefined なら最終 default 'grapesjs' を返す", () => {
    const result = resolveEditorKind(undefined, undefined);
    expect(result).toBe("grapesjs");
  });

  it("ケース 5: screen が undefined で project も editorKind なしなら 'grapesjs' を返す", () => {
    const result = resolveEditorKind(
      undefined,
      { editorKind: undefined },
    );
    expect(result).toBe("grapesjs");
  });
});
