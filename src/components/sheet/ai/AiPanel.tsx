"use client";

import { Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Notice } from "@/components/ui/Notice";
import { useAiConnection } from "@/hooks/ai/useAiConnection";
import { useStore } from "@/hooks/useStore";
import { MOCK_SCENARIO_TAGS } from "@/lib/ai/mock-scenarios";
import { rangeToA1, type CellRange } from "@/lib/sheet/address";
import { strings } from "@/resources/strings";
import { ICON } from "@/styles/icon";
import { useSheet } from "../SheetContext";
import { AiComposer } from "./AiComposer";
import { ModelSelect } from "./ModelSelect";
import { AiRunCard } from "./run-card";

const MOCK_TAGS = Object.values(MOCK_SCENARIO_TAGS).join(" ");

export function AiPanel() {
  const { ai, aiPanel, controller } = useSheet();
  const messages = useStore(ai.messages);
  const [draft, setDraft] = useState("");
  const connection = useAiConnection(ai);
  const isMock = connection?.provider === "mock";
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  // 새 메시지가 오면 맨 아래로 스크롤함. 첫 안내 화면만 위에서부터 보여 줌.
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
            className={isMock ? "badge badge-warn" : "badge"}
            title={isMock ? strings.ai.panel.mockTitle : strings.ai.panel.connectedTitle}
          >
            {isMock ? strings.ai.panel.mockBadge : strings.ai.panel.connectedBadge}
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
          <AiIntro
            showMockHint={isMock}
            onPickExample={(example) => {
              setDraft(example);
              inputRef.current?.focus();
            }}
          />
        ) : (
          messages.map((m) =>
            m.role === "user" ? (
              <UserMessage key={m.id} text={m.text} scope={m.scope} />
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
        modelSelect={connection && <ModelSelect connection={connection} />}
      />
    </aside>
  );
}

/** 대화가 없을 때 보이는 첫 안내. 예시를 누르면 요청창에 채워 넣음. */
function AiIntro({
  showMockHint,
  onPickExample,
}: {
  showMockHint: boolean;
  onPickExample: (example: string) => void;
}) {
  return (
    <div className="space-y-lg pt-md text-body text-fg-muted">
      <p>{strings.ai.panel.intro}</p>
      <div className="flex flex-col items-start gap-sm">
        {strings.ai.panel.examples.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onPickExample(example)}
            className="chip chip-suggest"
          >
            {example}
          </button>
        ))}
      </div>
      {showMockHint && <Notice>{strings.ai.panel.mockHint(MOCK_TAGS)}</Notice>}
    </div>
  );
}

function UserMessage({ text, scope }: { text: string; scope: CellRange | null }) {
  return (
    <div className="ml-2xl rounded-lg bg-ai-soft px-lg py-md text-body text-fg">
      <p className="whitespace-pre-wrap">{text}</p>
      <p className="mt-xs text-caption text-ai-ink/70">
        {strings.ai.panel.requestScope(scope && rangeToA1(scope))}
      </p>
    </div>
  );
}
