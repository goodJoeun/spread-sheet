import * as Y from "yjs";
import { EditOrigin, formatsOf, valuesOf } from "@/lib/sheet/document";

// [기능 설명: 동기화·저장 4/5] 실행 취소는 이 탭의 출처(user-edit, ai-apply)만 추적하고, 동작 하나를 한 단계로 둠.
/**
 * 이 탭에서 한 변경(user-edit, ai-apply)만 되돌리는 실행 취소 관리자를 만듦.
 * 다른 탭에서 온 변경은 추적하지 않음.
 * captureTimeout을 0으로 둬서 빠르게 이어진 편집도 합치지 않음(동작 하나 = 실행 취소 한 단계).
 */
export function createUndoManager(doc: Y.Doc): Y.UndoManager {
  return new Y.UndoManager([valuesOf(doc), formatsOf(doc)], {
    trackedOrigins: new Set<unknown>([EditOrigin.User, EditOrigin.Ai]),
    captureTimeout: 0,
  });
}
