import { describe, it, expect } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import {
  checkConventionReferences,
  checkConventionsCatalogIntegrity,
  checkScreenItemConventionReferences,
  type ConventionsCatalog,
} from "./conventionsValidator";
import type { ProcessFlow } from "../types/action";
import type { ScreenItemsFile } from "../types/screenItem";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const repoRoot = resolve(__dirname, "../../../");
const catalogPath = resolve(repoRoot, "docs/sample-project/conventions/conventions-catalog.json");
const catalogSchemaPath = resolve(repoRoot, "schemas/conventions.schema.json");
const samplesDir = resolve(repoRoot, "docs/sample-project/process-flows");

function loadCatalog(): ConventionsCatalog {
  return JSON.parse(readFileSync(catalogPath, "utf-8")) as ConventionsCatalog;
}

function makeGroup(partial: Partial<ProcessFlow>): ProcessFlow {
  return {
    id: "a", name: "x", type: "screen", description: "",
    actions: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...partial,
  } as ProcessFlow;
}

describe("conventions-catalog.json がスキーマに適合", () => {
  it("ajv でスキーマ検証 pass", () => {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    const schema = JSON.parse(readFileSync(catalogSchemaPath, "utf-8"));
    const catalog = JSON.parse(readFileSync(catalogPath, "utf-8"));
    const validate = ajv.compile(schema);
    const ok = validate(catalog);
    if (!ok) throw new Error(JSON.stringify(validate.errors));
    expect(ok).toBe(true);
  });
});

describe("checkConventionReferences", () => {
  const catalog = loadCatalog();

  it("既知の @conv.msg.* は accept", () => {
    const issues = checkConventionReferences(
      makeGroup({
        actions: [{
          id: "a1", name: "f", trigger: "click",
          steps: [{
            id: "s1", type: "validation", description: "", conditions: "",
            rules: [{ field: "x", type: "required", message: "@conv.msg.required" }],
          }],
        }],
      }),
      catalog,
    );
    expect(issues).toHaveLength(0);
  });

  it("未知の @conv.msg.* を検出", () => {
    const issues = checkConventionReferences(
      makeGroup({
        actions: [{
          id: "a1", name: "f", trigger: "click",
          steps: [{
            id: "s1", type: "validation", description: "", conditions: "",
            rules: [{ field: "x", type: "required", message: "@conv.msg.unknownKey" }],
          }],
        }],
      }),
      catalog,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("UNKNOWN_CONV_MSG");
  });

  it("@conv.regex.email-simple は accept", () => {
    const issues = checkConventionReferences(
      makeGroup({
        actions: [{
          id: "a1", name: "f", trigger: "click",
          steps: [{
            id: "s1", type: "validation", description: "", conditions: "@conv.regex.email-simple",
            rules: [],
          }],
        }],
      }),
      catalog,
    );
    expect(issues).toHaveLength(0);
  });

  it("@conv.regex.unknownPattern を検出", () => {
    const issues = checkConventionReferences(
      makeGroup({
        actions: [{
          id: "a1", name: "f", trigger: "click",
          steps: [{
            id: "s1", type: "validation", description: "", conditions: "@conv.regex.unknownPattern",
            rules: [],
          }],
        }],
      }),
      catalog,
    );
    expect(issues.some((i) => i.code === "UNKNOWN_CONV_REGEX")).toBe(true);
  });

  it("@conv.limit.quantityMax は accept", () => {
    const issues = checkConventionReferences(
      makeGroup({
        actions: [{
          id: "a1", name: "f", trigger: "click",
          steps: [{
            id: "s1", type: "other", description: "上限 @conv.limit.quantityMax まで",
          }],
        }],
      }),
      catalog,
    );
    expect(issues).toHaveLength(0);
  });

  it("未知のカテゴリ @conv.xxx.* は UNKNOWN_CONV_CATEGORY", () => {
    const issues = checkConventionReferences(
      makeGroup({
        actions: [{
          id: "a1", name: "f", trigger: "click",
          steps: [{
            id: "s1", type: "other", description: "@conv.color.red",
          }],
        }],
      }),
      catalog,
    );
    expect(issues.some((i) => i.code === "UNKNOWN_CONV_CATEGORY")).toBe(true);
  });

  it("@conv.scope.customerRegion は accept", () => {
    const issues = checkConventionReferences(
      makeGroup({
        actions: [{
          id: "a1", name: "f", trigger: "click",
          steps: [{ id: "s1", type: "other", description: "対象: @conv.scope.customerRegion" }],
        }],
      }),
      catalog,
    );
    expect(issues).toHaveLength(0);
  });

  it("@conv.scope.unknownKey は UNKNOWN_CONV_SCOPE", () => {
    const issues = checkConventionReferences(
      makeGroup({
        actions: [{
          id: "a1", name: "f", trigger: "click",
          steps: [{ id: "s1", type: "other", description: "@conv.scope.unknownKey" }],
        }],
      }),
      catalog,
    );
    expect(issues.some((i) => i.code === "UNKNOWN_CONV_SCOPE")).toBe(true);
  });

  it("@conv.currency.jpy は accept", () => {
    const issues = checkConventionReferences(
      makeGroup({
        actions: [{
          id: "a1", name: "f", trigger: "click",
          steps: [{ id: "s1", type: "other", description: "通貨: @conv.currency.jpy" }],
        }],
      }),
      catalog,
    );
    expect(issues).toHaveLength(0);
  });

  it("@conv.tax.standard は accept", () => {
    const issues = checkConventionReferences(
      makeGroup({
        actions: [{
          id: "a1", name: "f", trigger: "click",
          steps: [{ id: "s1", type: "other", description: "税率: @conv.tax.standard" }],
        }],
      }),
      catalog,
    );
    expect(issues).toHaveLength(0);
  });

  it("@conv.auth.default は accept", () => {
    const issues = checkConventionReferences(
      makeGroup({
        actions: [{
          id: "a1", name: "f", trigger: "click",
          steps: [{ id: "s1", type: "other", description: "認証: @conv.auth.default" }],
        }],
      }),
      catalog,
    );
    expect(issues).toHaveLength(0);
  });

  it("@conv.db.default は accept", () => {
    const issues = checkConventionReferences(
      makeGroup({
        actions: [{
          id: "a1", name: "f", trigger: "click",
          steps: [{ id: "s1", type: "other", description: "DB: @conv.db.default" }],
        }],
      }),
      catalog,
    );
    expect(issues).toHaveLength(0);
  });

  it("@conv.numbering.customerCode は accept", () => {
    const issues = checkConventionReferences(
      makeGroup({
        actions: [{
          id: "a1", name: "f", trigger: "click",
          steps: [{ id: "s1", type: "other", description: "採番: @conv.numbering.customerCode" }],
        }],
      }),
      catalog,
    );
    expect(issues).toHaveLength(0);
  });

  it("@conv.tx.singleOperation は accept", () => {
    const issues = checkConventionReferences(
      makeGroup({
        actions: [{
          id: "a1", name: "f", trigger: "click",
          steps: [{ id: "s1", type: "other", description: "TX: @conv.tx.singleOperation" }],
        }],
      }),
      catalog,
    );
    expect(issues).toHaveLength(0);
  });

  it("@conv.externalOutcomeDefaults.failure は accept", () => {
    const issues = checkConventionReferences(
      makeGroup({
        actions: [{
          id: "a1", name: "f", trigger: "click",
          steps: [{ id: "s1", type: "other", description: "失敗時: @conv.externalOutcomeDefaults.failure" }],
        }],
      }),
      catalog,
    );
    expect(issues).toHaveLength(0);
  });

  // ── 新カテゴリ: 不在キーは専用エラーコード (PR-A3) ──────────────────

  const makeGroupWithDesc = (desc: string) => makeGroup({
    actions: [{ id: "a1", name: "f", trigger: "click", steps: [{ id: "s1", type: "other", description: desc }] }],
  });

  it("@conv.currency.unknown は UNKNOWN_CONV_CURRENCY", () => {
    const issues = checkConventionReferences(makeGroupWithDesc("@conv.currency.unknown"), catalog);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("UNKNOWN_CONV_CURRENCY");
  });

  it("@conv.tax.unknown は UNKNOWN_CONV_TAX", () => {
    const issues = checkConventionReferences(makeGroupWithDesc("@conv.tax.unknown"), catalog);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("UNKNOWN_CONV_TAX");
  });

  it("@conv.auth.unknown は UNKNOWN_CONV_AUTH", () => {
    const issues = checkConventionReferences(makeGroupWithDesc("@conv.auth.unknown"), catalog);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("UNKNOWN_CONV_AUTH");
  });

  it("@conv.db.unknown は UNKNOWN_CONV_DB", () => {
    const issues = checkConventionReferences(makeGroupWithDesc("@conv.db.unknown"), catalog);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("UNKNOWN_CONV_DB");
  });

  it("@conv.numbering.unknown は UNKNOWN_CONV_NUMBERING", () => {
    const issues = checkConventionReferences(makeGroupWithDesc("@conv.numbering.unknown"), catalog);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("UNKNOWN_CONV_NUMBERING");
  });

  it("@conv.tx.unknown は UNKNOWN_CONV_TX", () => {
    const issues = checkConventionReferences(makeGroupWithDesc("@conv.tx.unknown"), catalog);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("UNKNOWN_CONV_TX");
  });

  it("@conv.externalOutcomeDefaults.unknown は UNKNOWN_CONV_EXTERNAL_OUTCOME_DEFAULTS", () => {
    const issues = checkConventionReferences(makeGroupWithDesc("@conv.externalOutcomeDefaults.unknown"), catalog);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("UNKNOWN_CONV_EXTERNAL_OUTCOME_DEFAULTS");
  });

  it("@conv.scope.unknown は UNKNOWN_CONV_SCOPE (inline catalog)", () => {
    const inlineCatalog: ConventionsCatalog = { version: "1.0.0", scope: { customerRegion: { value: "domestic" } } };
    const issues = checkConventionReferences(makeGroupWithDesc("@conv.scope.unknown"), inlineCatalog);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("UNKNOWN_CONV_SCOPE");
  });

  it("@conv.color.red は (未定義カテゴリ) UNKNOWN_CONV_CATEGORY", () => {
    const issues = checkConventionReferences(makeGroupWithDesc("@conv.color.red"), catalog);
    expect(issues.some((i) => i.code === "UNKNOWN_CONV_CATEGORY")).toBe(true);
  });

  it("catalog が null (未ロード) なら検査スキップ", () => {
    const issues = checkConventionReferences(
      makeGroup({
        actions: [{
          id: "a1", name: "f", trigger: "click",
          steps: [{
            id: "s1", type: "validation", description: "", conditions: "",
            rules: [{ field: "x", type: "required", message: "@conv.msg.anything" }],
          }],
        }],
      }),
      null,
    );
    expect(issues).toHaveLength(0);
  });
});

describe("checkConventionsCatalogIntegrity - RBAC", () => {
  it("有効な role / permission カタログは検証を通過する", () => {
    const catalog: ConventionsCatalog = {
      version: "1.0.0",
      permission: {
        "order.create": { resource: "Order", action: "create" },
        "order.read": { resource: "Order", action: "read", scope: "own" },
        "order.approve": { resource: "Order", action: "approve", scope: "department" },
      },
      role: {
        orderOperator: {
          name: "受注担当",
          permissions: ["order.create", "order.read"],
        },
        orderApprover: {
          name: "承認者",
          permissions: ["order.approve"],
          inherits: ["orderOperator"],
        },
      },
    };

    expect(checkConventionsCatalogIntegrity(catalog)).toHaveLength(0);
  });

  it("role.inherits の循環参照をエラーとして検出する", () => {
    const catalog: ConventionsCatalog = {
      version: "1.0.0",
      role: {
        roleA: { permissions: [], inherits: ["roleB"] },
        roleB: { permissions: [], inherits: ["roleA"] },
      },
    };

    const issues = checkConventionsCatalogIntegrity(catalog);
    expect(issues.some((issue) => issue.code === "ROLE_INHERITS_CYCLE")).toBe(true);
  });

  it("role.permissions の存在しない permission 参照をエラーとして検出する", () => {
    const catalog: ConventionsCatalog = {
      version: "1.0.0",
      permission: {
        "order.read": { resource: "Order", action: "read" },
      },
      role: {
        orderOperator: { permissions: ["order.read", "order.delete"] },
      },
    };

    const issues = checkConventionsCatalogIntegrity(catalog);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("UNKNOWN_CONV_ROLE_PERMISSION");
    expect(issues[0].path).toBe("role.orderOperator.permissions[1]");
  });
});

// ── checkScreenItemConventionReferences (#351) ────────────────────────────

describe("checkConventionsCatalogIntegrity - i18n", () => {
  it("valid i18n and msg.locales pass", () => {
    const catalog: ConventionsCatalog = {
      version: "1.0.0",
      i18n: {
        supportedLocales: ["ja-JP", "en-US"],
        defaultLocale: "ja-JP",
      },
      msg: {
        required: {
          template: "{label}は必須入力です",
          params: ["label"],
          locales: { "en-US": "{label} is required" },
        },
      },
    };

    expect(checkConventionsCatalogIntegrity(catalog)).toHaveLength(0);
  });

  it("defaultLocale outside supportedLocales is INVALID_DEFAULT_LOCALE", () => {
    const catalog: ConventionsCatalog = {
      version: "1.0.0",
      i18n: {
        supportedLocales: ["ja-JP"],
        defaultLocale: "en-US",
      },
    };

    const issues = checkConventionsCatalogIntegrity(catalog);
    expect(issues.some((issue) => issue.code === "INVALID_DEFAULT_LOCALE")).toBe(true);
  });

  it("msg.locales outside supportedLocales is UNKNOWN_MSG_LOCALE", () => {
    const catalog: ConventionsCatalog = {
      version: "1.0.0",
      i18n: {
        supportedLocales: ["ja-JP", "en-US"],
        defaultLocale: "ja-JP",
      },
      msg: {
        required: {
          template: "{label}は必須入力です",
          locales: { "fr-FR": "{label} est obligatoire" },
        },
      },
    };

    const issues = checkConventionsCatalogIntegrity(catalog);
    expect(issues.some((issue) => issue.code === "UNKNOWN_MSG_LOCALE")).toBe(true);
  });

  it("catalog without i18n block remains valid", () => {
    const catalog: ConventionsCatalog = {
      version: "1.0.0",
      msg: {
        required: {
          template: "{label}は必須入力です",
          locales: { "en-US": "{label} is required" },
        },
      },
    };

    expect(checkConventionsCatalogIntegrity(catalog)).toHaveLength(0);
  });

  it("msg entry without locales remains valid (downward compatibility)", () => {
    const catalog: ConventionsCatalog = {
      version: "1.0.0",
      i18n: {
        supportedLocales: ["ja-JP", "en-US"],
        defaultLocale: "ja-JP",
      },
      msg: {
        required: {
          template: "{label}は必須入力です",
          params: ["label"],
        },
      },
    };

    expect(checkConventionsCatalogIntegrity(catalog)).toHaveLength(0);
  });
});

function makeScreenItemsFile(partial: Partial<ScreenItemsFile>): ScreenItemsFile {
  return {
    screenId: "scr1",
    version: "0.1.0",
    updatedAt: "2026-01-01T00:00:00Z",
    items: [],
    ...partial,
  };
}

describe("checkScreenItemConventionReferences", () => {
  const catalog = loadCatalog();

  it("catalog が null なら空配列", () => {
    const file = makeScreenItemsFile({ items: [{ id: "email", label: "メール", type: "string", pattern: "@conv.regex.email-simple" }] });
    expect(checkScreenItemConventionReferences(file, null)).toHaveLength(0);
  });

  it("items が空なら空配列", () => {
    expect(checkScreenItemConventionReferences(makeScreenItemsFile({}), catalog)).toHaveLength(0);
  });

  it("pattern に実在する @conv.regex.* を書くとエラーなし", () => {
    const file = makeScreenItemsFile({
      items: [{ id: "phone", label: "電話", type: "string", pattern: "@conv.regex.phone-jp" }],
    });
    const issues = checkScreenItemConventionReferences(file, catalog);
    expect(issues).toHaveLength(0);
  });

  it("pattern に存在しない @conv.regex を書くと UNKNOWN_CONV_REGEX", () => {
    const file = makeScreenItemsFile({
      items: [{ id: "f", label: "F", type: "string", pattern: "@conv.regex.no-such-key" }],
    });
    const issues = checkScreenItemConventionReferences(file, catalog);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("UNKNOWN_CONV_REGEX");
    expect(issues[0].path).toBe("items[0].pattern");
  });

  it("errorMessages.required に存在しない @conv.msg を書くと UNKNOWN_CONV_MSG", () => {
    const file = makeScreenItemsFile({
      items: [{ id: "f", label: "F", type: "string", errorMessages: { required: "@conv.msg.no-such-msg" } }],
    });
    const issues = checkScreenItemConventionReferences(file, catalog);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("UNKNOWN_CONV_MSG");
    expect(issues[0].path).toBe("items[0].errorMessages.required");
  });

  it("pattern に @conv 参照なし (直接正規表現) はエラーなし", () => {
    const file = makeScreenItemsFile({
      items: [{ id: "f", label: "F", type: "string", pattern: "^[0-9]+$" }],
    });
    expect(checkScreenItemConventionReferences(file, catalog)).toHaveLength(0);
  });

  it("複数 items に問題があれば全件返す", () => {
    const file = makeScreenItemsFile({
      items: [
        { id: "f1", label: "F1", type: "string", pattern: "@conv.regex.bad1" },
        { id: "f2", label: "F2", type: "string", errorMessages: { maxLength: "@conv.msg.bad2" } },
      ],
    });
    const issues = checkScreenItemConventionReferences(file, catalog);
    expect(issues).toHaveLength(2);
    expect(issues[0].path).toBe("items[0].pattern");
    expect(issues[1].path).toBe("items[1].errorMessages.maxLength");
  });
});

describe("checkConventionReferences — サンプル (docs/sample-project/process-flows/*.json) 横断", () => {
  const catalog = loadCatalog();
  const files = readdirSync(samplesDir).filter((f) => f.endsWith(".json"));

  for (const f of files) {
    it(`${f} の @conv.* 参照が全て解決`, () => {
      const group = JSON.parse(readFileSync(join(samplesDir, f), "utf-8")) as ProcessFlow;
      const issues = checkConventionReferences(group, catalog);
      if (issues.length > 0) {
        throw new Error(
          `@conv.* 違反:\n${issues.map((i) => `  - ${i.path}: ${i.value} (${i.message})`).join("\n")}`,
        );
      }
      expect(issues).toHaveLength(0);
    });
  }
});
