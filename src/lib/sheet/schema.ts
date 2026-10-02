import { rangeContains, type CellCoord, type CellRange } from "./address";

/**
 * 시트의 형태(크기)와 서식 종류. 저장 방식(Yjs)과 무관한 정의만 둔다.
 * 선택·키 매핑·좌표 계산 같은 순수 로직이 Yjs를 끌어오지 않고 이 파일만 보면 되게 하기 위해서다.
 */

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
