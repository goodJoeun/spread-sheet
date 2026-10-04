"use client";

import { Check, Pencil, Users } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { Popover } from "@/components/ui/Popover";
import { strings } from "@/resources/strings";
import { ICON } from "@/styles/icon";
import { MAX_NAME_LENGTH } from "@/lib/collab/identity";
import type { Presence } from "@/lib/collab/presence";
import type { Participant } from "@/lib/collab/presence-state";
import { rangeToA1, toA1, type CellCoord } from "@/lib/sheet/address";
import { clampCoord, selectionRange } from "@/lib/sheet/selection";
import { useSheet } from "./SheetContext";
import { useParticipants } from "@/hooks/sheet/useParticipants";

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
          presence={presence}
          onJump={(coord) => {
            close();
            controller.jumpTo(clampCoord(coord));
          }}
          onRenamed={() => controller.focus()}
        />
      )}
    </Popover>
  );
}

function ParticipantPanel({
  participants,
  presence,
  onJump,
  onRenamed,
}: {
  participants: Participant[];
  presence: Presence;
  onJump: (coord: CellCoord) => void;
  onRenamed: () => void;
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
              <SelfRow participant={p} presence={presence} onDone={onRenamed} />
            ) : (
              <button
                type="button"
                disabled={!p.selection}
                onClick={() => p.selection && onJump(p.editing ?? p.selection.active)}
                title={strings.participants.jumpTo}
                className="list-row"
              >
                <Avatar participant={p} />
                <span className="min-w-0 flex-1">
                  <span className="list-row-title">{p.user.name}</span>
                  <span className="list-row-meta">{statusText(p)}</span>
                </span>
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function statusText(p: Participant): string {
  if (p.ai) {
    const where = p.ai.range ? rangeToA1(p.ai.range) : null;
    return strings.participants.status.ai(where, p.ai.status === "reviewing");
  }
  if (p.editing) return strings.participants.status.editing(toA1(clampCoord(p.editing)));
  if (p.selection) {
    const { anchor, focus, active } = p.selection;
    const range = selectionRange({ anchor: clampCoord(anchor), focus: clampCoord(focus), active });
    return strings.participants.status.viewing(rangeToA1(range));
  }
  return strings.participants.status.joining;
}

function SelfRow({
  participant,
  presence,
  onDone,
}: {
  participant: Participant;
  presence: Presence;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  const save = () => {
    if (draft !== null) presence.rename(draft);
    setDraft(null);
    onDone();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter") save();
    if (e.key === "Escape") {
      // 목록은 열어 둔 채 이름 변경만 취소한다.
      e.stopPropagation();
      setDraft(null);
    }
  };

  return (
    <div className="list-row">
      <Avatar participant={participant} />
      {draft === null ? (
        <>
          <span className="min-w-0 flex-1">
            <span className="list-row-title">
              {participant.user.name}{" "}
              <span className="text-fg-faint">{strings.participants.me}</span>
            </span>
            <span className="list-row-meta">{statusText(participant)}</span>
          </span>
          <button
            type="button"
            aria-label={strings.participants.rename}
            title={strings.participants.rename}
            onClick={() => setDraft(participant.user.name)}
            className="icon-btn-sm"
          >
            <Pencil size={ICON.sm} />
          </button>
        </>
      ) : (
        <>
          <input
            autoFocus
            aria-label={strings.participants.nameInput}
            value={draft}
            maxLength={MAX_NAME_LENGTH}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            className="min-w-0 flex-1 rounded-sm border border-accent px-md py-xs text-body outline-none"
          />
          <button
            type="button"
            aria-label={strings.participants.saveName}
            onClick={save}
            className="icon-btn-sm text-accent hover:bg-accent/10 hover:text-accent"
          >
            <Check size={ICON.sm} />
          </button>
        </>
      )}
    </div>
  );
}

function Avatar({ participant, className = "" }: { participant: Participant; className?: string }) {
  const { user, isSelf } = participant;
  const initial = user.name.split(" ").at(-1)?.charAt(0) ?? "?";
  return (
    <span
      title={isSelf ? strings.participants.withMe(user.name) : user.name}
      className={`avatar ${className}`}
      style={{ backgroundColor: user.color }}
    >
      {initial}
    </span>
  );
}
