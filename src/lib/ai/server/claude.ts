import Anthropic from "@anthropic-ai/sdk";
import { aiError, type AiEditRequest, type AiErrorInfo, type AiStreamEvent } from "../protocol";
import { createEditStreamParser } from "./edit-stream-parser";
import { EDIT_TOOL, EDIT_TOOL_NAME, SYSTEM_PROMPT, buildMessages } from "./prompt";

/**
 * Claude로 셀 편집 제안을 받아 AiStreamEvent로 바꾼다.
 * 실제 API든 가짜 fetch든 같은 SDK 경로를 지나므로, 가짜로 개발한 코드가 그대로 실제 모델에서 돈다.
 */

export interface ClaudeSetup {
  client: Anthropic;
  model: string;
  effort: "low" | "medium" | "high";
  /** 화면에 보여 줄 공급자 이름. 가짜면 "mock" */
  provider: "anthropic" | "mock";
}

/** 스트림을 시작하기 전에 실패했다. 라우트가 HTTP 오류로 바꿔 돌려준다. */
export class AiProviderError extends Error {
  constructor(readonly info: AiErrorInfo) {
    super(info.message);
  }
}

/** beta stream()이 받는 요청 형식 */
type StreamParams = Parameters<Anthropic["beta"]["messages"]["stream"]>[0];

/** 응답 길이 상한. 셀 하나에 20~30토큰이라 1,000셀 안팎을 한 번에 제안할 수 있다. */
const MAX_TOKENS = 32000;

/**
 * 모델별로 지원하는 옵션. 모르는 모델이면 둘 다 쓰지 않는다(지원하지 않는 옵션은 400이 난다).
 * - effort: 생각하는 정도. 낮을수록 빨리 답한다.
 * - fallbacks: 안전 분류기가 거절하면 같은 요청을 다른 모델로 이어서 처리한다(서버 측 기능).
 */
const MODEL_FEATURES: Record<string, { effort: boolean; fallbacks: boolean }> = {
  "claude-opus-5-5": { effort: true, fallbacks: true },
  "claude-opus-5": { effort: true, fallbacks: true },
  "claude-sonnet-5-5": { effort: true, fallbacks: true },
  "claude-fable-5-1": { effort: true, fallbacks: true },
  "claude-haiku-4-5": { effort: false, fallbacks: false },
};

export function buildParams(
  setup: Pick<ClaudeSetup, "model" | "effort">,
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
  const stream = setup.client.beta.messages.stream(buildParams(setup, request), { signal });

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
      yield {
        type: "warning",
        message: "응답이 최대 길이에서 끊겼어요. 받은 제안까지만 검토할 수 있어요.",
      };
    }
    if (invalid > 0) {
      yield { type: "warning", message: `형식이 맞지 않는 제안 ${invalid}개는 뺐어요.` };
    }
    yield { type: "done" };
  } catch (error) {
    if (error instanceof Anthropic.APIUserAbortError || signal.aborted) return;
    if (!(error instanceof Anthropic.APIError)) {
      // 도구 입력 JSON을 끝내 해석하지 못한 경우(SDK가 블록이 닫힐 때 던진다).
      // 그 전까지 완성된 제안은 이미 보냈으므로 경고와 함께 마친다.
      if (started) {
        yield {
          type: "warning",
          message: "AI 응답 일부를 해석하지 못해 받은 제안까지만 보여 드려요.",
        };
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

/** SDK의 오류 종류를 화면 안내용 오류로 바꾼다. 구체적인 것부터 확인한다. */
export function toAiError(error: InstanceType<typeof Anthropic.APIError>): AiErrorInfo {
  if (error instanceof Anthropic.APIConnectionTimeoutError) return aiError("timeout");
  if (error instanceof Anthropic.APIConnectionError) return aiError("network");
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return aiError("auth");
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
