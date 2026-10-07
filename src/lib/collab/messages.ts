import { rangeToA1, toA1, type CellCoord } from "@/lib/sheet/address";
import { clampCoord, selectionRange } from "@/lib/sheet/selection";
import { strings } from "@/resources/strings";
import { lockHolder } from "./locks";
import type { Participant } from "./presence-state";

/** 참여자 목록에 보이는 상태. AI 편집 > 입력 > 선택 순서로 하나만 보여 줌. */
export function participantStatus(p: Participant): string {
  if (p.ai) {
    const where = p.ai.range ? rangeToA1(p.ai.range) : null;
    return strings.participants.status.ai(where, p.ai.status === "reviewing", p.ai.locked);
  }
  // 다른 탭에서 온 좌표라 시트 범위 안으로 맞춤.
  if (p.editing) return strings.participants.status.editing(toA1(clampCoord(p.editing)));
  if (p.selection) {
    const { anchor, focus, active } = p.selection;
    const range = selectionRange({ anchor: clampCoord(anchor), focus: clampCoord(focus), active });
    return strings.participants.status.viewing(rangeToA1(range));
  }
  return strings.participants.status.joining;
}

/** 잠긴 셀을 편집하려다 막혔을 때 그 셀 위에 띄우는 안내. 그사이 잠금이 풀렸으면 띄우지 않음. */
export function lockedCellNotices(
  participants: readonly Participant[],
  coord: CellCoord,
): string[] {
  const holder = lockHolder(participants, { start: coord, end: coord });
  return holder ? [strings.grid.lockedByAi(holder.user.name)] : [];
}
