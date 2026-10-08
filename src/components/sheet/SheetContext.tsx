"use client";

import { createContext, use, useEffect, useMemo, useState, type ReactNode } from "react";
import { useStore } from "@/hooks/useStore";
import { AiController } from "@/lib/ai/ai-controller";
import { fetchAiTransport } from "@/lib/ai/transport";
import type { SheetSession } from "@/lib/collab/session";
import { SheetController } from "@/lib/controller/sheet-controller";
import { createStore, type Store } from "@/lib/store";

interface SheetContextValue {
  session: SheetSession;
  controller: SheetController;
  ai: AiController;
  aiPanel: Store<boolean>;
}

const SheetContext = createContext<SheetContextValue | null>(null);

export function SheetProvider({
  session,
  children,
}: {
  session: SheetSession;
  children: ReactNode;
}) {
  const controller = useMemo(() => new SheetController(session), [session]);
  const ai = useMemo(
    () => new AiController(session.doc, controller, fetchAiTransport, session.presence),
    [session, controller],
  );
  const [aiPanel] = useState(() => createStore(false));
  useEffect(() => controller.connect(), [controller]);
  useEffect(() => ai.connect(), [ai]);
  useEffect(() => () => ai.destroy(), [ai]);
  const value = useMemo(
    () => ({ session, controller, ai, aiPanel }),
    [session, controller, ai, aiPanel],
  );
  return <SheetContext value={value}>{children}</SheetContext>;
}

export function useSheet(): SheetContextValue {
  const value = use(SheetContext);
  if (!value) throw new Error("useSheet은 SheetProvider 안에서만 쓸 수 있습니다.");
  return value;
}

export function useSelection() {
  return useStore(useSheet().controller.selection);
}

export function useEditState() {
  return useStore(useSheet().controller.edit);
}
