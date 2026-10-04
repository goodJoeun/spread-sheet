import type { ReactNode } from "react";
import type { Rect } from "@/lib/sheet/geometry";

interface AnchoredLabelProps {
  /** 이름표를 붙일 셀·범위 */
  rect: Rect;
  /** 첫 행이면 머리글에 가리지 않게 아래에 붙인다. */
  below: boolean;
  /** 범위 왼쪽 끝(start)이나 오른쪽 끝(end)에 맞춘다. */
  align?: "start" | "end";
  zIndex: number;
  /** 모양(.name-tag, .grid-label …)과 아래 붙일 때의 간격 */
  className: string;
  /** 참여자 색처럼 계산된 바탕색 */
  color?: string;
  role?: "status";
  children: ReactNode;
}

/** 셀·범위 위(또는 아래)에 붙는 이름표. 높이를 몰라도 되게 위에 붙일 때는 자기 높이만큼 끌어올린다. */
export function AnchoredLabel({
  rect,
  below,
  align = "start",
  zIndex,
  className,
  color,
  role,
  children,
}: AnchoredLabelProps) {
  return (
    <div
      role={role}
      className={`${className} ${below ? "rounded-b-sm" : "rounded-t-sm"}`}
      style={{
        left: align === "start" ? rect.left : undefined,
        right: align === "end" ? `calc(100% - ${rect.left + rect.width}px)` : undefined,
        top: below ? rect.top + rect.height : rect.top,
        transform: below ? undefined : "translateY(-100%)",
        zIndex,
        backgroundColor: color,
      }}
    >
      {children}
    </div>
  );
}
