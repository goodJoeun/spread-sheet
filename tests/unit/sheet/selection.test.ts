import { describe, expect, it } from "vitest";
import { parseA1, toA1, type CellCoord } from "@/lib/sheet/address";
import { COL_COUNT, ROW_COUNT } from "@/lib/sheet/document";
import {
  advanceWithinRange,
  collapsedSelection,
  extendSelection,
  jumpTarget,
  moveSelection,
  selectionRange,
  type Selection,
} from "@/lib/sheet/selection";

const at = (a1: string): CellCoord => parseA1(a1)!;
const rangeSelection = (anchor: string, focus: string, active = anchor): Selection => ({
  anchor: at(anchor),
  focus: at(focus),
  active: at(active),
});

describe("move / extend", () => {
  it("moves the active cell and collapses any range", () => {
    const moved = moveSelection(rangeSelection("B2", "D4", "C3"), 1, 0);
    expect(moved).toEqual(collapsedSelection(at("C4")));
  });

  it("clamps to the sheet edges", () => {
    expect(moveSelection(collapsedSelection(at("A1")), -1, -1).active).toEqual(at("A1"));
    const last = { row: ROW_COUNT - 1, col: COL_COUNT - 1 };
    expect(moveSelection(collapsedSelection(last), 1, 1).active).toEqual(last);
  });

  it("extends from the anchor and can shrink back", () => {
    let selection = collapsedSelection(at("B2"));
    selection = extendSelection(selection, 1, 1);
    expect(selectionRange(selection)).toEqual({ start: at("B2"), end: at("C3") });
    selection = extendSelection(selection, -2, 0);
    expect(selectionRange(selection)).toEqual({ start: at("B1"), end: at("C2") });
    expect(selection.active).toEqual(at("B2"));
  });
});

describe("advanceWithinRange", () => {
  const visit = (selection: Selection, dRow: number, dCol: number, steps: number) => {
    const visited: string[] = [];
    for (let i = 0; i < steps; i++) {
      selection = advanceWithinRange(selection, dRow, dCol);
      visited.push(toA1(selection.active));
    }
    return visited;
  };

  it("walks down each column with Enter and wraps", () => {
    expect(visit(rangeSelection("A1", "B2"), 1, 0, 4)).toEqual(["A2", "B1", "B2", "A1"]);
  });

  it("walks across each row with Tab and wraps backwards with Shift+Tab", () => {
    expect(visit(rangeSelection("A1", "B2"), 0, 1, 4)).toEqual(["B1", "A2", "B2", "A1"]);
    expect(visit(rangeSelection("A1", "B2"), 0, -1, 2)).toEqual(["B2", "A2"]);
  });

  it("keeps the range itself", () => {
    const next = advanceWithinRange(rangeSelection("A1", "B2"), 1, 0);
    expect(selectionRange(next)).toEqual({ start: at("A1"), end: at("B2") });
  });
});

describe("jumpTarget (Ctrl+arrow)", () => {
  // 1행: A1 B1 C1 채움, D1 E1 비움, F1 채움
  const filled = new Set(["A1", "B1", "C1", "F1"]);
  const isFilled = (c: CellCoord) => filled.has(toA1(c));
  const jump = (from: string, dCol: number) => toA1(jumpTarget(at(from), 0, dCol, isFilled));

  it("goes to the end of the current block", () => {
    expect(jump("A1", 1)).toBe("C1");
  });

  it("goes to the next filled cell from the end of a block", () => {
    expect(jump("C1", 1)).toBe("F1");
  });

  it("goes to the sheet edge when nothing follows", () => {
    expect(jump("F1", 1)).toBe(toA1({ row: 0, col: COL_COUNT - 1 }));
    expect(jump("A1", -1)).toBe("A1");
  });

  it("goes to the next filled cell from an empty cell", () => {
    expect(jump("D1", 1)).toBe("F1");
    expect(jump("E1", -1)).toBe("C1");
  });
});
