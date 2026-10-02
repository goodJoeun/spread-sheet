import type { CellCoord, CellRange } from "./address";

/** 그리드 치수(px). 열 너비 조절을 넣기 전까지는 모든 열·행 크기가 같다. */
export const COL_WIDTH = 100;
export const ROW_HEIGHT = 24;
export const ROW_HEADER_WIDTH = 46;
export const COL_HEADER_HEIGHT = 24;

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 그리드 콘텐츠 좌표계(헤더 포함, 스크롤 무관)에서 셀의 위치. */
export function cellRect({ row, col }: CellCoord): Rect {
  return {
    left: ROW_HEADER_WIDTH + col * COL_WIDTH,
    top: COL_HEADER_HEIGHT + row * ROW_HEIGHT,
    width: COL_WIDTH,
    height: ROW_HEIGHT,
  };
}

/**
 * 셀 테두리(1px 격자선)까지 덮도록 위·왼쪽으로 1px 넓힌 사각형.
 * 선택 테두리, 다른 참여자 커서, 편집칸처럼 셀 위에 겹쳐 그리는 것은 모두 이 위치를 쓴다.
 */
export function outsetRect({ left, top, width, height }: Rect): Rect {
  return { left: left - 1, top: top - 1, width: width + 1, height: height + 1 };
}

export function rangeRect({ start, end }: CellRange): Rect {
  const a = cellRect(start);
  return {
    left: a.left,
    top: a.top,
    width: (end.col - start.col + 1) * COL_WIDTH,
    height: (end.row - start.row + 1) * ROW_HEIGHT,
  };
}
