import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { AI_MODELS, type AiModelId, type AiModelOption } from "../protocol";
import type { ClaudeSetup } from "./claude";
import { createMockAnthropicFetch } from "./mock-anthropic";

/** 환경 변수는 .env.example 참고. API 키가 없거나 AI_MOCK=1이면, 같은 SDK 경로로 가짜 API를 씀. */

const DEFAULT_MODEL: AiModelId = "claude-opus-5-5";
const EFFORTS = ["low", "medium", "high"] as const;

/** 실제 API일 때 429·5xx·연결 오류를 SDK가 다시 시도하는 횟수 */
const MAX_RETRIES = 2;
/**
 * 응답 헤더를 기다리는 시간. 넘기면 끊음.
 * 화면의 "응답 지연" 안내와 시간 초과는 브라우저가 따로 정함(ai-controller.ts의 SLOW_AFTER_MS·IDLE_TIMEOUT_MS).
 */
const RESPONSE_TIMEOUT_MS = 60_000;

let cached: ClaudeSetup | null = null;

export function getClaudeSetup(): ClaudeSetup {
  if (cached) return cached;

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const defaultModel = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
  const effortEnv = process.env.ANTHROPIC_EFFORT?.trim();
  const effort = EFFORTS.find((e) => e === effortEnv) ?? "low";
  const mock = !apiKey || process.env.AI_MOCK === "1";

  const client = new Anthropic({
    apiKey: mock ? "mock-key" : apiKey,
    maxRetries: MAX_RETRIES,
    timeout: RESPONSE_TIMEOUT_MS,
    ...(mock
      ? {
          fetch: createMockAnthropicFetch({
            delayScale: Number(process.env.AI_MOCK_DELAY_SCALE ?? 1),
          }),
        }
      : {}),
  });

  cached = {
    client,
    defaultModel,
    models: offeredModels(defaultModel),
    effort,
    provider: mock ? "mock" : "anthropic",
  };
  return cached;
}

function offeredModels(defaultModel: string): AiModelOption[] {
  if (AI_MODELS.some((m) => m.id === defaultModel)) return [...AI_MODELS];
  return [{ id: defaultModel, label: defaultModel }, ...AI_MODELS];
}
