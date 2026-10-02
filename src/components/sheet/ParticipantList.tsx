"use client";

import { Check, Pencil, Users } from "lucide-react";
import { useCallback, useRef, useState, type KeyboardEvent } from "react";
import { useDismiss } from "@/components/ui/useDismiss";
import type { Participant, Presence } from "@/lib/collab/presence";
import { rangeToA1, toA1, type CellCoord } from "@/lib/sheet/address";
import { clampCoord, selectionRange } from "@/lib/sheet/selection";
import { useSheet } from "./SheetContext";
import { useParticipants } from "./useSheetSession";

const MAX_AVATARS = 4;

/** 헤더의 참여자 아바타. 누르면 목록이 열리고, 다른 사람을 누르면 그 위치로 이동한다. */
export function ParticipantList() {
  const { session, controller } = useSheet();
  const { presence } = session;
  const participants = useParticipants(presence);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(rootRef, open, close);

  const shown = participants.slice(0, MAX_AVATARS);
  const hidden = participants.length - shown.length;

  const jumpTo = (coord: CellCoord) => {
    setOpen(false);
    controller.jumpTo(clampCoord(coord));
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`참여자 ${participants.length}명`}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full py-1 pr-3 pl-1 hover:bg-black/5"
      >
        <span className="flex">
          {shown.map((p, i) => (
            <Avatar key={p.clientId} participant={p} className={i > 0 ? "-ml-1.5" : ""} />
          ))}
          {hidden > 0 && (
            <span className="-ml-1.5 flex size-7 items-center justify-center rounded-full bg-neutral-200 text-[11px] font-semibold text-neutral-600 ring-2 ring-white">
              +{hidden}
            </span>
          )}
        </span>
        <span className="flex items-center gap-1 text-[13px] text-neutral-600">
          <Users size={14} aria-hidden />
          {participants.length}
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="참여자 목록"
          className="absolute top-11 right-0 z-50 w-72 rounded-lg border border-header-line bg-white py-2 shadow-xl"
        >
          <p className="px-3 pb-2 text-xs font-medium text-neutral-500">
            지금 이 시트에 {participants.length}명이 있어요
          </p>
          <ul>
            {participants.map((p) => (
              <li key={p.clientId}>
                {p.isSelf ? (
                  <SelfRow participant={p} presence={presence} onDone={() => controller.focus()} />
                ) : (
                  <button
                    type="button"
                    disabled={!p.selection}
                    onClick={() => p.selection && jumpTo(p.editing ?? p.selection.active)}
                    title="이 참여자의 위치로 이동"
                    className="flex w-full items-center gap-3 px-3 py-1.5 text-left hover:bg-black/5 disabled:hover:bg-transparent"
                  >
                    <Avatar participant={p} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-neutral-800">
                        {p.user.name}
                      </span>
                      <span className="block text-[11px] text-neutral-500">{statusText(p)}</span>
                    </span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function statusText(p: Participant): string {
  if (p.editing) return `${toA1(clampCoord(p.editing))} 입력 중`;
  if (p.selection) {
    const { anchor, focus, active } = p.selection;
    return `${rangeToA1(selectionRange({ anchor: clampCoord(anchor), focus: clampCoord(focus), active }))} 보는 중`;
  }
  return "들어오는 중";
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
    <div className="flex items-center gap-3 px-3 py-1.5">
      <Avatar participant={participant} />
      {draft === null ? (
        <>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] text-neutral-800">
              {participant.user.name} <span className="text-neutral-400">(나)</span>
            </span>
            <span className="block text-[11px] text-neutral-500">{statusText(participant)}</span>
          </span>
          <button
            type="button"
            aria-label="내 이름 바꾸기"
            title="내 이름 바꾸기"
            onClick={() => setDraft(participant.user.name)}
            className="rounded p-1 text-neutral-500 hover:bg-black/5 hover:text-neutral-800"
          >
            <Pencil size={14} />
          </button>
        </>
      ) : (
        <>
          <input
            autoFocus
            aria-label="내 이름"
            value={draft}
            maxLength={20}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            className="min-w-0 flex-1 rounded border border-accent px-2 py-1 text-[13px] outline-none"
          />
          <button
            type="button"
            aria-label="이름 저장"
            onClick={save}
            className="rounded p-1 text-accent hover:bg-accent/10"
          >
            <Check size={16} />
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
      title={isSelf ? `${user.name} (나)` : user.name}
      className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white ring-2 ring-white ${className}`}
      style={{ backgroundColor: user.color }}
    >
      {initial}
    </span>
  );
}
