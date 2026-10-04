import type { CellCoord } from "@/lib/sheet/address";
import {
  COL_HEADER_HEIGHT,
  COL_WIDTH,
  ROW_HEADER_WIDTH,
  ROW_HEIGHT,
  cellRect,
} from "@/lib/sheet/geometry";
import type { PointerTargetKind } from "@/lib/controller/sheet-controller";
import { clampCoord } from "@/lib/sheet/selection";

/** 고정 머리글에 가리는 부분은 빼고 계산한다. */

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

export function visibleRowCount(scroller: HTMLElement | null): number {
  if (!scroller) return 10;
  return Math.max(1, Math.floor((scroller.clientHeight - COL_HEADER_HEIGHT) / ROW_HEIGHT) - 1);
}

/** 머리글은 화면에 고정돼 있어 스크롤 영역 기준으로, 셀은 콘텐츠 기준으로 계산한다. */
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
  const kind: PointerTargetKind =
    inColHeader && inRowHeader ? "corner" : inColHeader ? "col" : inRowHeader ? "row" : "cell";
  return { kind, coord };
}
