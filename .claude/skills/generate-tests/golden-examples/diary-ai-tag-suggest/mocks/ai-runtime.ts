/**
 * AI runtime service mock helper (provider 中立形式)
 *
 * Phase 2-B: ProcessFlow.aiCall / aiAgent step に対応する runtime invocation を mock する。
 * 戻り値は spec §「outputBinding の値構造」に従う正規化形式 (provider 別の content[] / choices[] は隠蔽)。
 *
 * PLACEHOLDER (Phase 2-C で確定):
 *   AiRuntimeService クラス / 'invoke' method / '<placeholder>' import パス
 *
 * 旧 mocks/claude-api.ts (Anthropic 形式 HTTP レスポンス mock) は Phase 2-A / 2-B 移行で廃止。
 *
 * @example
 *   const spy = mockAiStructured(aiRuntime, { tags: [{ slug, name, confidence }] });
 *   // テスト実行
 *   spy.mockRestore(); // afterEach で必ず呼ぶ
 */
// PLACEHOLDER: Phase 2-C で実 import パスへ差替え
// import type { AiRuntimeService } from '<placeholder>';
type AiRuntimeService = unknown;

// ──────────────────────────────────────────────────────────────
// 型定義
// ──────────────────────────────────────────────────────────────

/**
 * spec §「outputBinding の値構造」に対応する正規化レスポンス型。
 * responseFormat.kind 別に使用フィールドが変わる:
 *   text       → text のみ
 *   json       → object + raw
 *   structuredObject → object (responseFormat.schema 準拠) + raw
 *   streaming  → text (本層では完了後 assembled のみ扱う)
 *   tools 使用時は toolCalls を併用
 */
export interface AiInvocationResult {
  text?: string;
  object?: unknown;
  raw?: string;
  finishReason?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  toolCalls?: Array<{ id: string; name: string; arguments: unknown }>;
}

/**
 * diary タグ提案 (a9b0c1d2) の structuredObject schema 対応型。
 * aiCall.responseFormat.schema (TagSuggestResult) に準拠。
 */
export interface MockTagCandidate {
  slug: string;
  name: string;
  confidence: number;
}

export interface MockTagSuggestResult {
  tags: MockTagCandidate[];
}

// ──────────────────────────────────────────────────────────────
// mock 生成ヘルパー (responseFormat 別)
// ──────────────────────────────────────────────────────────────

/**
 * (a) text format: aiCall.responseFormat={kind:"text"} (default) / streaming の正常応答
 */
export function mockAiText(
  svc: AiRuntimeService,
  text: string,
): jest.SpyInstance {
  const result: AiInvocationResult = {
    text,
    finishReason: 'end_turn',
    usage: { inputTokens: 50, outputTokens: 100 },
  };
  // PLACEHOLDER: 'invoke' は Phase 2-C で確定する method 名
  return jest.spyOn(svc as any, 'invoke').mockResolvedValue(result);
}

/**
 * (b) structuredObject format: aiCall.responseFormat={kind:"structuredObject", schema:...} の正常応答。
 *     object は responseFormat.schema 準拠で書くこと (テスト fixture 側で schema 準拠を保証)。
 *
 * @example
 *   mockAiStructured(aiRuntime, {
 *     tags: [{ slug: 'cooking', name: '料理', confidence: 0.9 }],
 *   } as MockTagSuggestResult);
 */
export function mockAiStructured(
  svc: AiRuntimeService,
  object: unknown,
): jest.SpyInstance {
  const result: AiInvocationResult = {
    object,
    raw: JSON.stringify(object),
    finishReason: 'end_turn',
    usage: { inputTokens: 50, outputTokens: 100 },
  };
  return jest.spyOn(svc as any, 'invoke').mockResolvedValue(result);
}

/**
 * (c) json format: aiCall.responseFormat={kind:"json"} の正常応答 (schema 制約なし)。
 *     構造は structuredObject と同形だが、AI-3 (format violation) の文脈で使い分ける。
 */
export function mockAiJson(
  svc: AiRuntimeService,
  object: unknown,
): jest.SpyInstance {
  return mockAiStructured(svc, object);
}

/**
 * (d) streaming format: 完了後の assembled text を返す (partial chunks は本層で扱わない)。
 */
export function mockAiStreaming(
  svc: AiRuntimeService,
  text: string,
): jest.SpyInstance {
  return mockAiText(svc, text);
}

/**
 * (e) provider 呼び出し失敗 (AI-4 / outcomes.failure)。
 *     mock が reject → runtime が outcomes.failure.action="abort" の path で responseId を返す想定。
 */
export function mockAiFailure(
  svc: AiRuntimeService,
  error?: Error,
): jest.SpyInstance {
  return jest
    .spyOn(svc as any, 'invoke')
    .mockRejectedValue(error ?? new Error('Mock provider error'));
}

/**
 * (f) format violation (AI-3、json / structuredObject のみ)。
 *     runtime が parse / schema 検証で失敗するケース。runtime 側で catch → 502 を返す前提。
 */
export function mockAiFormatViolation(
  svc: AiRuntimeService,
): jest.SpyInstance {
  return jest
    .spyOn(svc as any, 'invoke')
    .mockRejectedValue(
      new Error('Mock provider returned response that violates declared responseFormat'),
    );
}

/**
 * (g) tool call helper (aiCall + tools / aiAgent)。
 *     最終 assistant message に toolCalls を含む想定。aiAgent の途中 tool 呼び出しは
 *     runtime が内部処理するため、mock 対象は最終結果のみ。
 */
export function mockAiWithToolCalls(
  svc: AiRuntimeService,
  text: string,
  toolCalls: Array<{ id: string; name: string; arguments: unknown }>,
): jest.SpyInstance {
  const result: AiInvocationResult = {
    text,
    toolCalls,
    finishReason: 'tool_use',
    usage: { inputTokens: 50, outputTokens: 100 },
  };
  return jest.spyOn(svc as any, 'invoke').mockResolvedValue(result);
}
