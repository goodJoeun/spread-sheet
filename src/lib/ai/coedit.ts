import {
  intersectRanges,
  normalizeRange,
  type CellCoord,
  type CellRange,
} from "@/lib/sheet/address";
import { SHEET_RANGE } from "@/lib/sheet/schema";
import type { AiActivity, Participant } from "@/lib/collab/presence";
import type { AiProposal } from "./ai-controller";

/**
 * 공동 편집과 AI 편집이 만나는 지점의 규칙. 모두 순수 함수다.
 *
 * 규칙 하나로 세 상황(생성 중 다른 참여자의 수정, 검토 중 수정, 겹치는 동시 요청)을 처리한다.
 *   요청 시점의 값(base)을 기억해 두고, 그 뒤에 바뀐 셀은 "충돌"로 표시한다. 충돌한 셀은 기본으로 건너뛴다.
 * 사람이 한 변경을 AI 결과가 몰래 덮어쓰지 않게 하기 위해서다. AI 결과는 다시 만들기 쉽지만 사람의 입력은 그렇지 않다.
 */

export type ProposalStatus =
  /** 지금 값이 이미 제안과 같다. 쓸 것이 없다(다른 참여자가 같은 값으로 바꾼 경우 포함). */
  | "same"
  /** 요청한 뒤로 아무도 바꾸지 않았다. 적용한다. */
  | "clean"
  /** 요청한 뒤 다른 값으로 바뀌었다. 기본으로 건너뛰고, 사용자가 덮어쓰기를 고를 수 있다. */
  | "conflict";

export function classifyCell(base: string, current: string, proposed: string): ProposalStatus {
  if (proposed === current) return "same";
  if (current === base) return "clean";
  return "conflict";
}

export interface ProposalState {
  proposal: AiProposal;
  /** 지금 시트의 값 */
  current: string;
  status: ProposalStatus;
  /** 충돌한 셀을 덮어쓰기로 골랐는지 */
  overwrite: boolean;
}

/**
 * 제안마다 지금 값과 비교한 상태를 만든다.
 * 덮어쓰기는 "고를 때 본 값"에 묶여 있다. 그 뒤에 또 바뀌면 다시 확인할 때까지 건너뛴다.
 * 사용자가 덮어쓰기로 한 것은 그때 본 값이지, 그 뒤에 들어온 다른 사람의 값이 아니기 때문이다.
 */
export function evaluateProposals(
  proposals: readonly AiProposal[],
  readCurrent: (cell: string) => string,
  overwrites: ReadonlyMap<string, string>,
): ProposalState[] {
  return proposals.map((proposal) => {
    const current = readCurrent(proposal.cell);
    const status = classifyCell(proposal.before, current, proposal.after);
    const overwrite = status === "conflict" && overwrites.get(proposal.cell) === current;
    return { proposal, current, status, overwrite };
  });
}

/** 적용하면 실제로 쓰일 제안 */
export function writable(state: ProposalState): boolean {
  return state.status === "clean" || state.overwrite;
}

export interface ProposalSummary {
  /** 적용하면 쓰이는 셀 수 */
  toApply: number;
  /** 바뀌어서 건너뛸 셀 수 */
  skipped: number;
  /** 충돌한 셀 수(덮어쓰기를 고른 것 포함) */
  conflicts: number;
}

export function summarize(states: readonly ProposalState[]): ProposalSummary {
  let toApply = 0;
  let skipped = 0;
  let conflicts = 0;
  for (const s of states) {
    if (writable(s)) toApply++;
    if (s.status === "conflict") {
      conflicts++;
      if (!s.overwrite) skipped++;
    }
  }
  return { toApply, skipped, conflicts };
}

/** 셀들을 모두 감싸는 가장 작은 범위. 없으면 null */
export function boundingRange(cells: ReadonlyArray<{ coord: CellCoord }>): CellRange | null {
  if (cells.length === 0) return null;
  let top = Infinity;
  let left = Infinity;
  let bottom = -Infinity;
  let right = -Infinity;
  for (const { coord } of cells) {
    top = Math.min(top, coord.row);
    left = Math.min(left, coord.col);
    bottom = Math.max(bottom, coord.row);
    right = Math.max(right, coord.col);
  }
  return normalizeRange({ row: top, col: left }, { row: bottom, col: right });
}

/**
 * 다른 참여자에게 알릴 AI 편집 범위. 범위를 정해 요청했으면 그 범위,
 * 시트 전체 요청이면 지금까지 제안된 셀을 감싸는 범위(아직 없으면 null).
 */
export function activityRange(
  scope: CellRange | null,
  proposals: ReadonlyArray<{ coord: CellCoord }>,
): CellRange | null {
  return scope ?? boundingRange(proposals);
}

/** 범위가 정해지지 않은 AI 편집은 시트 전체로 본다. 다른 탭에서 온 범위는 시트 안으로 자른다. */
function effectiveRange(range: CellRange | null): CellRange | null {
  return range ? intersectRanges(range, SHEET_RANGE) : SHEET_RANGE;
}

export interface AiOverlap {
  participant: Participant;
  activity: AiActivity;
}

/**
 * 이 범위(null이면 시트 전체)와 겹치는 다른 참여자의 AI 편집.
 * 겹쳐도 요청은 막지 않는다. 잠그지 않으니 서로 기다리다 멈추는 일이 없고,
 * 먼저 적용된 셀은 나중 쪽 결과에서 충돌로 표시된다.
 */
export function overlappingAi(
  participants: readonly Participant[],
  range: CellRange | null,
): AiOverlap[] {
  const mine = effectiveRange(range);
  if (!mine) return [];
  const overlaps: AiOverlap[] = [];
  for (const participant of participants) {
    const activity = participant.ai;
    if (participant.isSelf || !activity) continue;
    const theirs = effectiveRange(activity.range);
    if (theirs && intersectRanges(mine, theirs)) overlaps.push({ participant, activity });
  }
  return overlaps;
}

/**
 * 셀 하나가 다른 참여자의 AI 편집 범위 안에 있는지(입력할 때 안내용).
 * 시트 전체 요청이라 아직 범위를 모르면 모든 셀에 안내가 뜨지 않도록 뺀다.
 */
export function aiActivitiesAt(
  participants: readonly Participant[],
  coord: CellCoord,
): AiOverlap[] {
  return overlappingAi(participants, { start: coord, end: coord }).filter(
    ({ activity }) => activity.range !== null,
  );
}
