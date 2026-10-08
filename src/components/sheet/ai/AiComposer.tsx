"use client";

import { ArrowUp, Lock, Sparkles, Square } from "lucide-react";
import { useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { overlappingAi } from "@/lib/ai/coedit";
import { overlapNotice } from "@/lib/ai/messages";
import { AI_LIMITS, type AiConnectionInfo } from "@/lib/ai/protocol";
import { isReviewing, isRunning } from "@/lib/ai/run";
import { isImeComposing } from "@/lib/platform";
import { rangeToA1 } from "@/lib/sheet/address";
import { isMultiCell, selectionRange } from "@/lib/sheet/selection";
import { useStore } from "@/hooks/useStore";
import { useSelection, useSheet } from "../SheetContext";
import { useParticipants } from "@/hooks/sheet/useParticipants";
import { Notice } from "@/components/ui/Notice";
import { ModelSelect } from "./ModelSelect";
import { strings } from "@/resources/strings";
import { ICON } from "@/styles/icon";

type ScopeMode = "selection" | "sheet";

interface AiComposerProps {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  draft: string;
  onDraftChange: (text: string) => void;
  connection: AiConnectionInfo | null;
}

export function AiComposer({ inputRef, draft, onDraftChange, connection }: AiComposerProps) {
  const { ai, session } = useSheet();
  const selection = useSelection();
  const participants = useParticipants(session.presence);
  const active = useStore(ai.active);
  const lockCells = useStore(ai.lockCells);
  const running = isRunning(active);
  const reviewing = isReviewing(active);

  // 범위를 여러 칸 선택했으면 그 범위로, 아니면 시트 전체로 요청함. 사용자가 직접 고르면 그 선택을 따름.
  const [chosen, setChosen] = useState<ScopeMode | null>(null);
  const mode: ScopeMode = chosen ?? (isMultiCell(selection) ? "selection" : "sheet");
  const range = selectionRange(selection);
  const scope = mode === "selection" ? range : null;
  const notice = active ? null : overlapNotice(overlappingAi(participants, scope), lockCells);
  const blocked = notice?.blocking ?? false;

  const send = () => {
    if (ai.send(draft, scope)) {
      onDraftChange("");
      setChosen(null);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // 한글 조합 중의 Enter는 글자를 확정하는 키라서 요청을 보내지 않음.
    if (isImeComposing(e.nativeEvent)) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!running) send();
    } else if (e.key === "Escape" && running) {
      e.preventDefault();
      ai.cancel();
    }
  };

  return (
    <div className="border-t border-line p-lg">
      {notice && (
        <Notice role="status" icon={notice.blocking ? Lock : Sparkles} className="mb-md">
          <p>{notice.text}</p>
        </Notice>
      )}
      <div role="radiogroup" aria-label={strings.ai.composer.scope} className="mb-md flex gap-xs">
        <ScopeOption checked={mode === "selection"} onSelect={() => setChosen("selection")}>
          {strings.ai.composer.scopeSelection}{" "}
          <span className="font-semibold">{rangeToA1(range)}</span>
        </ScopeOption>
        <ScopeOption checked={mode === "sheet"} onSelect={() => setChosen("sheet")}>
          {strings.ai.composer.scopeSheet}
        </ScopeOption>
      </div>

      <div className="rounded-lg border border-line px-md pt-md pb-sm focus-within:border-ai">
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          maxLength={AI_LIMITS.instruction}
          aria-label={strings.ai.composer.input}
          placeholder={
            reviewing ? strings.ai.composer.placeholderReviewing : strings.ai.composer.placeholder
          }
          className="block max-h-32 min-h-10 w-full resize-none bg-transparent text-body outline-none placeholder:text-fg-faint"
        />
        <div className="mt-xs flex items-center gap-md">
          {connection && <ModelSelect connection={connection} />}
          {running ? (
            <button
              type="button"
              onClick={() => ai.cancel()}
              aria-label={strings.ai.composer.stop}
              title={strings.ai.composer.stop}
              className="round-btn round-btn-dark ml-auto"
            >
              <Square size={ICON.sm} fill="currentColor" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              onClick={send}
              disabled={!draft.trim() || reviewing || blocked}
              aria-label={strings.ai.composer.send}
              title={strings.ai.composer.send}
              className="round-btn round-btn-ai ml-auto"
            >
              <ArrowUp size={ICON.md} aria-hidden />
            </button>
          )}
        </div>
      </div>
      <p className="mt-sm text-caption text-fg-faint">{strings.ai.composer.hint}</p>
    </div>
  );
}

function ScopeOption({
  checked,
  onSelect,
  children,
}: {
  checked: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" role="radio" aria-checked={checked} onClick={onSelect} className="chip">
      {children}
    </button>
  );
}
