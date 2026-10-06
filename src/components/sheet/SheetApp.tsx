"use client";

import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Notice } from "@/components/ui/Notice";
import { useStore } from "@/hooks/useStore";
import { strings } from "@/resources/strings";
import { AiPanel } from "./ai/AiPanel";
import { FormulaBar } from "./FormulaBar";
import { Grid } from "./grid/Grid";
import { ParticipantList } from "./ParticipantList";
import { SheetProvider, useSheet } from "./SheetContext";
import { Toolbar } from "./toolbar";
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
          {strings.app.loading}
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
        <h1 className="text-title font-semibold text-fg">{strings.app.title}</h1>
        <div className="ml-auto">{participants}</div>
      </header>
      {children}
    </div>
  );
}

function StorageNotice() {
  return (
    <Notice variant="bar" role="alert" icon={TriangleAlert}>
      {strings.app.storageUnavailable}
    </Notice>
  );
}
