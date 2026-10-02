import { describe, expect, it } from "vitest";
import {
  colToLabel,
  labelToCol,
  normalizeRange,
  parseA1,
  parseRangeA1,
  rangeContains,
  rangeToA1,
  toA1,
} from "./address";

describe("colToLabel / labelToCol", () => {
  it.each([
    [0, "A"],
    [25, "Z"],
    [26, "AA"],
    [51, "AZ"],
    [52, "BA"],
    [701, "ZZ"],
    [702, "AAA"],
  ])("%i ↔ %s", (col, label) => {
    expect(colToLabel(col)).toBe(label);
    expect(labelToCol(label)).toBe(col);
  });

  it("rejects invalid input", () => {
    expect(() => colToLabel(-1)).toThrow(RangeError);
    expect(() => colToLabel(1.5)).toThrow(RangeError);
    expect(labelToCol("")).toBeNull();
    expect(labelToCol("A1")).toBeNull();
  });
});

describe("parseA1 / toA1", () => {
  it("round-trips", () => {
    expect(parseA1("A1")).toEqual({ row: 0, col: 0 });
    expect(parseA1("c10")).toEqual({ row: 9, col: 2 });
    expect(parseA1(" $B$2 ")).toEqual({ row: 1, col: 1 });
    expect(toA1({ row: 9, col: 2 })).toBe("C10");
  });

  it("returns null for malformed addresses", () => {
    for (const bad of ["", "1A", "A0", "A", "12", "A1B", "A-1"]) {
      expect(parseA1(bad)).toBeNull();
    }
  });
});

describe("ranges", () => {
  it("normalizes regardless of drag direction", () => {
    expect(normalizeRange({ row: 3, col: 2 }, { row: 1, col: 0 })).toEqual({
      start: { row: 1, col: 0 },
      end: { row: 3, col: 2 },
    });
  });

  it("parses and formats", () => {
    const range = parseRangeA1("C3:A1");
    expect(range).toEqual({ start: { row: 0, col: 0 }, end: { row: 2, col: 2 } });
    expect(rangeToA1(range!)).toBe("A1:C3");
    expect(rangeToA1(parseRangeA1("B2")!)).toBe("B2");
    expect(parseRangeA1("A1:B2:C3")).toBeNull();
    expect(parseRangeA1("A1:")).toBeNull();
  });

  it("checks containment", () => {
    const range = parseRangeA1("B2:C3")!;
    expect(rangeContains(range, { row: 1, col: 1 })).toBe(true);
    expect(rangeContains(range, { row: 2, col: 2 })).toBe(true);
    expect(rangeContains(range, { row: 0, col: 1 })).toBe(false);
    expect(rangeContains(range, { row: 1, col: 3 })).toBe(false);
  });
});
