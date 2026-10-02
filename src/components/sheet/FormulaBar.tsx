"use client";

import { rangeToA1 } from "@/lib/sheet/address";
import { getValue } from "@/lib/sheet/document";
import { selectionRange } from "@/lib/sheet/selection";
import { useSelection, useSheet } from "./SheetContext";
import { useDocVersion } from "./useSheetSession";

/** 선택 범위 주소와 active 셀의 전체 내용을 보여 준다. 셀 너비보다 긴 값을 확인할 때 쓴다. */
export function FormulaBar() {
  const { session } = useSheet();
  useDocVersion(session.doc);
  const selection = useSelection();
  const value = getValue(session.doc, selection.active);

  return (
    <div className="flex h-8 shrink-0 items-center border-b border-header-line bg-white text-[13px]">
      <div
        className="flex h-full w-24 shrink-0 items-center border-r border-header-line px-3 font-medium text-neutral-700"
        aria-label="선택 범위"
      >
        {rangeToA1(selectionRange(selection))}
      </div>
      <div className="flex h-full shrink-0 items-center px-3 font-serif text-neutral-400 italic">
        fx
      </div>
      <div className="min-w-0 flex-1 truncate pr-3 text-neutral-800" aria-label="셀 내용">
        {value}
      </div>
    </div>
  );
}
