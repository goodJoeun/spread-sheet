/**
 * 브라우저와 /api/ai/edit 사이에 주고받는 형식.
 * 응답은 NDJSON(한 줄에 AiStreamEvent 하나)임.
 * 스트림을 시작하기 전에 실패하면 HTTP 오류 상태와 { error: AiErrorInfo }를 돌려줌.
 * 오류·경고는 코드로만 보내고, 화면 문구는 브라우저가 고름(messages.ts).
 */

import { COL_COUNT, ROW_COUNT } from "@/lib/sheet/schema";

export const AI_ENDPOINT = "/api/ai/edit";

/** 요청 크기 상한. cells는 시트 전체 셀 수 */
export const AI_LIMITS = {
  instruction: 2000,
  cellValue: 1000,
  cells: ROW_COUNT * COL_COUNT,
  history: 10,
  historyText: 4000,
  /** 모델 id 길이. 목록 확인 전에 터무니없이 긴 값을 거름. */
  modelId: 100,
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
}

/**
 * 화면에서 고를 수 있는 모델. 비용을 통제하려고 서버는 이 목록과 ANTHROPIC_MODEL로만 요청함.
 * 모델을 추가하고 화면 설명(strings)이나 지원 옵션(server/claude.ts)을 빠뜨리면 타입 오류가 남.
 */
export const AI_MODELS = [
  { id: "claude-opus-5-5", label: "Opus 5.5" },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5" },
] as const satisfies readonly AiModelOption[];

export type AiModelId = (typeof AI_MODELS)[number]["id"];

export function isAiModelId(id: string): id is AiModelId {
  return AI_MODELS.some((m) => m.id === id);
}

/** 응답의 모델 id에는 날짜가 붙을 수 있음(예: claude-haiku-4-5-20251001). */
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

/** 같은 오류 종류 안에서 안내를 달리해야 하는 경우 */
export const AI_ERROR_REASONS = [
  "model_not_offered",
  "model_unavailable",
  "stream_dropped",
  "connection_lost",
] as const;
export type AiErrorReason = (typeof AI_ERROR_REASONS)[number];

export interface AiErrorInfo {
  code: AiErrorCode;
  reason?: AiErrorReason;
  retryable: boolean;
}

/** 결과는 쓸 수 있지만 알려야 할 일 */
export type AiWarning =
  /** 응답이 최대 길이에서 잘림 */
  | { code: "truncated" }
  /** 형식이 맞지 않아 뺀 제안 */
  | { code: "invalid_edits"; count: number }
  /** 도구 입력을 끝까지 해석하지 못함 */
  | { code: "unparsable" };

export type AiStreamEvent =
  | { type: "meta"; provider: string; model: string }
  | { type: "text"; delta: string }
  | { type: "edit"; cell: string; value: string }
  | { type: "warning"; warning: AiWarning }
  | { type: "done" }
  | { type: "error"; error: AiErrorInfo };

export const AI_ERRORS: Record<AiErrorCode, { status: number; retryable: boolean }> = {
  bad_request: { status: 400, retryable: false },
  auth: { status: 401, retryable: false },
  quota: { status: 402, retryable: false },
  rate_limited: { status: 429, retryable: true },
  overloaded: { status: 503, retryable: true },
  refused: { status: 422, retryable: false },
  timeout: { status: 504, retryable: true },
  network: { status: 502, retryable: true },
  unknown: { status: 500, retryable: true },
};

export function aiError(code: AiErrorCode, reason?: AiErrorReason): AiErrorInfo {
  const { retryable } = AI_ERRORS[code];
  return reason ? { code, reason, retryable } : { code, retryable };
}

const ERROR_CODES = new Set<string>(Object.keys(AI_ERRORS));
const ERROR_REASONS = new Set<string>(AI_ERROR_REASONS);

function isErrorInfo(value: unknown): value is AiErrorInfo {
  if (typeof value !== "object" || value === null) return false;
  const { code, reason, retryable } = value as AiErrorInfo;
  return (
    ERROR_CODES.has(code) &&
    (reason === undefined || ERROR_REASONS.has(reason)) &&
    typeof retryable === "boolean"
  );
}

function parseWarning(value: unknown): AiWarning | null {
  if (typeof value !== "object" || value === null) return null;
  const warning = value as Record<string, unknown>;
  switch (warning.code) {
    case "truncated":
    case "unparsable":
      return { code: warning.code };
    case "invalid_edits":
      return typeof warning.count === "number"
        ? { code: "invalid_edits", count: warning.count }
        : null;
    default:
      return null;
  }
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
    case "warning": {
      const warning = parseWarning(event.warning);
      return warning ? { type: "warning", warning } : null;
    }
    case "done":
      return { type: "done" };
    case "error":
      return isErrorInfo(event.error) ? { type: "error", error: event.error } : null;
    default:
      return null;
  }
}

/**
 * 우리 서버의 오류 응답에는 본문에 AiErrorInfo가 실려 있어서 그것을 씀.
 * 상태 코드만 보는 경우는 본문이 없는 응답(프록시, 배포 플랫폼 등)뿐이라, AI_ERRORS를 거꾸로 찾지 않음.
 * 예를 들어 프록시의 422·502는 모델 거절이나 연결 실패라고 단정할 수 없어 unknown으로 봄.
 */
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
