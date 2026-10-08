import { parseA1, rangeContains, toA1, type CellCoord, type CellRange } from "@/lib/sheet/address";
import { isInSheet } from "@/lib/sheet/schema";
import { AI_LIMITS, type AiErrorInfo, type AiStreamEvent, type AiWarning } from "./protocol";

/** AI 요청 한 번(실행)의 상태. 컨트롤러, 충돌 판단, 화면이 함께 씀. */

export type AiRunStatus =
  | "waiting"
  | "streaming"
  | "review"
  | "answered" // 바꿀 셀 없이 답만 함
  | "applied"
  | "discarded"
  | "cancelled"
  | "error";

export interface AiProposal {
  coord: CellCoord;
  cell: string;
  /** 요청 시점의 값 */
  before: string;
  after: string;
}

export interface AiRun {
  id: number;
  instruction: string;
  /** 편집을 허용한 범위. null이면 시트 전체 */
  scope: CellRange | null;
  /** 요청 범위를 끝날 때까지 다른 참여자가 바꾸지 못하게 잠갔는지. 요청할 때 정해지고 바뀌지 않음. */
  locked: boolean;
  status: AiRunStatus;
  connected: boolean;
  slow: boolean;
  provider: string | null;
  model: string | null;
  text: string;
  proposals: AiProposal[];
  /**
   * 범위 밖이거나 주소가 잘못돼 받지 않은 제안 수.
   * 적용할 때 충돌로 건너뛴 셀 수(result.skipped)와는 다름.
   */
  excluded: number;
  warnings: AiWarning[];
  error: AiErrorInfo | null;
  /** 요청 시점의 셀 값(비어 있지 않은 셀) */
  base: ReadonlyMap<string, string>;
  /** 적용한 결과. 요청 뒤에 값이 바뀌어 건너뛴 셀 수도 함께 보여 줌. */
  result: { applied: number; skipped: number } | null;
}

export type AiMessage =
  | { id: number; role: "user"; text: string; scope: CellRange | null }
  | { id: number; role: "assistant"; run: AiRun };

/** 응답을 기다리거나 받는 중 */
export function isRunning(run: Pick<AiRun, "status"> | null | undefined): boolean {
  return run?.status === "waiting" || run?.status === "streaming";
}

/** 결과를 다 받아, 적용할지 버릴지 고르는 중 */
export function isReviewing(run: AiRun | null | undefined): run is AiRun {
  return run?.status === "review";
}

export interface AiRunInit {
  id: number;
  instruction: string;
  scope: CellRange | null;
  model: string | null;
  base: ReadonlyMap<string, string>;
  locked?: boolean;
}

export function createRun(init: AiRunInit): AiRun {
  return {
    ...init,
    locked: init.locked ?? false,
    status: "waiting",
    connected: false,
    slow: false,
    provider: null,
    text: "",
    proposals: [],
    excluded: 0,
    warnings: [],
    error: null,
    result: null,
  };
}

/** 실행을 끝내지 않는 스트림 이벤트. done·error는 컨트롤러가 요청을 정리하면서 따로 처리함. */
export type AiProgressEvent = Exclude<AiStreamEvent, { type: "done" } | { type: "error" }>;

export function applyProgress(run: AiRun, event: AiProgressEvent): AiRun {
  switch (event.type) {
    case "meta":
      return {
        ...run,
        connected: true,
        slow: false,
        provider: event.provider,
        model: event.model,
      };
    case "text":
      return {
        ...run,
        connected: true,
        slow: false,
        status: "streaming",
        text: run.text + event.delta,
      };
    case "edit":
      return addProposal(run, event.cell, event.value);
    case "warning":
      return { ...run, warnings: [...run.warnings, event.warning] };
  }
}

/** 제안이 있으면 검토 단계로, 없으면 답만 한 것으로 끝냄. */
export function finishRun(run: AiRun): AiRun {
  return { ...run, slow: false, status: run.proposals.length > 0 ? "review" : "answered" };
}

/** 범위 밖이거나 주소가 잘못된 제안은 세기만 함. 요청 때 값과 같아진 셀은 제안에서 뺌. */
function addProposal(run: AiRun, cell: string, value: string): AiRun {
  const coord = parseA1(cell);
  const streaming = { ...run, connected: true, slow: false, status: "streaming" as const };
  const isEditable =
    coord !== null && isInSheet(coord) && (!run.scope || rangeContains(run.scope, coord));
  if (!isEditable) {
    return { ...streaming, excluded: run.excluded + 1 };
  }
  const key = toA1(coord);
  const before = run.base.get(key) ?? "";
  const after = value.slice(0, AI_LIMITS.cellValue);
  const existing = run.proposals.findIndex((p) => p.cell === key);
  if (after === before) {
    return { ...streaming, proposals: run.proposals.filter((p) => p.cell !== key) };
  }
  const proposal: AiProposal = { coord, cell: key, before, after };
  const proposals =
    existing >= 0
      ? run.proposals.map((p, i) => (i === existing ? proposal : p))
      : [...run.proposals, proposal];
  return { ...streaming, proposals };
}
