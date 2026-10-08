import {
  useEffect,
  useMemo,
  useRef,
  type FocusEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import type { SheetController } from "@/lib/controller/sheet-controller";
import { isApplePlatform, isImeComposing } from "@/lib/platform";
import { isDraftInput } from "@/lib/sheet/draft-input";
import { resolveGridKey } from "@/lib/sheet/keymap";

/**
 * 수식 입력줄에서 셀 값을 고친다. 글자는 컨트롤러를 거쳐 셀 편집칸에도 그대로 써 두므로
 * 확정·이동·실행 취소·다른 참여자 알림은 셀에서 입력할 때와 같다.
 * 셀 편집칸처럼 비제어로 다룬다. 이 칸에서 입력하는 동안에는 이 칸의 글자가 원본이라 덮어쓰지 않는다.
 */
export function useFormulaInput(
  controller: SheetController,
  inputRef: RefObject<HTMLInputElement | null>,
  /** 보여 줄 값: 편집 중이면 입력 중인 글자, 아니면 선택한 셀의 값 */
  value: string,
) {
  const composingRef = useRef(false);
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
    const el = inputRef.current;
    if (!el || (el === document.activeElement && controller.isEditing())) return;
    el.value = value;
  }, [controller, inputRef, value]);

  return useMemo(() => {
    const input = () => inputRef.current;
    /** 잠긴 셀이라 편집을 시작하지 못했으면 입력한 글자를 지우고 셀 값으로 되돌린다. */
    const restore = () => {
      const el = input();
      if (el) el.value = valueRef.current;
    };

    return {
      onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
        if (isImeComposing(e.nativeEvent)) return;
        // 이 칸에서는 방향키가 언제나 글자 사이 커서를 움직인다(F2 편집 모드와 같음).
        const action = resolveGridKey(e, "edit", isApplePlatform());
        if (!action) return;
        e.preventDefault();
        controller.runAction(action);
        // Enter·Tab으로 확정하거나 Esc로 취소하면 시트로 돌아가 바로 이어서 움직일 수 있게 한다.
        if (action.type === "advance" || action.type === "cancelEdit") controller.focus();
      },
      onInput: () => {
        const el = input();
        if (!el || (composingRef.current && !controller.isEditing())) return;
        if (!controller.replaceDraft(el.value)) restore();
      },
      onCompositionStart: () => {
        composingRef.current = true;
        // 조합 중인 글자가 들어오기 전 값으로 편집을 시작해 둔다.
        if (!controller.isEditing()) controller.replaceDraft(input()?.value ?? "");
      },
      onCompositionEnd: () => {
        composingRef.current = false;
        if (!controller.isEditing()) restore();
      },
      onBlur: (e: FocusEvent<HTMLInputElement>) => {
        // 다른 창·탭으로 전환하거나 셀 편집칸으로 옮겨 가면 편집을 유지한다.
        if (!document.hasFocus() || isDraftInput(e.relatedTarget)) return;
        controller.commitEdit();
      },
    };
  }, [controller, inputRef]);
}
