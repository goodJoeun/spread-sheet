import type { CellCoord } from "./address";
import { COL_HEADER_HEIGHT, COL_WIDTH, ROW_HEADER_WIDTH, ROW_HEIGHT, cellRect } from "./geometry";
import { clampCoord } from "./selection";

/** 화면에 고정된 머리글에 가려지는 부분은 빼고 계산함. */

/** 그리드에서 누른 곳: 셀, 행 머리글, 열 머리글, 왼쪽 위 모서리 */
export type PointerTargetKind = "cell" | "row" | "col" | "corner";

export function revealCell(scroller: HTMLElement | null, coord: CellCoord): void {
  if (!scroller) return;
  const rect = cellRect(coord);
  const viewLeft = scroller.scrollLeft + ROW_HEADER_WIDTH;
  const viewTop = scroller.scrollTop + COL_HEADER_HEIGHT;
  if (rect.left < viewLeft) scroller.scrollLeft = rect.left - ROW_HEADER_WIDTH;
  else if (rect.left + rect.width > scroller.scrollLeft + scroller.clientWidth) {
    scroller.scrollLeft = rect.left + rect.width - scroller.clientWidth;
  }
  if (rect.top < viewTop) scroller.scrollTop = rect.top - COL_HEADER_HEIGHT;
  else if (rect.top + rect.height > scroller.scrollTop + scroller.clientHeight) {
    scroller.scrollTop = rect.top + rect.height - scroller.clientHeight;
  }
}

/** 화면 높이를 알 수 없을 때(그리드가 아직 없거나 테스트) PageUp/Down으로 움직이는 행 수 */
export const DEFAULT_PAGE_ROWS = 10;

export function visibleRowCount(scroller: HTMLElement | null): number {
  if (!scroller) return DEFAULT_PAGE_ROWS;
  return Math.max(1, Math.floor((scroller.clientHeight - COL_HEADER_HEIGHT) / ROW_HEIGHT) - 1);
}

/** 머리글은 화면에 고정돼 있어서 스크롤 영역 기준으로, 셀은 콘텐츠 기준으로 계산함. */
export function hitTest(
  scroller: HTMLElement,
  content: HTMLElement,
  clientX: number,
  clientY: number,
): { kind: PointerTargetKind; coord: CellCoord } {
  const viewport = scroller.getBoundingClientRect();
  const box = content.getBoundingClientRect();
  const inColHeader = clientY - viewport.top < COL_HEADER_HEIGHT;
  const inRowHeader = clientX - viewport.left < ROW_HEADER_WIDTH;
  const coord = clampCoord({
    row: Math.floor((clientY - box.top - COL_HEADER_HEIGHT) / ROW_HEIGHT),
    col: Math.floor((clientX - box.left - ROW_HEADER_WIDTH) / COL_WIDTH),
  });
  return { kind: pointerTargetKind(inColHeader, inRowHeader), coord };
}

function pointerTargetKind(inColHeader: boolean, inRowHeader: boolean): PointerTargetKind {
  if (inColHeader && inRowHeader) return "corner";
  if (inColHeader) return "col";
  if (inRowHeader) return "row";
  return "cell";
}
