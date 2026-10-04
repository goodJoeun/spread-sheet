"use client";

import {
  AlertTriangle,
  Check,
  Eye,
  GitCompareArrows,
  Loader2,
  RefreshCw,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { isRunning, type AiProposal, type AiRun } from "@/lib/ai/run";
import { summarize, type ProposalState } from "@/lib/ai/coedit";
import { aiErrorMessage, aiWarningMessage } from "@/lib/ai/messages";
import { modelLabel } from "@/lib/ai/protocol";
import { isApplePlatform } from "@/lib/platform";
import { rangeToA1 } from "@/lib/sheet/address";
import { useStore } from "@/hooks/useStore";
import { useSheet } from "../SheetContext";
import { useDocVersion } from "@/hooks/sheet/useDocVersion";
import { Notice } from "@/components/ui/Notice";
import { strings } from "@/resources/strings";
import { ICON } from "@/styles/icon";

const S = strings.ai.run;

const DIFF_ROW =
  "grid w-full grid-cols-[2.5rem_1fr_auto_1fr] items-center gap-sm px-md py-xs text-left text-label " +
  "hover:bg-hover";
/** 제안 아래 덧붙임 줄. 셀 이름 칸(앞 여백 8 + 칸 40 + 간격 6)만큼 들여 쓴다. */
const DIFF_NOTE = "px-md pb-xs pl-[54px] text-caption";

interface AiRunCardProps {
  run: AiRun;
}

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
          <ul
            aria-label={S.proposals}
            className="max-h-56 divide-y divide-line/60 overflow-y-auto rounded-sm border border-line"
          >
            {(states ?? run.proposals.map(plainState)).map((state) => (
              <ProposalRow
                key={state.proposal.cell}
                state={state}
                reviewing={reviewing}
                onJump={() => controller.jumpTo(state.proposal.coord)}
                onOverwrite={(on) => ai.setOverwrite(state.proposal.cell, on)}
              />
            ))}
          </ul>
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

function StatusLine({ run }: { run: AiRun }) {
  const undoKey = isApplePlatform() ? "⌘Z" : "Ctrl+Z";
  const spinner = <Loader2 size={ICON.sm} className="shrink-0 animate-spin text-ai" aria-hidden />;
  const line = (icon: ReactNode, text: string, tone = "text-fg-subtle") => (
    <p role="status" aria-live="polite" className={`flex items-center gap-sm text-label ${tone}`}>
      {icon}
      {text}
    </p>
  );

  switch (run.status) {
    case "waiting":
      if (run.slow) {
        return line(spinner, S.status.slow, "text-warn-ink");
      }
      return line(spinner, run.connected ? S.status.thinking : S.status.requesting);
    case "streaming":
      if (run.slow) return line(spinner, S.status.stalled, "text-warn-ink");
      return line(
        spinner,
        run.proposals.length > 0 ? S.status.proposing(run.proposals.length) : S.status.writing,
      );
    case "review":
      return line(null, S.status.review(run.proposals.length));
    case "answered":
      return null;
    case "applied": {
      const skipped = run.result?.skipped ?? 0;
      const skippedText = skipped > 0 ? S.status.appliedSkipped(skipped) : "";
      if (run.result?.applied === 0) {
        return line(null, S.status.nothingApplied(skippedText));
      }
      return line(
        <Check size={ICON.sm} aria-hidden />,
        S.status.applied(undoKey, skippedText),
        "text-success",
      );
    }
    case "discarded":
      return line(null, S.status.discarded);
    case "cancelled":
      return line(null, S.status.cancelled);
    case "error":
      return line(
        <AlertTriangle size={ICON.sm} className="shrink-0" aria-hidden />,
        run.error ? aiErrorMessage(run.error) : S.status.error,
        "text-danger",
      );
  }
}

/** 지난 실행처럼 지금 값과 비교하지 않는 제안 */
function plainState(proposal: AiProposal): ProposalState {
  return { proposal, current: proposal.before, status: "clean", overwrite: false };
}

function ConflictBanner({
  conflicts,
  skipped,
  reviewing,
  onOverwriteAll,
  onRegenerate,
}: {
  conflicts: number;
  skipped: number;
  reviewing: boolean;
  onOverwriteAll: (overwrite: boolean) => void;
  onRegenerate: () => void;
}) {
  return (
    <Notice role="status" icon={GitCompareArrows}>
      <p>
        {S.conflict.summary(conflicts)} {skipped > 0 ? S.conflict.keeping : S.conflict.overwriting}
      </p>
      {reviewing && (
        <div className="mt-sm flex flex-wrap gap-sm">
          <button
            type="button"
            onClick={() => onOverwriteAll(skipped > 0)}
            className="btn btn-sm btn-warn"
          >
            {skipped > 0 ? S.conflict.overwriteAll : S.conflict.skipAll}
          </button>
          <button type="button" onClick={onRegenerate} className="btn btn-sm btn-warn">
            <RefreshCw size={ICON.sm} aria-hidden />
            {S.conflict.regenerate}
          </button>
        </div>
      )}
    </Notice>
  );
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
