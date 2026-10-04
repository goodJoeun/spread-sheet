import { Sparkles } from "lucide-react";
import { memo } from "react";
import type { AiRun } from "@/lib/ai/ai-controller";
import { COL_WIDTH, ROW_HEIGHT, cellRect, outsetRect, rangeRect } from "@/lib/sheet/geometry";
import { Layer } from "./layers";

const NUMBER_PATTERN = /^[-+]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?%?$/;

interface AiPreviewProps {
  run: AiRun | null;
  /** 켜면 제안을 걷어 내고 원래 값을 보여 준다(비교용). */
  showOriginal: boolean;
}

/**
 * AI 제안 미리보기. 문서에는 아직 쓰지 않았고, 셀 위에 제안 값을 덮어 그리기만 한다.
 * 편집 범위는 점선으로, 제안된 셀은 보라색 칸으로 보여 준다.
 */
export const AiPreview = memo(function AiPreview({ run, showOriginal }: AiPreviewProps) {
  if (!run) return null;
  const generating = run.status === "waiting" || run.status === "streaming";
  const scope = run.scope ? outsetRect(rangeRect(run.scope)) : null;
  const label = generating
    ? `AI가 제안을 만드는 중… ${run.proposals.length > 0 ? `${run.proposals.length}개` : ""}`
    : `AI 제안 ${run.proposals.length}개 · 검토 중`;

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
          </div>
        </>
      )}
      {!showOriginal &&
        run.proposals.map((p) => {
          const rect = cellRect(p.coord);
          const cleared = p.after === "";
          return (
            <div
              key={p.cell}
              className="pointer-events-none absolute overflow-hidden bg-ai-soft px-1 text-[13px] leading-[23px] whitespace-pre text-ai-ink shadow-[inset_2px_0_0_var(--color-ai)]"
              style={{
                left: rect.left,
                top: rect.top,
                // 격자선이 보이도록 1px 안쪽에 그린다.
                width: COL_WIDTH - 1,
                height: ROW_HEIGHT - 1,
                zIndex: Layer.aiPreview,
                textAlign: NUMBER_PATTERN.test(p.after) ? "right" : "left",
              }}
            >
              {cleared ? (
                <span className="text-neutral-400 line-through">{p.before}</span>
              ) : (
                p.after
              )}
            </div>
          );
        })}
    </>
  );
});
