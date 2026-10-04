import type { Rect } from "@/lib/sheet/geometry";
import { Layer } from "./layers";

interface CoEditNoticeProps {
  messages: string[];
  rect: Rect;
  /** 첫 행이면 머리글에 가리지 않게 아래에 붙인다. */
  below: boolean;
}

/** 확인 창으로 묻지 않고 알리기만 한다. 확인 창은 편집칸 포커스를 빼앗아 한글 조합을 끊는다. */
export function CoEditNotice({ messages, rect, below }: CoEditNoticeProps) {
  if (messages.length === 0) return null;
  const height = 18 * messages.length;
  return (
    <div
      role="status"
      className="pointer-events-none absolute rounded-t bg-amber-500 px-1.5 text-[11px] leading-[18px] font-medium whitespace-nowrap text-white shadow"
      style={{
        left: rect.left,
        top: below ? rect.top + rect.height + 2 : rect.top - height,
        zIndex: Layer.editorNotice,
      }}
    >
      {messages.map((message) => (
        <p key={message}>{message}</p>
      ))}
    </div>
  );
}
