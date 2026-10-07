import type { RefObject } from "react";
import type { Rect } from "@/lib/sheet/geometry";
import { COL_WIDTH } from "@/lib/sheet/geometry";
import { DRAFT_INPUT_PROPS } from "@/lib/sheet/draft-input";
import type { CellFormat } from "@/lib/sheet/schema";
import { strings } from "@/resources/strings";
import { cellTextStyle } from "./cell-style";
import { Layer } from "./layers";
import type { CellEditorBinding } from "@/hooks/grid/useCellEditor";

interface CellEditorProps {
  inputRef: RefObject<HTMLInputElement | null>;
  handlers: CellEditorBinding["handlers"];
  editing: boolean;
  format: CellFormat;
  rect: Rect;
}

const IDLE = "absolute cursor-cell bg-transparent opacity-0 outline-none";
// 편집칸 글자가 셀 글자(px-xs)와 같은 자리에서 시작하도록, 테두리 2px과 바깥 1px을 뺀 3px만 띄움.
const EDITING =
  "absolute border-2 border-accent bg-surface px-[3px] text-body shadow-md outline-none " +
  "select-text [field-sizing:content]";

/** 편집 중이 아닐 때도 투명한 상태로 선택한 셀 위에 남아 포커스를 쥐고 있음. 그래야 한글 입력기 후보창도 셀 위치에 뜸. */
export function CellEditor({ inputRef, handlers, editing, format, rect }: CellEditorProps) {
  return (
    <input
      ref={inputRef}
      type="text"
      {...DRAFT_INPUT_PROPS}
      aria-label={strings.grid.cellEditor}
      autoComplete="off"
      spellCheck={false}
      className={editing ? EDITING : IDLE}
      style={{
        left: rect.left,
        top: rect.top,
        height: rect.height,
        minWidth: rect.width,
        width: editing ? undefined : rect.width,
        maxWidth: editing ? COL_WIDTH * 6 : undefined,
        zIndex: Layer.editor,
        ...cellTextStyle(format),
        backgroundColor: editing ? (format.fill ?? "#ffffff") : undefined,
        textAlign: format.align,
      }}
      {...handlers}
    />
  );
}
