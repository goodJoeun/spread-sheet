"use client";

import { TriangleAlert } from "lucide-react";
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
  const loaded = useSheetSession(sheetId);

  if (!loaded) {
    return (
      <Shell>
        <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">
          시트를 불러오는 중…
        </div>
      </Shell>
    );
  }

  return (
    <SheetProvider session={loaded.session}>
      <Shell participants={<ParticipantList />}>
        {loaded.storage === "unavailable" && <StorageNotice />}
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

function StorageNotice() {
  return (
    <div
      role="alert"
      className="flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-[13px] text-amber-900"
    >
      <TriangleAlert size={15} className="shrink-0 text-amber-600" aria-hidden />이 브라우저에서
      저장소를 열 수 없어 편집 내용이 저장되지 않아요. 열려 있는 다른 탭과의 동기화는 계속 동작해요.
    </div>
  );
}
