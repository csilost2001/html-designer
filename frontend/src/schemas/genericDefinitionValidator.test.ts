/**
 * genericDefinitionValidator.test.ts — GenericDefinition AJV バリデーターのテスト (#1079)
 */

import { describe, it, expect } from "vitest";
import { validateGenericDefinition } from "./genericDefinitionValidator";
import type { GenericDefinition } from "../types/v3";

// 合法な data-contract
const validDataContract: GenericDefinition = {
  kind: "data-contract",
  name: "OrderForm",
  purpose: "注文フォームの入力データを保持するデータ契約",
  responsibilities: ["顧客の注文情報を受け取る", "バックエンドへ送信するデータ構造を定義する"],
  targets: ["backend", "frontend"],
  fields: [
    { name: "customerId", type: "string" },
    { name: "quantity", type: "integer" },
  ],
};

// 合法な exception-type
const validExceptionType: GenericDefinition = {
  kind: "exception-type",
  name: "UserNotFoundException",
  purpose: "指定されたユーザーが見つからない場合にスローされる例外",
  responsibilities: [
    "ユーザーID が存在しない場合のエラーを表現する",
    "上位層でのエラーハンドリングのための識別子を提供する",
  ],
  targets: ["backend"],
};

// 合法な domain-type
const validDomainType: GenericDefinition = {
  kind: "domain-type",
  name: "Order",
  purpose: "注文エンティティを表すドメイン型",
  responsibilities: ["注文の状態と明細を保持する"],
  targets: ["backend", "shared"],
  fields: [{ name: "orderId", type: "string" }, { name: "status", type: "string" }],
};

// 合法な component-definition (operations あり)
const validComponentDef: GenericDefinition = {
  kind: "component-definition",
  name: "OrderService",
  purpose: "注文に関するビジネスロジックを提供するサービス",
  responsibilities: ["注文の作成・更新・削除を担当する"],
  targets: ["backend"],
  operations: [
    { name: "createOrder" },
    { name: "cancelOrder" },
  ],
};

describe("validateGenericDefinition", () => {
  describe("合法な定義", () => {
    it("data-contract が正しければ issues は空", () => {
      const issues = validateGenericDefinition(validDataContract);
      expect(issues.filter((i) => i.severity === "error")).toHaveLength(0);
    });

    it("exception-type が正しければ issues は空", () => {
      const issues = validateGenericDefinition(validExceptionType);
      // responsibilities が十分長い場合は warning なし
      expect(issues).toHaveLength(0);
    });

    it("domain-type が正しければ issues は空", () => {
      const issues = validateGenericDefinition(validDomainType);
      expect(issues.filter((i) => i.severity === "error")).toHaveLength(0);
    });

    it("component-definition (operations あり) は error/warning なし", () => {
      const issues = validateGenericDefinition(validComponentDef);
      expect(issues).toHaveLength(0);
    });
  });

  describe("必須フィールド欠落", () => {
    it("purpose が欠落すると error", () => {
      const def = { ...validDataContract, purpose: "" } as GenericDefinition;
      // minLength: 1 違反
      const issues = validateGenericDefinition(def);
      const errors = issues.filter((i) => i.severity === "error");
      expect(errors.length).toBeGreaterThan(0);
    });

    it("responsibilities が空配列だと error (minItems 1)", () => {
      const def: GenericDefinition = { ...validDataContract, responsibilities: [] };
      const issues = validateGenericDefinition(def);
      const errors = issues.filter((i) => i.severity === "error");
      expect(errors.length).toBeGreaterThan(0);
    });

    it("targets が空配列だと error (minItems 1)", () => {
      const def: GenericDefinition = { ...validDataContract, targets: [] };
      const issues = validateGenericDefinition(def);
      const errors = issues.filter((i) => i.severity === "error");
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe("name パターン違反", () => {
    it("name が数字始まりだと error", () => {
      const def: GenericDefinition = { ...validDataContract, name: "123Invalid" };
      const issues = validateGenericDefinition(def);
      const errors = issues.filter((i) => i.severity === "error");
      expect(errors.length).toBeGreaterThan(0);
    });

    it("name にスペースを含むと error", () => {
      const def: GenericDefinition = { ...validDataContract, name: "Order Form" };
      const issues = validateGenericDefinition(def);
      const errors = issues.filter((i) => i.severity === "error");
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe("targets の制約", () => {
    it("targets が重複すると error (uniqueItems)", () => {
      const def: GenericDefinition = {
        ...validDataContract,
        // 型として許容しているので as any で渡す (schema 側で uniqueItems を検証)
        targets: ["backend", "backend"] as GenericDefinition["targets"],
      };
      const issues = validateGenericDefinition(def);
      const errors = issues.filter((i) => i.severity === "error");
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe("data-contract semantic warning", () => {
    it("fields が空配列の場合 warning が 1 件", () => {
      const def: GenericDefinition = { ...validDataContract, fields: [] };
      const issues = validateGenericDefinition(def);
      const warnings = issues.filter((i) => i.severity === "warning");
      expect(warnings).toHaveLength(1);
      expect(warnings[0].path).toBe("fields");
    });

    it("fields がない場合も warning が 1 件", () => {
      const { fields: _fields, ...rest } = validDataContract;
      const def: GenericDefinition = rest as GenericDefinition;
      const issues = validateGenericDefinition(def);
      const warnings = issues.filter((i) => i.severity === "warning");
      expect(warnings).toHaveLength(1);
      expect(warnings[0].path).toBe("fields");
    });
  });

  describe("exception-type semantic warning", () => {
    it("responsibilities が全て 10 文字未満だと warning が 1 件", () => {
      const def: GenericDefinition = {
        ...validExceptionType,
        responsibilities: ["短い", "短い2"],
      };
      const issues = validateGenericDefinition(def);
      const warnings = issues.filter((i) => i.severity === "warning");
      expect(warnings).toHaveLength(1);
      expect(warnings[0].path).toBe("responsibilities");
    });

    it("responsibilities の一部が 10 文字以上あれば warning なし", () => {
      const def: GenericDefinition = {
        ...validExceptionType,
        responsibilities: ["短い", "ユーザーID が存在しない場合のエラーを表現する"],
      };
      const issues = validateGenericDefinition(def);
      const warnings = issues.filter((i) => i.severity === "warning");
      expect(warnings).toHaveLength(0);
    });
  });

  describe("component-definition semantic warning", () => {
    it("operations が空の場合 warning が 1 件", () => {
      const def: GenericDefinition = { ...validComponentDef, operations: [] };
      const issues = validateGenericDefinition(def);
      const warnings = issues.filter((i) => i.severity === "warning");
      expect(warnings).toHaveLength(1);
      expect(warnings[0].path).toBe("operations");
    });

    it("operations がない場合も warning が 1 件", () => {
      const { operations: _ops, ...rest } = validComponentDef;
      const def: GenericDefinition = rest as GenericDefinition;
      const issues = validateGenericDefinition(def);
      const warnings = issues.filter((i) => i.severity === "warning");
      expect(warnings).toHaveLength(1);
      expect(warnings[0].path).toBe("operations");
    });
  });

  describe("kind dispatch", () => {
    it("kind が enum 外の値なら error として検出", () => {
      const def = {
        ...validDataContract,
        kind: "invalid-kind",
      } as unknown as GenericDefinition;
      const issues = validateGenericDefinition(def);
      // 親 schema の enum で引っかかる
      const errors = issues.filter((i) => i.severity === "error");
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
