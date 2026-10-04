"use client";

import { ArrowUp, Square } from "lucide-react";
import { useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import type { AiConnectionInfo } from "@/lib/ai/protocol";
import { rangeToA1 } from "@/lib/sheet/address";
import { isMultiCell, selectionRange } from "@/lib/sheet/selection";
import { useStore } from "@/lib/store";
import { useSelection, useSheet } from "../SheetContext";
import { chooseModel } from "./useAiConnection";

type ScopeMode = "selection" | "sheet";

interface AiComposerProps {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  draft: string;
  onDraftChange: (text: string) => void;
  /** 서버 연결 정보. 불러오기 전(또는 실패)이면 null이고 모델을 고를 수 없다. */
  connection: AiConnectionInfo | null;
}

/**
 * 요청 입력칸. 편집 범위(선택 범위 / 시트 전체)와 모델을 고르고 보낸다.
 * 생성 중에는 중단 버튼이 된다.
 */
export function AiComposer({ inputRef, draft, onDraftChange, connection }: AiComposerProps) {
  const { ai } = useSheet();
  const selection = useSelection();
  const active = useStore(ai.active);
  const running = active?.status === "waiting" || active?.status === "streaming";
  const reviewing = active?.status === "review";

  // 범위를 여러 칸 선택해 두었으면 그 범위로, 아니면 시트 전체로. 사용자가 고르면 그걸 따른다.
  const [chosen, setChosen] = useState<ScopeMode | null>(null);
  const mode: ScopeMode = chosen ?? (isMultiCell(selection) ? "selection" : "sheet");
  const range = selectionRange(selection);

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
    <div className="border-t border-header-line p-3">
      <div role="radiogroup" aria-label="편집 범위" className="mb-2 flex gap-1 text-xs">
        <ScopeOption checked={mode === "selection"} onSelect={() => setChosen("selection")}>
          선택 범위 <span className="font-semibold">{rangeToA1(range)}</span>
        </ScopeOption>
        <ScopeOption checked={mode === "sheet"} onSelect={() => setChosen("sheet")}>
          시트 전체
        </ScopeOption>
      </div>

      <div className="rounded-lg border border-header-line px-2.5 pt-2 pb-1.5 focus-within:border-ai">
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
          className="block max-h-32 min-h-10 w-full resize-none bg-transparent text-[13px] leading-5 outline-none placeholder:text-neutral-400"
        />
        <div className="mt-1 flex items-center gap-2">
          {connection && <ModelSelect connection={connection} />}
          {running ? (
            <button
              type="button"
              onClick={() => ai.cancel()}
              aria-label="생성 중단 (Esc)"
              title="생성 중단 (Esc)"
              className="ml-auto flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-white hover:bg-neutral-700"
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
              className="ml-auto flex size-8 shrink-0 items-center justify-center rounded-full bg-ai text-white hover:bg-ai/90 disabled:bg-neutral-200 disabled:text-neutral-400"
            >
              <ArrowUp size={16} aria-hidden />
            </button>
          )}
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-neutral-400">
        Enter로 보내기 · Shift+Enter 줄바꿈 · AI 결과는 적용하기 전까지 시트에 쓰이지 않아요
      </p>
    </div>
  );
}

/** 다음 요청에 쓸 모델. 생성 중에 바꾸면 다음 요청부터 적용된다. */
function ModelSelect({ connection }: { connection: AiConnectionInfo }) {
  const { ai } = useSheet();
  const model = useStore(ai.model) ?? connection.defaultModel;
  return (
    <select
      value={model}
      onChange={(e) => chooseModel(ai, e.target.value)}
      aria-label="AI 모델"
      title="다음 요청에 쓸 모델"
      className="min-w-0 truncate rounded-md bg-transparent py-1 pr-1 pl-1.5 text-xs text-neutral-600 outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-ai/40"
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
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={`rounded-full border px-2.5 py-1 ${
        checked
          ? "border-ai bg-ai-soft text-ai-ink"
          : "border-header-line text-neutral-600 hover:bg-black/5"
      }`}
    >
      {children}
    </button>
  );
}
