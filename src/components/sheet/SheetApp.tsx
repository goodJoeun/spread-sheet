"use client";

import type { ReactNode } from "react";
import { FormulaBar } from "./FormulaBar";
import { Grid } from "./grid/Grid";
import { ParticipantList } from "./ParticipantList";
import { SheetProvider } from "./SheetContext";
import { Toolbar } from "./Toolbar";
import { useSheetSession } from "./useSheetSession";

interface SheetAppProps {
  sheetId: string;
}

export function SheetApp({ sheetId }: SheetAppProps) {
  const session = useSheetSession(sheetId);

  if (!session) {
    return (
      <Shell>
        <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">
          시트를 불러오는 중…
        </div>
      </Shell>
    );
  }

  return (
    <SheetProvider session={session}>
      <Shell participants={<ParticipantList />}>
        <Toolbar />
        <FormulaBar />
        <Grid />
      </Shell>
    </SheetProvider>
  );
}

function Shell({ participants, children }: { participants?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-white">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-header-line px-4">
        <div className="flex size-7 items-center justify-center rounded bg-accent text-sm font-bold text-white">
          S
        </div>
        <h1 className="text-[15px] font-semibold text-neutral-800">Spread Sheet</h1>
        <div className="ml-auto">{participants}</div>
      </header>
      {children}
    </div>
  );
}
