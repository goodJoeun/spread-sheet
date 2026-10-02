import { IndexeddbPersistence } from "y-indexeddb";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { BroadcastChannelProvider } from "./broadcast-provider";
import { Presence, randomUser, type UserInfo } from "./presence";
import { createUndoManager } from "./undo";

/**
 * 한 탭에서 시트 하나를 여는 데 필요한 것들을 묶는다.
 *   Y.Doc ── IndexedDB (영구 저장)
 *         └─ BroadcastChannel (다른 탭과 동기화 + awareness → 참여자 표시)
 */
export interface SheetSession {
  readonly sheetId: string;
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  readonly presence: Presence;
  readonly undoManager: Y.UndoManager;
  /** IndexedDB에서 저장된 내용을 다 불러오면 resolve된다. 그 전까지는 로딩 화면을 보여 준다. */
  readonly whenLoaded: Promise<void>;
  /** 탭을 떠날 때(pagehide) 참여자 목록에서 바로 빠진다. */
  leave(): void;
  /** bfcache에서 복원됐을 때 다시 동기화하고 참여자로 돌아온다. */
  rejoin(): void;
  destroy(): Promise<void>;
}

export interface SheetSessionOptions {
  /** 이 탭의 이름과 색. 없으면 무작위로 정한다. */
  user?: UserInfo;
  /** 이름·색이 바뀌면(겹쳐서 다시 고름, 이름 변경) 호출된다. 탭별 저장에 쓴다. */
  onUserChange?: (user: UserInfo) => void;
}

export function createSheetSession(
  sheetId: string,
  options: SheetSessionOptions = {},
): SheetSession {
  const doc = new Y.Doc();
  const awareness = new Awareness(doc);
  const persistence = new IndexeddbPersistence(`spread-sheet:${sheetId}`, doc);
  const provider = new BroadcastChannelProvider(sheetId, doc, { awareness });
  const presence = new Presence(awareness, options.user ?? randomUser(), options.onUserChange);
  const undoManager = createUndoManager(doc);
  void presence.join();

  let destroyed = false;
  return {
    sheetId,
    doc,
    awareness,
    presence,
    undoManager,
    whenLoaded: persistence.whenSynced.then(() => undefined),
    leave() {
      presence.leave();
    },
    rejoin() {
      provider.resync();
      void presence.join();
    },
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      undoManager.destroy();
      provider.destroy();
      presence.destroy();
      awareness.destroy();
      await persistence.destroy();
      doc.destroy();
    },
  };
}
