import { rangeToA1, toA1 } from "@/lib/sheet/address";
import { clampCoord, selectionRange } from "@/lib/sheet/selection";
import { strings } from "@/resources/strings";
import type { Participant } from "./presence-state";

/** 참여자 목록에 보이는 상태. AI 편집 > 입력 > 선택 순으로 하나만 보여 준다. */
export function participantStatus(p: Participant): string {
  if (p.ai) {
    const where = p.ai.range ? rangeToA1(p.ai.range) : null;
    return strings.participants.status.ai(where, p.ai.status === "reviewing");
  }
  // 다른 탭에서 온 좌표라 시트 범위 안으로 맞춘다.
  if (p.editing) return strings.participants.status.editing(toA1(clampCoord(p.editing)));
  if (p.selection) {
    const { anchor, focus, active } = p.selection;
    const range = selectionRange({ anchor: clampCoord(anchor), focus: clampCoord(focus), active });
    return strings.participants.status.viewing(rangeToA1(range));
  }
  return strings.participants.status.joining;
}
