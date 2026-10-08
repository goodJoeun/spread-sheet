import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import {
  aiError,
  type AiEditRequest,
  type AiErrorInfo,
  type AiModelId,
  type AiModelOption,
  type AiStreamEvent,
} from "../protocol";
import { createEditStreamParser } from "./edit-stream-parser";
import { EDIT_TOOL, EDIT_TOOL_NAME, SYSTEM_PROMPT, buildMessages } from "./prompt";

/** 실제 API와 가짜 fetch가 같은 SDK 경로를 지남. 그래서 가짜로 검증한 코드가 실제 모델에서도 그대로 동작함. */

export interface ClaudeSetup {
  client: Anthropic;
  defaultModel: string;
  /** 이 목록에 없는 모델로 온 요청은 받지 않음 */
  models: AiModelOption[];
  effort: "low" | "medium" | "high";
  provider: "anthropic" | "mock";
}

/** 스트림을 시작하기 전에 실패한 경우. 라우트가 HTTP 오류로 바꿔 돌려줌. */
export class AiProviderError extends Error {
  constructor(readonly info: AiErrorInfo) {
    super(`AI provider failed: ${info.reason ?? info.code}`);
  }
}

/** SDK가 이 타입을 내보내지 않아 stream()에서 꺼낸다. */
type StreamParams = Parameters<Anthropic["beta"]["messages"]["stream"]>[0];

/** 응답 길이 상한. 셀 하나에 20~30토큰이라 1,000셀 안팎을 한 번에 제안할 수 있다. */
const MAX_TOKENS = 32000;

/**
 * 지원하지 않는 옵션을 보내면 400이 나므로 모르는 모델에는 둘 다 쓰지 않는다.
 * fallbacks: 안전 분류기가 거절하면 서버가 다른 모델로 이어서 처리한다.
 */
interface ModelFeatures {
  effort: boolean;
  fallbacks: boolean;
}

/** 고를 수 있는 모델(AI_MODELS)은 모두 여기 있어야 한다. */
const OFFERED_MODEL_FEATURES: Record<AiModelId, ModelFeatures> = {
  "claude-opus-5-5": { effort: true, fallbacks: true },
  "claude-sonnet-5-5": { effort: true, fallbacks: true },
  "claude-haiku-4-5": { effort: false, fallbacks: false },
};

/** 목록에는 없지만 ANTHROPIC_MODEL로 기본 모델에 지정할 수 있는 모델 */
const OTHER_MODEL_FEATURES: Record<string, ModelFeatures> = {
  "claude-opus-5": { effort: true, fallbacks: true },
  "claude-fable-5-1": { effort: true, fallbacks: true },
};

const MODEL_FEATURES: Record<string, ModelFeatures> = {
  ...OTHER_MODEL_FEATURES,
  ...OFFERED_MODEL_FEATURES,
};

export function buildParams(
  setup: { model: string; effort: ClaudeSetup["effort"] },
  request: AiEditRequest,
): StreamParams {
  const features = MODEL_FEATURES[setup.model] ?? { effort: false, fallbacks: false };
  return {
    model: setup.model,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    tools: [EDIT_TOOL],
    messages: buildMessages(request),
    ...(features.effort ? { output_config: { effort: setup.effort } } : {}),
    ...(features.fallbacks
      ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
      : {}),
  };
}

export async function* streamClaudeEdits(
  setup: ClaudeSetup,
  request: AiEditRequest,
  signal: AbortSignal,
): AsyncGenerator<AiStreamEvent> {
  const model = request.model ?? setup.defaultModel;
  const stream = setup.client.beta.messages.stream(
    buildParams({ model, effort: setup.effort }, request),
    { signal },
  );

  let started = false;
  let toolBlock: number | null = null;
  let parser = createEditStreamParser();
  let invalid = 0;

  try {
    for await (const event of stream) {
      switch (event.type) {
        case "message_start":
          started = true;
          yield { type: "meta", provider: setup.provider, model: event.message.model };
          break;
        case "content_block_start":
          // 거절 후 대체 모델이 이어 쓰면 도구 호출이 새 블록으로 다시 시작될 수 있다.
          if (
            event.content_block.type === "tool_use" &&
            event.content_block.name === EDIT_TOOL_NAME
          ) {
            toolBlock = event.index;
            parser = createEditStreamParser();
          }
          break;
        case "content_block_delta":
          if (event.delta.type === "text_delta") {
            yield { type: "text", delta: event.delta.text };
          } else if (event.delta.type === "input_json_delta" && event.index === toolBlock) {
            const parsed = parser.push(event.delta.partial_json);
            invalid += parsed.invalid;
            for (const edit of parsed.edits) yield { type: "edit", ...edit };
          }
          break;
      }
    }

    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") {
      yield { type: "error", error: aiError("refused") };
      return;
    }
    if (message.stop_reason === "max_tokens") {
      yield { type: "warning", warning: { code: "truncated" } };
    }
    if (invalid > 0) {
      yield { type: "warning", warning: { code: "invalid_edits", count: invalid } };
    }
    yield { type: "done" };
  } catch (error) {
    if (error instanceof Anthropic.APIUserAbortError || signal.aborted) return;
    if (!(error instanceof Anthropic.APIError)) {
      // 도구 입력 JSON을 끝내 해석하지 못한 경우(SDK가 블록이 닫힐 때 던진다).
      // 그 전까지 완성된 제안은 이미 보냈으므로 경고와 함께 마친다.
      if (started) {
        yield { type: "warning", warning: { code: "unparsable" } };
        yield { type: "done" };
        return;
      }
      console.error("[ai] unexpected error before stream start", error);
      throw new AiProviderError(aiError("unknown"));
    }
    const info = toAiError(error);
    if (info.code === "bad_request" || info.code === "unknown") {
      console.error("[ai] Claude API error", error.status, error.message);
    }
    if (!started) throw new AiProviderError(info);
    yield { type: "error", error: info };
  }
}

interface ErrorBody {
  error?: { type?: string; message?: string; details?: { error_code?: string } };
}

/** 하위 클래스가 먼저 걸리도록 구체적인 오류부터 확인한다. */
export function toAiError(error: InstanceType<typeof Anthropic.APIError>): AiErrorInfo {
  if (error instanceof Anthropic.APIConnectionTimeoutError) return aiError("timeout");
  if (error instanceof Anthropic.APIConnectionError) return aiError("network");
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return aiError("auth");
  }
  if (error instanceof Anthropic.NotFoundError) {
    // 모델 이름이 틀렸거나 이 계정에서 쓸 수 없는 모델이다.
    return aiError("bad_request", "model_unavailable");
  }

  const body = error.error as ErrorBody | undefined;
  if (error instanceof Anthropic.RateLimitError) {
    // 조직의 월 사용 상한에 닿은 경우도 429로 온다. 재시도로는 풀리지 않는다.
    return body?.error?.details?.error_code === "enforced_spend_limit_reached"
      ? aiError("quota")
      : aiError("rate_limited");
  }
  if (error instanceof Anthropic.BadRequestError) {
    // 직접 설정한 사용 한도에 닿으면 400으로 오고, 구분할 코드가 없어 문구로 판단한다.
    return /reached your specified (workspace )?API usage limits/i.test(body?.error?.message ?? "")
      ? aiError("quota")
      : aiError("bad_request");
  }

  // 스트림 도중의 오류(SSE error 이벤트)는 상태 코드 없이 오류 type만 온다.
  const type = body?.error?.type ?? error.type;
  if (error.status === 529 || type === "overloaded_error") return aiError("overloaded");
  if (type === "rate_limit_error") return aiError("rate_limited");
  if (type === "authentication_error" || type === "permission_error") return aiError("auth");
  if (error.status !== undefined && error.status >= 500) return aiError("overloaded");
  return aiError("unknown");
}
