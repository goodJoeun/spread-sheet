import { AlertTriangle, Check, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { runStatusLine, type StatusLine as StatusLineView } from "@/lib/ai/messages";
import type { AiRun } from "@/lib/ai/run";
import { isApplePlatform } from "@/lib/platform";
import { ICON } from "@/styles/icon";

const TONE: Record<StatusLineView["tone"], string> = {
  muted: "text-fg-subtle",
  warn: "text-warn-ink",
  success: "text-success",
  danger: "text-danger",
};

const ICONS: Record<NonNullable<StatusLineView["icon"]>, ReactNode> = {
  spinner: <Loader2 size={ICON.sm} className="shrink-0 animate-spin text-ai" aria-hidden />,
  check: <Check size={ICON.sm} aria-hidden />,
  alert: <AlertTriangle size={ICON.sm} className="shrink-0" aria-hidden />,
};

export function StatusLine({ run }: { run: AiRun }) {
  const line = runStatusLine(run, isApplePlatform() ? "⌘Z" : "Ctrl+Z");
  if (!line) return null;
  return (
    <p
      role="status"
      aria-live="polite"
      className={`flex items-center gap-sm text-label ${TONE[line.tone]}`}
    >
      {line.icon && ICONS[line.icon]}
      {line.text}
    </p>
  );
}
