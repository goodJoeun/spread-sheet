import type { CellCoord } from "@/lib/sheet/address";
import { cellRect, outsetRect, rangeRect } from "@/lib/sheet/geometry";
import { isMultiCell, selectionRange, type Selection } from "@/lib/sheet/selection";
import { Layer } from "./layers";

interface SelectionOverlayProps {
  selection: Selection;
  /** 테두리를 그릴 셀. 편집 중이면 편집 중인 셀 */
  activeCoord: CellCoord;
}

/** 내 선택 범위(반투명 파란 영역)와 active 셀(굵은 테두리). */
export function SelectionOverlay({ selection, activeCoord }: SelectionOverlayProps) {
  return (
    <>
      {isMultiCell(selection) && (
        <div
          className="pointer-events-none absolute border border-accent bg-accent/10"
          style={{ ...outsetRect(rangeRect(selectionRange(selection))), zIndex: Layer.selection }}
        />
      )}
      <div
        className="pointer-events-none absolute border-2 border-accent"
        style={{ ...outsetRect(cellRect(activeCoord)), zIndex: Layer.selection }}
      />
    </>
  );
}
