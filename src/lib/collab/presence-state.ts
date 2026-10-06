import type { CellCoord, CellRange } from "@/lib/sheet/address";
import type { Selection } from "@/lib/sheet/selection";

/** 탭마다 awareness로 알리는 상태. 다른 탭(이전 버전 포함)에서 온 값이라 isPresenceState로 검증해서 쓴다. */

export interface UserInfo {
  name: string;
  color: string;
}

/** 제안 값은 싣지 않는다. 확정되지 않은 값이 실제 데이터처럼 보이지 않고, 토큰마다 방송하지 않게. */
export interface AiActivity {
  status: "generating" | "reviewing";
  /** 편집 범위. 시트 전체 요청이라 아직 제안이 없으면 null */
  range: CellRange | null;
  /** 요청한 사람이 셀 잠금을 켰다. 끝날 때까지 다른 참여자는 range(null이면 시트 전체)를 바꿀 수 없다. */
  locked: boolean;
}

/** 입력 중인 글자를 알릴 때의 길이 상한. 글자마다 다른 탭에 보내므로 크기를 제한한다. */
export const DRAFT_MAX_LENGTH = 1000;

export interface PresenceState {
  user: UserInfo;
  selection: Selection | null;
  editing: CellCoord | null;
  /** editing 셀에 입력 중인, 아직 확정하지 않은 글자. 문서에는 쓰지 않고 확정할 때 셀 값이 된다. */
  draft: string | null;
  ai: AiActivity | null;
}

export interface Participant extends PresenceState {
  clientId: number;
  isSelf: boolean;
}

const isCoord = (value: unknown): value is CellCoord =>
  typeof value === "object" &&
  value !== null &&
  Number.isInteger((value as CellCoord).row) &&
  Number.isInteger((value as CellCoord).col);

const isSelection = (value: unknown): value is Selection =>
  typeof value === "object" &&
  value !== null &&
  isCoord((value as Selection).anchor) &&
  isCoord((value as Selection).focus) &&
  isCoord((value as Selection).active);

const isRange = (value: unknown): value is CellRange =>
  typeof value === "object" &&
  value !== null &&
  isCoord((value as CellRange).start) &&
  isCoord((value as CellRange).end);

const isAiActivity = (value: unknown): value is AiActivity =>
  typeof value === "object" &&
  value !== null &&
  ((value as AiActivity).status === "generating" || (value as AiActivity).status === "reviewing") &&
  ((value as AiActivity).range === null || isRange((value as AiActivity).range)) &&
  ((value as AiActivity).locked === undefined || typeof (value as AiActivity).locked === "boolean");

/**
 * ai가 없는 상태(이전 버전 탭)는 AI 편집이 없는 것으로, locked가 없으면 잠그지 않은 것으로 본다.
 * draft가 없으면 입력 중인 글자를 알리지 않는 것으로 본다.
 */
export function isPresenceState(value: unknown): value is PresenceState {
  if (typeof value !== "object" || value === null) return false;
  const { user, selection, editing, draft, ai } = value as PresenceState;
  return (
    typeof user === "object" &&
    user !== null &&
    typeof user.name === "string" &&
    typeof user.color === "string" &&
    (selection === null || isSelection(selection)) &&
    (editing === null || isCoord(editing)) &&
    (draft === undefined || draft === null || typeof draft === "string") &&
    (ai === undefined || ai === null || isAiActivity(ai))
  );
}
