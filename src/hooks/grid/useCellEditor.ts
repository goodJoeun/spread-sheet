import { useMemo, useRef, type KeyboardEvent, type RefObject } from "react";
import type { SheetController } from "@/lib/controller/sheet-controller";
import { isApplePlatform } from "@/lib/platform";
import { resolveGridKey } from "@/lib/sheet/keymap";

/**
 * 편집칸은 항상 DOM에 남아 포커스를 쥔다. 셀을 선택한 채 타이핑하거나 한글 조합을 시작해도 첫 글자(첫 자모)를 잃지 않게.
 * 값은 비제어로 다룬다. React가 조합 중인 값을 덮어쓰면 한글 입력이 깨진다.
 * inputRef를 객체에 담아 받지 않는 이유: 렌더링 중 ref 접근으로 판단된다.
 */
export function useCellEditor(
  controller: SheetController,
  inputRef: RefObject<HTMLInputElement | null>,
) {
  const composingRef = useRef(false);

  return useMemo(() => {
    const input = () => inputRef.current;

    return {
      focus: () => input()?.focus({ preventScroll: true }),
      readDraft: () => input()?.value ?? "",
      writeDraft: (text: string) => {
        const el = input();
        if (!el) return;
        el.value = text;
        el.setSelectionRange(text.length, text.length);
      },

      /** IME 조합 중이면 blur로 조합을 먼저 확정시킨다. */
      finishBeforePointer: () => {
        const el = input();
        if (!controller.isEditing() || !el) return;
        if (composingRef.current) {
          el.blur(); // compositionend → blur → onBlur에서 확정
          el.focus({ preventScroll: true });
        } else {
          controller.commitEdit();
        }
      },

      handlers: {
        onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
          // IME 조합 중인 키(한글 등)는 입력기에 맡긴다. 여기서 Enter를 처리하면 마지막 글자가 사라지거나 두 번 들어간다.
          if (e.nativeEvent.isComposing || e.keyCode === 229) return;
          const action = resolveGridKey(e, controller.edit.get()?.mode ?? null, isApplePlatform());
          if (!action) return;
          e.preventDefault();
          controller.runAction(action);
        },
        onInput: () => {
          if (!controller.isEditing() && !composingRef.current)
            controller.startEdit("enter", false);
        },
        onCompositionStart: () => {
          composingRef.current = true;
          if (!controller.isEditing()) controller.startEdit("enter", false);
        },
        onCompositionEnd: () => {
          composingRef.current = false;
          // 잠긴 셀이라 편집을 시작하지 못했으면 조합한 글자가 편집칸에 남지 않게 지운다.
          if (!controller.isEditing()) controller.cancelEdit();
        },
        onBlur: () => {
          // 다른 창·탭으로 전환한 경우에는 편집을 유지한다(돌아오면 이어서 입력).
          if (!document.hasFocus()) return;
          controller.commitEdit();
        },
      },
    };
  }, [controller, inputRef]);
}

export type CellEditorBinding = ReturnType<typeof useCellEditor>;
