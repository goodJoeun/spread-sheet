import type { Rect } from "@/lib/sheet/geometry";
import { Layer } from "./layers";

interface CoEditNoticeProps {
  /** 같은 셀을 입력 중인 다른 참여자 이름 */
  names: string[];
  /** 편집칸 위치(outsetRect) */
  rect: Rect;
  /** 첫 행이면 머리글에 가리지 않게 아래에 붙인다. */
  below: boolean;
}

/** 내가 입력 중인 셀을 다른 사람도 입력 중이면 알린다. 나중에 확정한 값이 남는다. */
export function CoEditNotice({ names, rect, below }: CoEditNoticeProps) {
  if (names.length === 0) return null;
  return (
    <div
      role="status"
      className="pointer-events-none absolute rounded-t bg-amber-500 px-1.5 text-[11px] leading-[18px] font-medium whitespace-nowrap text-white shadow"
      style={{
        left: rect.left,
        top: below ? rect.top + rect.height + 2 : rect.top - 18,
        zIndex: Layer.editorNotice,
      }}
    >
      {names.join(", ")}님도 이 셀을 입력 중이에요
    </div>
  );
}
