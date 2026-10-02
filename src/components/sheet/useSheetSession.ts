import { useEffect, useState, useSyncExternalStore } from "react";
import type * as Y from "yjs";
import { loadTabUser, saveTabUser } from "@/lib/collab/identity";
import type { Participant, Presence } from "@/lib/collab/presence";
import { createSheetSession, type SheetSession, type StorageStatus } from "@/lib/collab/session";

interface LoadedSession {
  session: SheetSession;
  storage: StorageStatus;
}

/**
 * 시트 세션을 열고, 저장된 내용을 다 불러온 뒤에 돌려준다.
 * 불러오기 전에 빈 시트가 잠깐 보였다가 내용이 채워지는 깜빡임을 막기 위해서다.
 * 저장소를 쓸 수 없으면 storage가 "unavailable"인 채로 연다(로딩 화면에서 멈추지 않게).
 */
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

export function useParticipants(presence: Presence): Participant[] {
  return useSyncExternalStore(
    presence.subscribe,
    presence.getParticipants,
    presence.getParticipants,
  );
}

interface VersionStore {
  subscribe(onChange: () => void): () => void;
  getSnapshot(): number;
}

const versionStores = new WeakMap<Y.Doc, VersionStore>();

/** 문서 하나에 리스너 하나만 걸고, 구독자 모두에게 같은 버전 번호를 준다. */
function docVersionStore(doc: Y.Doc): VersionStore {
  const cached = versionStores.get(doc);
  if (cached) return cached;

  let version = 0;
  const listeners = new Set<() => void>();
  const onUpdate = () => {
    version++;
    listeners.forEach((listener) => listener());
  };
  const store: VersionStore = {
    subscribe(onChange) {
      if (listeners.size === 0) doc.on("update", onUpdate);
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
        if (listeners.size === 0) doc.off("update", onUpdate);
      };
    },
    getSnapshot: () => version,
  };
  versionStores.set(doc, store);
  return store;
}

/** 문서가 바뀔 때마다 증가하는 번호. 셀·툴바를 다시 그리게 하는 데 쓴다. */
export function useDocVersion(doc: Y.Doc): number {
  const store = docVersionStore(doc);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
