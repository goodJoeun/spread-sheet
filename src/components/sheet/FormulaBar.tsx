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
    <div className="flex h-8 shrink-0 items-center border-b border-line bg-surface text-body">
      <div
        className="flex h-full w-24 shrink-0 items-center border-r border-line px-lg font-medium text-fg-secondary"
        aria-label="선택 범위"
      >
        {rangeToA1(selectionRange(selection))}
      </div>
      <div className="flex h-full shrink-0 items-center px-lg font-serif text-fg-faint italic">
        fx
      </div>
      <div className="min-w-0 flex-1 truncate pr-lg text-fg" aria-label="셀 내용">
        {value}
      </div>
    </div>
  );
}
