import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { AI_MODELS, modelLabel, type AiEditRequest, type AiStreamEvent } from "@/lib/ai/protocol";
import {
  AiProviderError,
  buildParams,
  streamClaudeEdits,
  toAiError,
  type ClaudeSetup,
} from "@/lib/ai/server/claude";
import { createEditStreamParser } from "@/lib/ai/server/edit-stream-parser";
import { createMockAnthropicFetch } from "@/lib/ai/server/mock-anthropic";
import { buildUserMessage, parseUserMessage } from "@/lib/ai/server/prompt";

// 가짜 Claude API를 SDK의 fetch 자리에 넣고 실제 SDK로 호출한다.
// 그래서 이 테스트는 실제 모델을 쓸 때 돌아갈 코드(SDK 스트림 해석, 셀 제안 추출, 오류 분류)를 그대로 검증한다.

function mockSetup(model = "claude-opus-5-5"): ClaudeSetup {
  return {
    client: new Anthropic({
      apiKey: "mock-key",
      fetch: createMockAnthropicFetch({ delayScale: 0 }),
      maxRetries: 0,
    }),
    defaultModel: model,
    models: [...AI_MODELS],
    effort: "low",
    provider: "mock",
  };
}

function request(instruction: string, overrides: Partial<AiEditRequest> = {}): AiEditRequest {
  return {
    instruction,
    range: "B2:B4",
    cells: [
      { cell: "A1", value: "품목" },
      { cell: "B1", value: "가격" },
      { cell: "B2", value: "1,200" },
      { cell: "B3", value: "300" },
      { cell: "B4", value: "abc" },
    ],
    history: [],
    ...overrides,
  };
}

async function collect(events: AsyncIterable<AiStreamEvent>): Promise<AiStreamEvent[]> {
  const out: AiStreamEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

const edits = (events: AiStreamEvent[]) =>
  events.flatMap((e) => (e.type === "edit" ? [`${e.cell}=${e.value}`] : []));

describe("edit stream parser", () => {
  it("emits each edit as soon as its object closes, across arbitrary chunk boundaries", () => {
    const json = JSON.stringify({
      edits: [
        { cell: "B2", value: 'say "hi" {}' },
        { cell: "c3", value: 7 },
      ],
    });
    const parser = createEditStreamParser();
    const seen: string[] = [];
    for (const ch of json) {
      for (const edit of parser.push(ch).edits) seen.push(`${edit.cell}=${edit.value}`);
    }
    expect(seen).toEqual(['B2=say "hi" {}', "C3=7"]);
  });

  it("counts malformed elements instead of emitting them", () => {
    const parser = createEditStreamParser();
    const result = parser.push('{"edits":[{"cell":"B2"},{"cell":"B3","value":"ok"}]}');
    expect(result.edits).toEqual([{ cell: "B3", value: "ok" }]);
    expect(result.invalid).toBe(1);
  });
});

describe("prompt", () => {
  it("round-trips the sheet, range and request so the mock sees what the model sees", () => {
    const req = request('줄바꿈\n과 "따옴표"');
    const parsed = parseUserMessage(buildUserMessage(req));
    expect(parsed.cells).toEqual(req.cells);
    expect(parsed.range).toBe("B2:B4");
    expect(parsed.instruction).toBe(req.instruction);
  });

  it("only sends effort and fallbacks to models that support them", () => {
    const opus = buildParams({ model: "claude-opus-5-5", effort: "low" }, request("x"));
    expect(opus.output_config).toEqual({ effort: "low" });
    expect(opus.fallbacks).toBe("default");
    expect(opus.tools?.[0]).toMatchObject({ name: "propose_edits", eager_input_streaming: true });

    const haiku = buildParams({ model: "claude-haiku-4-5", effort: "low" }, request("x"));
    expect(haiku.output_config).toBeUndefined();
    expect(haiku.fallbacks).toBeUndefined();
  });
});

describe("models", () => {
  it("labels model ids, including dated ids the API answers with", () => {
    expect(modelLabel("claude-haiku-4-5")).toBe("Haiku 4.5");
    expect(modelLabel("claude-haiku-4-5-20251001")).toBe("Haiku 4.5");
    expect(modelLabel("claude-opus-5")).toBe("claude-opus-5");
  });

  it("tells the user to pick another model when the API does not know the model", () => {
    const error = Anthropic.APIError.generate(
      404,
      { type: "error", error: { type: "not_found_error", message: "model: claude-x" } },
      undefined,
      new Headers(),
    );
    expect(toAiError(error)).toEqual({
      code: "bad_request",
      reason: "model_unavailable",
      retryable: false,
    });
  });
});

function apiError(status: number, type: string, message: string, errorCode?: string) {
  const details = errorCode ? { details: { error_code: errorCode } } : {};
  return Anthropic.APIError.generate(
    status,
    { type: "error", error: { type, message, ...details } },
    undefined,
    new Headers(),
  );
}

describe("toAiError: usage limits", () => {
  it("treats the tier's monthly spend cap as a quota error, not a retryable rate limit", () => {
    // 상한 429에는 retry-after가 없어 다시 보내도 다음 달까지 실패한다.
    const error = apiError(
      429,
      "rate_limit_error",
      "You have reached your API usage limits: your organization has crossed its monthly API usage threshold.",
      "enforced_spend_limit_reached",
    );
    expect(toAiError(error)).toMatchObject({ code: "quota", retryable: false });
  });

  it("keeps an ordinary 429 retryable", () => {
    const error = apiError(
      429,
      "rate_limit_error",
      "Number of request tokens has exceeded your limit.",
    );
    expect(toAiError(error)).toMatchObject({ code: "rate_limited", retryable: true });
  });

  it.each([
    [
      "organization",
      "You have reached your specified API usage limits. You will regain access on 2026-11-01.",
    ],
    [
      "workspace",
      "You have reached your specified workspace API usage limits. You will regain access on 2026-11-01.",
    ],
  ])("treats the %s spend limit I set (400) as a quota error", (_, message) => {
    const error = apiError(400, "invalid_request_error", message);
    expect(toAiError(error)).toMatchObject({ code: "quota", retryable: false });
  });

  it("keeps other 400s as bad requests", () => {
    const error = apiError(400, "invalid_request_error", "max_tokens: Field required");
    expect(toAiError(error)).toMatchObject({ code: "bad_request", retryable: false });
  });
});

describe("toAiError: other failures", () => {
  it.each([
    [401, "authentication_error", "auth", false],
    [403, "permission_error", "auth", false],
    [500, "api_error", "overloaded", true],
    [529, "overloaded_error", "overloaded", true],
  ])("maps HTTP %i to %s", (status, type, code, retryable) => {
    expect(toAiError(apiError(status, type, "x"))).toMatchObject({ code, retryable });
  });

  it.each([
    ["overloaded_error", "overloaded"],
    ["rate_limit_error", "rate_limited"],
    ["authentication_error", "auth"],
  ] as const)("maps a %s that arrives mid-stream (no HTTP status)", (type, code) => {
    // SDK는 SSE error 이벤트를 상태 코드 없는 APIError로 던진다.
    const error = new Anthropic.APIError(
      undefined,
      { type: "error", error: { type, message: "x" } },
      undefined,
      new Headers(),
      type,
    );
    expect(toAiError(error).code).toBe(code);
  });

  it("separates a connection timeout from a dropped connection", () => {
    expect(toAiError(new Anthropic.APIConnectionTimeoutError())).toMatchObject({
      code: "timeout",
      retryable: true,
    });
    expect(
      toAiError(new Anthropic.APIConnectionError({ message: "socket hang up" })),
    ).toMatchObject({ code: "network", retryable: true });
  });
});

describe("streamClaudeEdits (real SDK against the mock API)", () => {
  it("streams meta, explanation text, edits in order, then done", async () => {
    const events = await collect(
      streamClaudeEdits(mockSetup(), request("두 배로"), new AbortController().signal),
    );
    expect(events[0]).toEqual({ type: "meta", provider: "mock", model: "claude-opus-5-5" });
    const text = events.flatMap((e) => (e.type === "text" ? [e.delta] : [])).join("");
    expect(text).toContain("두 배");
    expect(edits(events)).toEqual(["B2=2,400", "B3=600"]);
    expect(events.at(-1)).toEqual({ type: "done" });
  });

  it("uses the model the request picked instead of the default", async () => {
    const events = await collect(
      streamClaudeEdits(
        mockSetup(),
        request("두 배로", { model: "claude-haiku-4-5" }),
        new AbortController().signal,
      ),
    );
    expect(events[0]).toEqual({ type: "meta", provider: "mock", model: "claude-haiku-4-5" });
  });

  it("answers a question with text only", async () => {
    const events = await collect(
      streamClaudeEdits(mockSetup(), request("몇 칸이야?"), new AbortController().signal),
    );
    expect(edits(events)).toEqual([]);
    expect(events.at(-1)).toEqual({ type: "done" });
  });

  it.each([
    ["[한도]", "rate_limited"],
    ["[키]", "auth"],
  ])("fails before the stream starts on %s", async (tag, code) => {
    const events = streamClaudeEdits(
      mockSetup(),
      request(`${tag} 두 배로`),
      new AbortController().signal,
    );
    const error = await events.next().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiProviderError);
    expect((error as AiProviderError).info.code).toBe(code);
  });

  it("reports an overload in the middle of the stream after the edits received so far", async () => {
    const events = await collect(
      streamClaudeEdits(
        mockSetup(),
        request("[과부하] 빈칸 채워", { range: "C1:C20" }),
        new AbortController().signal,
      ),
    );
    const last = events.at(-1);
    expect(last).toMatchObject({ type: "error", error: { code: "overloaded", retryable: true } });
    expect(edits(events).length).toBeGreaterThan(0);
    expect(edits(events).length).toBeLessThan(20);
  });

  it("turns a refusal into a non-retryable error", async () => {
    const events = await collect(
      streamClaudeEdits(mockSetup(), request("[거절] 두 배로"), new AbortController().signal),
    );
    expect(events.at(-1)).toMatchObject({
      type: "error",
      error: { code: "refused", retryable: false },
    });
  });

  it("keeps the edits received before max_tokens and warns", async () => {
    const events = await collect(
      streamClaudeEdits(
        mockSetup(),
        request("[잘림] 빈칸 채워", { range: "C1:C20" }),
        new AbortController().signal,
      ),
    );
    expect(events).toContainEqual({ type: "warning", warning: { code: "truncated" } });
    expect(events.at(-1)).toEqual({ type: "done" });
    const received = edits(events);
    expect(received.length).toBeGreaterThan(0);
    expect(received.length).toBeLessThan(20);
  });

  it("stops quietly when the browser cancels", async () => {
    const controller = new AbortController();
    const seen: AiStreamEvent[] = [];
    for await (const event of streamClaudeEdits(
      mockSetup(),
      request("빈칸 채워", { range: "C1:C20" }),
      controller.signal,
    )) {
      seen.push(event);
      if (event.type === "edit") controller.abort();
    }
    expect(seen.some((e) => e.type === "error" || e.type === "done")).toBe(false);
  });
});
