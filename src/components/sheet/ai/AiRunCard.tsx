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
import type { AiProposal, AiRun } from "@/lib/ai/ai-controller";
import { summarize, type ProposalState } from "@/lib/ai/coedit";
import { modelLabel } from "@/lib/ai/protocol";
import { isApplePlatform } from "@/lib/platform";
import { rangeToA1 } from "@/lib/sheet/address";
import { useStore } from "@/lib/store";
import { useSheet } from "../SheetContext";
import { useDocVersion } from "../useSheetSession";

interface AiRunCardProps {
  run: AiRun;
}

export function AiRunCard({ run }: AiRunCardProps) {
  const { ai, controller, session } = useSheet();
  const showOriginal = useStore(ai.showOriginal);
  const active = useStore(ai.active);
  const busy = active !== null;
  const generating = run.status === "waiting" || run.status === "streaming";
  const reviewing = run.status === "review";
  // 생성·검토 중인 실행만 지금 시트 값과 비교한다. 문서나 덮어쓰기 선택이 바뀌면 다시 그린다.
  useDocVersion(session.doc);
  useStore(ai.overwrites);
  const states = active?.id === run.id ? ai.states(run) : null;
  const summary = states ? summarize(states) : null;

  return (
    <div className="rounded-lg border border-header-line bg-white text-[13px]">
      <div className="flex items-center gap-1.5 border-b border-header-line px-3 py-2 text-xs text-neutral-500">
        <Sparkles size={13} className="text-ai" aria-hidden />
        <span className="font-medium text-neutral-700">AI</span>
        {run.model && <span title={run.model}>{modelLabel(run.model)}</span>}
        {run.provider === "mock" && (
          <span className="rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-800">
            가짜 응답
          </span>
        )}
        <span className="ml-auto">{run.scope ? rangeToA1(run.scope) : "시트 전체"}</span>
      </div>

      <div className="space-y-2 px-3 py-2.5">
        <StatusLine run={run} />

        {run.text && (
          <p className="leading-relaxed whitespace-pre-wrap text-neutral-800">
            {run.text}
            {generating && (
              <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-ai/60 align-middle" />
            )}
          </p>
        )}

        {run.warnings.map((warning) => (
          <p key={warning} className="flex gap-1.5 text-xs text-amber-800">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
            {warning}
          </p>
        ))}
        {run.skipped > 0 && (
          <p className="text-xs text-neutral-500">
            범위 밖이거나 주소가 잘못된 제안 {run.skipped}개는 제외했어요.
          </p>
        )}

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
            aria-label="제안 목록"
            className="max-h-56 divide-y divide-header-line/60 overflow-y-auto rounded border border-header-line"
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
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => ai.apply()}
              disabled={summary?.toApply === 0}
              title={summary?.toApply === 0 ? "적용할 셀이 없어요" : undefined}
              className="inline-flex items-center gap-1 rounded-md bg-ai px-3 py-1.5 text-xs font-semibold text-white hover:bg-ai/90 disabled:bg-neutral-200 disabled:text-neutral-400"
            >
              <Check size={14} aria-hidden />
              적용하기 ({summary?.toApply ?? run.proposals.length})
            </button>
            <button
              type="button"
              onClick={() => ai.discard()}
              className="inline-flex items-center gap-1 rounded-md border border-header-line px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-black/5"
            >
              <X size={14} aria-hidden />
              버리기
            </button>
            <button
              type="button"
              aria-pressed={showOriginal}
              onClick={() => ai.showOriginal.set((v) => !v)}
              className={`ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium ${
                showOriginal ? "bg-header-active text-accent" : "text-neutral-600 hover:bg-black/5"
              }`}
            >
              <Eye size={14} aria-hidden />
              원래 값 보기
            </button>
          </div>
        )}

        {(run.status === "error" || run.status === "cancelled") &&
          (run.error?.retryable ?? true) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => ai.retry(run.id)}
              className="inline-flex items-center gap-1 rounded-md border border-header-line px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-black/5 disabled:opacity-40"
            >
              <RotateCcw size={13} aria-hidden />
              다시 시도
            </button>
          )}
      </div>
    </div>
  );
}

function StatusLine({ run }: { run: AiRun }) {
  const undoKey = isApplePlatform() ? "⌘Z" : "Ctrl+Z";
  const spinner = <Loader2 size={13} className="shrink-0 animate-spin text-ai" aria-hidden />;
  const line = (icon: ReactNode, text: string, tone = "text-neutral-500") => (
    <p role="status" aria-live="polite" className={`flex items-center gap-1.5 text-xs ${tone}`}>
      {icon}
      {text}
    </p>
  );

  switch (run.status) {
    case "waiting":
      if (run.slow) {
        return line(
          spinner,
          "응답이 늦어지고 있어요. 계속 기다리거나 중단할 수 있어요.",
          "text-amber-700",
        );
      }
      return line(spinner, run.connected ? "생각하는 중…" : "AI에 요청하는 중…");
    case "streaming":
      if (run.slow)
        return line(spinner, "응답이 잠시 멈췄어요. 계속 기다리는 중…", "text-amber-700");
      return line(
        spinner,
        run.proposals.length > 0 ? `제안을 만드는 중… ${run.proposals.length}개` : "답을 쓰는 중…",
      );
    case "review":
      return line(null, `제안 ${run.proposals.length}개 · 시트에서 원래 값과 비교한 뒤 적용하세요`);
    case "answered":
      return null;
    case "applied": {
      const skipped = run.result?.skipped ?? 0;
      const skippedText = skipped > 0 ? ` · 그사이 바뀐 ${skipped}개 셀은 건너뛰었어요` : "";
      if (run.result?.applied === 0) {
        return line(null, `바꿀 셀이 없어 적용하지 않았어요${skippedText}`);
      }
      return line(
        <Check size={13} className="text-emerald-600" aria-hidden />,
        `적용했어요 · ${undoKey}로 한 번에 되돌릴 수 있어요${skippedText}`,
        "text-emerald-700",
      );
    }
    case "discarded":
      return line(null, "제안을 버렸어요");
    case "cancelled":
      return line(null, "중단했어요. 받은 제안은 적용하지 않았어요.");
    case "error":
      return line(
        <AlertTriangle size={13} className="shrink-0" aria-hidden />,
        run.error?.message ?? "오류가 발생했어요.",
        "text-red-700",
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
    <div
      role="status"
      className="rounded border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-900"
    >
      <p className="flex gap-1.5">
        <GitCompareArrows size={13} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          요청한 뒤 다른 값으로 바뀐 셀이 {conflicts}개 있어요.{" "}
          {skipped > 0 ? "지금 값을 지키고 건너뛰어요." : "모두 덮어쓰기로 골랐어요."}
        </span>
      </p>
      {reviewing && (
        <div className="mt-1.5 flex flex-wrap gap-1.5 pl-5">
          <button
            type="button"
            onClick={() => onOverwriteAll(skipped > 0)}
            className="rounded border border-amber-300 bg-white px-2 py-0.5 font-medium hover:bg-amber-100"
          >
            {skipped > 0 ? "모두 덮어쓰기" : "모두 건너뛰기"}
          </button>
          <button
            type="button"
            onClick={onRegenerate}
            className="inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-2 py-0.5 font-medium hover:bg-amber-100"
          >
            <RefreshCw size={11} aria-hidden />
            지금 값으로 다시 요청
          </button>
        </div>
      )}
    </div>
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
  const show = (text: string, empty: string) => text || <i className="text-neutral-400">{empty}</i>;

  return (
    <li className={conflict ? "bg-amber-50/60" : undefined}>
      <button
        type="button"
        onClick={onJump}
        title={`${p.cell}로 이동`}
        className="grid w-full grid-cols-[2.5rem_1fr_auto_1fr] items-center gap-1.5 px-2 py-1 text-left text-xs hover:bg-black/5"
      >
        <span className="font-medium text-neutral-500">{p.cell}</span>
        <span className="truncate text-neutral-400 line-through">{show(current, "빈칸")}</span>
        <span className="text-neutral-400">→</span>
        <span className={`truncate font-medium ${muted ? "text-neutral-400" : "text-ai-ink"}`}>
          {show(p.after, "지움")}
        </span>
      </button>
      {status === "same" && (
        <p className="px-2 pb-1 pl-[3.25rem] text-[11px] text-neutral-500">이미 같은 값이에요</p>
      )}
      {conflict && (
        <div className="flex items-center gap-2 px-2 pb-1.5 pl-[3.25rem] text-[11px] text-amber-900">
          <span className="min-w-0 flex-1 truncate">
            요청 때 {show(p.before, "빈칸")} → 지금 {show(current, "빈칸")}
          </span>
          {reviewing && (
            <label className="flex shrink-0 cursor-pointer items-center gap-1">
              <input
                type="checkbox"
                checked={overwrite}
                onChange={(e) => onOverwrite(e.target.checked)}
                className="accent-amber-600"
              />
              덮어쓰기
            </label>
          )}
        </div>
      )}
    </li>
  );
}
