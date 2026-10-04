"use client";

import { createContext, use, useEffect, useMemo, useState, type ReactNode } from "react";
import { AiController } from "@/lib/ai/ai-controller";
import { fetchAiTransport } from "@/lib/ai/transport";
import type { SheetSession } from "@/lib/collab/session";
import { SheetController } from "@/lib/controller/sheet-controller";
import { createStore, useStore, type Store } from "@/lib/store";

interface SheetContextValue {
  session: SheetSession;
  controller: SheetController;
  ai: AiController;
  /** AI 패널이 열려 있는지 */
  aiPanel: Store<boolean>;
}

const SheetContext = createContext<SheetContextValue | null>(null);

/** 시트 화면의 컴포넌트들(그리드, 툴바, 참여자 목록, AI 패널)이 같은 세션과 컨트롤러를 쓰게 한다. */
export function SheetProvider({
  session,
  children,
}: {
  session: SheetSession;
  children: ReactNode;
}) {
  const controller = useMemo(() => new SheetController(session), [session]);
  const ai = useMemo(
    () => new AiController(session.doc, controller, fetchAiTransport),
    [session, controller],
  );
  const [aiPanel] = useState(() => createStore(false));
  useEffect(() => controller.connect(), [controller]);
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
