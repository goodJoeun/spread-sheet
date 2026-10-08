/*
 * 시트가 지키는 규칙을 한 곳에 모아 둔다. 시트 크기, 서식의 종류와 형식, 기본 정렬, 주소 검증이 여기 있다.
 *   - 화면, AI 프롬프트, 서버 검증이 같은 숫자와 규칙을 쓰므로 다른 곳에 다시 적지 않는다.
 *   - 다른 탭이나 AI에서 온 값은 isSheetCellA1, isValidStyle로 검증한 뒤에 쓴다.
 * Y.Doc에 읽고 쓰는 일은 document.ts가 맡는다. 선택·키 매핑 같은 순수 로직이 Yjs를 끌어오지 않도록 나눠 두었다.
 */

import {
  intersectRanges,
  parseA1,
  rangeContains,
  toA1,
  type CellCoord,
  type CellRange,
} from "./address";

export const ROW_COUNT = 100;
export const COL_COUNT = 26;
export const SHEET_RANGE: CellRange = {
  start: { row: 0, col: 0 },
  end: { row: ROW_COUNT - 1, col: COL_COUNT - 1 },
};

export function isInSheet(coord: CellCoord): boolean {
  return rangeContains(SHEET_RANGE, coord);
}

/** 범위에서 시트 안에 드는 부분. 시트와 겹치지 않으면 null */
export function clipToSheet(range: CellRange): CellRange | null {
  return intersectRanges(range, SHEET_RANGE);
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

/** 시트 안의 셀을 표준 A1 표기(대문자, $ 없음)로 적었는지 확인함. 다른 탭·브라우저에서 온 주소를 검증할 때 씀. */
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

/** 저장소에 들어가는 서식 값의 형식을 검증함. 다른 탭이나 AI에서 온 값도 이 함수를 거침. */
export function isValidStyle(key: StyleKey, value: string): boolean {
  if (key === "align") return (ALIGNMENTS as readonly string[]).includes(value);
  return HEX_COLOR.test(value);
}
