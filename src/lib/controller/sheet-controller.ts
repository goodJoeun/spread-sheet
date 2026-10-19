import type * as Y from "yjs";
import { lockHolder } from "@/lib/collab/locks";
import type { Participant } from "@/lib/collab/presence-state";
import type { CellCoord, CellRange } from "@/lib/sheet/address";
// 컨트롤러의 서식·지우기 명령은 문서 함수와 이름이 같지만, 선택 범위에 적용하고 잠긴 셀이면 막는다는 점이 다름.
// 그래서 문서를 직접 바꾸는 호출은 SheetDoc.으로 구분함.
import * as SheetDoc from "@/lib/sheet/document";
import type { EditMode, GridAction } from "@/lib/sheet/keymap";
import { applyNavigation, isNavigationAction, type NavigationAction } from "@/lib/sheet/navigation";
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
import { DEFAULT_PAGE_ROWS, type PointerTargetKind } from "@/lib/sheet/viewport";
import { createStore, type Store } from "@/lib/store";

// [흐름 14 · 5603cf4] 입력 경로가 늘면서 "편집 중이면 먼저 확정" 같은 규칙이 경로마다 흩어져 명령을 한 곳에 모음.
// 그리드에 연결(4b195c4)하기 전에 독립 클래스로 먼저 만들고 테스트로 동작을 고정함.
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

/** 그리드가 붙기 전이나 테스트에서 쓰는 DOM 없는 화면. */
function detachedView(): SheetView {
  let draft = "";
  return {
    reveal() {},
    focus() {},
    visibleRowCount: () => DEFAULT_PAGE_ROWS,
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

  /**
   * 선택·편집 상태를 참여 상태로 알리고, 실행 취소할 때 선택을 그 변경이 있던 곳으로 되돌리는 구독을 시작함.
   * 생성자가 아니라 여기서 시작해서, React 개발 모드가 객체를 두 번 만들어도 구독이 새지 않음.
   */
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

  /** 그리드가 스크롤·포커스·편집칸 글자를 맡을 화면을 붙임. 떼는 함수를 돌려줌. */
  attachView(view: SheetView): () => void {
    this.view = view;
    return () => {
      if (this.view === view) this.view = detachedView();
    };
  }

  /** 키보드 입력을 그리드로 돌림. */
  focus(): void {
    this.view.focus();
  }

  /** 선택은 그대로 두고 그 셀이 보이도록 스크롤함. */
  reveal(coord: CellCoord): void {
    this.view.reveal(coord);
  }

  /** 셀을 편집 중인지. */
  isEditing(): boolean {
    return this.edit.get() !== null;
  }

  /** 선택한 셀의 편집을 시작함. 잠긴 셀이면 막음. keepContent는 F2·더블클릭처럼 기존 값을 고칠 때 true이고, 바로 타이핑할 때는 편집칸에 이미 들어간 글자로 시작함. */
  startEdit(mode: EditMode, { keepContent = false }: { keepContent?: boolean } = {}): void {
    const coord = this.selection.get().active;
    if (this.blockIfLocked({ start: coord, end: coord })) {
      // 바로 타이핑해서 시작했다면 편집칸에 이미 들어간 글자를 지움.
      this.view.writeDraft("");
      return;
    }
    if (keepContent) this.view.writeDraft(SheetDoc.getValue(this.session.doc, coord));
    this.edit.set({ mode, coord });
    this.draft.set(this.view.readDraft());
  }

  /** 편집칸 글자가 바뀌었을 때 부름. 다른 참여자가 확정 전에도 입력 중인 글자를 볼 수 있게 알림. */
  draftChanged(): void {
    if (!this.edit.get()) return;
    const draft = this.view.readDraft();
    this.draft.set(draft);
    this.session.presence.setDraft?.(draft);
  }

  // [흐름 29 · 53b0784] 수식 입력줄에 별도 편집 경로를 만들지 않고 셀 편집칸에 같은 글자를 씀. 확정·잠금·알림 규칙을 다시 만들지 않으려고.
  /** 수식 입력줄에서 바꾼 글자를 셀 편집칸에도 씀. 편집 중이 아니면 이 셀의 편집을 시작함. 확정·이동·알림은 셀에서 입력할 때와 같음. 잠긴 셀이라 시작하지 못했으면 false. */
  replaceDraft(text: string): boolean {
    if (!this.isEditing()) this.startEdit("edit");
    if (!this.isEditing()) return false;
    this.view.writeDraft(text);
    this.draftChanged();
    return true;
  }

  /** 편집칸 글자를 셀 값으로 확정함(origin: user-edit). 편집 중이 아니면 아무것도 하지 않음. */
  commitEdit(): void {
    const current = this.edit.get();
    if (!current) return;
    SheetDoc.setValue(
      this.session.doc,
      current.coord,
      this.view.readDraft(),
      SheetDoc.EditOrigin.User,
    );
    this.endEdit();
  }

  /** 입력을 버리고 편집을 끝냄(Esc). */
  cancelEdit(): void {
    this.endEdit();
  }

  /** 편집을 끝내고 편집칸 글자를 비움. 확정할지는 부르는 쪽이 정함. */
  private endEdit(): void {
    this.view.writeDraft("");
    this.draft.set("");
    this.edit.set(null);
  }

  /** 편집 중 F2로 enter(방향키 = 셀 이동)와 edit(방향키 = 커서 이동) 모드를 바꿈. */
  toggleEditMode(): void {
    const current = this.edit.get();
    if (current) this.edit.set({ ...current, mode: current.mode === "enter" ? "edit" : "enter" });
  }

  /** 선택을 바꾸고 필요하면 스크롤함. 잠금 안내는 지움. */
  select(next: Selection, reveal: CellCoord | null = next.active): void {
    this.selection.set(next);
    this.lockNotice.set(null);
    if (reveal) this.view.reveal(reveal);
  }

  /** 그 셀로 바로 이동함(참여자 목록에서 다른 사람 위치로 갈 때). */
  jumpTo(coord: CellCoord): void {
    this.commitEdit();
    this.tabReturnCol = null;
    this.select(collapsedSelection(coord));
    this.view.focus();
  }

  /** 키보드 이동. 편집 중이면 먼저 확정하고, 다음 선택은 applyNavigation이 계산함. */
  navigate(action: NavigationAction): void {
    this.commitEdit();
    const result = applyNavigation(
      { selection: this.selection.get(), tabReturnCol: this.tabReturnCol },
      action,
      {
        pageRows: this.view.visibleRowCount(),
        isFilled: (coord) => SheetDoc.getValue(this.session.doc, coord) !== "",
      },
    );
    this.tabReturnCol = result.tabReturnCol;
    this.select(result.selection, result.reveal);
  }

  /** 마우스로 누른 곳(셀·행·열·모서리)에 따라 선택함. Shift를 누르고 있으면 범위를 늘림. */
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

  /** 드래그하는 동안 선택 범위를 늘림. */
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

  /** 지금 선택 범위. */
  private get range() {
    return selectionRange(this.selection.get());
  }

  /**
   * range에 다른 참여자가 AI 편집을 위해 잠근 셀이 있으면 안내(lockNotice)를 띄우고 true를 돌려줌(부르는 쪽이 멈춤).
   * 잠기기 전에 시작한 입력은 확정할 수 있음(그 셀은 AI 결과에서 충돌로 표시됨).
   */
  private blockIfLocked(range: CellRange): boolean {
    const participants = this.session.presence.getParticipants?.() ?? [];
    if (!lockHolder(participants, range)) return false;
    this.lockNotice.set(this.selection.get().active);
    return true;
  }

  /** 선택 범위의 굵게·기울임 등을 켜거나 끔. 잠긴 셀이면 막음. 편집 중에도 편집을 유지한 채 적용함(구글 시트와 같음). */
  toggleFormat(key: FormatKey): void {
    if (this.blockIfLocked(this.range)) return;
    SheetDoc.toggleFormat(this.session.doc, this.range, key, SheetDoc.EditOrigin.User);
  }

  /** 선택 범위에 글자색·채우기·정렬을 적용함. 잠긴 셀이면 막음. */
  setStyle(key: StyleKey, value: string | null): void {
    if (this.blockIfLocked(this.range)) return;
    SheetDoc.setStyle(this.session.doc, this.range, key, value, SheetDoc.EditOrigin.User);
  }

  /** 선택 범위의 서식을 지움. 잠긴 셀이면 막음. */
  clearFormats(): void {
    if (this.blockIfLocked(this.range)) return;
    SheetDoc.clearFormats(this.session.doc, this.range, SheetDoc.EditOrigin.User);
  }

  /** 선택 범위의 값만 지움(Delete). 잠긴 셀이면 막음. */
  clearValues(): void {
    if (this.blockIfLocked(this.range)) return;
    SheetDoc.clearValues(this.session.doc, this.range, SheetDoc.EditOrigin.User);
  }

  /** 실행 취소. 편집 중이면 먼저 확정해서, 실행 취소가 "입력 취소"처럼 동작하고 다시 실행으로 되살릴 수 있음. */
  undo(): void {
    this.commitEdit();
    this.session.undoManager.undo();
  }

  /** 다시 실행. 편집 중이면 먼저 확정함. */
  redo(): void {
    this.commitEdit();
    this.session.undoManager.redo();
  }

  /** 키 해석 결과(GridAction)를 알맞은 명령으로 보냄. */
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
        return this.startEdit("edit", { keepContent: true });
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
