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
import { AiPreview } from "./AiPreview";
import { CellEditor } from "./CellEditor";
import { CoEditNotice } from "./CoEditNotice";
import { GridCells } from "./GridCells";
import { GridHeaders } from "./GridHeaders";
import { RemoteCursors } from "./RemoteCursors";
import { SelectionOverlay } from "./SelectionOverlay";
import { useCellEditor } from "./useCellEditor";
import { useGridPointer } from "./useGridPointer";
import { revealCell, visibleRowCount } from "./viewport";

const CONTENT_WIDTH = ROW_HEADER_WIDTH + COL_COUNT * COL_WIDTH;
const CONTENT_HEIGHT = COL_HEADER_HEIGHT + ROW_COUNT * ROW_HEIGHT;

/**
 * 스프레드시트 그리드. 레이어를 쌓아 그리고, 입력(키보드·IME·마우스)을 컨트롤러로 보낸다.
 * 규칙(이동, 편집 확정, 명령)은 SheetController에, DOM 계산은 viewport.ts에 있다.
 */
export function Grid() {
  const { session, controller, ai } = useSheet();
  const version = useDocVersion(session.doc);
  const selection = useSelection();
  const edit = useEditState();
  const participants = useParticipants(session.presence);
  const aiRun = useStore(ai.active);
  const showOriginal = useStore(ai.showOriginal);

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const editor = useCellEditor(controller, inputRef);
  const pointer = useGridPointer({ controller, editor, inputRef, scrollRef, contentRef });

  // 컨트롤러가 스크롤·포커스·편집칸 글자를 다룰 수 있게 화면을 붙인다.
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
  const coEditors = edit
    ? participants.filter((p) => !p.isSelf && p.editing && sameCoord(p.editing, edit.coord))
    : [];

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
        <AiPreview run={aiRun} showOriginal={showOriginal} />
        <SelectionOverlay selection={selection} activeCoord={activeCoord} />
        <CoEditNotice
          names={coEditors.map((p) => p.user.name)}
          rect={activeRect}
          below={activeCoord.row === 0}
        />
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
