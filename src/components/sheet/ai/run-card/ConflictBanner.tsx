import { GitCompareArrows, RefreshCw } from "lucide-react";
import { Notice } from "@/components/ui/Notice";
import { strings } from "@/resources/strings";
import { ICON } from "@/styles/icon";

const S = strings.ai.run.conflict;

interface ConflictBannerProps {
  conflicts: number;
  skipped: number;
  reviewing: boolean;
  onOverwriteAll: (overwrite: boolean) => void;
  onRegenerate: () => void;
}

/** AI에 요청한 뒤 다른 값으로 바뀐 셀이 있을 때 보이는 안내. 기본은 건너뛰기이고, 한 번에 덮어쓰거나 다시 요청할 수도 있음. */
export function ConflictBanner({
  conflicts,
  skipped,
  reviewing,
  onOverwriteAll,
  onRegenerate,
}: ConflictBannerProps) {
  // 건너뛰는 셀이 하나라도 있으면 버튼은 "모두 덮어쓰기", 모두 덮어쓰기로 골랐으면 "모두 건너뛰기"
  const someSkipped = skipped > 0;
  return (
    <Notice role="status" icon={GitCompareArrows}>
      <p>
        {S.summary(conflicts)} {someSkipped ? S.keeping : S.overwriting}
      </p>
      {reviewing && (
        <div className="mt-sm flex flex-wrap gap-sm">
          <button
            type="button"
            onClick={() => onOverwriteAll(someSkipped)}
            className="btn btn-sm btn-warn"
          >
            {someSkipped ? S.overwriteAll : S.skipAll}
          </button>
          <button type="button" onClick={onRegenerate} className="btn btn-sm btn-warn">
            <RefreshCw size={ICON.sm} aria-hidden />
            {S.regenerate}
          </button>
        </div>
      )}
    </Notice>
  );
}
