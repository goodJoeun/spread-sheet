import type { CellCoord } from "@/lib/sheet/address";
import { cellRect, outsetRect, rangeRect } from "@/lib/sheet/geometry";
import { isMultiCell, selectionRange, type Selection } from "@/lib/sheet/selection";
import { Layer } from "./layers";

interface SelectionOverlayProps {
  selection: Selection;
  /** 편집 중이면 편집 중인 셀 */
  activeCoord: CellCoord;
}

export function SelectionOverlay({ selection, activeCoord }: SelectionOverlayProps) {
  return (
    <>
      {isMultiCell(selection) && (
        <div
          className="selection-range"
          style={{ ...outsetRect(rangeRect(selectionRange(selection))), zIndex: Layer.selection }}
        />
      )}
      <div
        className="selection-cursor"
        style={{ ...outsetRect(cellRect(activeCoord)), zIndex: Layer.selection }}
      />
    </>
  );
}
