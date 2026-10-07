import { intersectRanges, type CellRange } from "@/lib/sheet/address";
import { SHEET_RANGE } from "@/lib/sheet/schema";
import type { Participant } from "./presence-state";

/**
 * AI 편집 잠금. 요청한 사람이 켜면, 결과를 적용하거나 버릴 때까지 그 범위를 다른 참여자가 바꿀 수 없음.
 * 잠금은 awareness에 실려 있어서, 요청한 탭이 닫히면(Web Locks로 감지) 바로 풀림.
 */

/** AI 편집이 닿는 범위. null이면 시트 전체. 다른 탭에서 온 범위일 수 있어서 시트 안으로 자름. */
export function aiArea(range: CellRange | null): CellRange | null {
  return range ? intersectRanges(range, SHEET_RANGE) : SHEET_RANGE;
}

/** range와 겹치는 범위를 잠근 다른 참여자. 없으면 null */
export function lockHolder(
  participants: readonly Participant[],
  range: CellRange,
): Participant | null {
  for (const participant of participants) {
    if (participant.isSelf || !participant.ai?.locked) continue;
    const area = aiArea(participant.ai.range);
    if (area && intersectRanges(area, range)) return participant;
  }
  return null;
}
