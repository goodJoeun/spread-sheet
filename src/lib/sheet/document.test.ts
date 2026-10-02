import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { parseA1, parseRangeA1, type CellCoord } from "./address";
import {
  EditOrigin,
  clearValues,
  getFormat,
  getValue,
  hasFormatEverywhere,
  setFormat,
  setValue,
  toggleFormat,
  valuesOf,
  writeValues,
} from "./document";

const at = (a1: string): CellCoord => parseA1(a1)!;
const range = (a1: string) => parseRangeA1(a1)!;
const { User } = EditOrigin;

/** 두 문서가 서로의 변경을 모두 받게 한다(네트워크 왕복 한 번에 해당). */
function exchange(a: Y.Doc, b: Y.Doc) {
  const fromA = Y.encodeStateAsUpdate(a, Y.encodeStateVector(b));
  const fromB = Y.encodeStateAsUpdate(b, Y.encodeStateVector(a));
  Y.applyUpdate(b, fromA, "remote");
  Y.applyUpdate(a, fromB, "remote");
}

describe("values", () => {
  it("reads empty string for untouched cells", () => {
    expect(getValue(new Y.Doc(), at("A1"))).toBe("");
  });

  it("writes and clears with an empty string", () => {
    const doc = new Y.Doc();
    expect(setValue(doc, at("B2"), "hello", User)).toBe(true);
    expect(getValue(doc, at("B2"))).toBe("hello");
    expect(setValue(doc, at("B2"), "", User)).toBe(true);
    expect(valuesOf(doc).has("B2")).toBe(false);
  });

  it("skips no-op writes and cells outside the sheet", () => {
    const doc = new Y.Doc();
    setValue(doc, at("A1"), "x", User);
    const changed = writeValues(
      doc,
      [
        { coord: at("A1"), value: "x" },
        { coord: at("ZZ1"), value: "out" },
        { coord: { row: -1, col: 0 }, value: "out" },
        { coord: at("A2"), value: "new" },
      ],
      User,
    );
    expect(changed).toBe(1);
    expect(valuesOf(doc).size).toBe(2);
  });

  it("clears values but keeps formats", () => {
    const doc = new Y.Doc();
    setValue(doc, at("A1"), "1", User);
    setValue(doc, at("B2"), "2", User);
    setFormat(doc, range("A1"), "bold", true, User);
    expect(clearValues(doc, range("A1:B2"), User)).toBe(2);
    expect(getValue(doc, at("A1"))).toBe("");
    expect(getFormat(doc, at("A1"))).toEqual({ bold: true });
  });
});

describe("formats", () => {
  it("toggles like Google Sheets: on unless already on everywhere", () => {
    const doc = new Y.Doc();
    setFormat(doc, range("A1"), "bold", true, User);
    // A1만 굵게 → 범위 전체를 굵게
    expect(toggleFormat(doc, range("A1:A3"), "bold", User)).toBe(true);
    expect(hasFormatEverywhere(doc, range("A1:A3"), "bold")).toBe(true);
    // 전체가 굵게 → 전체 해제
    expect(toggleFormat(doc, range("A1:A3"), "bold", User)).toBe(false);
    expect(getFormat(doc, at("A2"))).toEqual({});
  });

  it("keeps independent format keys per cell", () => {
    const doc = new Y.Doc();
    setFormat(doc, range("C3"), "bold", true, User);
    setFormat(doc, range("C3"), "italic", true, User);
    setFormat(doc, range("C3"), "bold", false, User);
    expect(getFormat(doc, at("C3"))).toEqual({ italic: true });
  });
});

describe("concurrent edits", () => {
  it("keeps both a value and a format written to the same empty cell", () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    setValue(a, at("B2"), "100", User);
    setFormat(b, range("B2"), "bold", true, User);
    exchange(a, b);
    for (const doc of [a, b]) {
      expect(getValue(doc, at("B2"))).toBe("100");
      expect(getFormat(doc, at("B2"))).toEqual({ bold: true });
    }
  });

  it("keeps different formats applied concurrently", () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    setFormat(a, range("A1:B2"), "bold", true, User);
    setFormat(b, range("B2:C3"), "italic", true, User);
    exchange(a, b);
    for (const doc of [a, b]) {
      expect(getFormat(doc, at("B2"))).toEqual({ bold: true, italic: true });
      expect(getFormat(doc, at("A1"))).toEqual({ bold: true });
      expect(getFormat(doc, at("C3"))).toEqual({ italic: true });
    }
  });

  it("converges when two participants write the same cell", () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    setValue(a, at("A1"), "from A", User);
    setValue(b, at("A1"), "from B", User);
    exchange(a, b);
    expect(getValue(a, at("A1"))).toBe(getValue(b, at("A1")));
    expect(["from A", "from B"]).toContain(getValue(a, at("A1")));
  });
});
