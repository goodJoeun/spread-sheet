import { describe, expect, it } from "vitest";
import { aiErrorMessage, aiWarningMessage, modelDescription } from "@/lib/ai/messages";
import {
  AI_ERROR_REASONS,
  AI_ERRORS,
  AI_MODELS,
  aiError,
  errorFromResponse,
  parseStreamEvent,
  type AiErrorCode,
  type AiWarning,
} from "@/lib/ai/protocol";

describe("AI 오류·경고 문구", () => {
  it("모든 오류 코드와 이유에 문구가 있다", () => {
    for (const code of Object.keys(AI_ERRORS) as AiErrorCode[]) {
      expect(aiErrorMessage(aiError(code))).toBeTruthy();
    }
    for (const reason of AI_ERROR_REASONS) {
      expect(aiErrorMessage(aiError("network", reason))).toBeTruthy();
    }
  });

  it("이유가 있으면 오류 종류보다 이유의 문구를 쓴다", () => {
    expect(aiErrorMessage(aiError("bad_request", "model_not_offered"))).not.toBe(
      aiErrorMessage(aiError("bad_request")),
    );
  });

  it("경고는 개수를 문구에 넣는다", () => {
    expect(aiWarningMessage({ code: "invalid_edits", count: 3 })).toContain("3");
    expect(aiWarningMessage({ code: "truncated" })).toBeTruthy();
    expect(aiWarningMessage({ code: "unparsable" })).toBeTruthy();
  });

  it("고를 수 있는 모델에는 설명이 있고, 모르는 모델은 서버 기본 모델로 설명한다", () => {
    const fallback = modelDescription("claude-unknown");
    for (const { id } of AI_MODELS) expect(modelDescription(id)).not.toBe(fallback);
  });
});

describe("protocol: 코드만 오간다", () => {
  it.each<AiWarning>([
    { code: "truncated" },
    { code: "invalid_edits", count: 2 },
    { code: "unparsable" },
  ])("경고 %o를 그대로 읽는다", (warning) => {
    const wire = JSON.parse(JSON.stringify({ type: "warning", warning }));
    expect(parseStreamEvent(wire)).toEqual({ type: "warning", warning });
  });

  it("모르는 경고·이유는 버린다", () => {
    expect(parseStreamEvent({ type: "warning", warning: { code: "nope" } })).toBeNull();
    expect(parseStreamEvent({ type: "warning", warning: { code: "invalid_edits" } })).toBeNull();
    expect(
      parseStreamEvent({ type: "error", error: { code: "network", reason: "x", retryable: true } }),
    ).toBeNull();
  });

  it("응답 본문의 오류 정보를 이유까지 그대로 쓴다", () => {
    const error = aiError("bad_request", "model_not_offered");
    expect(errorFromResponse(400, { error })).toEqual(error);
  });
});
