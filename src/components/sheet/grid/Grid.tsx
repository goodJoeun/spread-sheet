"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import { getFormat } from "@/lib/sheet/document";
import {
  COL_HEADER_HEIGHT,
  COL_WIDTH,
  ROW_HEADER_WIDTH,
  ROW_HEIGHT,
  cellRect,
  outsetRect,
} from "@/lib/sheet/geometry";
import { COL_COUNT, ROW_COUNT } from "@/lib/sheet/schema";
import { sameCoord, selectionRange } from "@/lib/sheet/selection";
import { useEditState, useSelection, useSheet } from "../SheetContext";
import { useDocVersion, useParticipants } from "../useSheetSession";
import { aiActivitiesAt } from "@/lib/ai/coedit";
import { AiPreview } from "./AiPreview";
import { CellEditor } from "./CellEditor";
import { CoEditNotice } from "./CoEditNotice";
import { GridCells } from "./GridCells";
import { GridHeaders } from "./GridHeaders";
import { RemoteAiActivity } from "./RemoteAiActivity";
import { RemoteCursors } from "./RemoteCursors";
import { SelectionOverlay } from "./SelectionOverlay";
import { useCellEditor } from "./useCellEditor";
import { useGridPointer } from "./useGridPointer";
import { revealCell, visibleRowCount } from "./viewport";

const CONTENT_WIDTH = ROW_HEADER_WIDTH + COL_COUNT * COL_WIDTH;
const CONTENT_HEIGHT = COL_HEADER_HEIGHT + ROW_COUNT * ROW_HEIGHT;

export function Grid() {
  const { session, controller, ai } = useSheet();
  const version = useDocVersion(session.doc);
  const selection = useSelection();
  const edit = useEditState();
  const participants = useParticipants(session.presence);
  const aiRun = useStore(ai.active);
  const showOriginal = useStore(ai.showOriginal);
  useStore(ai.overwrites); // 덮어쓰기를 고르면 미리보기를 다시 그린다.

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const editor = useCellEditor(controller, inputRef);
  const pointer = useGridPointer({ controller, editor, inputRef, scrollRef, contentRef });

  useEffect(
    () =>
      controller.attachView({
        reveal: (coord) => revealCell(scrollRef.current, coord),
        visibleRowCount: () => visibleRowCount(scrollRef.current),
        focus: editor.focus,
        readDraft: editor.readDraft,
        writeDraft: editor.writeDraft,
      }),
    [controller, editor],
  );

  // 처음 열렸을 때 바로 타이핑할 수 있게 편집칸에 포커스를 준다.
  useEffect(() => editor.focus(), [editor]);

  const activeCoord = edit?.coord ?? selection.active;
  const activeRect = outsetRect(cellRect(activeCoord));
  const notices: string[] = [];
  if (edit) {
    const coEditors = participants.filter(
      (p) => !p.isSelf && p.editing && sameCoord(p.editing, edit.coord),
    );
    // 같은 셀을 동시에 입력하면 나중에 확정한 값이 남는다.
    if (coEditors.length > 0) {
      notices.push(`${coEditors.map((p) => p.user.name).join(", ")}님도 이 셀을 입력 중이에요`);
    }
    // 다른 참여자의 AI 편집 범위여도 막지 않는다. 입력한 셀은 그 사람의 AI 결과에서 충돌로 표시된다.
    for (const { participant, activity } of aiActivitiesAt(participants, edit.coord)) {
      const doing = activity.status === "reviewing" ? "AI 결과 검토" : "AI 편집";
      notices.push(`${participant.user.name}님이 ${doing} 중 · 입력한 값은 기본으로 유지돼요`);
    }
  }
  // 문서가 바뀌면(version) 다시 그려지므로, 다른 참여자의 변경으로 생긴 충돌도 바로 반영된다.
  const aiStates = aiRun ? ai.states(aiRun) : [];

  return (
    <div ref={scrollRef} className="relative min-h-0 min-w-0 flex-1 overflow-auto bg-white">
      <div
        ref={contentRef}
        className="relative grid cursor-cell select-none"
        style={{
          width: CONTENT_WIDTH,
          height: CONTENT_HEIGHT,
          gridTemplateColumns: `${ROW_HEADER_WIDTH}px repeat(${COL_COUNT}, ${COL_WIDTH}px)`,
          gridTemplateRows: `${COL_HEADER_HEIGHT}px repeat(${ROW_COUNT}, ${ROW_HEIGHT}px)`,
        }}
        {...pointer}
      >
        <GridHeaders range={selectionRange(selection)} />
        <GridCells doc={session.doc} version={version} />
        <RemoteCursors participants={participants} />
        <RemoteAiActivity participants={participants} />
        <AiPreview run={aiRun} states={aiStates} showOriginal={showOriginal} />
        <SelectionOverlay selection={selection} activeCoord={activeCoord} />
        <CoEditNotice messages={notices} rect={activeRect} below={activeCoord.row === 0} />
        <CellEditor
          inputRef={inputRef}
          handlers={editor.handlers}
          editing={edit !== null}
          format={edit ? getFormat(session.doc, edit.coord) : {}}
          rect={activeRect}
        />
      </div>
    </div>
  );
}
