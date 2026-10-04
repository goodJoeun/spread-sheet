import * as Y from "yjs";
import { EditOrigin, formatsOf, valuesOf } from "@/lib/sheet/document";

/**
 * 이 탭의 변경만 되돌린다. 다른 탭에서 온 변경은 origin이 provider라서 추적되지 않는다.
 * captureTimeout 0: 기본값(500ms)이면 빠르게 이어진 편집이 한 단계로 합쳐진다. 동작 하나 = 실행 취소 한 단계.
 * 다른 참여자가 나중에 덮어쓴 셀은 되돌리지 않는다(Yjs 기본 동작).
 */
export function createUndoManager(doc: Y.Doc): Y.UndoManager {
  return new Y.UndoManager([valuesOf(doc), formatsOf(doc)], {
    trackedOrigins: new Set<unknown>([EditOrigin.User, EditOrigin.Ai]),
    captureTimeout: 0,
  });
}
