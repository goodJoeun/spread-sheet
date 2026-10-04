import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createUndoManager } from "@/lib/collab/undo";
import { SheetController, type SheetView } from "@/lib/controller/sheet-controller";
import { parseA1, toA1, type CellCoord } from "@/lib/sheet/address";
import { getFormat, getValue } from "@/lib/sheet/document";
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

function setup(start = "A1") {
  const doc = new Y.Doc();
  const undoManager = createUndoManager(doc);
  const published = { selection: [] as Selection[], editing: [] as Array<CellCoord | null> };
  const presence = {
    setSelection: (s: Selection) => published.selection.push(s),
    setEditing: (c: CellCoord | null) => published.editing.push(c),
  };
  const controller = new SheetController(
    { doc, undoManager, presence },
    collapsedSelection(at(start)),
  );
  const { view, calls, draft } = fakeView();
  cleanup.push(controller.attachView(view), controller.connect(), () => undoManager.destroy());

  /** 사용자가 셀을 선택한 채 타이핑을 시작한 것과 같다. */
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
});
