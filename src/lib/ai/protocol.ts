/**
 * 브라우저와 /api/ai/edit 사이의 형식. 응답은 NDJSON(한 줄에 AiStreamEvent 하나)이고,
 * 스트림을 시작하기 전에 실패하면 HTTP 오류 상태와 { error: AiErrorInfo }를 돌려준다.
 */

export const AI_ENDPOINT = "/api/ai/edit";

/** 요청 크기 상한. cells는 시트 전체(100×26) */
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
  /** 시트의 비어 있지 않은 셀 */
  cells: AiCell[];
  history: AiHistoryItem[];
  /** 없으면 서버 기본 모델 */
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

/** 응답의 모델 id에는 날짜가 붙을 수 있다(claude-haiku-4-5-20251001). */
export function modelLabel(id: string, options: readonly AiModelOption[] = AI_MODELS): string {
  return options.find((m) => id === m.id || id.startsWith(`${m.id}-`))?.label ?? id;
}

/** GET /api/ai/edit 응답 */
export interface AiConnectionInfo {
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
