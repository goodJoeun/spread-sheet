import { useEffect, useState } from "react";
import { loadTabUser, saveTabUser } from "@/lib/collab/identity";
import { createSheetSession, type SheetSession, type StorageStatus } from "@/lib/collab/session";

interface LoadedSession {
  session: SheetSession;
  storage: StorageStatus;
}

/** 저장된 내용을 다 불러온 뒤에 돌려준다. 빈 시트가 잠깐 보였다가 채워지는 깜빡임을 막는다. */
export function useSheetSession(sheetId: string): LoadedSession | null {
  const [loaded, setLoaded] = useState<LoadedSession | null>(null);

  useEffect(() => {
    const session = createSheetSession(sheetId, {
      user: loadTabUser(),
      onUserChange: saveTabUser,
    });
    let active = true;
    session.whenLoaded.then((storage) => {
      if (active) setLoaded({ session, storage });
    });
    // 늦게라도 저장소가 준비되면 안내를 거둔다.
    session.whenPersisted.then(() => {
      if (active) setLoaded({ session, storage: "ready" });
    });

    // 탭을 닫거나 새로고침하면 다른 탭의 참여자 목록에서 바로 빠진다.
    // 뒤로/앞으로 캐시에서 복원되면 멈춰 있던 동안의 변경을 다시 받고 참여자로 돌아온다.
    const onPageHide = () => session.leave();
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) session.rejoin();
    };
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      active = false;
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      void session.destroy();
    };
  }, [sheetId]);

  return loaded?.session.sheetId === sheetId ? loaded : null;
}
