import type { RefObject } from "react";
import type { Rect } from "@/lib/sheet/geometry";
import { COL_WIDTH } from "@/lib/sheet/geometry";
import type { CellFormat } from "@/lib/sheet/schema";
import { strings } from "@/resources/strings";
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
// 글자 시작점을 셀 글자(px-xs)와 맞추려고 테두리 2px·바깥 1px을 뺀 3px만 띄운다.
const EDITING =
  "absolute border-2 border-accent bg-surface px-[3px] text-body shadow-md outline-none " +
  "select-text [field-sizing:content]";

/** 편집 중이 아닐 때도 투명하게 active 셀 위에 남아 포커스를 쥔다. 그래야 IME 후보창도 셀 위치에 뜬다. */
export function CellEditor({ inputRef, handlers, editing, format, rect }: CellEditorProps) {
  const decoration = [format.underline && "underline", format.strike && "line-through"]
    .filter(Boolean)
    .join(" ");
  return (
    <input
      ref={inputRef}
      type="text"
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
        fontWeight: format.bold ? 700 : undefined,
        fontStyle: format.italic ? "italic" : undefined,
        textDecorationLine: decoration || undefined,
        color: format.color,
        backgroundColor: editing ? (format.fill ?? "#ffffff") : undefined,
        textAlign: format.align,
      }}
      {...handlers}
    />
  );
}
