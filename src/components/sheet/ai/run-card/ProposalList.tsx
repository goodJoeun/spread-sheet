import type { ProposalState } from "@/lib/ai/coedit";
import type { AiProposal } from "@/lib/ai/run";
import type { CellCoord } from "@/lib/sheet/address";
import { strings } from "@/resources/strings";

const S = strings.ai.run;

const DIFF_ROW =
  "grid w-full grid-cols-[2.5rem_1fr_auto_1fr] items-center gap-sm px-md py-xs text-left text-label " +
  "hover:bg-hover";
/** 제안 아래 덧붙임 줄. 셀 이름 칸(앞 여백 8 + 칸 40 + 간격 6)만큼 들여 쓴다. */
const DIFF_NOTE = "px-md pb-xs pl-[54px] text-caption";

interface ProposalListProps {
  proposals: readonly AiProposal[];
  /** 지금 시트 값과 비교한 상태. 지난 실행이면 null(비교하지 않는다) */
  states: ProposalState[] | null;
  reviewing: boolean;
  onJump: (coord: CellCoord) => void;
  onOverwrite: (cell: string, overwrite: boolean) => void;
}

export function ProposalList({
  proposals,
  states,
  reviewing,
  onJump,
  onOverwrite,
}: ProposalListProps) {
  return (
    <ul
      aria-label={S.proposals}
      className="max-h-56 divide-y divide-line/60 overflow-y-auto rounded-sm border border-line"
    >
      {(states ?? proposals.map(plainState)).map((state) => (
        <ProposalRow
          key={state.proposal.cell}
          state={state}
          reviewing={reviewing}
          onJump={() => onJump(state.proposal.coord)}
          onOverwrite={(on) => onOverwrite(state.proposal.cell, on)}
        />
      ))}
    </ul>
  );
}

/** 지난 실행처럼 지금 값과 비교하지 않는 제안 */
function plainState(proposal: AiProposal): ProposalState {
  return { proposal, current: proposal.before, status: "clean", overwrite: false };
}

function ProposalRow({
  state,
  reviewing,
  onJump,
  onOverwrite,
}: {
  state: ProposalState;
  reviewing: boolean;
  onJump: () => void;
  onOverwrite: (overwrite: boolean) => void;
}) {
  const { proposal: p, current, status, overwrite } = state;
  const conflict = status === "conflict";
  const muted = status === "same" || (conflict && !overwrite);
  const show = (text: string, empty: string) => text || <i className="text-fg-faint">{empty}</i>;

  return (
    <li className={conflict ? "bg-warn-soft/60" : undefined}>
      <button type="button" onClick={onJump} title={S.jumpTo(p.cell)} className={DIFF_ROW}>
        <span className="font-medium text-fg-subtle">{p.cell}</span>
        <span className="truncate text-fg-faint line-through">{show(current, S.empty)}</span>
        <span className="text-fg-faint">→</span>
        <span className={`truncate font-medium ${muted ? "text-fg-faint" : "text-ai-ink"}`}>
          {show(p.after, S.cleared)}
        </span>
      </button>
      {status === "same" && <p className={`${DIFF_NOTE} text-fg-subtle`}>{S.same}</p>}
      {conflict && (
        <div className={`${DIFF_NOTE} flex items-center gap-md pb-sm text-warn-ink`}>
          <span className="min-w-0 flex-1 truncate">
            {S.conflict.changedSince} {show(p.before, S.empty)} → {S.conflict.now}{" "}
            {show(current, S.empty)}
          </span>
          {reviewing && (
            <label className="flex shrink-0 cursor-pointer items-center gap-xs">
              <input
                type="checkbox"
                checked={overwrite}
                onChange={(e) => onOverwrite(e.target.checked)}
                className="accent-warn-strong"
              />
              {S.conflict.overwrite}
            </label>
          )}
        </div>
      )}
    </li>
  );
}
