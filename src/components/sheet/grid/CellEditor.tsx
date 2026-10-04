import type { RefObject } from "react";
import type { Rect } from "@/lib/sheet/geometry";
import { COL_WIDTH } from "@/lib/sheet/geometry";
import type { CellFormat } from "@/lib/sheet/schema";
import { Layer } from "./layers";
import type { CellEditorBinding } from "./useCellEditor";

interface CellEditorProps {
  inputRef: RefObject<HTMLInputElement | null>;
  handlers: CellEditorBinding["handlers"];
  editing: boolean;
  format: CellFormat;
  rect: Rect;
}

/** 편집 중이 아닐 때도 투명하게 active 셀 위에 남아 포커스를 쥔다. 그래야 IME 후보창도 셀 위치에 뜬다. */
export function CellEditor({ inputRef, handlers, editing, format, rect }: CellEditorProps) {
  const decoration = [format.underline && "underline", format.strike && "line-through"]
    .filter(Boolean)
    .join(" ");
  return (
    <input
      ref={inputRef}
      type="text"
      aria-label="셀 편집"
      autoComplete="off"
      spellCheck={false}
      className={
        editing
          ? "absolute border-2 border-accent bg-white px-[3px] text-[13px] shadow-md outline-none select-text [field-sizing:content]"
          : "absolute cursor-cell border-0 bg-transparent p-0 opacity-0 outline-none"
      }
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
