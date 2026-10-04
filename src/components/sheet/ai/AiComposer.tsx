"use client";

import { ArrowUp, Sparkles, Square } from "lucide-react";
import { useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { overlappingAi, type AiOverlap } from "@/lib/ai/coedit";
import { AI_LIMITS, type AiConnectionInfo } from "@/lib/ai/protocol";
import { isRunning } from "@/lib/ai/run";
import { rangeToA1 } from "@/lib/sheet/address";
import { isMultiCell, selectionRange } from "@/lib/sheet/selection";
import { useStore } from "@/hooks/useStore";
import { useSelection, useSheet } from "../SheetContext";
import { useParticipants } from "@/hooks/sheet/useParticipants";
import { chooseModel } from "@/hooks/ai/useAiConnection";
import { Notice } from "@/components/ui/Notice";
import { strings } from "@/resources/strings";
import { ICON } from "@/styles/icon";

type ScopeMode = "selection" | "sheet";

const MODEL_SELECT =
  "min-w-0 truncate rounded-md bg-transparent py-xs pr-xs pl-sm text-label text-fg-muted " +
  "outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ai/40";

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
  const running = isRunning(active);
  const reviewing = active?.status === "review";

  // 범위를 여러 칸 선택해 두었으면 그 범위로, 아니면 시트 전체로. 사용자가 고르면 그걸 따른다.
  const [chosen, setChosen] = useState<ScopeMode | null>(null);
  const mode: ScopeMode = chosen ?? (isMultiCell(selection) ? "selection" : "sheet");
  const range = selectionRange(selection);
  const overlaps = active ? [] : overlappingAi(participants, mode === "selection" ? range : null);

  const send = () => {
    if (ai.send(draft, mode === "selection" ? range : null)) {
      onDraftChange("");
      setChosen(null);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // 한글 조합 중 Enter는 글자를 확정하는 키라 보내지 않는다.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
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
      {overlaps.length > 0 && <OverlapNotice overlaps={overlaps} />}
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
              disabled={!draft.trim() || reviewing}
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

function ModelSelect({ connection }: { connection: AiConnectionInfo }) {
  const { ai } = useSheet();
  const model = useStore(ai.model) ?? connection.defaultModel;
  return (
    <select
      value={model}
      onChange={(e) => chooseModel(ai, e.target.value)}
      aria-label={strings.ai.composer.model}
      title={strings.ai.composer.modelTitle}
      className={MODEL_SELECT}
    >
      {connection.models.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label} · {m.description}
        </option>
      ))}
    </select>
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

function OverlapNotice({ overlaps }: { overlaps: AiOverlap[] }) {
  const names = overlaps.map((o) => o.participant.user.name).join(", ");
  const reviewing = overlaps.every((o) => o.activity.status === "reviewing");
  return (
    <Notice role="status" icon={Sparkles} className="mb-md">
      <p>{strings.ai.composer.overlap(names, reviewing)}</p>
    </Notice>
  );
}
