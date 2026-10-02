import { IndexeddbPersistence } from "y-indexeddb";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { BroadcastChannelProvider } from "./broadcast-provider";
import { createUndoManager } from "./undo";

/**
 * 한 탭에서 시트 하나를 여는 데 필요한 것들을 묶는다.
 *   Y.Doc ── IndexedDB (영구 저장)
 *         └─ BroadcastChannel (다른 탭과 동기화 + awareness)
 */
export interface SheetSession {
  readonly sheetId: string;
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  readonly undoManager: Y.UndoManager;
  /** IndexedDB에서 저장된 내용을 다 불러오면 resolve된다. 그 전까지는 로딩 화면을 보여 준다. */
  readonly whenLoaded: Promise<void>;
  destroy(): Promise<void>;
}

export function createSheetSession(sheetId: string): SheetSession {
  const doc = new Y.Doc();
  const awareness = new Awareness(doc);
  const persistence = new IndexeddbPersistence(`spread-sheet:${sheetId}`, doc);
  const provider = new BroadcastChannelProvider(sheetId, doc, { awareness });
  const undoManager = createUndoManager(doc);

  let destroyed = false;
  return {
    sheetId,
    doc,
    awareness,
    undoManager,
    whenLoaded: persistence.whenSynced.then(() => undefined),
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      undoManager.destroy();
      provider.destroy();
      awareness.destroy();
      await persistence.destroy();
      doc.destroy();
    },
  };
}
