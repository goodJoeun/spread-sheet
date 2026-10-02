import * as Y from "yjs";
import { EditOrigin, formatsOf, valuesOf } from "@/lib/sheet/document";

/**
 * 이 탭(참여자)의 변경만 되돌리는 UndoManager.
 *
 * - trackedOrigins: 내 편집(User)과 내가 적용한 AI 결과(Ai)만 추적한다.
 *   다른 탭에서 동기화된 변경은 origin이 provider라서 추적되지 않는다.
 * - captureTimeout 0: 기본값(500ms)이면 빠르게 이어진 편집이 한 단계로 합쳐진다.
 *   스프레드시트에서는 "동작 하나 = 트랜잭션 하나 = 실행 취소 한 단계"가 자연스럽다.
 *   AI 결과 적용도 하나의 트랜잭션이므로 한 번의 실행 취소로 전부 되돌아간다.
 * - 다른 참여자가 나중에 덮어쓴 셀은 되돌리지 않는다(Yjs 기본 동작, ignoreRemoteMapChanges = false).
 */
export function createUndoManager(doc: Y.Doc): Y.UndoManager {
  return new Y.UndoManager([valuesOf(doc), formatsOf(doc)], {
    trackedOrigins: new Set<unknown>([EditOrigin.User, EditOrigin.Ai]),
    captureTimeout: 0,
  });
}
