import { Pencil } from "lucide-react";
import { Fragment, memo } from "react";
import type { Participant } from "@/lib/collab/presence-state";
import { cellRect, outsetRect, rangeRect } from "@/lib/sheet/geometry";
import { isMultiCell, selectionRange } from "@/lib/sheet/selection";
import { ICON } from "@/styles/icon";
import { strings } from "@/resources/strings";
import { AnchoredLabel } from "./AnchoredLabel";
import { Layer } from "./layers";
import { participantTint } from "./participant-tint";

interface RemoteCursorsProps {
  participants: Participant[];
}

/** 다른 참여자의 커서는 내 선택보다 아래 층에 그려서 내 커서를 가리지 않게 함. 이름표만 위로 올림. */
export const RemoteCursors = memo(function RemoteCursors({ participants }: RemoteCursorsProps) {
  return participants.map((participant) => {
    const { selection, editing, user, clientId, isSelf } = participant;
    if (isSelf || !selection) return null;

    const range = outsetRect(rangeRect(selectionRange(selection)));
    const cursor = editing ?? selection.active;
    const rect = outsetRect(cellRect(cursor));
    const labelBelow = cursor.row === 0; // 첫 행이면 머리글에 가리지 않게 아래에 붙임.

    return (
      <Fragment key={clientId}>
        {isMultiCell(selection) && (
          <div
            className="overlay border"
            style={{
              ...range,
              zIndex: Layer.remoteRange,
              borderColor: user.color,
              backgroundColor: participantTint(user.color, "selection"),
            }}
          />
        )}
        <div
          className="overlay border-2"
          style={{
            ...rect,
            zIndex: Layer.remoteCursor,
            borderColor: user.color,
            backgroundColor: editing ? participantTint(user.color, "editingCell") : undefined,
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
