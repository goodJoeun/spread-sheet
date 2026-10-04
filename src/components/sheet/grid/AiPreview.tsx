import { Sparkles } from "lucide-react";
import { memo } from "react";
import type { AiRun } from "@/lib/ai/ai-controller";
import { summarize, type ProposalState } from "@/lib/ai/coedit";
import { COL_WIDTH, ROW_HEIGHT, cellRect, outsetRect, rangeRect } from "@/lib/sheet/geometry";
import { Layer } from "./layers";

const NUMBER_PATTERN = /^[-+]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?%?$/;

interface AiPreviewProps {
  run: AiRun | null;
  /** 제안마다 지금 시트 값과 비교한 상태 */
  states: ProposalState[];
  /** 켜면 제안을 걷어 내고 원래 값을 보여 준다(비교용). */
  showOriginal: boolean;
}

/**
 * AI 제안 미리보기. 문서에는 아직 쓰지 않았고, 셀 위에 제안 값을 덮어 그리기만 한다.
 * 편집 범위는 점선으로, 제안된 셀은 보라색 칸으로 보여 준다.
 * 요청 뒤 다른 값으로 바뀐 셀(충돌)은 지금 값을 가리지 않고 주황 테두리만 두른다. 적용하면 건너뛰는 셀이다.
 */
export const AiPreview = memo(function AiPreview({ run, states, showOriginal }: AiPreviewProps) {
  if (!run) return null;
  const generating = run.status === "waiting" || run.status === "streaming";
  const scope = run.scope ? outsetRect(rangeRect(run.scope)) : null;
  const { conflicts } = summarize(states);
  const count = states.filter((s) => s.status !== "same").length;
  const label = generating
    ? `AI가 제안을 만드는 중… ${count > 0 ? `${count}개` : ""}`
    : `AI 제안 ${count}개 · 검토 중`;

  return (
    <>
      {scope && (
        <>
          <div
            className={`pointer-events-none absolute border-2 border-dashed border-ai ${generating ? "animate-pulse" : ""}`}
            style={{ ...scope, zIndex: Layer.aiPreview }}
          />
          <div
            className="pointer-events-none absolute flex items-center gap-1 rounded-t bg-ai px-1.5 text-[11px] leading-[18px] font-medium whitespace-nowrap text-white"
            style={{
              left: scope.left,
              top: run.scope!.start.row === 0 ? scope.top + scope.height : scope.top - 18,
              zIndex: Layer.aiLabel,
            }}
          >
            <Sparkles size={11} aria-hidden />
            {label}
            {conflicts > 0 && <span className="text-amber-200">· 바뀐 셀 {conflicts}개</span>}
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
              <div
                key={p.cell}
                className="pointer-events-none absolute border-2 border-amber-500 bg-amber-400/10"
                style={box}
              />
            );
          }
          const cleared = p.after === "";
          return (
            <div
              key={p.cell}
              className={`pointer-events-none absolute overflow-hidden bg-ai-soft px-1 text-[13px] leading-[23px] whitespace-pre text-ai-ink ${
                overwrite
                  ? "shadow-[inset_2px_0_0_var(--color-ai),inset_0_0_0_1px_#f59e0b]"
                  : "shadow-[inset_2px_0_0_var(--color-ai)]"
              }`}
              style={{ ...box, textAlign: NUMBER_PATTERN.test(p.after) ? "right" : "left" }}
            >
              {cleared ? <span className="text-neutral-400 line-through">{current}</span> : p.after}
            </div>
          );
        })}
    </>
  );
});
