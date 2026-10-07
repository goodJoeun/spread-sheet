import { Pencil } from "lucide-react";
import { Fragment, memo } from "react";
import type { Participant } from "@/lib/collab/presence-state";
import { cellRect, outsetRect, rangeRect } from "@/lib/sheet/geometry";
import { clampCoord, isMultiCell, selectionRange } from "@/lib/sheet/selection";
import { ICON } from "@/styles/icon";
import { strings } from "@/resources/strings";
import { AnchoredLabel } from "./AnchoredLabel";
import { Layer } from "./layers";

interface RemoteCursorsProps {
  participants: Participant[];
}

/** 다른 참여자의 커서는 내 선택보다 아래 층에 그려서 내 커서를 가리지 않게 함. 이름표만 위로 올림. */
export const RemoteCursors = memo(function RemoteCursors({ participants }: RemoteCursorsProps) {
  return participants.map((participant) => {
    const { selection, editing, user, clientId, isSelf } = participant;
    if (isSelf || !selection) return null;

    // 다른 탭에서 온 좌표라 시트 범위 안으로 맞춤.
    const safe = {
      anchor: clampCoord(selection.anchor),
      focus: clampCoord(selection.focus),
      active: clampCoord(selection.active),
    };
    const range = outsetRect(rangeRect(selectionRange(safe)));
    const cursor = clampCoord(editing ?? safe.active);
    const rect = outsetRect(cellRect(cursor));
    const labelBelow = cursor.row === 0; // 첫 행이면 머리글에 가리지 않게 아래에 붙임.

    return (
      <Fragment key={clientId}>
        {isMultiCell(safe) && (
          <div
            className="overlay border"
            style={{
              ...range,
              zIndex: Layer.remoteRange,
              borderColor: user.color,
              backgroundColor: `${user.color}14`,
            }}
          />
        )}
        <div
          className="overlay border-2"
          style={{
            ...rect,
            zIndex: Layer.remoteCursor,
            borderColor: user.color,
            backgroundColor: editing ? `${user.color}1f` : undefined,
          }}
        />
        <AnchoredLabel
          rect={rect}
          below={labelBelow}
          zIndex={Layer.remoteLabel}
          className="name-tag"
          color={user.color}
        >
          {editing && <Pencil size={ICON.xs} strokeWidth={2.5} aria-hidden />}
          {user.name}
          {editing && <span className="opacity-90">{strings.grid.remoteEditing}</span>}
        </AnchoredLabel>
      </Fragment>
    );
  });
});
