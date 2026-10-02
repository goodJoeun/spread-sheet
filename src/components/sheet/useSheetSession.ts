import { useEffect, useState, useSyncExternalStore } from "react";
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
