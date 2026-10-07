"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/hooks/useStore";
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
import { selectionRange } from "@/lib/sheet/selection";
import { useEditState, useSelection, useSheet } from "../SheetContext";
import { useDocVersion } from "@/hooks/sheet/useDocVersion";
import { useParticipants } from "@/hooks/sheet/useParticipants";
import { editorNotices } from "@/lib/ai/messages";
import { lockedCellNotices } from "@/lib/collab/messages";
import { AiPreview } from "./AiPreview";
import { CellEditor } from "./CellEditor";
import { CoEditNotice } from "./CoEditNotice";
import { GridCells } from "./GridCells";
import { GridHeaders } from "./GridHeaders";
import { RemoteAiActivity } from "./RemoteAiActivity";
import { RemoteCursors } from "./RemoteCursors";
import { RemoteDrafts } from "./RemoteDrafts";
import { SelectionOverlay } from "./SelectionOverlay";
import { useCellEditor } from "@/hooks/grid/useCellEditor";
import { useGridPointer } from "@/hooks/grid/useGridPointer";
import { revealCell, visibleRowCount } from "@/lib/sheet/viewport";

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
  useStore(ai.overwrites); // 덮어쓰기를 고르면 미리보기를 다시 그림.
  const blockedAt = useStore(controller.lockNotice);

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

  // 처음 열렸을 때 바로 타이핑할 수 있게 편집칸에 포커스를 줌.
  useEffect(() => editor.focus(), [editor]);

  const activeCoord = edit?.coord ?? selection.active;
  const activeRect = outsetRect(cellRect(activeCoord));
  const notices = edit
    ? editorNotices(participants, edit.coord)
    : blockedAt
      ? lockedCellNotices(participants, blockedAt)
      : [];
  // 다른 참여자가 셀을 바꾸면 문서 버전(version)이 바뀌어 다시 그려짐. 그래서 새로 생긴 충돌도 바로 보임.
  const aiStates = aiRun ? ai.states(aiRun) : [];

  return (
    <div ref={scrollRef} className="relative min-h-0 min-w-0 flex-1 overflow-auto bg-surface">
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
        <RemoteDrafts participants={participants} doc={session.doc} version={version} />
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
