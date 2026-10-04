import { IndexeddbPersistence } from "y-indexeddb";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { BroadcastChannelProvider } from "./broadcast-provider";
import { Presence, randomUser, type UserInfo } from "./presence";
import { createUndoManager } from "./undo";

export interface SheetSession {
  readonly sheetId: string;
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  readonly presence: Presence;
  readonly undoManager: Y.UndoManager;
  /**
   * "ready": 저장된 내용을 다 불러왔다.
   * "unavailable": 저장소를 열 수 없다(차단·용량 초과 등). 탭 간 동기화는 되지만 새로고침하면 사라질 수 있다.
   */
  readonly whenLoaded: Promise<StorageStatus>;
  /** 저장소가 늦게라도 준비되면 resolve된다("unavailable"이었다가 회복되는 경우). */
  readonly whenPersisted: Promise<void>;
  leave(): void;
  /** bfcache에서 복원됐을 때 */
  rejoin(): void;
  destroy(): Promise<void>;
}

export type StorageStatus = "ready" | "unavailable";

/** 저장소가 이 시간 안에 응답하지 않으면 저장 없이 시트를 연다. */
export const STORAGE_TIMEOUT_MS = 5000;

export interface SheetSessionOptions {
  user?: UserInfo;
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

  // y-indexeddb는 성공(synced)만 알리고 실패는 알리지 않는다. 그대로 기다리면 로딩 화면에서 멈추므로
  // DB 열기 실패나 시간 초과를 "unavailable"로 처리한다.
  let storage: StorageStatus | "loading" = "loading";
  const whenLoaded = new Promise<StorageStatus>((resolve) => {
    const settle = (status: StorageStatus) => {
      if (storage !== "loading") return;
      storage = status;
      clearTimeout(timer);
      resolve(status);
    };
    const timer = setTimeout(() => settle("unavailable"), STORAGE_TIMEOUT_MS);
    persistence.whenSynced.then(() => settle("ready"));
    persistence._db.catch(() => settle("unavailable"));
  });

  let destroyed = false;
  return {
    sheetId,
    doc,
    awareness,
    presence,
    undoManager,
    whenLoaded,
    whenPersisted: persistence.whenSynced.then(() => undefined),
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
      // 저장소가 열리지 않은 상태면 y-indexeddb의 destroy가 끝나지 않으므로 기다리지 않는다.
      const closing = persistence.destroy().catch(() => {});
      if (storage === "ready") await closing;
      doc.destroy();
    },
  };
}
