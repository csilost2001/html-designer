/**
 * v3 Project 型定義 (`schemas/v3/project.v3.schema.json` と 1:1 対応)
 *
 * 参考: schemas/v3/project.v3.schema.json
 */

import type {
  Authoring,
  DisplayName,
  EntityMeta,
  ExtensionApplied,
  LocalId,
  Maturity,
  Mode,
  PhysicalName,
  ProcessFlowId,
  ProjectId,
  ScreenGroupId,
  ScreenId,
  SequenceId,
  TableId,
  Timestamp,
  Uuid,
  ViewId,
} from "./common";
import type { ViewDefinitionId } from "./view-definition";

/** entities.* 配列要素の共通プロパティ。一覧 UI 表示用最小メタ。 */
export interface EntryBase {
  id: Uuid;
  /** 物理順 (1..N)。一覧の並び替え永続化に使用。 */
  no: number;
  name: DisplayName;
  updatedAt: Timestamp;
  maturity?: Maturity;
}

export interface ScreenEntry extends EntryBase {
  id: ScreenId;
  /** ScreenKind 文字列 (login/dashboard/list/detail/form 等)。 */
  kind?: string;
  path?: string;
  groupId?: ScreenGroupId;
  hasDesign?: boolean;
}

export interface TableEntry extends EntryBase {
  id: TableId;
  physicalName?: PhysicalName;
  category?: string;
  columnCount?: number;
}

export interface ProcessFlowEntry extends EntryBase {
  id: ProcessFlowId;
  /** ProcessFlowKind (screen/batch/scheduled/system/common/other 等)。 */
  kind?: string;
  /** screen kind の場合の関連画面 ID。 */
  screenId?: ScreenId;
  actionCount?: number;
  notesCount?: number;
}

export interface ViewEntry extends EntryBase {
  id: ViewId;
  physicalName?: PhysicalName;
}

/** ViewDefinition (画面 一覧 UI viewer) entry。schemas/v3/view-definition.v3.schema.json と対応。 */
export interface ViewDefinitionEntry extends EntryBase {
  id: ViewDefinitionId;
  /** ViewDefinitionKind (list / detail / kanban / calendar、または `retail:storefront` 等の拡張参照)。 */
  kind?: string;
  /** ベースとなる source table の Uuid (一覧 UI 表示用)。 */
  sourceTableId?: TableId;
  columnCount?: number;
}

export interface SequenceEntry extends EntryBase {
  id: SequenceId;
  physicalName?: PhysicalName;
  /** `@conv.numbering.<key>` 形式の参照。 */
  conventionRef?: string;
}

export interface ScreenGroupEntry {
  id: ScreenGroupId;
  name: DisplayName;
  /** UI 表示色 (`#RRGGBB`)。 */
  color?: string;
}

/** 画面間の遷移定義。UI 座標は screen-layout に分離。 */
export interface ScreenTransitionEntry {
  id: LocalId;
  sourceScreenId: ScreenId;
  targetScreenId: ScreenId;
  label?: DisplayName;
  trigger: "click" | "submit" | "select" | "cancel" | "auto" | "back" | "other";
  /**
   * 遷移種別 (#744)。
   * - `"navigation"` (default) — 純 UI 遷移、ScreenTransitionStep 不要。
   * - `"flow-driven"` — 処理を伴う遷移、対応する ScreenTransitionStep が必要。
   */
  kind?: "navigation" | "flow-driven";
}

/** プロジェクトが保持する各 entity への参照一覧。 */
export interface ProjectEntities {
  screens?: ScreenEntry[];
  tables?: TableEntry[];
  processFlows?: ProcessFlowEntry[];
  views?: ViewEntry[];
  viewDefinitions?: ViewDefinitionEntry[];
  sequences?: SequenceEntry[];
  screenGroups?: ScreenGroupEntry[];
  screenTransitions?: ScreenTransitionEntry[];
}

/** プロジェクト identity と運用設定。 */
export interface ProjectMeta extends EntityMeta {
  id: ProjectId;
  /** プロジェクト全体の上流/下流モード。 */
  mode?: Mode;
}

/** 業務システム 1 案件の root 定義。`data/project.json` に対応。 */
export interface Project {
  $schema?: string;
  /** 本プロジェクトが使う schema バージョン。 */
  schemaVersion: "v3";
  meta: ProjectMeta;
  /**
   * 本プロジェクトが適用する拡張 namespace 一覧 (version 制約付き)。
   * 例: `[{ namespace: 'retail', version: '>=2.0.0' }]`
   */
  extensionsApplied?: ExtensionApplied[];
  entities?: ProjectEntities;
  /** プロジェクト全体の authoring 情報 (entity 横断で共有される ADR や用語集)。 */
  authoring?: Authoring;
}
