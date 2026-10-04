import { Sparkles } from "lucide-react";
import { Fragment, memo } from "react";
import type { Participant } from "@/lib/collab/presence";
import { intersectRanges } from "@/lib/sheet/address";
import { outsetRect, rangeRect } from "@/lib/sheet/geometry";
import { SHEET_RANGE } from "@/lib/sheet/schema";
import { Layer } from "./layers";

interface RemoteAiActivityProps {
  participants: Participant[];
}

/** 제안 값은 보여 주지 않는다. 확정되지 않은 값이 실제 데이터처럼 보이면 혼란스럽다. */
export const RemoteAiActivity = memo(function RemoteAiActivity({
  participants,
}: RemoteAiActivityProps) {
  return participants.map(({ clientId, isSelf, user, ai }) => {
    if (isSelf || !ai?.range) return null;
    // 다른 탭에서 온 범위라 시트 안으로 자른다.
    const range = intersectRanges(ai.range, SHEET_RANGE);
    if (!range) return null;
    const rect = outsetRect(rangeRect(range));
    const labelBelow = range.start.row === 0;
    return (
      <Fragment key={clientId}>
        <div
          className="remote-ai-range"
          style={{
            ...rect,
            zIndex: Layer.remoteAi,
            borderColor: user.color,
            backgroundColor: `${user.color}0d`,
          }}
        />
        <div
          className="name-tag"
          style={{
            // 같은 범위의 선택 이름표와 겹치지 않게 오른쪽 끝에 붙인다.
            right: `calc(100% - ${rect.left + rect.width}px)`,
            top: labelBelow ? rect.top + rect.height : rect.top - 16,
            zIndex: Layer.remoteLabel,
            backgroundColor: user.color,
            borderRadius: labelBelow ? "0 0 3px 3px" : "3px 3px 0 0",
          }}
        >
          <Sparkles size={9} strokeWidth={2.5} aria-hidden />
          {user.name} · {ai.status === "reviewing" ? "AI 결과 검토 중" : "AI 편집 중"}
        </div>
      </Fragment>
    );
  });
});
