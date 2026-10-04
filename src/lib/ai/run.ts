import type { CellCoord, CellRange } from "@/lib/sheet/address";
import type { AiErrorInfo, AiWarning } from "./protocol";

/** AI 요청 한 번(실행)의 상태. 컨트롤러·충돌 판단·화면이 함께 쓴다. */

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
  status: AiRunStatus;
  connected: boolean;
  slow: boolean;
  provider: string | null;
  model: string | null;
  text: string;
  proposals: AiProposal[];
  /** 범위 밖 등으로 뺀 제안 수 */
  skipped: number;
  warnings: AiWarning[];
  error: AiErrorInfo | null;
  /** 요청 시점의 셀 값(비어 있지 않은 셀) */
  base: ReadonlyMap<string, string>;
  /** 적용한 결과. 요청 뒤 바뀌어서 건너뛴 셀 수를 함께 보여 준다. */
  result: { applied: number; skipped: number } | null;
}

export type AiMessage =
  | { id: number; role: "user"; text: string; scope: CellRange | null }
  | { id: number; role: "assistant"; run: AiRun };

/** 응답을 기다리거나 받는 중 */
export function isRunning(run: Pick<AiRun, "status"> | null | undefined): boolean {
  return run?.status === "waiting" || run?.status === "streaming";
}
