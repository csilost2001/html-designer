/**
 * v3 Screen 型定義 (`schemas/v3/screen.v3.schema.json` と 1:1 対応)
 *
 * - 業務情報のみを保持、UI 座標は `screen-layout.ts` に分離
 * - GrapesJS の生 HTML データは本型の対象外
 *
 * 参考: schemas/v3/screen.v3.schema.json
 */

import type { Authoring, EntityMeta, ScreenGroupId } from "./common";
import type { ScreenItem } from "./screen-item";
import type { ViewDefinitionId } from "./view-definition";

/** 組み込み画面種別 (12 種)。 */
export type BuiltinScreenKind =
  | "login"
  | "dashboard"
  | "list"
  | "detail"
  | "form"
  | "search"
  | "confirm"
  | "complete"
  | "error"
  | "modal"
  | "wizard"
  | "other";

/**
 * 画面種別。組み込み + 拡張参照 (`namespace:kindName`)。
 * 例: `retail:storefront`
 */
export type ScreenKind = BuiltinScreenKind | string;

/**
 * 画面デザイン (GrapesJS) の参照情報。
 * 生 HTML/CSS/component tree は別ファイル (`data/screens/<id>.design.json`) で管理し、
 * 本型は参照のみ持つ。
 */
export interface ScreenDesign {
  /** デザインファイルへの相対パス (例: `design.json`)。 */
  designFileRef?: string;
  /** サムネイル画像への相対パス または data URL。 */
  thumbnailRef?: string;
}

/** Screen entity 本体。EntityMeta + 業務情報 + 画面項目集合 + authoring。 */
export interface Screen extends EntityMeta {
  $schema?: string;
  kind: ScreenKind;
  /** URL ルーティングパス。例: `/customers`, `/customers/:id`, `/orders/new` */
  path: string;
  /** 認証要件。未指定は required 相当。 */
  auth?: "required" | "optional" | "none";
  /** 所属画面グループ ID。 */
  groupId?: ScreenGroupId;
  /** 画面項目定義一覧 (フォーム要素・表示要素)。 */
  items?: ScreenItem[];
  /** 本画面表示に必要な permission キー (`@conv.permission.<key>`)。 */
  permissions?: string[];
  /** 画面デザイン (GrapesJS 生 HTML への参照)。 */
  design?: ScreenDesign;
  /** 本画面が参照する ViewDefinition ID 一覧 (1:N)。 */
  viewDefinitionRefs?: ViewDefinitionId[];
  authoring?: Authoring;
}
