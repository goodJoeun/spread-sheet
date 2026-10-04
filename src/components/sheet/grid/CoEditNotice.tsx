import type { Rect } from "@/lib/sheet/geometry";
import { AnchoredLabel } from "./AnchoredLabel";
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
  return (
    <AnchoredLabel
      role="status"
      rect={rect}
      below={below}
      zIndex={Layer.editorNotice}
      // 아래에 붙을 때는 편집칸 테두리·그림자와 겹치지 않게 조금 띄운다.
      className={`grid-label grid-label-warn ${below ? "mt-2xs" : ""}`}
    >
      {messages.map((message) => (
        <p key={message}>{message}</p>
      ))}
    </AnchoredLabel>
  );
}
