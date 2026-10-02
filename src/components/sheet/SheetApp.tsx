"use client";

import { useRef, useState } from "react";
import { collapsedSelection } from "@/lib/sheet/selection";
import { createStore } from "@/lib/store";
import { FormulaBar } from "./FormulaBar";
import { Grid, type GridHandle } from "./Grid";
import { ParticipantList } from "./ParticipantList";
import { Toolbar } from "./Toolbar";
import { useSheetSession } from "./useSheetSession";

interface SheetAppProps {
  sheetId: string;
}

export function SheetApp({ sheetId }: SheetAppProps) {
  const session = useSheetSession(sheetId);
  const [selectionStore] = useState(() => createStore(collapsedSelection({ row: 0, col: 0 })));
  const gridRef = useRef<GridHandle>(null);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-white">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-header-line px-4">
        <div className="flex size-7 items-center justify-center rounded bg-accent text-sm font-bold text-white">
          S
        </div>
        <h1 className="text-[15px] font-semibold text-neutral-800">Spread Sheet</h1>
        <div className="ml-auto">
          {session && <ParticipantList presence={session.presence} gridRef={gridRef} />}
        </div>
      </header>

      {session ? (
        <>
          <Toolbar session={session} selectionStore={selectionStore} gridRef={gridRef} />
          <FormulaBar session={session} selectionStore={selectionStore} />
          <Grid ref={gridRef} session={session} selectionStore={selectionStore} />
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">
          시트를 불러오는 중…
        </div>
      )}
    </div>
  );
}
