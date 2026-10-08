import { Check, Pencil } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { strings } from "@/resources/strings";
import { ICON } from "@/styles/icon";
import { MAX_NAME_LENGTH } from "@/lib/collab/identity";
import { participantStatus } from "@/lib/collab/messages";
import type { Participant } from "@/lib/collab/presence-state";
import { isImeComposing } from "@/lib/platform";
import type { CellCoord } from "@/lib/sheet/address";
import { Avatar } from "./Avatar";

/** 나. 이름을 바꿀 수 있음. */
export function SelfRow({
  participant,
  onRename,
  onDone,
}: {
  participant: Participant;
  onRename: (name: string) => void;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  const save = () => {
    if (draft !== null) onRename(draft);
    setDraft(null);
    onDone();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (isImeComposing(e.nativeEvent)) return;
    if (e.key === "Enter") save();
    if (e.key === "Escape") {
      // 이름 변경만 취소하고 목록은 열어 둠.
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
            <span className="list-row-meta">{participantStatus(participant)}</span>
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

/** 다른 참여자. 누르면 그 사람이 입력 중인 셀(없으면 선택한 셀)로 이동함. 아직 선택이 없으면 누를 수 없음. */
export function OtherRow({
  participant,
  onJump,
}: {
  participant: Participant;
  onJump: (coord: CellCoord) => void;
}) {
  const { selection, editing, user } = participant;
  const jumpTarget = selection ? (editing ?? selection.active) : null;
  return (
    <button
      type="button"
      disabled={!jumpTarget}
      onClick={() => jumpTarget && onJump(jumpTarget)}
      title={strings.participants.jumpTo}
      className="list-row"
    >
      <Avatar participant={participant} />
      <span className="min-w-0 flex-1">
        <span className="list-row-title">{user.name}</span>
        <span className="list-row-meta">{participantStatus(participant)}</span>
      </span>
    </button>
  );
}
