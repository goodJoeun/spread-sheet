/**
 * 브라우저와 /api/ai/edit 사이의 형식. 응답은 NDJSON(한 줄에 AiStreamEvent 하나)이고,
 * 스트림을 시작하기 전에 실패하면 HTTP 오류 상태와 { error: AiErrorInfo }를 돌려준다.
 */

import { COL_COUNT, ROW_COUNT } from "@/lib/sheet/schema";
import { strings } from "@/resources/strings";

export const AI_ENDPOINT = "/api/ai/edit";

/** 요청 크기 상한. cells는 시트 전체 */
export const AI_LIMITS = {
  instruction: 2000,
  cellValue: 1000,
  cells: ROW_COUNT * COL_COUNT,
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
  { id: "claude-opus-5-5", label: "Opus 5.5", description: strings.ai.models.opus },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5", description: strings.ai.models.sonnet },
  { id: "claude-haiku-4-5", label: "Haiku 4.5", description: strings.ai.models.haiku },
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
  bad_request: { status: 400, message: strings.ai.errors.bad_request, retryable: false },
  auth: {
    status: 401,
    message: strings.ai.errors.auth,
    retryable: false,
  },
  quota: {
    status: 402,
    message: strings.ai.errors.quota,
    retryable: false,
  },
  rate_limited: {
    status: 429,
    message: strings.ai.errors.rate_limited,
    retryable: true,
  },
  overloaded: {
    status: 503,
    message: strings.ai.errors.overloaded,
    retryable: true,
  },
  refused: {
    status: 422,
    message: strings.ai.errors.refused,
    retryable: false,
  },
  timeout: {
    status: 504,
    message: strings.ai.errors.timeout,
    retryable: true,
  },
  network: {
    status: 502,
    message: strings.ai.errors.network,
    retryable: true,
  },
  unknown: { status: 500, message: strings.ai.errors.unknown, retryable: true },
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
