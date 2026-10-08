"use client";

import { Users } from "lucide-react";
import { Popover } from "@/components/ui/Popover";
import { useParticipants } from "@/hooks/sheet/useParticipants";
import type { Participant } from "@/lib/collab/presence-state";
import type { CellCoord } from "@/lib/sheet/address";
import { strings } from "@/resources/strings";
import { ICON } from "@/styles/icon";
import { useSheet } from "../SheetContext";
import { Avatar } from "./Avatar";
import { OtherRow, SelfRow } from "./ParticipantRows";

const MAX_AVATARS = 4;

export function ParticipantList() {
  const { session, controller } = useSheet();
  const { presence } = session;
  const participants = useParticipants(presence);
  const shown = participants.slice(0, MAX_AVATARS);
  const hidden = participants.length - shown.length;

  return (
    <Popover
      role="dialog"
      label={strings.participants.list}
      triggerLabel={strings.participants.count(participants.length)}
      triggerClassName="flex items-center gap-md rounded-full py-xs pr-lg pl-xs hover:bg-hover"
      trigger={
        <>
          <span className="flex">
            {shown.map((p, i) => (
              <Avatar key={p.clientId} participant={p} className={i > 0 ? "-ml-sm" : ""} />
            ))}
            {hidden > 0 && (
              <span className="avatar -ml-sm bg-fill-strong text-caption text-fg-muted">
                +{hidden}
              </span>
            )}
          </span>
          <span className="flex items-center gap-xs text-body text-fg-muted">
            <Users size={ICON.sm} aria-hidden />
            {participants.length}
          </span>
        </>
      }
      panelClassName="top-11 right-0 w-72 py-md"
    >
      {(close) => (
        <ParticipantPanel
          participants={participants}
          onJump={(coord) => {
            close();
            controller.jumpTo(coord);
          }}
          onRename={(name) => presence.rename(name)}
          onRenameDone={() => controller.focus()}
        />
      )}
    </Popover>
  );
}

function ParticipantPanel({
  participants,
  onJump,
  onRename,
  onRenameDone,
}: {
  participants: Participant[];
  onJump: (coord: CellCoord) => void;
  onRename: (name: string) => void;
  onRenameDone: () => void;
}) {
  return (
    <>
      <p className="px-lg pb-md text-label font-medium text-fg-subtle">
        {strings.participants.heading(participants.length)}
      </p>
      <ul>
        {participants.map((p) => (
          <li key={p.clientId}>
            {p.isSelf ? (
              <SelfRow participant={p} onRename={onRename} onDone={onRenameDone} />
            ) : (
              <OtherRow participant={p} onJump={onJump} />
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
