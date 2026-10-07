import type * as Y from "yjs";
import { lockHolder } from "@/lib/collab/locks";
import type { Participant } from "@/lib/collab/presence-state";
import type { CellCoord, CellRange } from "@/lib/sheet/address";
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
import type { PointerTargetKind } from "@/lib/sheet/viewport";
import { createStore, type Store } from "@/lib/store";

/**
 * 키보드·마우스·툴바·AI 패널이 모두 같은 명령을 부름. 그래서 "편집 중이면 먼저 확정" 같은 규칙이 한 곳에만 있음.
 * DOM이 필요한 일(스크롤, 포커스, 편집칸 글자)은 그리드가 붙여 주는 SheetView에 맡김.
 */

export interface EditState {
  mode: EditMode;
  coord: CellCoord;
}

export interface SheetView {
  reveal(coord: CellCoord): void;
  focus(): void;
  visibleRowCount(): number;
  readDraft(): string;
  /** 편집칸의 글자를 바꾸고 커서를 끝으로 옮김. */
  writeDraft(text: string): void;
}

export interface ControllerSession {
  doc: Y.Doc;
  undoManager: Y.UndoManager;
  presence: {
    setSelection(selection: Selection): void;
    setEditing(coord: CellCoord | null): void;
    /** 없으면 입력 중인 글자를 다른 탭에 알리지 않음. */
    setDraft?(draft: string | null): void;
    /** 없으면 다른 참여자가 없는(잠금도 없는) 것으로 봄. */
    getParticipants?(): readonly Participant[];
  };
}

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
  /** 편집 중인 글자. 수식 입력줄이 셀 편집칸과 같은 글자를 보여 주게 한다. */
  readonly draft: Store<string> = createStore("");
  /** 다른 참여자가 잠근 셀을 바꾸려다 막힌 위치. 선택을 옮기면 지운다. */
  readonly lockNotice: Store<CellCoord | null> = createStore<CellCoord | null>(null);
  private view: SheetView = detachedView();
  private tabReturnCol: number | null = null;

  constructor(
    private readonly session: ControllerSession,
    initialSelection: Selection = collapsedSelection({ row: 0, col: 0 }),
  ) {
    this.selection = createStore(initialSelection);
  }

  /** 구독은 생성자가 아니라 여기서 시작함. React 개발 모드가 객체를 두 번 만들어도 구독이 새지 않게. */
  connect(): () => void {
    const { presence, undoManager } = this.session;
    const publishSelection = () => presence.setSelection(this.selection.get());
    const publishEditing = () => {
      const edit = this.edit.get();
      presence.setEditing(edit?.coord ?? null);
      presence.setDraft?.(edit ? this.view.readDraft() : null);
    };
    publishSelection();
    publishEditing();
    const offSelection = this.selection.subscribe(publishSelection);
    const offEditing = this.edit.subscribe(publishEditing);

    // 실행 취소/다시 실행하면, 그 변경이 있던 곳으로 선택을 되돌림.
    let addedDuringPop: StackItemEvent["stackItem"] | null = null;
    const onAdded = ({ stackItem }: StackItemEvent) => {
      if (!stackItem.meta.has("selection")) stackItem.meta.set("selection", this.selection.get());
      addedDuringPop = stackItem;
    };
    const onPopped = ({ stackItem }: StackItemEvent) => {
      const saved = stackItem.meta.get("selection") as Selection | undefined;
      // 되돌리면서 반대쪽 스택에 새로 생긴 항목도 같은 위치를 기억하게 함.
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

  attachView(view: SheetView): () => void {
    this.view = view;
    return () => {
      if (this.view === view) this.view = detachedView();
    };
  }

  focus(): void {
    this.view.focus();
  }

  reveal(coord: CellCoord): void {
    this.view.reveal(coord);
  }

  isEditing(): boolean {
    return this.edit.get() !== null;
  }

  /** keepContent: F2·더블클릭처럼 기존 값을 고칠 때 true, 바로 타이핑해 바꿀 때 false */
  startEdit(mode: EditMode, keepContent: boolean): void {
    const coord = this.selection.get().active;
    if (this.refuseLocked({ start: coord, end: coord })) {
      // 바로 타이핑해서 시작했다면 편집칸에 이미 들어간 글자를 지움.
      this.view.writeDraft("");
      return;
    }
    if (keepContent) this.view.writeDraft(getValue(this.session.doc, coord));
    this.edit.set({ mode, coord });
    this.draft.set(this.view.readDraft());
  }

  /** 편집칸 글자가 바뀌었을 때 호출. 다른 참여자가 확정 전에도 입력 중인 글자를 볼 수 있게 알림. */
  draftChanged(): void {
    if (!this.edit.get()) return;
    const draft = this.view.readDraft();
    this.draft.set(draft);
    this.session.presence.setDraft?.(draft);
  }

  /**
   * 셀 편집칸 밖(수식 입력줄)에서 글자를 바꿨다. 편집 중이 아니면 이 셀의 편집을 시작한다.
   * 셀 편집칸에도 같은 글자를 써 두므로 확정·이동·다른 참여자 알림은 셀에서 입력할 때와 같다.
   * @returns 잠긴 셀이라 편집을 시작하지 못했으면 false
   */
  replaceDraft(text: string): boolean {
    if (!this.isEditing()) this.startEdit("edit", false);
    if (!this.isEditing()) return false;
    this.view.writeDraft(text);
    this.draftChanged();
    return true;
  }

  commitEdit(): void {
    const current = this.edit.get();
    if (!current) return;
    setValue(this.session.doc, current.coord, this.view.readDraft(), EditOrigin.User);
    this.clearDraft();
  }

  cancelEdit(): void {
    this.clearDraft();
  }

  private clearDraft(): void {
    this.view.writeDraft("");
    this.draft.set("");
    this.edit.set(null);
  }

  toggleEditMode(): void {
    const current = this.edit.get();
    if (current) this.edit.set({ ...current, mode: current.mode === "enter" ? "edit" : "enter" });
  }

  select(next: Selection, reveal: CellCoord | null = next.active): void {
    this.selection.set(next);
    this.lockNotice.set(null);
    if (reveal) this.view.reveal(reveal);
  }

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

  private get range() {
    return selectionRange(this.selection.get());
  }

  /**
   * 다른 참여자가 AI 편집을 위해 잠근 셀이 range에 있으면, 막고 안내를 띄움.
   * 잠금 전에 시작한 입력은 확정할 수 있음. 입력한 글자를 버리지 않기 위함이고, 그 셀은 AI 결과에서 충돌로 표시됨.
   */
  private refuseLocked(range: CellRange): boolean {
    const participants = this.session.presence.getParticipants?.() ?? [];
    if (!lockHolder(participants, range)) return false;
    this.lockNotice.set(this.selection.get().active);
    return true;
  }

  /** 편집 중에도 편집을 유지한 채 서식을 적용함(구글 시트와 같음). */
  toggleFormat(key: FormatKey): void {
    if (this.refuseLocked(this.range)) return;
    toggleFormat(this.session.doc, this.range, key, EditOrigin.User);
  }

  setStyle(key: StyleKey, value: string | null): void {
    if (this.refuseLocked(this.range)) return;
    setStyle(this.session.doc, this.range, key, value, EditOrigin.User);
  }

  clearFormats(): void {
    if (this.refuseLocked(this.range)) return;
    clearFormats(this.session.doc, this.range, EditOrigin.User);
  }

  clearValues(): void {
    if (this.refuseLocked(this.range)) return;
    clearValues(this.session.doc, this.range, EditOrigin.User);
  }

  /** 편집 중이면 먼저 확정함. 그래서 실행 취소가 "입력 취소"처럼 동작하고, 다시 실행으로 되살릴 수 있음. */
  undo(): void {
    this.commitEdit();
    this.session.undoManager.undo();
  }

  redo(): void {
    this.commitEdit();
    this.session.undoManager.redo();
  }

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
