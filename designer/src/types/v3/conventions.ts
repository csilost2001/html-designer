/**
 * v3 Conventions 型定義 (`schemas/v3/conventions.v3.schema.json` と 1:1 対応)
 *
 * - 標準 14 カテゴリ + 拡張 (extensions.v3 の conventionCategories で追加)
 * - `@conv.<category>.<key>` で参照される
 * - 各 entry の詳細プロパティは schema に従い、必要箇所で型を tighten 可能
 *
 * 参考: schemas/v3/conventions.v3.schema.json
 */

import type { Description, SemVer, Timestamp } from "./common";

/** メッセージテンプレート 1 件 (`@conv.msg.<key>`)。 */
export interface MessageTemplate {
  default: string;
  /** 多言語訳 (キー: ja-JP / en-US 等)。 */
  translations?: Record<string, string>;
  description?: Description;
  /** 例: `{count}` 等のプレースホルダ名一覧。 */
  placeholders?: string[];
}

/** 正規表現 1 件 (`@conv.regex.<key>`)。 */
export interface RegexEntry {
  pattern: string;
  description?: Description;
  flags?: string;
}

/** 境界値 1 件 (`@conv.limit.<key>`)。 */
export interface LimitEntry {
  /** 制限値 (数値、unit に応じて意味が変わる)。 */
  value: number;
  unit: "characters" | "bytes" | "items" | "yen" | "percent" | "ratio" | "integer" | string;
  description?: Description;
}

/** I18n 設定。 */
export interface I18nConfig {
  defaultLocale: string;
  supportedLocales?: string[];
  fallbackLocale?: string;
}

/** スコープ / 通貨 / 税率 / 認証 / 役割 / 権限 / DB / 採番 / TX / 外部 outcome の各カテゴリは `Record<string, unknown>` で粗く受ける。 */
export type GenericConventionCategory = Record<string, Record<string, unknown>>;

/** Conventions root。 */
export interface Conventions {
  $schema?: string;
  version: SemVer;
  description?: Description;
  updatedAt?: Timestamp;
  i18n?: I18nConfig;
  msg?: Record<string, MessageTemplate>;
  regex?: Record<string, RegexEntry>;
  limit?: Record<string, LimitEntry>;
  scope?: GenericConventionCategory[string];
  currency?: GenericConventionCategory[string];
  tax?: GenericConventionCategory[string];
  auth?: GenericConventionCategory[string];
  role?: GenericConventionCategory[string];
  permission?: GenericConventionCategory[string];
  db?: GenericConventionCategory[string];
  numbering?: GenericConventionCategory[string];
  tx?: GenericConventionCategory[string];
  externalOutcomeDefaults?: GenericConventionCategory[string];
  /** 拡張カテゴリ (extensions.v3 の conventionCategories で定義)。 */
  extensionCategories?: Record<string, GenericConventionCategory[string]>;
}
