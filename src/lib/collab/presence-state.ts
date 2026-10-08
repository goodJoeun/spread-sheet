import type { CellCoord, CellRange } from "@/lib/sheet/address";
import { clipToSheet } from "@/lib/sheet/schema";
import { clampCoord, type Selection } from "@/lib/sheet/selection";

/**
 * 탭마다 awareness로 알리는 상태. 다른 탭(이전 버전 포함)에서 온 값이라
 * isPresenceState로 검증하고 normalizePresenceState로 맞춘 뒤에 씀.
 */

export interface UserInfo {
  name: string;
  color: string;
}

/** AI 제안 값은 싣지 않음. 확정되지 않은 값이 실제 데이터처럼 보이지 않게 하고, 토큰마다 다른 탭에 보내지 않기 위함. */
export interface AiActivity {
  status: "generating" | "reviewing";
  /** 편집 범위. 시트 전체 요청이라 아직 제안이 없으면 null */
  range: CellRange | null;
  /** 요청한 사람이 셀 잠금을 켰는지. 켰다면 끝날 때까지 다른 참여자는 range(null이면 시트 전체)를 바꿀 수 없음. */
  locked: boolean;
}

/** 입력 중인 글자를 알릴 때의 길이 상한. 글자마다 다른 탭에 보내므로 크기를 제한함. */
export const DRAFT_MAX_LENGTH = 1000;

export interface PresenceState {
  user: UserInfo;
  selection: Selection | null;
  editing: CellCoord | null;
  /** editing 셀에 입력 중인, 아직 확정하지 않은 글자. 문서에는 쓰지 않고, 확정하면 셀 값이 됨. */
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
 * 이전 버전 탭이 보낸 상태도 받아들임.
 * ai가 없으면 AI 편집이 없는 것으로, locked가 없으면 잠그지 않은 것으로, draft가 없으면 입력 중인 글자가 없는 것으로 봄.
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

/**
 * 검증한 상태를 참여자 목록에 넣기 전에 맞춤. 다른 탭에서 온 좌표를 시트 안으로 맞추는 일은 여기서만 함.
 * 그래서 Participant를 쓰는 화면과 판단 로직은 좌표를 다시 확인하지 않아도 됨.
 * - 좌표는 시트 안으로 맞추고, AI 편집 범위는 시트 안으로 자름.
 * - 이전 버전 탭이 빠뜨린 값은 기본값으로 채움(locked → false, draft → null).
 */
export function normalizePresenceState(state: PresenceState): PresenceState {
  const { user, selection, editing, draft, ai } = state;
  return {
    user,
    selection: selection
      ? {
          anchor: clampCoord(selection.anchor),
          focus: clampCoord(selection.focus),
          active: clampCoord(selection.active),
        }
      : null,
    editing: editing ? clampCoord(editing) : null,
    draft: editing && typeof draft === "string" ? draft : null,
    ai: ai ? normalizeAiActivity(ai) : null,
  };
}

function normalizeAiActivity(ai: AiActivity): AiActivity | null {
  const range = ai.range ? clipToSheet(ai.range) : null;
  // 시트와 겹치지 않는 범위를 null로 두면 "시트 전체"가 되므로, AI 편집이 없는 것으로 봄.
  if (ai.range && !range) return null;
  return { status: ai.status, range, locked: ai.locked === true };
}
