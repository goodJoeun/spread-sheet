"use client";

import { AlertTriangle, Check, Eye, RotateCcw, Sparkles, X } from "lucide-react";
import { Notice } from "@/components/ui/Notice";
import { useDocVersion } from "@/hooks/sheet/useDocVersion";
import { useStore } from "@/hooks/useStore";
import { summarize } from "@/lib/ai/coedit";
import { aiWarningMessage } from "@/lib/ai/messages";
import { modelLabel } from "@/lib/ai/protocol";
import { isRunning, type AiRun } from "@/lib/ai/run";
import { rangeToA1 } from "@/lib/sheet/address";
import { strings } from "@/resources/strings";
import { ICON } from "@/styles/icon";
import { useSheet } from "../../SheetContext";
import { ConflictBanner } from "./ConflictBanner";
import { ProposalList } from "./ProposalList";
import { StatusLine } from "./StatusLine";

const S = strings.ai.run;

interface AiRunCardProps {
  run: AiRun;
}

/** AI 실행 하나. 데이터는 여기서만 읽고 하위 부품에는 props로 넘긴다. */
export function AiRunCard({ run }: AiRunCardProps) {
  const { ai, controller, session } = useSheet();
  const showOriginal = useStore(ai.showOriginal);
  const active = useStore(ai.active);
  const busy = active !== null;
  const generating = isRunning(run);
  const reviewing = run.status === "review";
  // 생성·검토 중인 실행만 지금 시트 값과 비교한다. 문서나 덮어쓰기 선택이 바뀌면 다시 그린다.
  useDocVersion(session.doc);
  useStore(ai.overwrites);
  const states = active?.id === run.id ? ai.states(run) : null;
  const summary = states ? summarize(states) : null;

  return (
    <div className="rounded-lg border border-line bg-surface text-body">
      <div className="flex items-center gap-sm border-b border-line px-lg py-md text-label text-fg-subtle">
        <Sparkles size={ICON.sm} className="text-ai" aria-hidden />
        <span className="font-medium text-fg-secondary">AI</span>
        {run.model && <span title={run.model}>{modelLabel(run.model)}</span>}
        {run.provider === "mock" && <span className="badge badge-warn">{S.mockBadge}</span>}
        <span className="ml-auto">{S.scope(run.scope && rangeToA1(run.scope))}</span>
      </div>

      <div className="space-y-md px-lg py-md">
        <StatusLine run={run} />

        {run.text && (
          <p className="whitespace-pre-wrap text-fg">
            {run.text}
            {generating && (
              <span className="ml-2xs inline-block h-3.5 w-1.5 animate-pulse bg-ai/60 align-middle" />
            )}
          </p>
        )}

        {run.warnings.map((warning) => (
          <Notice key={warning.code} variant="inline" icon={AlertTriangle}>
            {aiWarningMessage(warning)}
          </Notice>
        ))}
        {run.skipped > 0 && <p className="text-label text-fg-subtle">{S.skipped(run.skipped)}</p>}

        {summary && summary.conflicts > 0 && (
          <ConflictBanner
            conflicts={summary.conflicts}
            skipped={summary.skipped}
            reviewing={reviewing}
            onOverwriteAll={(on) => ai.setOverwriteAll(on)}
            onRegenerate={() => ai.regenerate()}
          />
        )}

        {run.proposals.length > 0 && run.status !== "error" && run.status !== "cancelled" && (
          <ProposalList
            proposals={run.proposals}
            states={states}
            reviewing={reviewing}
            onJump={(coord) => controller.jumpTo(coord)}
            onOverwrite={(cell, on) => ai.setOverwrite(cell, on)}
          />
        )}

        {reviewing && (
          <div className="flex flex-wrap items-center gap-sm pt-xs">
            <button
              type="button"
              onClick={() => ai.apply()}
              disabled={summary?.toApply === 0}
              title={summary?.toApply === 0 ? S.nothingToApply : undefined}
              className="btn btn-ai"
            >
              <Check size={ICON.sm} aria-hidden />
              {S.apply(summary?.toApply ?? run.proposals.length)}
            </button>
            <button type="button" onClick={() => ai.discard()} className="btn btn-outline">
              <X size={ICON.sm} aria-hidden />
              {S.discard}
            </button>
            <button
              type="button"
              aria-pressed={showOriginal}
              onClick={() => ai.showOriginal.set((v) => !v)}
              className="btn btn-ghost ml-auto"
            >
              <Eye size={ICON.sm} aria-hidden />
              {S.showOriginal}
            </button>
          </div>
        )}

        {(run.status === "error" || run.status === "cancelled") &&
          (run.error?.retryable ?? true) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => ai.retry(run.id)}
              className="btn btn-outline"
            >
              <RotateCcw size={ICON.sm} aria-hidden />
              {S.retry}
            </button>
          )}
      </div>
    </div>
  );
}
