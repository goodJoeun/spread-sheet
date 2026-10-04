import Anthropic from "@anthropic-ai/sdk";
import type { ClaudeSetup } from "./claude";
import { createMockAnthropicFetch } from "./mock-anthropic";

/**
 * 환경 변수로 Claude 연결을 정한다(서버에서만 읽는다).
 *   ANTHROPIC_API_KEY  있으면 실제 API, 없으면 가짜 API(같은 SDK 경로)
 *   ANTHROPIC_MODEL    기본 claude-opus-5-5
 *   ANTHROPIC_EFFORT   low | medium | high, 기본 low (빨리 답하도록)
 *   AI_MOCK=1          키가 있어도 가짜로 돌린다
 *   AI_MOCK_DELAY_SCALE 가짜 응답의 지연 배율(테스트에서 0)
 */

const DEFAULT_MODEL = "claude-opus-5-5";
const EFFORTS = ["low", "medium", "high"] as const;

let cached: ClaudeSetup | null = null;

export function getClaudeSetup(): ClaudeSetup {
  if (cached) return cached;

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
  const effortEnv = process.env.ANTHROPIC_EFFORT?.trim();
  const effort = EFFORTS.find((e) => e === effortEnv) ?? "low";
  const mock = !apiKey || process.env.AI_MOCK === "1";

  const client = new Anthropic({
    apiKey: mock ? "mock-key" : apiKey,
    // 429·5xx·연결 오류는 SDK가 두 번까지 다시 시도한다(실제 API일 때).
    maxRetries: 2,
    // 응답 헤더가 60초 안에 오지 않으면 끊는다. 화면은 5초부터 "응답 지연"을 알린다.
    timeout: 60_000,
    ...(mock
      ? {
          fetch: createMockAnthropicFetch({
            delayScale: Number(process.env.AI_MOCK_DELAY_SCALE ?? 1),
          }),
        }
      : {}),
  });

  cached = { client, model, effort, provider: mock ? "mock" : "anthropic" };
  return cached;
}
