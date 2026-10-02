"use client";

import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import type * as Y from "yjs";
import type { SheetSession } from "@/lib/collab/session";
import { isApplePlatform } from "@/lib/platform";
import type { CellCoord } from "@/lib/sheet/address";
import {
  EditOrigin,
  clearFormats,
  clearValues,
  getFormat,
  getValue,
  setStyle,
  setValue,
  toggleFormat,
} from "@/lib/sheet/document";
import { COL_COUNT, ROW_COUNT } from "@/lib/sheet/schema";
import {
  COL_HEADER_HEIGHT,
  COL_WIDTH,
  ROW_HEADER_WIDTH,
  ROW_HEIGHT,
  cellRect,
  rangeRect,
} from "@/lib/sheet/geometry";
import { resolveGridKey, type EditMode, type GridAction } from "@/lib/sheet/keymap";
import {
  advanceWithinRange,
  clampCoord,
  collapsedSelection,
  extendSelection,
  extendSelectionTo,
  isMultiCell,
  jumpTarget,
  moveSelection,
  sameCoord,
  selectAll,
  selectColumns,
  selectRows,
  selectionRange,
  type Selection,
} from "@/lib/sheet/selection";
import { createStore, useStore, type Store } from "@/lib/store";
import { GridCells } from "./GridCells";
import { GridHeaders } from "./GridHeaders";
import { RemoteCursors } from "./RemoteCursors";
import { useDocVersion, useParticipants } from "./useSheetSession";

interface EditState {
  mode: EditMode;
  coord: CellCoord;
}

type HitKind = "cell" | "row" | "col" | "corner";

const CONTENT_WIDTH = ROW_HEADER_WIDTH + COL_COUNT * COL_WIDTH;
const CONTENT_HEIGHT = COL_HEADER_HEIGHT + ROW_COUNT * ROW_HEIGHT;

/** 툴바 등 그리드 밖에서 쓰는 조작 */
export interface GridHandle {
  /** 편집 중이면 입력을 확정한다. */
  commitEdit(): void;
  /** 키보드 입력을 다시 그리드로 돌린다. */
  focus(): void;
  /** 그 셀을 선택하고 화면에 보이게 한다(참여자 위치로 이동). */
  jumpTo(coord: CellCoord): void;
}

interface GridProps {
  session: SheetSession;
  selectionStore: Store<Selection>;
  ref?: RefObject<GridHandle | null>;
}

export function Grid({ session, selectionStore, ref }: GridProps) {
  const { doc, undoManager } = session;
  const version = useDocVersion(doc);
  const selection = useStore(selectionStore);
  const [editStore] = useState(() => createStore<EditState | null>(null));
  const edit = useStore(editStore);
  const participants = useParticipants(session.presence);

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const composingRef = useRef(false);
  const dragRef = useRef<Exclude<HitKind, "corner"> | null>(null);
  /** Tab으로 오른쪽으로 입력해 나가다 Enter를 누르면 시작한 열의 다음 행으로 돌아간다(엑셀·구글시트 동작). */
  const tabReturnColRef = useRef<number | null>(null);

  useImperativeHandle(ref, () => ({
    commitEdit: () => commitEdit(),
    focus: () => inputRef.current?.focus({ preventScroll: true }),
    jumpTo: (coord) => {
      commitEdit();
      tabReturnColRef.current = null;
      select(collapsedSelection(coord));
      inputRef.current?.focus({ preventScroll: true });
    },
  }));

  // 내 선택과 입력 중인 셀을 다른 참여자에게 알린다.
  useEffect(() => {
    const { presence } = session;
    const publishSelection = () => presence.setSelection(selectionStore.get());
    const publishEditing = () => presence.setEditing(editStore.get()?.coord ?? null);
    publishSelection();
    publishEditing();
    const offSelection = selectionStore.subscribe(publishSelection);
    const offEditing = editStore.subscribe(publishEditing);
    return () => {
      offSelection();
      offEditing();
    };
  }, [session, selectionStore, editStore]);

  // 처음 열렸을 때 바로 타이핑할 수 있게 입력칸에 포커스를 준다.
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  // 실행 취소/다시 실행하면 그 변경이 있던 곳으로 선택을 되돌린다.
  useEffect(() => {
    let addedDuringPop: { meta: Map<unknown, unknown> } | null = null;
    const onAdded = ({ stackItem }: { stackItem: { meta: Map<unknown, unknown> } }) => {
      if (!stackItem.meta.has("selection")) stackItem.meta.set("selection", selectionStore.get());
      addedDuringPop = stackItem;
    };
    const onPopped = ({ stackItem }: { stackItem: { meta: Map<unknown, unknown> } }) => {
      const saved = stackItem.meta.get("selection") as Selection | undefined;
      // 되돌리면서 반대쪽 스택에 새로 생긴 항목도 같은 위치를 기억하게 한다.
      if (saved && addedDuringPop && addedDuringPop !== stackItem) {
        addedDuringPop.meta.set("selection", saved);
      }
      addedDuringPop = null;
      if (saved) {
        selectionStore.set(saved);
        revealCell(saved.active);
      }
    };
    undoManager.on("stack-item-added", onAdded);
    undoManager.on("stack-item-popped", onPopped);
    return () => {
      undoManager.off("stack-item-added", onAdded);
      undoManager.off("stack-item-popped", onPopped);
    };
  }, [undoManager, selectionStore]);

  /* ───────────── 스크롤 ───────────── */

  function revealCell(coord: CellCoord) {
    const el = scrollRef.current;
    if (!el) return;
    const rect = cellRect(coord);
    const viewLeft = el.scrollLeft + ROW_HEADER_WIDTH;
    const viewTop = el.scrollTop + COL_HEADER_HEIGHT;
    if (rect.left < viewLeft) el.scrollLeft = rect.left - ROW_HEADER_WIDTH;
    else if (rect.left + rect.width > el.scrollLeft + el.clientWidth) {
      el.scrollLeft = rect.left + rect.width - el.clientWidth;
    }
    if (rect.top < viewTop) el.scrollTop = rect.top - COL_HEADER_HEIGHT;
    else if (rect.top + rect.height > el.scrollTop + el.clientHeight) {
      el.scrollTop = rect.top + rect.height - el.clientHeight;
    }
  }

  function visibleRowCount(): number {
    const el = scrollRef.current;
    if (!el) return 10;
    return Math.max(1, Math.floor((el.clientHeight - COL_HEADER_HEIGHT) / ROW_HEIGHT) - 1);
  }

  /* ───────────── 편집 ───────────── */

  function startEdit(mode: EditMode, keepContent: boolean) {
    const input = inputRef.current;
    if (!input) return;
    const coord = selectionStore.get().active;
    if (keepContent) {
      input.value = getValue(doc, coord);
      input.setSelectionRange(input.value.length, input.value.length);
    }
    editStore.set({ mode, coord });
  }

  function commitEdit() {
    const current = editStore.get();
    const input = inputRef.current;
    if (!current || !input) return;
    setValue(doc, current.coord, input.value, EditOrigin.User);
    input.value = "";
    editStore.set(null);
  }

  function cancelEdit() {
    if (inputRef.current) inputRef.current.value = "";
    editStore.set(null);
  }

  /** 마우스로 다른 곳을 누를 때 편집을 끝낸다. IME 조합 중이면 blur로 조합을 먼저 확정시킨다. */
  function finishEditingBeforePointer() {
    const input = inputRef.current;
    if (!editStore.get() || !input) return;
    if (composingRef.current) {
      input.blur(); // compositionend → blur → handleBlur에서 확정
      input.focus({ preventScroll: true });
    } else {
      commitEdit();
    }
  }

  /* ───────────── 선택 ───────────── */

  function select(next: Selection, reveal: CellCoord = next.active) {
    selectionStore.set(next);
    revealCell(reveal);
  }

  const isFilled = (coord: CellCoord) => getValue(doc, coord) !== "";

  function runAction(action: GridAction) {
    const sel = selectionStore.get();
    const range = selectionRange(sel);

    switch (action.type) {
      case "cancelEdit":
        cancelEdit();
        return;
      case "toggleEditMode": {
        const current = editStore.get();
        if (current)
          editStore.set({ ...current, mode: current.mode === "enter" ? "edit" : "enter" });
        return;
      }
      case "format":
        toggleFormat(doc, range, action.key, EditOrigin.User);
        return;
      case "align":
        setStyle(doc, range, "align", action.value, EditOrigin.User);
        return;
      case "clearFormat":
        clearFormats(doc, range, EditOrigin.User);
        return;
      case "undo":
        undoManager.undo();
        return;
      case "redo":
        undoManager.redo();
        return;
      case "startEdit":
        startEdit("edit", true);
        return;
      case "clear":
        clearValues(doc, range, EditOrigin.User);
        return;
    }

    // 나머지는 이동 동작이다. 편집 중이었다면 먼저 입력을 확정한다.
    commitEdit();

    if (action.type !== "advance") tabReturnColRef.current = null;
    switch (action.type) {
      case "move":
        select(moveSelection(sel, action.dRow, action.dCol));
        return;
      case "extend": {
        const next = extendSelection(sel, action.dRow, action.dCol);
        select(next, next.focus);
        return;
      }
      case "jump": {
        const from = action.extend ? sel.focus : sel.active;
        const target = jumpTarget(from, action.dRow, action.dCol, isFilled);
        select(action.extend ? extendSelectionTo(sel, target) : collapsedSelection(target), target);
        return;
      }
      case "advance": {
        if (isMultiCell(sel)) {
          select(advanceWithinRange(sel, action.dRow, action.dCol));
          return;
        }
        if (action.dCol !== 0) {
          tabReturnColRef.current ??= sel.active.col;
          select(moveSelection(sel, 0, action.dCol));
          return;
        }
        const returnCol = tabReturnColRef.current;
        tabReturnColRef.current = null;
        if (action.dRow > 0 && returnCol !== null) {
          select(collapsedSelection({ row: sel.active.row + 1, col: returnCol }));
        } else {
          select(moveSelection(sel, action.dRow, 0));
        }
        return;
      }
      case "page": {
        const rows = visibleRowCount() * action.direction;
        if (action.extend) {
          const next = extendSelection(sel, rows, 0);
          select(next, next.focus);
        } else {
          select(moveSelection(sel, rows, 0));
        }
        return;
      }
      case "rowStart":
        select(collapsedSelection({ row: sel.active.row, col: 0 }));
        return;
      case "sheetStart":
        select(collapsedSelection({ row: 0, col: 0 }));
        return;
      case "selectAll":
        selectionStore.set(selectAll(sel));
        return;
    }
  }

  /* ───────────── 키보드·IME ───────────── */

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // IME 조합 중인 키(한글 등)는 입력기에 맡긴다. 여기서 Enter를 처리하면 마지막 글자가 사라지거나 두 번 들어간다.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    const action = resolveGridKey(e, editStore.get()?.mode ?? null, isApplePlatform());
    if (!action) return;
    e.preventDefault();
    runAction(action);
  }

  /** 셀을 선택한 채 타이핑하면 그 글자로 편집을 시작한다. 입력칸이 이미 포커스를 갖고 있어 첫 글자를 잃지 않는다. */
  function handleInput() {
    if (!editStore.get() && !composingRef.current) startEdit("enter", false);
  }

  function handleCompositionStart() {
    composingRef.current = true;
    if (!editStore.get()) startEdit("enter", false);
  }

  function handleCompositionEnd() {
    composingRef.current = false;
  }

  function handleBlur() {
    // 다른 창·탭으로 전환한 경우에는 편집을 유지한다(돌아오면 이어서 입력).
    if (typeof document !== "undefined" && !document.hasFocus()) return;
    commitEdit();
  }

  /* ───────────── 마우스 ───────────── */

  function hitTest(clientX: number, clientY: number): { kind: HitKind; coord: CellCoord } {
    const viewport = scrollRef.current!.getBoundingClientRect();
    const content = contentRef.current!.getBoundingClientRect();
    const inColHeader = clientY - viewport.top < COL_HEADER_HEIGHT;
    const inRowHeader = clientX - viewport.left < ROW_HEADER_WIDTH;
    const coord = clampCoord({
      row: Math.floor((clientY - content.top - COL_HEADER_HEIGHT) / ROW_HEIGHT),
      col: Math.floor((clientX - content.left - ROW_HEADER_WIDTH) / COL_WIDTH),
    });
    const kind: HitKind =
      inColHeader && inRowHeader ? "corner" : inColHeader ? "col" : inRowHeader ? "row" : "cell";
    return { kind, coord };
  }

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    // 편집 중인 입력칸 안을 누르면 커서 이동 등 기본 동작에 맡긴다.
    if (editStore.get() && e.target === inputRef.current) return;
    e.preventDefault(); // 입력칸의 포커스를 유지하고, 드래그 중 글자가 선택되지 않게 한다.

    finishEditingBeforePointer();
    tabReturnColRef.current = null;

    const sel = selectionStore.get();
    const { kind, coord } = hitTest(e.clientX, e.clientY);
    switch (kind) {
      case "cell":
        selectionStore.set(e.shiftKey ? extendSelectionTo(sel, coord) : collapsedSelection(coord));
        break;
      case "row":
        selectionStore.set(selectRows(e.shiftKey ? sel.anchor.row : coord.row, coord.row));
        break;
      case "col":
        selectionStore.set(selectColumns(e.shiftKey ? sel.anchor.col : coord.col, coord.col));
        break;
      case "corner":
        selectionStore.set(selectAll(sel));
        break;
    }
    dragRef.current = kind === "corner" ? null : kind;
    e.currentTarget.setPointerCapture(e.pointerId);
    inputRef.current?.focus({ preventScroll: true });
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const sel = selectionStore.get();
    const { coord } = hitTest(e.clientX, e.clientY);
    if (drag === "cell") {
      if (sameCoord(sel.focus, coord)) return;
      selectionStore.set(extendSelectionTo(sel, coord));
      revealCell(coord); // 가장자리 밖으로 끌면 그쪽으로 스크롤된다.
    } else if (drag === "row") {
      if (sel.focus.row === coord.row) return;
      selectionStore.set(selectRows(sel.anchor.row, coord.row));
    } else {
      if (sel.focus.col === coord.col) return;
      selectionStore.set(selectColumns(sel.anchor.col, coord.col));
    }
  }

  function handlePointerUp(e: PointerEvent<HTMLDivElement>) {
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  function handleDoubleClick(e: MouseEvent<HTMLDivElement>) {
    if (editStore.get() && e.target === inputRef.current) return;
    const { kind } = hitTest(e.clientX, e.clientY);
    if (kind === "cell") startEdit("edit", true);
  }

  /* ───────────── 렌더링 ───────────── */

  const range = selectionRange(selection);
  const activeRect = cellRect(edit?.coord ?? selection.active);
  const multi = isMultiCell(selection);
  const rangeBox = rangeRect(range);
  // 내가 입력 중인 셀을 다른 사람도 입력 중이면 알린다. 먼저 확정한 값은 나중 값에 덮어써진다.
  const coEditors = edit
    ? participants.filter((p) => !p.isSelf && p.editing && sameCoord(p.editing, edit.coord))
    : [];

  return (
    <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto bg-white">
      <div
        ref={contentRef}
        className="relative grid cursor-cell select-none"
        style={{
          width: CONTENT_WIDTH,
          height: CONTENT_HEIGHT,
          gridTemplateColumns: `${ROW_HEADER_WIDTH}px repeat(${COL_COUNT}, ${COL_WIDTH}px)`,
          gridTemplateRows: `${COL_HEADER_HEIGHT}px repeat(${ROW_COUNT}, ${ROW_HEIGHT}px)`,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      >
        <GridHeaders range={range} />
        <GridCells doc={doc} version={version} />
        <RemoteCursors participants={participants} />

        {multi && (
          <div
            className="pointer-events-none absolute z-10 border border-accent bg-accent/10"
            style={{
              left: rangeBox.left - 1,
              top: rangeBox.top - 1,
              width: rangeBox.width + 1,
              height: rangeBox.height + 1,
            }}
          />
        )}
        <div
          className="pointer-events-none absolute z-10 border-2 border-accent"
          style={{
            left: activeRect.left - 1,
            top: activeRect.top - 1,
            width: activeRect.width + 1,
            height: activeRect.height + 1,
          }}
        />

        {coEditors.length > 0 && (
          <div
            role="status"
            className="pointer-events-none absolute z-[16] rounded-t bg-amber-500 px-1.5 text-[11px] leading-[18px] font-medium whitespace-nowrap text-white shadow"
            style={{
              left: activeRect.left - 1,
              top:
                edit && edit.coord.row === 0
                  ? activeRect.top + activeRect.height + 2
                  : activeRect.top - 19,
            }}
          >
            {coEditors.map((p) => p.user.name).join(", ")}님도 이 셀을 입력 중이에요
          </div>
        )}

        <CellEditor
          inputRef={inputRef}
          doc={doc}
          edit={edit}
          rect={activeRect}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          onBlur={handleBlur}
        />
      </div>
    </div>
  );
}

interface CellEditorProps {
  inputRef: RefObject<HTMLInputElement | null>;
  doc: Y.Doc;
  edit: EditState | null;
  rect: { left: number; top: number; width: number; height: number };
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onInput: () => void;
  onCompositionStart: () => void;
  onCompositionEnd: () => void;
  onBlur: () => void;
}

/**
 * 셀 편집기. 항상 DOM에 남아 포커스를 유지하고, 편집 중이 아닐 때는 투명하게 active 셀 위에 있다.
 * 값은 비제어(uncontrolled)로 다룬다. React가 조합 중인 값을 덮어쓰면 한글 입력이 깨지기 때문이다.
 */
function CellEditor({ inputRef, doc, edit, rect, ...handlers }: CellEditorProps) {
  const format = edit ? getFormat(doc, edit.coord) : {};
  const decoration = [format.underline && "underline", format.strike && "line-through"]
    .filter(Boolean)
    .join(" ");
  return (
    <input
      ref={inputRef}
      type="text"
      aria-label="셀 편집"
      autoComplete="off"
      spellCheck={false}
      className={
        edit
          ? "absolute z-[15] border-2 border-accent bg-white px-[3px] text-[13px] shadow-md outline-none select-text [field-sizing:content]"
          : "absolute z-[15] cursor-cell border-0 bg-transparent p-0 opacity-0 outline-none"
      }
      style={{
        left: rect.left - 1,
        top: rect.top - 1,
        height: rect.height + 1,
        minWidth: rect.width + 1,
        width: edit ? undefined : rect.width + 1,
        maxWidth: edit ? COL_WIDTH * 6 : undefined,
        fontWeight: format.bold ? 700 : undefined,
        fontStyle: format.italic ? "italic" : undefined,
        textDecorationLine: decoration || undefined,
        color: format.color,
        backgroundColor: edit ? (format.fill ?? "#ffffff") : undefined,
        textAlign: format.align,
      }}
      onKeyDown={handlers.onKeyDown}
      onInput={handlers.onInput}
      onCompositionStart={handlers.onCompositionStart}
      onCompositionEnd={handlers.onCompositionEnd}
      onBlur={handlers.onBlur}
    />
  );
}
