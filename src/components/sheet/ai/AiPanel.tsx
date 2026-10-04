"use client";

import { Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { rangeToA1 } from "@/lib/sheet/address";
import { useStore } from "@/lib/store";
import { useSheet } from "../SheetContext";
import { AiComposer } from "./AiComposer";
import { AiRunCard } from "./AiRunCard";
import { useAiConnection } from "./useAiConnection";
import { ICON } from "@/components/ui/icon";

const EXAMPLES = [
  "선택한 범위의 숫자를 두 배로 바꿔 줘",
  "빈칸을 예시 값으로 채워 줘",
  "영문을 대문자로 바꿔 줘",
];

/** 가짜 응답 모드에서 실패 상황을 재현하는 표시(서버의 mock-anthropic.ts 참고) */
const MOCK_TAGS = ["[느림]", "[한도]", "[키]", "[과부하]", "[거절]", "[잘림]"];

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
      aria-label="AI 편집"
      className="flex w-[360px] shrink-0 flex-col border-l border-line bg-surface-muted"
    >
      <header className="flex h-10 shrink-0 items-center gap-md border-b border-line bg-surface px-lg">
        <Sparkles size={ICON.md} className="text-ai" aria-hidden />
        <h2 className="text-title font-semibold text-fg">AI 편집</h2>
        {connection && (
          <span
            className={connection.provider === "mock" ? "badge badge-warn" : "badge"}
            title={
              connection.provider === "mock"
                ? "API 키가 없어 가짜 응답으로 동작해요"
                : "서버가 Claude API에 연결되어 있어요"
            }
          >
            {connection.provider === "mock" ? "가짜 응답 · API 키 없음" : "Claude API"}
          </span>
        )}
        <button
          type="button"
          onClick={close}
          aria-label="AI 패널 닫기"
          className="icon-btn-sm ml-auto"
        >
          <X size={ICON.md} />
        </button>
      </header>

      <div ref={listRef} className="min-h-0 flex-1 space-y-lg overflow-y-auto p-lg">
        {messages.length === 0 ? (
          <div className="space-y-lg pt-md text-body text-fg-muted">
            <p>
              시트 내용을 바탕으로 AI가 값을 제안해요. 범위를 선택하고 요청하면 그 범위만 바꾸고,
              결과는 원래 값과 비교한 뒤 적용할 수 있어요.
            </p>
            <div className="flex flex-col items-start gap-sm">
              {EXAMPLES.map((example) => (
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
              <p className="notice">
                지금은 가짜 응답이에요. 요청에 {MOCK_TAGS.join(" ")}를 넣으면 지연·오류 상황을
                재현할 수 있어요.
              </p>
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
                  {m.scope ? `범위 ${rangeToA1(m.scope)}` : "시트 전체"}
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
