"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { useDismiss } from "@/hooks/ui/useDismiss";

interface PopoverProps {
  /** 패널 종류. 고르는 항목이면 "menu", 그 밖의 내용이면 "dialog" */
  role: "menu" | "dialog";
  /** 스크린 리더가 읽는 패널 이름 */
  label: string;
  /** 트리거 버튼 안의 내용 */
  trigger: ReactNode;
  triggerClassName: string;
  /** 트리거에 글자가 없을 때 스크린 리더가 읽는 이름 */
  triggerLabel?: string;
  triggerTitle?: string;
  /** 트리거 기준 패널 위치·너비·안쪽 여백(예: "top-9 left-0 w-[188px] p-md") */
  panelClassName: string;
  /** 항목을 고른 뒤 패널을 닫을 수 있게 close를 넘김. */
  children: (close: () => void) => ReactNode;
}

/** 트리거 버튼과 그 아래에 뜨는 패널. 바깥을 누르거나 Esc를 누르면 닫힘. */
export function Popover({
  role,
  label,
  trigger,
  triggerClassName,
  triggerLabel,
  triggerTitle,
  panelClassName,
  children,
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(rootRef, open, close);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup={role}
        aria-expanded={open}
        aria-label={triggerLabel}
        title={triggerTitle}
        onClick={() => setOpen((o) => !o)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          role={role}
          aria-label={label}
          className={`absolute z-50 rounded-lg border border-line bg-surface shadow-lg ${panelClassName}`}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}
