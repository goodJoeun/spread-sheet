"use client";

import { rangeToA1 } from "@/lib/sheet/address";
import { getValue } from "@/lib/sheet/document";
import { selectionRange } from "@/lib/sheet/selection";
import { useSelection, useSheet } from "./SheetContext";
import { useDocVersion } from "./useSheetSession";

export function FormulaBar() {
  const { session } = useSheet();
  useDocVersion(session.doc);
  const selection = useSelection();
  const value = getValue(session.doc, selection.active);

  return (
    <div className="formula-bar">
      <div className="formula-bar-ref" aria-label="선택 범위">
        {rangeToA1(selectionRange(selection))}
      </div>
      <div className="formula-bar-fx">fx</div>
      <div className="min-w-0 flex-1 truncate pr-3 text-fg" aria-label="셀 내용">
        {value}
      </div>
    </div>
  );
}
