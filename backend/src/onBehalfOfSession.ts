/**
 * AI が人間セッションに代わって操作する際の owner/actor 解決ロジック (#690)。
 *
 * - onBehalfOfSession が省略された場合: caller が owner かつ actor (通常操作)
 * - onBehalfOfSession が指定された場合: 指定セッションが owner、caller が actor (AI 委任操作)
 *   - 指定セッションがアクティブでない場合は INVALID_ON_BEHALF_OF_SESSION エラー
 */

export interface OnBehalfOfResult {
  owner: string;
  actor: string;
  isDelegated: boolean;
}

/**
 * onBehalfOfSession パラメータを解決し、owner/actor を返す。
 *
 * @param callerSessionId - 呼び出し元のセッション ID (MCP tool caller)
 * @param onBehalfOfSession - 人間セッションの ID (省略可)
 * @param isActiveSession - セッションがアクティブか判定する関数
 * @throws Error INVALID_ON_BEHALF_OF_SESSION: セッションが存在しないまたは切断済み
 */
export function resolveOnBehalfOfSession(
  callerSessionId: string,
  onBehalfOfSession: string | undefined,
  isActiveSession: (id: string) => boolean,
): OnBehalfOfResult {
  if (!onBehalfOfSession) {
    return { owner: callerSessionId, actor: callerSessionId, isDelegated: false };
  }
  if (!isActiveSession(onBehalfOfSession)) {
    throw new Error(`INVALID_ON_BEHALF_OF_SESSION: ${onBehalfOfSession}`);
  }
  return { owner: onBehalfOfSession, actor: callerSessionId, isDelegated: true };
}

/**
 * AI onBehalfOfSession の actor を fromSessionId から toSessionId に引き継ぐ。
 * docs/spec/collab-presence.md § 10 (option A: AI actor 引継ぎ) に準拠。
 *
 * 現状の実装: AI session-borrow registry が未整備のため最小実装 (no-op + ログ)。
 * 実際の borrow 関係追跡は follow-up ISSUE として別途対応予定。
 *
 * option A: 同じ AI が新 owner (toSessionId) として動き続ける。
 * AI 側の actor の sessionId が分からない場合は no-op。
 */
export function reassignOnBehalfOf(
  fromSessionId: string,
  toSessionId: string,
): void {
  // NOTE: 現状 AI session-borrow registry が存在しないため no-op。
  // onBehalfOfSession の borrow 関係 (AI actor → human owner) を
  // in-memory で管理する registry を追加した際にここに実装を入れる。
  // follow-up: AI session borrow tracking を別 ISSUE 化
  console.error(
    `[onBehalfOfSession] reassignOnBehalfOf: from=${fromSessionId} to=${toSessionId} ` +
    `(no-op: AI session-borrow registry 未整備 — follow-up ISSUE で対応)`,
  );
}

/**
 * 委任操作の監査ログを出力する。isDelegated が false の場合は何もしない。
 */
export function logAuditIfDelegated(
  toolName: string,
  result: OnBehalfOfResult,
  resourceType: string,
  resourceId: string,
): void {
  if (result.isDelegated) {
    console.error(
      `[audit] tool=${toolName} owner=${result.owner} actor=${result.actor} resource=${resourceType}:${resourceId}`,
    );
  }
}
