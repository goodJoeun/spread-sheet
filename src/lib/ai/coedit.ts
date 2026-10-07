import {
  intersectRanges,
  normalizeRange,
  type CellCoord,
  type CellRange,
} from "@/lib/sheet/address";
import { aiArea } from "@/lib/collab/locks";
import type { AiActivity, Participant } from "@/lib/collab/presence-state";
import { isRunning, type AiProposal, type AiRun } from "./run";

/**
 * 요청 때 값(base)에서 바뀐 셀은 충돌로 보고 기본으로 건너뜀.
 * AI 결과는 다시 만들 수 있지만 사람의 입력은 그렇지 않음. 그래서 AI가 사람의 변경을 몰래 덮어쓰지 않게 함.
 */

/** same: 지금 값이 이미 제안과 같음(다른 참여자가 같은 값으로 바꾼 경우 포함) */
export type ProposalStatus = "same" | "clean" | "conflict";

export function classifyCell(base: string, current: string, proposed: string): ProposalStatus {
  if (proposed === current) return "same";
  if (current === base) return "clean";
  return "conflict";
}

export interface ProposalState {
  proposal: AiProposal;
  current: string;
  status: ProposalStatus;
  overwrite: boolean;
}

/** 덮어쓰기는 고를 때 본 값에만 적용됨. 그 뒤에 값이 또 바뀌면 다른 사람의 새 값이므로, 다시 고를 때까지 건너뜀. */
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

export function writable(state: ProposalState): boolean {
  return state.status === "clean" || state.overwrite;
}

export interface ProposalSummary {
  toApply: number;
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

export function activityRange(
  scope: CellRange | null,
  proposals: ReadonlyArray<{ coord: CellCoord }>,
): CellRange | null {
  return scope ?? boundingRange(proposals);
}

/**
 * 다른 참여자에게 알릴 내 AI 편집 상태. 제안 값은 싣지 않음.
 * 잠근 실행은 요청한 범위를 그대로 알림. 제안에 따라 범위가 바뀌면 어느 셀이 잠겼는지 예측할 수 없기 때문.
 */
export function aiActivityOf(run: AiRun | null): AiActivity | null {
  if (!run || !(isRunning(run) || run.status === "review")) return null;
  return {
    status: run.status === "review" ? "reviewing" : "generating",
    range: run.locked ? run.scope : activityRange(run.scope, run.proposals),
    locked: run.locked,
  };
}

export interface AiOverlap {
  participant: Participant;
  activity: AiActivity;
}

/** 잠그지 않은 AI 편집끼리는 범위가 겹쳐도 요청을 막지 않음. 먼저 적용된 셀은 나중 결과에서 충돌로 표시됨. */
export function overlappingAi(
  participants: readonly Participant[],
  range: CellRange | null,
): AiOverlap[] {
  const mine = aiArea(range);
  if (!mine) return [];
  const overlaps: AiOverlap[] = [];
  for (const participant of participants) {
    const activity = participant.ai;
    if (participant.isSelf || !activity) continue;
    const theirs = aiArea(activity.range);
    if (theirs && intersectRanges(mine, theirs)) overlaps.push({ participant, activity });
  }
  return overlaps;
}

/**
 * 겹침 중에서 요청을 막는 것만 고름. 남이 잠근 범위에는 요청할 수 없고, 내가 잠그려면 겹치는 AI 편집이 없어야 함.
 * 그래서 잠긴 범위에서는 AI 실행이 항상 하나뿐임.
 */
export function blockingOverlaps(overlaps: readonly AiOverlap[], lock: boolean): AiOverlap[] {
  return lock ? [...overlaps] : overlaps.filter((o) => o.activity.locked);
}

/** 범위가 아직 정해지지 않은 시트 전체 요청은 뺌. 모든 셀에 안내가 뜨지 않도록. */
export function aiActivitiesAt(
  participants: readonly Participant[],
  coord: CellCoord,
): AiOverlap[] {
  return overlappingAi(participants, { start: coord, end: coord }).filter(
    ({ activity }) => activity.range !== null,
  );
}
