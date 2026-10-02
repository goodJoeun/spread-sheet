import { Pencil } from "lucide-react";
import { Fragment, memo } from "react";
import type { Participant } from "@/lib/collab/presence";
import { cellRect, outsetRect, rangeRect } from "@/lib/sheet/geometry";
import { clampCoord, isMultiCell, selectionRange } from "@/lib/sheet/selection";
import { Layer } from "./layers";

interface RemoteCursorsProps {
  participants: Participant[];
}

/**
 * 다른 참여자의 선택 범위, active 셀, 입력 중인 셀을 그 사람의 색으로 그린다.
 * 내 선택보다 아래 레이어에 두어 내 커서가 가려지지 않게 하고, 이름표만 위로 올린다.
 */
export const RemoteCursors = memo(function RemoteCursors({ participants }: RemoteCursorsProps) {
  return participants.map((participant) => {
    const { selection, editing, user, clientId, isSelf } = participant;
    if (isSelf || !selection) return null;

    // 다른 탭에서 온 좌표라 시트 범위 안으로 맞춘다.
    const safe = {
      anchor: clampCoord(selection.anchor),
      focus: clampCoord(selection.focus),
      active: clampCoord(selection.active),
    };
    const range = outsetRect(rangeRect(selectionRange(safe)));
    const cursor = clampCoord(editing ?? safe.active);
    const rect = outsetRect(cellRect(cursor));
    const labelBelow = cursor.row === 0; // 첫 행이면 머리글에 가리지 않게 아래에 붙인다.

    return (
      <Fragment key={clientId}>
        {isMultiCell(safe) && (
          <div
            className="pointer-events-none absolute border"
            style={{
              ...range,
              zIndex: Layer.remoteRange,
              borderColor: user.color,
              backgroundColor: `${user.color}14`,
            }}
          />
        )}
        <div
          className="pointer-events-none absolute border-2"
          style={{
            ...rect,
            zIndex: Layer.remoteCursor,
            borderColor: user.color,
            backgroundColor: editing ? `${user.color}1f` : undefined,
          }}
        />
        <div
          className="pointer-events-none absolute flex items-center gap-1 px-1 text-[10px] leading-4 font-medium whitespace-nowrap text-white shadow-sm"
          style={{
            left: rect.left,
            top: labelBelow ? rect.top + rect.height : rect.top - 16,
            zIndex: Layer.remoteLabel,
            backgroundColor: user.color,
            borderRadius: labelBelow ? "0 0 3px 3px" : "3px 3px 0 0",
          }}
        >
          {editing && <Pencil size={9} strokeWidth={2.5} aria-hidden />}
          {user.name}
          {editing && <span className="opacity-90">· 입력 중</span>}
        </div>
      </Fragment>
    );
  });
});
