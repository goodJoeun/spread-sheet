import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ICON } from "@/styles/icon";

/**
 * 주의 안내(충돌, 겹침, 경고, 저장소 문제)를 보여 주는 상자.
 *   box: 테두리 상자  inline: 상자 없이 글자 줄만  bar: 화면 폭 띠(위쪽 바에 붙음)
 */
type NoticeVariant = "box" | "inline" | "bar";

const VARIANT: Record<NoticeVariant, string> = {
  box: "rounded-sm border border-warn-line bg-warn-soft px-md py-sm text-label",
  inline: "text-label",
  bar: "shrink-0 items-center border-b border-warn-line bg-warn-soft px-xl py-sm text-body",
};

// 아이콘을 글자 첫 줄(16px)의 가운데에 맞춤. 띠(bar)는 한 줄이라 세로 가운데 정렬로 맞춤.
const ICON_CLASS: Record<NoticeVariant, string> = {
  box: "mt-2xs shrink-0",
  inline: "mt-2xs shrink-0",
  bar: "shrink-0 text-warn-strong",
};

interface NoticeProps {
  variant?: NoticeVariant;
  icon?: LucideIcon;
  /** 스크린 리더 역할. 바뀌면 읽어 주는 안내는 "status", 바로 알려야 하는 문제는 "alert" */
  role?: "status" | "alert";
  /** 바깥 여백이나 세로 여백 조정 */
  className?: string;
  children: ReactNode;
}

export function Notice({
  variant = "box",
  icon: Icon,
  role,
  className = "",
  children,
}: NoticeProps) {
  return (
    <div role={role} className={`flex gap-sm text-warn-ink ${VARIANT[variant]} ${className}`}>
      {Icon && <Icon size={ICON.sm} className={ICON_CLASS[variant]} aria-hidden />}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
