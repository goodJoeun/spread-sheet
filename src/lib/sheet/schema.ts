import { parseA1, rangeContains, toA1, type CellCoord, type CellRange } from "./address";

/** 순수 로직(선택·키 매핑·좌표)이 Yjs를 끌어오지 않도록 document.ts와 나눠 둔다. */

export const ROW_COUNT = 100;
export const COL_COUNT = 26;
export const SHEET_RANGE: CellRange = {
  start: { row: 0, col: 0 },
  end: { row: ROW_COUNT - 1, col: COL_COUNT - 1 },
};

export function isInSheet(coord: CellCoord): boolean {
  return rangeContains(SHEET_RANGE, coord);
}

/** 켜고 끄는 서식 */
export const FORMAT_KEYS = ["bold", "italic", "underline", "strike"] as const;
export type FormatKey = (typeof FORMAT_KEYS)[number];

/** 값을 갖는 서식 */
export const STYLE_KEYS = ["color", "fill", "align"] as const;
export type StyleKey = (typeof STYLE_KEYS)[number];
export const ALIGNMENTS = ["left", "center", "right"] as const;
export type Alignment = (typeof ALIGNMENTS)[number];

const NUMBER_PATTERN = /^[-+]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?%?$/;

/** 정렬을 지정하지 않은 셀: 스프레드시트 관례대로 숫자는 오른쪽, 글자는 왼쪽 */
export function defaultAlignment(value: string): Alignment {
  return NUMBER_PATTERN.test(value) ? "right" : "left";
}

/** 시트 안의 셀을 정규 A1 표기(대문자, $ 없음)로 적었는지. 다른 탭·브라우저에서 온 주소를 검증할 때 쓴다. */
export function isSheetCellA1(input: string): boolean {
  const coord = parseA1(input);
  return coord !== null && isInSheet(coord) && toA1(coord) === input;
}

export interface CellFormat extends Partial<Record<FormatKey, true>> {
  color?: string;
  fill?: string;
  align?: Alignment;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** 저장소에 들어가는 서식 값은 형식을 검증한다(다른 탭·AI에서 온 값도 같은 함수를 거친다). */
export function isValidStyle(key: StyleKey, value: string): boolean {
  if (key === "align") return (ALIGNMENTS as readonly string[]).includes(value);
  return HEX_COLOR.test(value);
}
