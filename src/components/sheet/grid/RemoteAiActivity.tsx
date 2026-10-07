import { Lock, Sparkles } from "lucide-react";
import { Fragment, memo } from "react";
import type { Participant } from "@/lib/collab/presence-state";
import { intersectRanges } from "@/lib/sheet/address";
import { outsetRect, rangeRect } from "@/lib/sheet/geometry";
import { SHEET_RANGE } from "@/lib/sheet/schema";
import { ICON } from "@/styles/icon";
import { strings } from "@/resources/strings";
import { AnchoredLabel } from "./AnchoredLabel";
import { Layer } from "./layers";

interface RemoteAiActivityProps {
  participants: Participant[];
}

/** AI 제안 값은 보여 주지 않음. 확정되지 않은 값이 실제 데이터처럼 보이면 헷갈리기 때문. */
export const RemoteAiActivity = memo(function RemoteAiActivity({
  participants,
}: RemoteAiActivityProps) {
  return participants.map(({ clientId, isSelf, user, ai }) => {
    if (isSelf || !ai?.range) return null;
    // 다른 탭에서 온 범위라 시트 밖으로 벗어나지 않게 자름.
    const range = intersectRanges(ai.range, SHEET_RANGE);
    if (!range) return null;
    const rect = outsetRect(rangeRect(range));
    const labelBelow = range.start.row === 0;
    return (
      <Fragment key={clientId}>
        <div
          className="overlay border-2 border-dashed"
          style={{
            ...rect,
            zIndex: Layer.remoteAi,
            borderColor: user.color,
            backgroundColor: `${user.color}0d`,
          }}
        />
        {/* 같은 범위에 붙는 선택 이름표와 겹치지 않게 오른쪽 끝에 붙임. */}
        <AnchoredLabel
          rect={rect}
          below={labelBelow}
          align="end"
          zIndex={Layer.remoteLabel}
          className="name-tag"
          color={user.color}
        >
          {ai.locked ? (
            <Lock size={ICON.xs} strokeWidth={2.5} aria-hidden />
          ) : (
            <Sparkles size={ICON.xs} strokeWidth={2.5} aria-hidden />
          )}
          {user.name} · {strings.grid.remoteAi(ai.status === "reviewing", ai.locked)}
        </AnchoredLabel>
      </Fragment>
    );
  });
});
