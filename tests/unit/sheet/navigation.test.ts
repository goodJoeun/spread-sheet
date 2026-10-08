import { describe, expect, it } from "vitest";
import { parseA1, toA1, type CellCoord } from "@/lib/sheet/address";
import { resolveGridKey } from "@/lib/sheet/keymap";
import {
  isNavigationAction,
  applyNavigation,
  type NavigationAction,
  type NavigationState,
} from "@/lib/sheet/navigation";
import { COL_COUNT, ROW_COUNT } from "@/lib/sheet/schema";
import { collapsedSelection, selectionRange, type Selection } from "@/lib/sheet/selection";

const at = (a1: string): CellCoord => parseA1(a1)!;
const context = { pageRows: 10, isFilled: () => false };

function walk(start: Selection, actions: NavigationAction[]): string[] {
  let state: NavigationState = { selection: start, tabReturnCol: null };
  return actions.map((action) => {
    state = applyNavigation(state, action, context);
    return toA1(state.selection.active);
  });
}

const tab: NavigationAction = { type: "advance", dRow: 0, dCol: 1 };
const enter: NavigationAction = { type: "advance", dRow: 1, dCol: 0 };
const down: NavigationAction = { type: "move", dRow: 1, dCol: 0 };

describe("Tab then Enter", () => {
  it("returns to the column where tabbing started", () => {
    expect(walk(collapsedSelection(at("B2")), [tab, tab, enter])).toEqual(["C2", "D2", "B3"]);
  });

  it("starts over after returning", () => {
    expect(walk(collapsedSelection(at("B2")), [tab, enter, enter])).toEqual(["C2", "B3", "B4"]);
  });

  it("forgets the start column after any other move", () => {
    expect(walk(collapsedSelection(at("B2")), [tab, down, enter])).toEqual(["C2", "C3", "C4"]);
  });

  it("moves straight up with Shift+Enter", () => {
    expect(walk(collapsedSelection(at("B2")), [tab, { ...enter, dRow: -1 }])).toEqual(["C2", "C1"]);
  });
});

describe("advance inside a range", () => {
  it("cycles the active cell without changing the range", () => {
    const range: Selection = { anchor: at("A1"), focus: at("B2"), active: at("A1") };
    const result = applyNavigation({ selection: range, tabReturnCol: null }, enter, context);
    expect(toA1(result.selection.active)).toBe("A2");
    expect(selectionRange(result.selection)).toEqual({ start: at("A1"), end: at("B2") });
  });
});

describe("reveal", () => {
  it("follows the moving corner when extending", () => {
    const result = applyNavigation(
      { selection: collapsedSelection(at("C3")), tabReturnCol: null },
      { type: "page", direction: 1, extend: true },
      context,
    );
    expect(result.selection.focus).toEqual(at("C13"));
    expect(result.reveal).toEqual(at("C13"));
    expect(result.selection.active).toEqual(at("C3"));
  });

  it("does not scroll when selecting everything", () => {
    const result = applyNavigation(
      { selection: collapsedSelection(at("C3")), tabReturnCol: null },
      { type: "selectAll" },
      context,
    );
    expect(result.reveal).toBeNull();
    expect(selectionRange(result.selection).end).toEqual({
      row: ROW_COUNT - 1,
      col: COL_COUNT - 1,
    });
  });
});

describe("jump", () => {
  it("extends to the edge of the data with Ctrl+Shift+arrow", () => {
    const filled = new Set(["A1", "A2", "A3"]);
    const result = applyNavigation(
      { selection: collapsedSelection(at("A1")), tabReturnCol: null },
      { type: "jump", dRow: 1, dCol: 0, extend: true },
      { ...context, isFilled: (c) => filled.has(toA1(c)) },
    );
    expect(selectionRange(result.selection)).toEqual({ start: at("A1"), end: at("A3") });
  });
});

describe("isNavigationAction", () => {
  const key = (k: string) =>
    resolveGridKey(
      { key: k, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false },
      null,
      false,
    )!;

  it("separates moves from commands", () => {
    expect(isNavigationAction(key("ArrowDown"))).toBe(true);
    expect(isNavigationAction(key("Enter"))).toBe(true);
    expect(isNavigationAction(key("Delete"))).toBe(false);
    expect(isNavigationAction(key("F2"))).toBe(false);
  });
});
