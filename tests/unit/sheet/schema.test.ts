import { describe, expect, it } from "vitest";
import { defaultAlignment, isSheetCellA1 } from "@/lib/sheet/schema";

describe("defaultAlignment", () => {
  it.each(["42", "-3.5", "+7", "1,250", "12%", "1,234,567.89"])("숫자 %s는 오른쪽", (value) => {
    expect(defaultAlignment(value)).toBe("right");
  });

  it.each(["", "abc", "1,25", "12a", "1.2.3", "$100"])("숫자가 아닌 %s는 왼쪽", (value) => {
    expect(defaultAlignment(value)).toBe("left");
  });
});

describe("isSheetCellA1", () => {
  it("시트 안의 정규 표기만 받는다", () => {
    expect(isSheetCellA1("A1")).toBe(true);
    expect(isSheetCellA1("Z100")).toBe(true);
  });

  it.each(["AA1", "A101", "A0", "a1", "$A$1", " A1", "A1:B2", ""])("%s는 거절한다", (input) => {
    expect(isSheetCellA1(input)).toBe(false);
  });
});
