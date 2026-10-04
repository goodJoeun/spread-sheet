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

/** 요청한 뒤 다른 값으로 바뀐 셀이 있을 때. 기본은 건너뛰기이고 한 번에 덮어쓰거나 다시 요청할 수 있다. */
export function ConflictBanner({
  conflicts,
  skipped,
  reviewing,
  onOverwriteAll,
  onRegenerate,
}: ConflictBannerProps) {
  return (
    <Notice role="status" icon={GitCompareArrows}>
      <p>
        {S.summary(conflicts)} {skipped > 0 ? S.keeping : S.overwriting}
      </p>
      {reviewing && (
        <div className="mt-sm flex flex-wrap gap-sm">
          <button
            type="button"
            onClick={() => onOverwriteAll(skipped > 0)}
            className="btn btn-sm btn-warn"
          >
            {skipped > 0 ? S.overwriteAll : S.skipAll}
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
