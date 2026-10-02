"use client";

import { createContext, use, useEffect, useMemo, type ReactNode } from "react";
import type { SheetSession } from "@/lib/collab/session";
import { SheetController } from "@/lib/controller/sheet-controller";
import { useStore } from "@/lib/store";

interface SheetContextValue {
  session: SheetSession;
  controller: SheetController;
}

const SheetContext = createContext<SheetContextValue | null>(null);

/** 시트 화면의 컴포넌트들(그리드, 툴바, 참여자 목록 등)이 같은 세션과 컨트롤러를 쓰게 한다. */
export function SheetProvider({
  session,
  children,
}: {
  session: SheetSession;
  children: ReactNode;
}) {
  const controller = useMemo(() => new SheetController(session), [session]);
  useEffect(() => controller.connect(), [controller]);
  const value = useMemo(() => ({ session, controller }), [session, controller]);
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
