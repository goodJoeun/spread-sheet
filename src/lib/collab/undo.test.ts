import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { parseA1, parseRangeA1, type CellCoord } from "@/lib/sheet/address";
import {
  EditOrigin,
  getFormat,
  getValue,
  setValue,
  toggleFormat,
  writeValues,
} from "@/lib/sheet/document";
import { createUndoManager } from "./undo";

const at = (a1: string): CellCoord => parseA1(a1)!;
const { User, Ai } = EditOrigin;

/** from의 변경 중 to에 없는 것을 원격 변경으로 적용한다. */
function deliver(from: Y.Doc, to: Y.Doc) {
  Y.applyUpdate(to, Y.encodeStateAsUpdate(from, Y.encodeStateVector(to)), "remote");
}

describe("createUndoManager", () => {
  it("undoes only my own changes", () => {
    const mine = new Y.Doc();
    const theirs = new Y.Doc();
    const undo = createUndoManager(mine);

    setValue(mine, at("A1"), "mine", User);
    setValue(theirs, at("B1"), "theirs", User);
    deliver(theirs, mine);

    undo.undo();
    expect(getValue(mine, at("A1"))).toBe("");
    expect(getValue(mine, at("B1"))).toBe("theirs");
    expect(undo.canUndo()).toBe(false);
  });

  it("does not revert a cell someone else overwrote after me", () => {
    const mine = new Y.Doc();
    const theirs = new Y.Doc();
    const undo = createUndoManager(mine);

    setValue(mine, at("A1"), "old", User);
    setValue(mine, at("A1"), "mine", User);
    deliver(mine, theirs);
    setValue(theirs, at("A1"), "theirs", User);
    deliver(theirs, mine);

    undo.undo();
    expect(getValue(mine, at("A1"))).toBe("theirs");
  });

  it("makes each edit its own undo step, even when made quickly", () => {
    const doc = new Y.Doc();
    const undo = createUndoManager(doc);
    setValue(doc, at("A1"), "1", User);
    setValue(doc, at("A2"), "2", User);

    undo.undo();
    expect(getValue(doc, at("A1"))).toBe("1");
    expect(getValue(doc, at("A2"))).toBe("");
  });

  it("reverts an applied AI result with a single undo", () => {
    const doc = new Y.Doc();
    const undo = createUndoManager(doc);
    setValue(doc, at("A1"), "before", User);

    writeValues(
      doc,
      [
        { coord: at("A1"), value: "ai 1" },
        { coord: at("A2"), value: "ai 2" },
        { coord: at("A3"), value: "ai 3" },
      ],
      Ai,
    );
    undo.undo();
    expect([getValue(doc, at("A1")), getValue(doc, at("A2")), getValue(doc, at("A3"))]).toEqual([
      "before",
      "",
      "",
    ]);

    undo.redo();
    expect(getValue(doc, at("A3"))).toBe("ai 3");
  });

  it("does not record no-op writes", () => {
    const doc = new Y.Doc();
    const undo = createUndoManager(doc);
    setValue(doc, at("A1"), "same", User);
    setValue(doc, at("A1"), "same", User);
    undo.undo();
    expect(getValue(doc, at("A1"))).toBe("");
    expect(undo.canUndo()).toBe(false);
  });

  it("undoes format changes", () => {
    const doc = new Y.Doc();
    const undo = createUndoManager(doc);
    toggleFormat(doc, parseRangeA1("A1:B2")!, "bold", User);
    undo.undo();
    expect(getFormat(doc, at("B2"))).toEqual({});
  });
});
