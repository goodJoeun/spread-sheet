import { useEffect, type RefObject } from "react";

/**
 * 열린 팝오버를 바깥 클릭이나 Esc로 닫는다.
 * Esc는 캡처 단계에서 먼저 받아, 그리드가 같은 키로 편집을 취소하지 않게 한다.
 */
export function useDismiss(
  rootRef: RefObject<HTMLElement | null>,
  open: boolean,
  onDismiss: () => void,
): void {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onDismiss();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onDismiss();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [rootRef, open, onDismiss]);
}
