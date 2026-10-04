"use client";

import { Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AI_ENDPOINT } from "@/lib/ai/protocol";
import { rangeToA1 } from "@/lib/sheet/address";
import { useStore } from "@/lib/store";
import { useSheet } from "../SheetContext";
import { AiComposer } from "./AiComposer";
import { AiRunCard } from "./AiRunCard";

const EXAMPLES = [
  "선택한 범위의 숫자를 두 배로 바꿔 줘",
  "빈칸을 예시 값으로 채워 줘",
  "영문을 대문자로 바꿔 줘",
];

/** 가짜 응답 모드에서 실패 상황을 재현하는 표시(서버의 mock-anthropic.ts 참고) */
const MOCK_TAGS = ["[느림]", "[한도]", "[키]", "[과부하]", "[거절]", "[잘림]"];

interface Connection {
  provider: string;
  model: string;
}

/** 오른쪽 AI 편집 패널: 대화, 진행 상태, 제안 검토, 요청 입력. */
export function AiPanel() {
  const { ai, aiPanel, controller } = useSheet();
  const messages = useStore(ai.messages);
  const [draft, setDraft] = useState("");
  const [connection, setConnection] = useState<Connection | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 패널을 열면 바로 입력할 수 있게 한다.
  useEffect(() => inputRef.current?.focus(), []);

  useEffect(() => {
    let active = true;
    fetch(AI_ENDPOINT)
      .then((res) => (res.ok ? (res.json() as Promise<Connection>) : null))
      .then((info) => {
        if (active && info) setConnection(info);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

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
      className="flex w-[360px] shrink-0 flex-col border-l border-header-line bg-header"
    >
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-header-line bg-white px-3">
        <Sparkles size={16} className="text-ai" aria-hidden />
        <h2 className="text-[14px] font-semibold text-neutral-800">AI 편집</h2>
        {connection && (
          <span
            className={`truncate rounded px-1.5 py-0.5 text-[10px] font-medium ${
              connection.provider === "mock"
                ? "bg-amber-100 text-amber-800"
                : "bg-neutral-100 text-neutral-600"
            }`}
            title={
              connection.provider === "mock" ? "API 키가 없어 가짜 응답으로 동작해요" : undefined
            }
          >
            {connection.provider === "mock" ? "가짜 응답 · API 키 없음" : connection.model}
          </span>
        )}
        <button
          type="button"
          onClick={close}
          aria-label="AI 패널 닫기"
          className="ml-auto rounded p-1 text-neutral-500 hover:bg-black/5"
        >
          <X size={16} />
        </button>
      </header>

      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <div className="space-y-3 pt-2 text-[13px] text-neutral-600">
            <p>
              시트 내용을 바탕으로 AI가 값을 제안해요. 범위를 선택하고 요청하면 그 범위만 바꾸고,
              결과는 원래 값과 비교한 뒤 적용할 수 있어요.
            </p>
            <div className="flex flex-col items-start gap-1.5">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => {
                    setDraft(example);
                    inputRef.current?.focus();
                  }}
                  className="rounded-full border border-header-line bg-white px-3 py-1 text-xs text-neutral-700 hover:border-ai hover:text-ai-ink"
                >
                  {example}
                </button>
              ))}
            </div>
            {connection?.provider === "mock" && (
              <p className="rounded-md bg-amber-50 p-2 text-xs leading-relaxed text-amber-900">
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
                className="ml-8 rounded-lg bg-ai-soft px-3 py-2 text-[13px] text-neutral-800"
              >
                <p className="whitespace-pre-wrap">{m.text}</p>
                <p className="mt-1 text-[11px] text-ai-ink/70">
                  {m.scope ? `범위 ${rangeToA1(m.scope)}` : "시트 전체"}
                </p>
              </div>
            ) : (
              <AiRunCard key={m.id} run={m.run} />
            ),
          )
        )}
      </div>

      <AiComposer inputRef={inputRef} draft={draft} onDraftChange={setDraft} />
    </aside>
  );
}
