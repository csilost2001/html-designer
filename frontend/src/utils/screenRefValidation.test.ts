import { describe, it, expect } from "vitest";
import { validateScreenRefs } from "./screenRefValidation";
import type { Screen } from "../types/v3/screen";

function makeScreen(partial: Partial<Screen>): Screen {
  return {
    id: "s1",
    name: "test",
    purpose: "page",
    kind: "form",
    path: "/test",
    items: [],
    ...partial,
  } as unknown as Screen;
}

describe("validateScreenRefs (#1090 Phase 2)", () => {
  it("fragmentRef が catalog 内 → no issue", () => {
    const issues = validateScreenRefs(
      makeScreen({
        fragments: [
          { fragmentRef: "generic-definitions/ui-fragment/messageArea", instanceId: "errorArea" },
        ],
      } as Partial<Screen>),
      { genericDefinitionNames: { "ui-fragment": new Set(["messageArea"]) } },
    );
    expect(issues).toHaveLength(0);
  });

  it("fragmentRef が catalog 外 → UNKNOWN_FRAGMENT_REF (severity warning)", () => {
    const issues = validateScreenRefs(
      makeScreen({
        fragments: [
          { fragmentRef: "generic-definitions/ui-fragment/NonExistentFragment" },
        ],
      } as Partial<Screen>),
      { genericDefinitionNames: { "ui-fragment": new Set(["messageArea"]) } },
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("UNKNOWN_FRAGMENT_REF");
    expect(issues[0].severity).toBe("warning");
    expect(issues[0].field).toBe("fragments[0].fragmentRef");
    expect(issues[0].message).toContain("NonExistentFragment");
  });

  it("複数 fragmentRef (一部切れ) → 切れた数だけ issue", () => {
    const issues = validateScreenRefs(
      makeScreen({
        fragments: [
          { fragmentRef: "generic-definitions/ui-fragment/messageArea", instanceId: "errorArea" },
          { fragmentRef: "generic-definitions/ui-fragment/Missing1" },
          { fragmentRef: "generic-definitions/ui-fragment/messageArea", instanceId: "infoArea" },
          { fragmentRef: "generic-definitions/ui-fragment/Missing2" },
        ],
      } as Partial<Screen>),
      { genericDefinitionNames: { "ui-fragment": new Set(["messageArea"]) } },
    );
    expect(issues).toHaveLength(2);
    expect(issues[0].field).toBe("fragments[1].fragmentRef");
    expect(issues[1].field).toBe("fragments[3].fragmentRef");
  });

  it("genericDefinitionNames['ui-fragment'] 未指定 → silent pass", () => {
    // catalog ロード失敗時の互換性維持: 検査しない (誤検出を避ける)
    const issues = validateScreenRefs(
      makeScreen({
        fragments: [
          { fragmentRef: "generic-definitions/ui-fragment/Whatever" },
        ],
      } as Partial<Screen>),
    );
    expect(issues).toHaveLength(0);

    // options 自体が undefined の場合も silent
    const issues2 = validateScreenRefs(
      makeScreen({
        fragments: [
          { fragmentRef: "generic-definitions/ui-fragment/Whatever" },
        ],
      } as Partial<Screen>),
      undefined,
    );
    expect(issues2).toHaveLength(0);
  });

  it("空 Set → 全 ref が UNKNOWN_FRAGMENT_REF (catalog 0 件 = 全部 catalog 外)", () => {
    const issues = validateScreenRefs(
      makeScreen({
        fragments: [
          { fragmentRef: "generic-definitions/ui-fragment/messageArea" },
        ],
      } as Partial<Screen>),
      { genericDefinitionNames: { "ui-fragment": new Set() } },
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("UNKNOWN_FRAGMENT_REF");
  });

  it("screen.fragments undefined / 空配列 → no issue", () => {
    const issuesUndef = validateScreenRefs(
      makeScreen({}),
      { genericDefinitionNames: { "ui-fragment": new Set(["messageArea"]) } },
    );
    expect(issuesUndef).toHaveLength(0);

    const issuesEmpty = validateScreenRefs(
      makeScreen({ fragments: [] } as Partial<Screen>),
      { genericDefinitionNames: { "ui-fragment": new Set(["messageArea"]) } },
    );
    expect(issuesEmpty).toHaveLength(0);
  });

  it("AJV pattern 不一致 (形式違反) → silent pass (AJV 側で error 報告される領域)", () => {
    const issues = validateScreenRefs(
      makeScreen({
        fragments: [
          // pattern にマッチしない (kind 部不正)
          { fragmentRef: "generic-definitions/wrong-kind/Whatever" },
          // pattern にマッチしない (prefix 不正)
          { fragmentRef: "ui-fragment/Whatever" },
        ],
      } as Partial<Screen>),
      { genericDefinitionNames: { "ui-fragment": new Set(["messageArea"]) } },
    );
    expect(issues).toHaveLength(0);
  });
});
