import { IndexeddbPersistence } from "y-indexeddb";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { BroadcastChannelProvider } from "./broadcast-provider";
import { randomUser } from "./identity";
import { Presence } from "./presence";
import type { UserInfo } from "./presence-state";
import { createUndoManager } from "./undo";

export interface SheetSession {
  readonly sheetId: string;
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  readonly presence: Presence;
  readonly undoManager: Y.UndoManager;
  /**
   * "ready": 저장된 내용을 모두 불러왔음.
   * "unavailable": 저장소를 열 수 없음(차단·용량 초과 등). 탭끼리 동기화는 되지만, 새로고침하면 내용이 사라질 수 있음.
   */
  readonly whenLoaded: Promise<StorageStatus>;
  /** 저장소가 늦게라도 준비되면 resolve됨. "unavailable"이었다가 회복되는 경우에 씀. */
  readonly whenPersisted: Promise<void>;
  leave(): void;
  /** 뒤로/앞으로 가기 캐시(bfcache)에서 복원됐을 때 호출 */
  rejoin(): void;
  destroy(): Promise<void>;
}

export type StorageStatus = "ready" | "unavailable";

/** 저장소가 이 시간 안에 응답하지 않으면 저장 없이 시트를 엶. */
export const STORAGE_TIMEOUT_MS = 5000;

export interface SheetSessionOptions {
  user?: UserInfo;
  onUserChange?: (user: UserInfo) => void;
}

// [기능 설명: 동기화·저장 1/5] 문서 하나에 저장(IndexedDB)·전송(BroadcastChannel)·참여 상태·실행 취소 부품을 붙임.
// [결정] 문서 하나에 저장(IndexedDB)·전송(BroadcastChannel) 부품을 따로 붙이는 조립 지점.
// 저장·전송 방식을 바꿀 때 고칠 곳이 이 함수로 모임.
/** 시트 하나를 여는 세션을 만듦. 문서·참여 상태·저장·전송·참여자·실행 취소 부품을 만들어 잇고, 저장된 내용을 다 불러왔는지(whenLoaded) 알려 줌. */
export function createSheetSession(
  sheetId: string,
  options: SheetSessionOptions = {},
): SheetSession {
  // 시트 데이터 본체 (셀 값·서식)
  const doc = new Y.Doc();
  // 커서·선택 영역처럼 저장하지 않는 임시 상태. 탭마다 자기 상태를 하나씩 가짐.
  const awareness = new Awareness(doc);
  // doc의 변경을 IndexedDB에 저장하고, 시트를 열 때 저장된 내용을 doc에 불러옴.
  const persistence = new IndexeddbPersistence(`spread-sheet:${sheetId}`, doc);
  // 같은 브라우저의 다른 탭과 doc·awareness 변경을 주고받는다.
  const provider = new BroadcastChannelProvider(sheetId, doc, { awareness });
  // awareness 위에서 내 이름·색·선택 영역을 알리고, 다른 탭들을 참여자 목록으로 모은다.
  const presence = new Presence(awareness, options.user ?? randomUser(), options.onUserChange);
  // 이 탭에서 한 편집만 실행 취소·다시 실행한다.
  const undoManager = createUndoManager(doc);
  void presence.join();

  // [기능 설명: 동기화·저장 3/5] 저장된 내용을 다 불러오거나, 저장소를 못 열거나, 5초가 지나면 시트를 보여 줌.
  // [결정] 처음엔 whenSynced만 기다려서, 저장소가 막힌 브라우저에서 로딩 화면이 끝나지 않았음.
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
