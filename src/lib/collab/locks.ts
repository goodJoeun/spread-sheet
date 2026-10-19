import { intersectRanges, type CellRange } from "@/lib/sheet/address";
import { SHEET_RANGE } from "@/lib/sheet/schema";
import type { Participant } from "./presence-state";

// [흐름 27 · d38b4a2] 막는 쪽은 SheetController, 잠그는 쪽은 AI 실행. lib/collab은 lib/ai를 몰라야 해서 "참여 상태로 편집 허용을 정하는 규칙"으로 보고 여기 둠.
// 잠금은 새 저장소 없이 AiActivity.locked 하나로 참여 상태에 얹음. 그래서 잠근 탭이 닫히면 잠금도 함께 사라짐.
/**
 * AI 편집 잠금. 요청한 사람이 켜면, 결과를 적용하거나 버릴 때까지 그 범위를 다른 참여자가 바꿀 수 없음.
 * 잠금은 awareness에 실려 있어서, 요청한 탭이 닫히면(Web Locks로 감지) 바로 풀림.
 */

/** AI 작업이 닿는 범위. null(시트 전체 요청)이면 시트 전체로 봄. */
export function aiArea(range: CellRange | null): CellRange {
  return range ?? SHEET_RANGE;
}

/** range와 겹치는 범위를 잠근 다른 참여자를 찾음. 없으면 null. 컨트롤러가 편집을 막을지 정할 때 씀. */
export function lockHolder(
  participants: readonly Participant[],
  range: CellRange,
): Participant | null {
  for (const participant of participants) {
    if (participant.isSelf || !participant.ai?.locked) continue;
    if (intersectRanges(aiArea(participant.ai.range), range)) return participant;
  }
  return null;
}
