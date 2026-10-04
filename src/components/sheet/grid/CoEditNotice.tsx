import type { Rect } from "@/lib/sheet/geometry";
import { Layer } from "./layers";

interface CoEditNoticeProps {
  /** 보여 줄 안내(같은 셀 동시 입력, 다른 참여자의 AI 편집 범위 등) */
  messages: string[];
  /** 편집칸 위치(outsetRect) */
  rect: Rect;
  /** 첫 행이면 머리글에 가리지 않게 아래에 붙인다. */
  below: boolean;
}

/**
 * 내가 입력 중인 셀에 대한 공동 편집 안내. 입력을 막지 않고 알리기만 한다.
 * 확인 창으로 묻지 않는 이유: 편집칸의 포커스를 빼앗아 한글 조합이 중간에 끊기기 때문이다.
 */
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
