/**
 * screenRefValidation.ts — Screen entity の cross-resource ref 整合性検証 (#1090 Phase 2)
 *
 * Screen.fragments[].fragmentRef が Generic Definition Catalog の ui-fragment に
 * 存在するか検証する。AJV pattern (`generic-definitions/ui-fragment/<Name>` 形式)
 * は schema layer で gate 済みだが、`<Name>` 部の実在検証は AJV では行えない。
 *
 * 設計方針:
 * - ProcessFlow 側の `referentialIntegrity.ts` (#1090 Phase 1) と同じ責務分離パターン
 * - Puck data 検証 (`puckScreenValidation.ts`) とは別ファイル / 別関数 (editor-agnostic)
 * - severity は既存 referentialIntegrity 慣行に合わせて warning 統一
 *
 * 仕様: docs/spec/generic-definition-layer.md §3.6
 */

import type { Screen } from "../types/v3/screen";

/**
 * Screen 検証で参照する Generic Definition Catalog の name set (#1090 Phase 2)。
 * undefined の場合は silent pass (catalog ロード失敗時の互換性維持)。
 */
export interface ScreenGenericDefinitionNames {
  "ui-fragment"?: Set<string>;
}

export interface ScreenRefIssue {
  severity: "error" | "warning";
  message: string;
  /** ドットパス (例: "fragments[0].fragmentRef") */
  field: string;
  /** 識別子 */
  code: "UNKNOWN_FRAGMENT_REF";
}

/**
 * `generic-definitions/ui-fragment/<Name>` 形式の参照から <Name> を抽出する。
 * AJV pattern gate で形式は担保される前提だが、防御的に regex 一致を確認する。
 * 形式不一致の場合は null (= AJV 側で error 報告される領域なので本検証は skip)。
 */
function extractUiFragmentName(ref: string): string | null {
  const m = ref.match(/^generic-definitions\/ui-fragment\/([A-Za-z][A-Za-z0-9_]*)$/);
  return m ? m[1] : null;
}

/**
 * Screen 単体の cross-resource ref 整合性を検証する。
 * Phase 2 では fragments[].fragmentRef のみ対象。将来的に他 ref 種別が増えたら同関数を拡張。
 */
export function validateScreenRefs(
  screen: Screen,
  options?: { genericDefinitionNames?: ScreenGenericDefinitionNames },
): ScreenRefIssue[] {
  const issues: ScreenRefIssue[] = [];
  const fragmentNames = options?.genericDefinitionNames?.["ui-fragment"];

  // genericDefinitionNames["ui-fragment"] 未指定 → silent pass (catalog ロード失敗等)
  if (!fragmentNames) return issues;

  const fragments = screen.fragments ?? [];
  fragments.forEach((f, i) => {
    const ref = f?.fragmentRef;
    if (!ref) return; // schema 側で required 担保
    const name = extractUiFragmentName(ref);
    if (name && !fragmentNames.has(name)) {
      issues.push({
        severity: "warning",
        message: `screen.fragments[${i}].fragmentRef "${ref}" の <Name> が generic-definitions/ui-fragment catalog に存在しません`,
        field: `fragments[${i}].fragmentRef`,
        code: "UNKNOWN_FRAGMENT_REF",
      });
    }
  });

  return issues;
}
