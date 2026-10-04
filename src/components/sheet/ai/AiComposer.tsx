"use client";

import { ArrowUp, Sparkles, Square } from "lucide-react";
import { useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { overlappingAi, type AiOverlap } from "@/lib/ai/coedit";
import type { AiConnectionInfo } from "@/lib/ai/protocol";
import { rangeToA1 } from "@/lib/sheet/address";
import { isMultiCell, selectionRange } from "@/lib/sheet/selection";
import { useStore } from "@/lib/store";
import { useSelection, useSheet } from "../SheetContext";
import { useParticipants } from "../useSheetSession";
import { chooseModel } from "./useAiConnection";

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
  const running = active?.status === "waiting" || active?.status === "streaming";
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
    <div className="border-t border-line p-3">
      {overlaps.length > 0 && <OverlapNotice overlaps={overlaps} />}
      <div role="radiogroup" aria-label="편집 범위" className="mb-2 flex gap-1 text-xs">
        <ScopeOption checked={mode === "selection"} onSelect={() => setChosen("selection")}>
          선택 범위 <span className="font-semibold">{rangeToA1(range)}</span>
        </ScopeOption>
        <ScopeOption checked={mode === "sheet"} onSelect={() => setChosen("sheet")}>
          시트 전체
        </ScopeOption>
      </div>

      <div className="composer">
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          maxLength={2000}
          aria-label="AI에게 요청"
          placeholder={
            reviewing
              ? "제안을 적용하거나 버리면 새 요청을 보낼 수 있어요"
              : "예: 이 범위의 숫자를 두 배로 바꿔 줘"
          }
          className="composer-input"
        />
        <div className="mt-1 flex items-center gap-2">
          {connection && <ModelSelect connection={connection} />}
          {running ? (
            <button
              type="button"
              onClick={() => ai.cancel()}
              aria-label="생성 중단 (Esc)"
              title="생성 중단 (Esc)"
              className="round-btn round-btn-dark ml-auto"
            >
              <Square size={12} fill="currentColor" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              onClick={send}
              disabled={!draft.trim() || reviewing}
              aria-label="보내기 (Enter)"
              title="보내기 (Enter)"
              className="round-btn round-btn-ai ml-auto"
            >
              <ArrowUp size={16} aria-hidden />
            </button>
          )}
        </div>
      </div>
      <p className="mt-1.5 text-caption text-fg-faint">
        Enter로 보내기 · Shift+Enter 줄바꿈 · AI 결과는 적용하기 전까지 시트에 쓰이지 않아요
      </p>
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
      aria-label="AI 모델"
      title="다음 요청에 쓸 모델"
      className="select-inline"
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
    <p role="status" className="notice mb-2 flex gap-1.5">
      <Sparkles size={13} className="mt-0.5 shrink-0" aria-hidden />
      <span>
        {names}님이 이 범위를 AI로 {reviewing ? "검토" : "편집"} 중이에요. 요청할 수는 있지만, 먼저
        적용된 셀은 내 결과에서 충돌로 표시되고 기본으로 건너뛰어요.
      </span>
    </p>
  );
}
