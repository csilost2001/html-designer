/**
 * Designer.tsx の cssFramework 解決ロジックのユニットテスト (#806 子 2)。
 *
 * resolveCssFramework(screenDesign, projectDesign) の純粋関数を対象に、
 * 3 シナリオを検証する:
 *   - 画面 A: screen.design.cssFramework = "tailwind" → "tailwind"
 *   - 画面 B: screen.design.cssFramework = undefined + project.design.cssFramework = "tailwind" → "tailwind"
 *   - 画面 C: 両方 undefined → "bootstrap" (最終 default)
 *
 * 仕様書参照: docs/spec/css-framework-switching.md § 1.3.1
 *             docs/spec/multi-editor-puck.md § 2.3
 */
import { describe, it, expect } from "vitest";
import { resolveCssFramework } from "../utils/resolveCssFramework";

describe("resolveCssFramework", () => {
  it("画面 A: screen.design.cssFramework が 'tailwind' のとき 'tailwind' を返す", () => {
    const screenDesign = { cssFramework: "tailwind" as const };
    const projectDesign = { cssFramework: "bootstrap" as const };
    expect(resolveCssFramework(screenDesign, projectDesign)).toBe("tailwind");
  });

  it("画面 B: screen.design.cssFramework が undefined のとき project.design.cssFramework にフォールバックする", () => {
    const screenDesign = { cssFramework: undefined };
    const projectDesign = { cssFramework: "tailwind" as const };
    expect(resolveCssFramework(screenDesign, projectDesign)).toBe("tailwind");
  });

  it("画面 C: 両方 undefined のとき 'bootstrap' を返す", () => {
    expect(resolveCssFramework(undefined, undefined)).toBe("bootstrap");
  });

  it("screen.design 自体が undefined のとき project.design.cssFramework にフォールバックする", () => {
    const projectDesign = { cssFramework: "tailwind" as const };
    expect(resolveCssFramework(undefined, projectDesign)).toBe("tailwind");
  });

  it("screen.design.cssFramework が 'bootstrap' のとき project が tailwind でも 'bootstrap' を返す", () => {
    const screenDesign = { cssFramework: "bootstrap" as const };
    const projectDesign = { cssFramework: "tailwind" as const };
    expect(resolveCssFramework(screenDesign, projectDesign)).toBe("bootstrap");
  });
});
