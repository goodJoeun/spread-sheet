import type * as Y from "yjs";
import type { CellCoord } from "@/lib/sheet/address";
import {
  EditOrigin,
  clearFormats,
  clearValues,
  getValue,
  setStyle,
  setValue,
  toggleFormat,
} from "@/lib/sheet/document";
import type { EditMode, GridAction } from "@/lib/sheet/keymap";
import { isNavigationAction, navigate, type NavigationAction } from "@/lib/sheet/navigation";
import type { FormatKey, StyleKey } from "@/lib/sheet/schema";
import {
  collapsedSelection,
  extendSelectionTo,
  sameCoord,
  selectAll,
  selectColumns,
  selectRows,
  selectionRange,
  type Selection,
} from "@/lib/sheet/selection";
import { createStore, type Store } from "@/lib/store";

/**
 * 시트 화면의 상태(선택, 편집)와 명령을 한곳에 모은다.
 *
 * 키보드, 마우스, 툴바, 참여자 목록, AI 패널이 모두 같은 명령을 호출하므로
 * "편집 중이면 먼저 확정한다", "실행 취소하면 그 위치로 선택을 돌린다" 같은 규칙이 한 번만 구현된다.
 * DOM에 닿아야 하는 일(스크롤, 포커스, 편집칸의 글자)은 그리드가 붙여 주는 SheetView에 맡긴다.
 */

export interface EditState {
  mode: EditMode;
  coord: CellCoord;
}

/** 컨트롤러가 화면에 요청하는 것. 그리드가 붙기 전이나 테스트에서는 DOM 없는 기본 구현을 쓴다. */
export interface SheetView {
  /** 셀이 보이도록 스크롤한다. */
  reveal(coord: CellCoord): void;
  /** 키보드 입력을 그리드로 돌린다. */
  focus(): void;
  /** 화면에 보이는 행 수(PageUp/PageDown 간격) */
  visibleRowCount(): number;
  /** 편집칸에 입력된 글자 */
  readDraft(): string;
  /** 편집칸의 글자를 바꾸고 커서를 끝으로 옮긴다. */
  writeDraft(text: string): void;
}

/** 컨트롤러가 쓰는 세션의 일부. 테스트에서는 이 모양만 맞춰 주면 된다. */
export interface ControllerSession {
  doc: Y.Doc;
  undoManager: Y.UndoManager;
  presence: {
    setSelection(selection: Selection): void;
    setEditing(coord: CellCoord | null): void;
  };
}

export type PointerTargetKind = "cell" | "row" | "col" | "corner";

function detachedView(): SheetView {
  let draft = "";
  return {
    reveal() {},
    focus() {},
    visibleRowCount: () => 20,
    readDraft: () => draft,
    writeDraft: (text) => {
      draft = text;
    },
  };
}

interface StackItemEvent {
  stackItem: { meta: Map<unknown, unknown> };
}

export class SheetController {
  readonly selection: Store<Selection>;
  readonly edit: Store<EditState | null> = createStore<EditState | null>(null);
  private view: SheetView = detachedView();
  private tabReturnCol: number | null = null;

  constructor(
    private readonly session: ControllerSession,
    initialSelection: Selection = collapsedSelection({ row: 0, col: 0 }),
  ) {
    this.selection = createStore(initialSelection);
  }

  /**
   * 참여자 정보 발행과 실행 취소 위치 복원을 시작한다. 정리 함수를 돌려준다.
   * 생성자에서 하지 않는 이유: React가 개발 모드에서 객체를 두 번 만들 때 구독이 새지 않게 하려고.
   */
  connect(): () => void {
    const { presence, undoManager } = this.session;
    const publishSelection = () => presence.setSelection(this.selection.get());
    const publishEditing = () => presence.setEditing(this.edit.get()?.coord ?? null);
    publishSelection();
    publishEditing();
    const offSelection = this.selection.subscribe(publishSelection);
    const offEditing = this.edit.subscribe(publishEditing);

    // 실행 취소/다시 실행하면 그 변경이 있던 곳으로 선택을 되돌린다.
    let addedDuringPop: StackItemEvent["stackItem"] | null = null;
    const onAdded = ({ stackItem }: StackItemEvent) => {
      if (!stackItem.meta.has("selection")) stackItem.meta.set("selection", this.selection.get());
      addedDuringPop = stackItem;
    };
    const onPopped = ({ stackItem }: StackItemEvent) => {
      const saved = stackItem.meta.get("selection") as Selection | undefined;
      // 되돌리면서 반대쪽 스택에 새로 생긴 항목도 같은 위치를 기억하게 한다.
      if (saved && addedDuringPop && addedDuringPop !== stackItem) {
        addedDuringPop.meta.set("selection", saved);
      }
      addedDuringPop = null;
      if (saved) this.select(saved);
    };
    undoManager.on("stack-item-added", onAdded);
    undoManager.on("stack-item-popped", onPopped);

    return () => {
      offSelection();
      offEditing();
      undoManager.off("stack-item-added", onAdded);
      undoManager.off("stack-item-popped", onPopped);
    };
  }

  /** 그리드가 화면 조작을 붙인다. 떼어 낼 함수를 돌려준다. */
  attachView(view: SheetView): () => void {
    this.view = view;
    return () => {
      if (this.view === view) this.view = detachedView();
    };
  }

  focus(): void {
    this.view.focus();
  }

  /* ───────────── 편집 ───────────── */

  isEditing(): boolean {
    return this.edit.get() !== null;
  }

  /** keepContent: F2·더블클릭처럼 기존 값을 고칠 때 true, 바로 타이핑해 바꿀 때 false */
  startEdit(mode: EditMode, keepContent: boolean): void {
    const coord = this.selection.get().active;
    if (keepContent) this.view.writeDraft(getValue(this.session.doc, coord));
    this.edit.set({ mode, coord });
  }

  commitEdit(): void {
    const current = this.edit.get();
    if (!current) return;
    setValue(this.session.doc, current.coord, this.view.readDraft(), EditOrigin.User);
    this.view.writeDraft("");
    this.edit.set(null);
  }

  cancelEdit(): void {
    this.view.writeDraft("");
    this.edit.set(null);
  }

  toggleEditMode(): void {
    const current = this.edit.get();
    if (current) this.edit.set({ ...current, mode: current.mode === "enter" ? "edit" : "enter" });
  }

  /* ───────────── 선택 ───────────── */

  select(next: Selection, reveal: CellCoord | null = next.active): void {
    this.selection.set(next);
    if (reveal) this.view.reveal(reveal);
  }

  /** 그 셀로 이동한다(참여자 위치로 가기 등). */
  jumpTo(coord: CellCoord): void {
    this.commitEdit();
    this.tabReturnCol = null;
    this.select(collapsedSelection(coord));
    this.view.focus();
  }

  navigate(action: NavigationAction): void {
    this.commitEdit();
    const result = navigate(
      { selection: this.selection.get(), tabReturnCol: this.tabReturnCol },
      action,
      {
        pageRows: this.view.visibleRowCount(),
        isFilled: (coord) => getValue(this.session.doc, coord) !== "",
      },
    );
    this.tabReturnCol = result.tabReturnCol;
    this.select(result.selection, result.reveal);
  }

  /** 마우스를 눌렀을 때. 셀·행 머리글·열 머리글·모서리에 따라 선택하고, Shift면 넓힌다. */
  pointerSelect(kind: PointerTargetKind, coord: CellCoord, extend: boolean): void {
    this.commitEdit();
    this.tabReturnCol = null;
    const sel = this.selection.get();
    switch (kind) {
      case "cell":
        this.select(extend ? extendSelectionTo(sel, coord) : collapsedSelection(coord), null);
        return;
      case "row":
        this.select(selectRows(extend ? sel.anchor.row : coord.row, coord.row), null);
        return;
      case "col":
        this.select(selectColumns(extend ? sel.anchor.col : coord.col, coord.col), null);
        return;
      case "corner":
        this.select(selectAll(sel), null);
        return;
    }
  }

  /** 누른 채로 끌 때. 셀을 끌면 가장자리 밖으로 나간 만큼 스크롤된다. */
  pointerDrag(kind: Exclude<PointerTargetKind, "corner">, coord: CellCoord): void {
    const sel = this.selection.get();
    if (kind === "cell") {
      if (!sameCoord(sel.focus, coord)) this.select(extendSelectionTo(sel, coord), coord);
    } else if (kind === "row") {
      if (sel.focus.row !== coord.row) this.select(selectRows(sel.anchor.row, coord.row), null);
    } else if (sel.focus.col !== coord.col) {
      this.select(selectColumns(sel.anchor.col, coord.col), null);
    }
  }

  /* ───────────── 명령 (현재 선택 범위 대상) ───────────── */

  private get range() {
    return selectionRange(this.selection.get());
  }

  /** 편집 중에도 편집을 유지한 채 적용한다(구글시트와 같음). */
  toggleFormat(key: FormatKey): void {
    toggleFormat(this.session.doc, this.range, key, EditOrigin.User);
  }

  setStyle(key: StyleKey, value: string | null): void {
    setStyle(this.session.doc, this.range, key, value, EditOrigin.User);
  }

  clearFormats(): void {
    clearFormats(this.session.doc, this.range, EditOrigin.User);
  }

  clearValues(): void {
    clearValues(this.session.doc, this.range, EditOrigin.User);
  }

  /** 편집 중이면 입력을 먼저 확정한다. 그래서 툴바의 실행 취소는 "입력 취소"처럼 동작하고, 다시 실행으로 되살릴 수 있다. */
  undo(): void {
    this.commitEdit();
    this.session.undoManager.undo();
  }

  redo(): void {
    this.commitEdit();
    this.session.undoManager.redo();
  }

  /** 키보드 동작을 실행한다. */
  runAction(action: GridAction): void {
    if (isNavigationAction(action)) {
      this.navigate(action);
      return;
    }
    switch (action.type) {
      case "cancelEdit":
        return this.cancelEdit();
      case "toggleEditMode":
        return this.toggleEditMode();
      case "startEdit":
        return this.startEdit("edit", true);
      case "format":
        return this.toggleFormat(action.key);
      case "align":
        return this.setStyle("align", action.value);
      case "clearFormat":
        return this.clearFormats();
      case "clear":
        return this.clearValues();
      case "undo":
        return this.undo();
      case "redo":
        return this.redo();
    }
  }
}
