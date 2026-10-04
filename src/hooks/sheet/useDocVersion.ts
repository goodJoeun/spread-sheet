import { useSyncExternalStore } from "react";
import type * as Y from "yjs";

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

/** 문서가 바뀔 때마다 다시 그린다. 값은 렌더 중에 문서에서 직접 읽는다. */
export function useDocVersion(doc: Y.Doc): number {
  const store = docVersionStore(doc);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
