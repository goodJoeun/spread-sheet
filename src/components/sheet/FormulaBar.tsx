"use client";

import { useRef } from "react";
import { useDocVersion } from "@/hooks/sheet/useDocVersion";
import { useFormulaInput } from "@/hooks/sheet/useFormulaInput";
import { useStore } from "@/hooks/useStore";
import { rangeToA1 } from "@/lib/sheet/address";
import { getValue } from "@/lib/sheet/document";
import { DRAFT_INPUT_PROPS } from "@/lib/sheet/draft-input";
import { selectionRange } from "@/lib/sheet/selection";
import { strings } from "@/resources/strings";
import { useEditState, useSelection, useSheet } from "./SheetContext";

export function FormulaBar() {
  const { session, controller } = useSheet();
  useDocVersion(session.doc);
  const selection = useSelection();
  const edit = useEditState();
  const draft = useStore(controller.draft);
  const value = edit ? draft : getValue(session.doc, selection.active);
  const inputRef = useRef<HTMLInputElement>(null);
  const { handlers } = useFormulaInput(controller, inputRef, value);

  return (
    <div className="flex h-8 shrink-0 items-center border-b border-line bg-surface text-body">
      <div
        className="flex h-full w-24 shrink-0 items-center border-r border-line px-lg font-medium text-fg-secondary"
        aria-label={strings.formulaBar.range}
      >
        {rangeToA1(selectionRange(selection))}
      </div>
      <div className="flex h-full shrink-0 items-center px-lg font-serif text-fg-faint italic">
        fx
      </div>
      <input
        ref={inputRef}
        type="text"
        {...DRAFT_INPUT_PROPS}
        aria-label={strings.formulaBar.value}
        autoComplete="off"
        spellCheck={false}
        className="h-full min-w-0 flex-1 truncate bg-transparent pr-lg text-fg outline-none"
        {...handlers}
      />
    </div>
  );
}
