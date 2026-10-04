import { Pencil } from "lucide-react";
import { Fragment, memo } from "react";
import type { Participant } from "@/lib/collab/presence";
import { cellRect, outsetRect, rangeRect } from "@/lib/sheet/geometry";
import { clampCoord, isMultiCell, selectionRange } from "@/lib/sheet/selection";
import { Layer } from "./layers";

interface RemoteCursorsProps {
  participants: Participant[];
}

/** 내 선택보다 아래 레이어에 두어 내 커서가 가려지지 않게 하고, 이름표만 위로 올린다. */
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
            className="remote-range"
            style={{
              ...range,
              zIndex: Layer.remoteRange,
              borderColor: user.color,
              backgroundColor: `${user.color}14`,
            }}
          />
        )}
        <div
          className="remote-cursor"
          style={{
            ...rect,
            zIndex: Layer.remoteCursor,
            borderColor: user.color,
            backgroundColor: editing ? `${user.color}1f` : undefined,
          }}
        />
        <div
          className="name-tag"
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
