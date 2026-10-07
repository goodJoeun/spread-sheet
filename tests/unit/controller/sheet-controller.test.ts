import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createUndoManager } from "@/lib/collab/undo";
import { SheetController, type SheetView } from "@/lib/controller/sheet-controller";
import type { Participant } from "@/lib/collab/presence-state";
import { parseA1, parseRangeA1, toA1, type CellCoord } from "@/lib/sheet/address";
import { EditOrigin, getFormat, getValue, setValue } from "@/lib/sheet/document";
import { collapsedSelection, type Selection } from "@/lib/sheet/selection";

const at = (a1: string): CellCoord => parseA1(a1)!;

let cleanup: Array<() => void> = [];
afterEach(() => {
  cleanup.forEach((fn) => fn());
  cleanup = [];
});

function fakeView() {
  const calls = { reveal: [] as string[], focus: 0 };
  let draft = "";
  const view: SheetView & { type(text: string): void } = {
    reveal: (coord) => calls.reveal.push(toA1(coord)),
    focus: () => calls.focus++,
    visibleRowCount: () => 10,
    readDraft: () => draft,
    writeDraft: (text) => {
      draft = text;
    },
    type: (text) => {
      draft += text;
    },
  };
  return { view, calls, draft: () => draft };
}

function setup(start = "A1", participants: Participant[] = []) {
  const doc = new Y.Doc();
  const undoManager = createUndoManager(doc);
  const published = {
    selection: [] as Selection[],
    editing: [] as Array<CellCoord | null>,
    draft: [] as Array<string | null>,
  };
  const presence = {
    setSelection: (s: Selection) => published.selection.push(s),
    setEditing: (c: CellCoord | null) => published.editing.push(c),
    setDraft: (d: string | null) => published.draft.push(d),
    getParticipants: () => participants,
  };
  const controller = new SheetController(
    { doc, undoManager, presence },
    collapsedSelection(at(start)),
  );
  const { view, calls, draft } = fakeView();
  cleanup.push(controller.attachView(view), controller.connect(), () => undoManager.destroy());

  /** 사용자가 셀을 선택한 채 타이핑을 시작한 상황을 흉내 냄. */
  const typeInto = (text: string) => {
    view.type(text);
    controller.startEdit("enter", false);
  };
  const active = () => toA1(controller.selection.get().active);
  return { doc, controller, view, calls, draft, published, typeInto, active };
}

describe("editing", () => {
  it("commits the draft before moving", () => {
    const { doc, controller, typeInto, active } = setup("B2");
    typeInto("hello");
    controller.runAction({ type: "advance", dRow: 1, dCol: 0 });
    expect(getValue(doc, at("B2"))).toBe("hello");
    expect(active()).toBe("B3");
    expect(controller.isEditing()).toBe(false);
  });

  it("loads the current value into the editor for F2 and discards it on Escape", () => {
    const { doc, controller, view, typeInto, draft } = setup();
    typeInto("before");
    controller.commitEdit();

    controller.runAction({ type: "startEdit" });
    expect(draft()).toBe("before");
    view.type("!!");
    controller.runAction({ type: "cancelEdit" });
    expect(getValue(doc, at("A1"))).toBe("before");
    expect(draft()).toBe("");
  });

  it("keeps editing while a format is applied", () => {
    const { doc, controller, typeInto } = setup();
    typeInto("x");
    controller.runAction({ type: "format", key: "bold" });
    expect(controller.isEditing()).toBe(true);
    expect(getFormat(doc, at("A1"))).toEqual({ bold: true });
  });
});

describe("formula bar", () => {
  it("mirrors the cell editor draft and clears it when the edit ends", () => {
    const { controller, view, typeInto } = setup();
    typeInto("ab");
    expect(controller.draft.get()).toBe("ab");
    view.type("c");
    controller.draftChanged();
    expect(controller.draft.get()).toBe("abc");
    controller.cancelEdit();
    expect(controller.draft.get()).toBe("");
  });

  it("starts an edit from outside the cell and commits it like cell typing", () => {
    const { doc, controller, draft, published, active } = setup("B2");
    expect(controller.replaceDraft("from bar")).toBe(true);
    expect(controller.edit.get()).toEqual({ mode: "edit", coord: at("B2") });
    expect(draft()).toBe("from bar");
    expect(published.draft.at(-1)).toBe("from bar");

    controller.runAction({ type: "advance", dRow: 1, dCol: 0 });
    expect(getValue(doc, at("B2"))).toBe("from bar");
    expect(active()).toBe("B3");
  });

  it("refuses to start an edit on a locked cell", () => {
    const locked: Participant = {
      clientId: 2,
      isSelf: false,
      user: { name: "다른 사람", color: "#e8710a" },
      selection: null,
      editing: null,
      draft: null,
      ai: { status: "generating", range: parseRangeA1("B2:B2")!, locked: true },
    };
    const { controller, draft } = setup("B2", [locked]);
    expect(controller.replaceDraft("x")).toBe(false);
    expect(controller.isEditing()).toBe(false);
    expect(draft()).toBe("");
    expect(controller.lockNotice.get()).toEqual(at("B2"));
  });
});

describe("undo", () => {
  it("treats undo while editing as discarding the draft, which redo brings back", () => {
    const { doc, controller, typeInto } = setup();
    typeInto("old");
    controller.commitEdit();
    typeInto("new");

    controller.undo();
    expect(controller.isEditing()).toBe(false);
    expect(getValue(doc, at("A1"))).toBe("old");
    controller.redo();
    expect(getValue(doc, at("A1"))).toBe("new");
  });

  it("moves the selection back to where the undone change happened", () => {
    const { controller, typeInto, active, calls } = setup("C3");
    typeInto("x");
    controller.runAction({ type: "advance", dRow: 1, dCol: 0 });
    controller.jumpTo(at("A1"));

    controller.undo();
    expect(active()).toBe("C3");
    expect(calls.reveal.at(-1)).toBe("C3");
  });
});

describe("selection", () => {
  it("returns to the starting column after Tab, Tab, Enter", () => {
    const { controller, typeInto, active } = setup("B2");
    typeInto("a");
    controller.runAction({ type: "advance", dRow: 0, dCol: 1 });
    typeInto("b");
    controller.runAction({ type: "advance", dRow: 0, dCol: 1 });
    controller.runAction({ type: "advance", dRow: 1, dCol: 0 });
    expect(active()).toBe("B3");
  });

  it("selects rows and columns from the headers, extending with Shift", () => {
    const { controller } = setup("B2");
    controller.pointerSelect("row", at("A3"), false);
    controller.pointerDrag("row", at("A5"));
    const sel = controller.selection.get();
    expect([sel.anchor.row, sel.focus.row]).toEqual([2, 4]);
    controller.pointerSelect("col", at("D1"), true);
    expect(controller.selection.get().focus.col).toBe(3);
  });

  it("commits, selects, reveals and focuses when jumping to a participant", () => {
    const { doc, controller, typeInto, active, calls } = setup();
    typeInto("draft");
    controller.jumpTo(at("F10"));
    expect(getValue(doc, at("A1"))).toBe("draft");
    expect(active()).toBe("F10");
    expect(calls.reveal.at(-1)).toBe("F10");
    expect(calls.focus).toBe(1);
  });
});

describe("presence", () => {
  it("publishes my selection and the cell I'm editing", () => {
    const { controller, published, typeInto } = setup();
    controller.runAction({ type: "move", dRow: 1, dCol: 1 });
    typeInto("x");
    expect(toA1(published.selection.at(-1)!.active)).toBe("B2");
    expect(published.editing.at(-1)).toEqual(at("B2"));
    controller.cancelEdit();
    expect(published.editing.at(-1)).toBeNull();
  });

  it("publishes the text being typed before it is committed", () => {
    const { controller, view, published, typeInto } = setup();
    typeInto("1");
    expect(published.draft.at(-1)).toBe("1");
    view.type("2");
    controller.draftChanged();
    expect(published.draft.at(-1)).toBe("12");
    controller.commitEdit();
    expect(published.draft.at(-1)).toBeNull();
  });

  it("publishes the current value as the draft when editing it in place", () => {
    const { doc, controller, published } = setup();
    setValue(doc, at("A1"), "old", EditOrigin.User);
    controller.startEdit("edit", true);
    expect(published.draft.at(-1)).toBe("old");
  });
});

describe("AI cell lock", () => {
  const lockedBy = (range: string, isSelf = false): Participant => ({
    clientId: isSelf ? 1 : 2,
    isSelf,
    user: { name: "다른 사람", color: "#e8710a" },
    selection: null,
    editing: null,
    draft: null,
    ai: { status: "generating", range: parseRangeA1(range)!, locked: true },
  });

  it("refuses to start editing a locked cell and drops the typed text", () => {
    const { controller, draft, typeInto } = setup("B2", [lockedBy("B2:C3")]);
    typeInto("x");
    expect(controller.isEditing()).toBe(false);
    expect(draft()).toBe("");
    expect(controller.lockNotice.get()).toEqual(at("B2"));

    controller.startEdit("edit", true);
    expect(controller.isEditing()).toBe(false);
  });

  it("refuses value and format changes that touch a locked cell", () => {
    const { doc, controller } = setup("A1", [lockedBy("B2:C3")]);
    setValue(doc, at("B2"), "1", EditOrigin.User);
    controller.select({ anchor: at("A1"), focus: at("B2"), active: at("A1") });
    controller.clearValues();
    controller.toggleFormat("bold");
    expect(getValue(doc, at("B2"))).toBe("1");
    expect(getFormat(doc, at("A1")).bold).toBeFalsy();
  });

  it("clears the notice when the selection moves", () => {
    const { controller, typeInto } = setup("B2", [lockedBy("B2:C3")]);
    typeInto("x");
    controller.jumpTo(at("B4"));
    expect(controller.lockNotice.get()).toBeNull();
  });

  it("lets an edit begun before the lock commit, and ignores my own lock", () => {
    const participants: Participant[] = [lockedBy("B2:B2", true)];
    const { doc, controller, typeInto } = setup("B2", participants);
    typeInto("mine");
    expect(controller.isEditing()).toBe(true);
    participants.push(lockedBy("B2:B2"));
    controller.commitEdit();
    expect(getValue(doc, at("B2"))).toBe("mine");
  });
});
