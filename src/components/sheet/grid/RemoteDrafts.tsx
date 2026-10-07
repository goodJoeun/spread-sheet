import { memo } from "react";
import type * as Y from "yjs";
import type { Participant } from "@/lib/collab/presence-state";
import { getFormat } from "@/lib/sheet/document";
import { cellRect } from "@/lib/sheet/geometry";
import { defaultAlignment } from "@/lib/sheet/schema";
import { clampCoord } from "@/lib/sheet/selection";
import { cellTextStyle } from "./cell-style";
import { Layer } from "./layers";

interface RemoteDraftsProps {
  participants: Participant[];
  doc: Y.Doc;
  /** 문서 버전. 셀 서식이 바뀌면 다시 그림. */
  version: number;
}

/**
 * 다른 참여자가 입력 중인(아직 확정하지 않은) 글자를 그 셀 위에 그림.
 * 실제 셀 값처럼 보이게 셀 서식을 따르고, 셀 너비를 넘는 글자는 자름.
 * 넘치게 그리면 같은 셀을 입력 중인 내 편집칸 옆으로 글자가 삐져나옴. 내 편집칸은 내 글자 길이만큼만 덮기 때문.
 */
export const RemoteDrafts = memo(function RemoteDrafts({ participants, doc }: RemoteDraftsProps) {
  return participants.map(({ clientId, isSelf, editing, draft }) => {
    if (isSelf || !editing || draft === null) return null;
    // 다른 탭에서 온 좌표라 시트 범위 안으로 맞춤.
    const coord = clampCoord(editing);
    const { left, top, width, height } = cellRect(coord);
    const format = getFormat(doc, coord);
    return (
      <div
        key={clientId}
        className="overlay overflow-hidden border-r border-b border-line-grid bg-surface px-xs text-body leading-cell whitespace-pre"
        style={{
          left,
          top,
          width,
          height,
          zIndex: Layer.remoteDraft,
          textAlign: format.align ?? defaultAlignment(draft),
          ...cellTextStyle(format),
          backgroundColor: format.fill,
        }}
      >
        {draft}
      </div>
    );
  });
});
