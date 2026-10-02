import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type * as Y from "yjs";
import { createSheetSession, type SheetSession } from "@/lib/collab/session";

/**
 * 시트 세션을 열고, 저장된 내용을 다 불러온 뒤에 돌려준다.
 * 불러오기 전에 빈 시트가 잠깐 보였다가 내용이 채워지는 깜빡임을 막기 위해서다.
 */
export function useSheetSession(sheetId: string): SheetSession | null {
  const [loaded, setLoaded] = useState<SheetSession | null>(null);

  useEffect(() => {
    const session = createSheetSession(sheetId);
    let active = true;
    session.whenLoaded.then(() => {
      if (active) setLoaded(session);
    });
    return () => {
      active = false;
      void session.destroy();
    };
  }, [sheetId]);

  return loaded?.sheetId === sheetId ? loaded : null;
}

/** 문서가 바뀔 때마다 증가하는 번호. 셀 렌더링을 다시 하게 만드는 데 쓴다. */
export function useDocVersion(doc: Y.Doc): number {
  const store = useMemo(() => {
    let version = 0;
    return {
      subscribe(onChange: () => void) {
        const handler = () => {
          version++;
          onChange();
        };
        doc.on("update", handler);
        return () => doc.off("update", handler);
      },
      getSnapshot: () => version,
    };
  }, [doc]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
