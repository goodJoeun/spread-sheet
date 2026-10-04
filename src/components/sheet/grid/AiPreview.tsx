import { Sparkles } from "lucide-react";
import { memo } from "react";
import type { AiRun } from "@/lib/ai/ai-controller";
import { summarize, type ProposalState } from "@/lib/ai/coedit";
import { COL_WIDTH, ROW_HEIGHT, cellRect, outsetRect, rangeRect } from "@/lib/sheet/geometry";
import { ICON } from "@/styles/icon";
import { strings } from "@/resources/strings";
import { Layer } from "./layers";

const NUMBER_PATTERN = /^[-+]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?%?$/;

const PROPOSAL =
  "overlay overflow-hidden bg-ai-soft px-xs text-body leading-cell whitespace-pre text-ai-ink";
const PROPOSAL_MARK = "shadow-[inset_2px_0_0_var(--color-ai)]";
/** 충돌한 셀을 덮어쓰기로 고른 경우 주의 색 테두리를 더한다. */
const PROPOSAL_MARK_OVERWRITE =
  "shadow-[inset_2px_0_0_var(--color-ai),inset_0_0_0_1px_var(--color-warn)]";

interface AiPreviewProps {
  run: AiRun | null;
  states: ProposalState[];
  showOriginal: boolean;
}

/** 문서에는 쓰지 않고 셀 위에 제안 값을 덮어 그리기만 한다. */
export const AiPreview = memo(function AiPreview({ run, states, showOriginal }: AiPreviewProps) {
  if (!run) return null;
  const generating = run.status === "waiting" || run.status === "streaming";
  const scope = run.scope ? outsetRect(rangeRect(run.scope)) : null;
  const { conflicts } = summarize(states);
  const count = states.filter((s) => s.status !== "same").length;
  const label = generating ? strings.grid.aiGenerating(count) : strings.grid.aiReviewing(count);

  return (
    <>
      {scope && (
        <>
          <div
            className={`overlay border-2 border-dashed border-ai ${generating ? "animate-pulse" : ""}`}
            style={{ ...scope, zIndex: Layer.aiPreview }}
          />
          <div
            className="grid-label grid-label-ai"
            style={{
              left: scope.left,
              top: run.scope!.start.row === 0 ? scope.top + scope.height : scope.top - 18,
              zIndex: Layer.aiLabel,
            }}
          >
            <Sparkles size={ICON.xs} aria-hidden />
            {label}
            {conflicts > 0 && (
              <span className="text-warn-muted">{strings.grid.aiChanged(conflicts)}</span>
            )}
          </div>
        </>
      )}
      {!showOriginal &&
        states.map(({ proposal: p, current, status, overwrite }) => {
          if (status === "same") return null;
          const rect = cellRect(p.coord);
          const box = {
            left: rect.left,
            top: rect.top,
            // 격자선이 보이도록 1px 안쪽에 그린다.
            width: COL_WIDTH - 1,
            height: ROW_HEIGHT - 1,
            zIndex: Layer.aiPreview,
          };
          if (status === "conflict" && !overwrite) {
            // 지금 값이 그대로 남는 셀이라 값을 가리지 않는다.
            return (
              <div key={p.cell} className="overlay border-2 border-warn bg-warn/10" style={box} />
            );
          }
          const cleared = p.after === "";
          return (
            <div
              key={p.cell}
              className={`${PROPOSAL} ${overwrite ? PROPOSAL_MARK_OVERWRITE : PROPOSAL_MARK}`}
              style={{ ...box, textAlign: NUMBER_PATTERN.test(p.after) ? "right" : "left" }}
            >
              {cleared ? <span className="text-fg-faint line-through">{current}</span> : p.after}
            </div>
          );
        })}
    </>
  );
});
