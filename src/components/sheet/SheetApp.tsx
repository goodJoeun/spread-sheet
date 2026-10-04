"use client";

import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Notice } from "@/components/ui/Notice";
import { useStore } from "@/lib/store";
import { AiPanel } from "./ai/AiPanel";
import { FormulaBar } from "./FormulaBar";
import { Grid } from "./grid/Grid";
import { ParticipantList } from "./ParticipantList";
import { SheetProvider, useSheet } from "./SheetContext";
import { Toolbar } from "./Toolbar";
import { useSheetSession } from "@/hooks/sheet/useSheetSession";

interface SheetAppProps {
  sheetId: string;
}

export function SheetApp({ sheetId }: SheetAppProps) {
  const loaded = useSheetSession(sheetId);

  if (!loaded) {
    return (
      <Shell>
        <div className="flex flex-1 items-center justify-center text-body text-fg-subtle">
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
        <Workspace />
      </Shell>
    </SheetProvider>
  );
}

function Workspace() {
  const { aiPanel } = useSheet();
  const aiOpen = useStore(aiPanel);
  return (
    <div className="flex min-h-0 flex-1">
      <Grid />
      {aiOpen && <AiPanel />}
    </div>
  );
}

function Shell({ participants, children }: { participants?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-surface">
      <header className="flex h-12 shrink-0 items-center gap-lg border-b border-line px-xl">
        <div className="flex size-7 items-center justify-center rounded-sm bg-accent text-body font-semibold text-fg-inverse">
          S
        </div>
        <h1 className="text-title font-semibold text-fg">Spread Sheet</h1>
        <div className="ml-auto">{participants}</div>
      </header>
      {children}
    </div>
  );
}

function StorageNotice() {
  return (
    <Notice variant="bar" role="alert" icon={TriangleAlert}>
      이 브라우저에서 저장소를 열 수 없어 편집 내용이 저장되지 않아요. 열려 있는 다른 탭과의
      동기화는 계속 동작해요.
    </Notice>
  );
}
