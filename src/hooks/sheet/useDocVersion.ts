import { useSyncExternalStore } from "react";
import type * as Y from "yjs";

interface VersionStore {
  subscribe(onChange: () => void): () => void;
  getSnapshot(): number;
}

const versionStores = new WeakMap<Y.Doc, VersionStore>();

/** 문서 하나에 리스너를 하나만 걸고, 구독하는 컴포넌트 모두에 같은 버전 번호를 줌. */
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

// [흐름 8] 셀 값을 화면 상태로 복사하지 않고 "바뀌었다"는 신호(버전 번호)만 받음. 원본이 Y.Doc 하나뿐이라 어긋날 일이 없음.
/** 문서가 바뀔 때마다 다시 그리게 함. 값은 렌더링 중에 문서에서 직접 읽음. */
export function useDocVersion(doc: Y.Doc): number {
  const store = docVersionStore(doc);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
