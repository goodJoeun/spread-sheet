import { useMemo, useRef, type MouseEvent, type PointerEvent, type RefObject } from "react";
import type { SheetController } from "@/lib/controller/sheet-controller";
import { hitTest, type PointerTargetKind } from "@/lib/sheet/viewport";
import type { CellEditorBinding } from "./useCellEditor";

interface GridPointerOptions {
  controller: SheetController;
  editor: CellEditorBinding;
  inputRef: RefObject<HTMLInputElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
}

export function useGridPointer({
  controller,
  editor,
  inputRef,
  scrollRef,
  contentRef,
}: GridPointerOptions) {
  const dragRef = useRef<Exclude<PointerTargetKind, "corner"> | null>(null);

  return useMemo(() => {
    const locate = (e: { clientX: number; clientY: number }) =>
      hitTest(scrollRef.current!, contentRef.current!, e.clientX, e.clientY);
    const onEditor = (e: { target: EventTarget }) =>
      controller.isEditing() && e.target === inputRef.current;

    const endDrag = (e: PointerEvent<HTMLDivElement>) => {
      dragRef.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    };

    return {
      onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        // 편집 중인 입력칸 안을 누르면 커서 이동 같은 브라우저 기본 동작에 맡김.
        if (onEditor(e)) return;
        e.preventDefault(); // 편집칸의 포커스를 유지하고, 드래그 중 글자가 선택되지 않게 함.

        editor.finishBeforePointer();
        const { kind, coord } = locate(e);
        controller.pointerSelect(kind, coord, e.shiftKey);
        dragRef.current = kind === "corner" ? null : kind;
        e.currentTarget.setPointerCapture(e.pointerId);
        controller.focus();
      },
      onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
        if (dragRef.current) controller.pointerDrag(dragRef.current, locate(e).coord);
      },
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onDoubleClick: (e: MouseEvent<HTMLDivElement>) => {
        if (onEditor(e)) return;
        if (locate(e).kind === "cell") controller.startEdit("edit", true);
      },
    };
  }, [controller, editor, inputRef, scrollRef, contentRef]);
}
