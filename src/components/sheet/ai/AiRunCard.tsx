"use client";

import { AlertTriangle, Check, Eye, Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import type { ReactNode } from "react";
import type { AiRun } from "@/lib/ai/ai-controller";
import { modelLabel } from "@/lib/ai/protocol";
import { isApplePlatform } from "@/lib/platform";
import { rangeToA1 } from "@/lib/sheet/address";
import { useStore } from "@/lib/store";
import { useSheet } from "../SheetContext";

interface AiRunCardProps {
  run: AiRun;
}

/** AI 응답 하나: 진행 상태, 설명, 원래 값 → 제안 목록, 적용·버리기·다시 시도. */
export function AiRunCard({ run }: AiRunCardProps) {
  const { ai, controller } = useSheet();
  const showOriginal = useStore(ai.showOriginal);
  const busy = useStore(ai.active) !== null;
  const generating = run.status === "waiting" || run.status === "streaming";
  const reviewing = run.status === "review";

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

        {run.proposals.length > 0 && run.status !== "error" && run.status !== "cancelled" && (
          <ul
            aria-label="제안 목록"
            className="max-h-56 divide-y divide-header-line/60 overflow-y-auto rounded border border-header-line"
          >
            {run.proposals.map((p) => (
              <li key={p.cell}>
                <button
                  type="button"
                  onClick={() => controller.jumpTo(p.coord)}
                  title={`${p.cell}로 이동`}
                  className="grid w-full grid-cols-[2.5rem_1fr_auto_1fr] items-center gap-1.5 px-2 py-1 text-left text-xs hover:bg-black/5"
                >
                  <span className="font-medium text-neutral-500">{p.cell}</span>
                  <span className="truncate text-neutral-400 line-through">
                    {p.before || <i className="no-underline">빈칸</i>}
                  </span>
                  <span className="text-neutral-400">→</span>
                  <span className="truncate font-medium text-ai-ink">
                    {p.after || <i className="font-normal text-neutral-400">지움</i>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {reviewing && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => ai.apply()}
              className="inline-flex items-center gap-1 rounded-md bg-ai px-3 py-1.5 text-xs font-semibold text-white hover:bg-ai/90"
            >
              <Check size={14} aria-hidden />
              적용하기 ({run.proposals.length})
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
    case "applied":
      return line(
        <Check size={13} className="text-emerald-600" aria-hidden />,
        `적용했어요 · ${undoKey}로 한 번에 되돌릴 수 있어요`,
        "text-emerald-700",
      );
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
