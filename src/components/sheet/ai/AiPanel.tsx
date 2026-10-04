"use client";

import { Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { rangeToA1 } from "@/lib/sheet/address";
import { useStore } from "@/hooks/useStore";
import { useSheet } from "../SheetContext";
import { AiComposer } from "./AiComposer";
import { AiRunCard } from "./AiRunCard";
import { useAiConnection } from "@/hooks/ai/useAiConnection";
import { Notice } from "@/components/ui/Notice";
import { strings } from "@/resources/strings";
import { ICON } from "@/styles/icon";

/** 가짜 응답 모드에서 지연·실패를 재현하는 표시(서버의 mock-anthropic.ts가 같은 목록을 쓴다) */
const MOCK_TAGS = Object.values(strings.ai.mockTags).join(" ");

export function AiPanel() {
  const { ai, aiPanel, controller } = useSheet();
  const messages = useStore(ai.messages);
  const [draft, setDraft] = useState("");
  const connection = useAiConnection(ai);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  // 새 내용이 오면 맨 아래를 보여 준다(첫 안내 화면은 위에서부터).
  useEffect(() => {
    const el = listRef.current;
    if (el && messages.length > 0) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const close = () => {
    aiPanel.set(false);
    controller.focus();
  };

  return (
    <aside
      aria-label={strings.ai.panel.title}
      className="flex w-[360px] shrink-0 flex-col border-l border-line bg-surface-muted"
    >
      <header className="flex h-10 shrink-0 items-center gap-md border-b border-line bg-surface px-lg">
        <Sparkles size={ICON.md} className="text-ai" aria-hidden />
        <h2 className="text-title font-semibold text-fg">{strings.ai.panel.title}</h2>
        {connection && (
          <span
            className={connection.provider === "mock" ? "badge badge-warn" : "badge"}
            title={
              connection.provider === "mock"
                ? strings.ai.panel.mockTitle
                : strings.ai.panel.connectedTitle
            }
          >
            {connection.provider === "mock"
              ? strings.ai.panel.mockBadge
              : strings.ai.panel.connectedBadge}
          </span>
        )}
        <button
          type="button"
          onClick={close}
          aria-label={strings.ai.panel.close}
          className="icon-btn-sm ml-auto"
        >
          <X size={ICON.md} />
        </button>
      </header>

      <div ref={listRef} className="min-h-0 flex-1 space-y-lg overflow-y-auto p-lg">
        {messages.length === 0 ? (
          <div className="space-y-lg pt-md text-body text-fg-muted">
            <p>{strings.ai.panel.intro}</p>
            <div className="flex flex-col items-start gap-sm">
              {strings.ai.panel.examples.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => {
                    setDraft(example);
                    inputRef.current?.focus();
                  }}
                  className="chip chip-suggest"
                >
                  {example}
                </button>
              ))}
            </div>
            {connection?.provider === "mock" && (
              <Notice>{strings.ai.panel.mockHint(MOCK_TAGS)}</Notice>
            )}
          </div>
        ) : (
          messages.map((m) =>
            m.role === "user" ? (
              <div
                key={m.id}
                className="ml-2xl rounded-lg bg-ai-soft px-lg py-md text-body text-fg"
              >
                <p className="whitespace-pre-wrap">{m.text}</p>
                <p className="mt-xs text-caption text-ai-ink/70">
                  {strings.ai.panel.requestScope(m.scope && rangeToA1(m.scope))}
                </p>
              </div>
            ) : (
              <AiRunCard key={m.id} run={m.run} />
            ),
          )
        )}
      </div>

      <AiComposer
        inputRef={inputRef}
        draft={draft}
        onDraftChange={setDraft}
        connection={connection}
      />
    </aside>
  );
}
