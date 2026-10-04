/**
 * 브라우저와 AI 서버(/api/ai/edit) 사이의 약속.
 *
 * 응답은 NDJSON 스트림이다(한 줄에 이벤트 하나). 가짜 서버와 실제 LLM 서버가 같은 형식을 쓰므로,
 * 화면은 어느 쪽이 답하는지 몰라도 된다.
 *   {"type":"meta","provider":"mock","model":"mock"}
 *   {"type":"text","delta":"B열 숫자를 "}
 *   {"type":"edit","cell":"B2","value":"240"}
 *   {"type":"done"}
 * 스트림을 시작하기 전에 실패하면(키 오류, 요청 한도 등) HTTP 오류 상태와 { error: AiErrorInfo } JSON을 돌려준다.
 */

export const AI_ENDPOINT = "/api/ai/edit";

/** 요청 크기 상한. 시트가 100×26이라 셀은 최대 2,600개다. */
export const AI_LIMITS = {
  instruction: 2000,
  cellValue: 1000,
  cells: 2600,
  history: 10,
  historyText: 4000,
} as const;

export interface AiCell {
  /** A1 표기 */
  cell: string;
  value: string;
}

export interface AiHistoryItem {
  role: "user" | "assistant";
  text: string;
}

export interface AiEditRequest {
  instruction: string;
  /** 편집을 허용할 범위(A1:C5). null이면 시트 전체 */
  range: string | null;
  /** 시트의 비어 있지 않은 셀 전부(AI가 참고할 내용) */
  cells: AiCell[];
  /** 이전 대화(최근 것만) */
  history: AiHistoryItem[];
  /** 쓸 모델 id. 없으면 서버 기본 모델. 서버가 고를 수 있게 한 모델만 받는다. */
  model?: string;
}

export interface AiModelOption {
  id: string;
  label: string;
  description: string;
}

/** 화면에서 고를 수 있는 모델. 서버는 이 목록과 ANTHROPIC_MODEL로만 요청한다(비용 통제). */
export const AI_MODELS: readonly AiModelOption[] = [
  { id: "claude-opus-5-5", label: "Opus 5.5", description: "가장 정확" },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5", description: "속도·정확도 균형" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5", description: "가장 빠르고 저렴" },
];

/** 화면에 보여 줄 모델 이름. 응답의 모델 id는 날짜가 붙어 올 수 있다(claude-haiku-4-5-20251001). */
export function modelLabel(id: string, options: readonly AiModelOption[] = AI_MODELS): string {
  return options.find((m) => id === m.id || id.startsWith(`${m.id}-`))?.label ?? id;
}

/** GET /api/ai/edit 응답: 연결 상태와 고를 수 있는 모델 */
export interface AiConnectionInfo {
  /** 실제 Claude API면 "anthropic", API 키가 없어 가짜로 동작하면 "mock" */
  provider: "anthropic" | "mock";
  defaultModel: string;
  models: AiModelOption[];
}

export type AiErrorCode =
  | "bad_request"
  | "auth"
  | "quota"
  | "rate_limited"
  | "overloaded"
  | "refused"
  | "timeout"
  | "network"
  | "unknown";

export interface AiErrorInfo {
  code: AiErrorCode;
  message: string;
  /** 같은 요청을 다시 보내면 성공할 수 있는지 */
  retryable: boolean;
}

export type AiStreamEvent =
  | { type: "meta"; provider: string; model: string }
  | { type: "text"; delta: string }
  | { type: "edit"; cell: string; value: string }
  /** 결과는 쓸 수 있지만 알려야 할 일(응답이 최대 길이에서 잘림 등) */
  | { type: "warning"; message: string }
  | { type: "done" }
  | { type: "error"; error: AiErrorInfo };

/** 오류 종류별 사용자 안내와 HTTP 상태. 서버·브라우저가 같은 문구를 쓴다. */
export const AI_ERRORS: Record<
  AiErrorCode,
  { status: number; message: string; retryable: boolean }
> = {
  bad_request: { status: 400, message: "요청 형식이 올바르지 않아요.", retryable: false },
  auth: {
    status: 401,
    message: "AI 서비스 인증에 실패했어요. 서버의 API 키 설정을 확인해 주세요.",
    retryable: false,
  },
  quota: {
    status: 402,
    message: "AI 사용 한도에 도달했어요. 한도를 늘리거나 다음 달에 다시 시도해 주세요.",
    retryable: false,
  },
  rate_limited: {
    status: 429,
    message: "요청이 너무 많아요. 잠시 뒤 다시 시도해 주세요.",
    retryable: true,
  },
  overloaded: {
    status: 503,
    message: "AI 서비스가 혼잡해요. 잠시 뒤 다시 시도해 주세요.",
    retryable: true,
  },
  refused: {
    status: 422,
    message: "AI가 이 요청에 답하지 않았어요. 표현을 바꿔 다시 요청해 보세요.",
    retryable: false,
  },
  timeout: {
    status: 504,
    message: "AI 응답이 너무 오래 걸려 중단했어요.",
    retryable: true,
  },
  network: {
    status: 502,
    message: "AI 서버에 연결하지 못했어요. 네트워크를 확인해 주세요.",
    retryable: true,
  },
  unknown: { status: 500, message: "알 수 없는 오류가 발생했어요.", retryable: true },
};

export function aiError(code: AiErrorCode, message?: string): AiErrorInfo {
  const known = AI_ERRORS[code];
  return { code, message: message ?? known.message, retryable: known.retryable };
}

const ERROR_CODES = new Set<string>(Object.keys(AI_ERRORS));

function isErrorInfo(value: unknown): value is AiErrorInfo {
  if (typeof value !== "object" || value === null) return false;
  const { code, message, retryable } = value as AiErrorInfo;
  return ERROR_CODES.has(code) && typeof message === "string" && typeof retryable === "boolean";
}

/** 서버에서 온 이벤트는 형식을 확인한 뒤에만 쓴다. 모르는 형식이면 null. */
export function parseStreamEvent(value: unknown): AiStreamEvent | null {
  if (typeof value !== "object" || value === null) return null;
  const event = value as Record<string, unknown>;
  switch (event.type) {
    case "meta":
      return typeof event.provider === "string" && typeof event.model === "string"
        ? { type: "meta", provider: event.provider, model: event.model }
        : null;
    case "text":
      return typeof event.delta === "string" ? { type: "text", delta: event.delta } : null;
    case "edit":
      return typeof event.cell === "string" && typeof event.value === "string"
        ? { type: "edit", cell: event.cell, value: event.value }
        : null;
    case "warning":
      return typeof event.message === "string" ? { type: "warning", message: event.message } : null;
    case "done":
      return { type: "done" };
    case "error":
      return isErrorInfo(event.error) ? { type: "error", error: event.error } : null;
    default:
      return null;
  }
}

/** HTTP 오류 응답을 AiErrorInfo로 바꾼다. 본문에 형식이 맞는 error가 없으면 상태 코드로 짐작한다. */
export function errorFromResponse(status: number, body: unknown): AiErrorInfo {
  const embedded = (body as { error?: unknown } | null)?.error;
  if (isErrorInfo(embedded)) return embedded;
  if (status === 401 || status === 403) return aiError("auth");
  if (status === 402) return aiError("quota");
  if (status === 429) return aiError("rate_limited");
  if (status === 503 || status === 529) return aiError("overloaded");
  if (status === 504) return aiError("timeout");
  if (status === 400 || status === 413) return aiError("bad_request");
  return aiError("unknown");
}
