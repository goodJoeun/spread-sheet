import { useSyncExternalStore } from "react";
import type * as Y from "yjs";

interface UndoState {
  canUndo: boolean;
  canRedo: boolean;
}

interface UndoStateStore {
  subscribe(onChange: () => void): () => void;
  getSnapshot(): UndoState;
}

const stores = new WeakMap<Y.UndoManager, UndoStateStore>();

function undoStateStore(undoManager: Y.UndoManager): UndoStateStore {
  const cached = stores.get(undoManager);
  if (cached) return cached;

  let snapshot: UndoState = { canUndo: undoManager.canUndo(), canRedo: undoManager.canRedo() };
  const store: UndoStateStore = {
    subscribe(onChange) {
      const update = () => {
        const canUndo = undoManager.canUndo();
        const canRedo = undoManager.canRedo();
        if (canUndo === snapshot.canUndo && canRedo === snapshot.canRedo) return;
        snapshot = { canUndo, canRedo };
        onChange();
      };
      undoManager.on("stack-item-added", update);
      undoManager.on("stack-item-popped", update);
      undoManager.on("stack-cleared", update);
      return () => {
        undoManager.off("stack-item-added", update);
        undoManager.off("stack-item-popped", update);
        undoManager.off("stack-cleared", update);
      };
    },
    getSnapshot: () => snapshot,
  };
  stores.set(undoManager, store);
  return store;
}

/** 실행 취소/다시 실행 버튼의 활성 상태. 이 탭의 스택만 본다. */
export function useUndoState(undoManager: Y.UndoManager): UndoState {
  const store = undoStateStore(undoManager);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
