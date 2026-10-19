import { normalizeRange, type CellCoord, type CellRange } from "./address";
import { COL_COUNT, ROW_COUNT, SHEET_RANGE, isInSheet } from "./schema";

/**
 * anchor: 범위 선택을 시작한 고정 꼭짓점
 * focus: Shift+방향키나 드래그로 움직이는 꼭짓점
 * active: 입력이 들어가는 셀(범위 안에서 Enter/Tab으로 옮겨 다님)
 */
export interface Selection {
  anchor: CellCoord;
  focus: CellCoord;
  active: CellCoord;
}

/** 좌표를 시트 경계 안으로 맞춤. */
export function clampCoord({ row, col }: CellCoord): CellCoord {
  return {
    row: Math.min(Math.max(row, 0), ROW_COUNT - 1),
    col: Math.min(Math.max(col, 0), COL_COUNT - 1),
  };
}

/** 한 셀만 고른 선택(anchor·focus·active가 모두 같음). */
export function collapsedSelection(coord: CellCoord): Selection {
  const c = clampCoord(coord);
  return { anchor: c, focus: c, active: c };
}

/** 드래그 방향과 상관없이 정리된 선택 범위. */
export function selectionRange(selection: Selection): CellRange {
  return normalizeRange(selection.anchor, selection.focus);
}

/** 두 셀 이상 골랐는지. */
export function isMultiCell(selection: Selection): boolean {
  const { anchor, focus } = selection;
  return anchor.row !== focus.row || anchor.col !== focus.col;
}

/** 같은 셀인지. */
export function sameCoord(a: CellCoord, b: CellCoord): boolean {
  return a.row === b.row && a.col === b.col;
}

/** 범위를 풀고 active 셀을 기준으로 이동함(방향키). */
export function moveSelection(selection: Selection, dRow: number, dCol: number): Selection {
  const { active } = selection;
  return collapsedSelection({ row: active.row + dRow, col: active.col + dCol });
}

/** active는 두고 끝점(focus)만 움직여 범위를 늘리거나 줄임(Shift+방향키). */
export function extendSelection(selection: Selection, dRow: number, dCol: number): Selection {
  const { focus } = selection;
  return { ...selection, focus: clampCoord({ row: focus.row + dRow, col: focus.col + dCol }) };
}

/** 끝점을 그 셀로 옮김(Shift+클릭, 드래그). */
export function extendSelectionTo(selection: Selection, focus: CellCoord): Selection {
  return { ...selection, focus: clampCoord(focus) };
}

/** 범위는 그대로 두고 active만 옮김. Enter는 열 방향, Tab은 행 방향으로 돌고, 끝에 닿으면 처음으로 돌아감(엑셀과 같음). */
export function advanceWithinRange(selection: Selection, dRow: number, dCol: number): Selection {
  const { start, end } = selectionRange(selection);
  const rows = end.row - start.row + 1;
  const cols = end.col - start.col + 1;
  const total = rows * cols;
  const { row, col } = selection.active;

  let index: number;
  let toCoord: (i: number) => CellCoord;
  if (dRow !== 0) {
    index = (col - start.col) * rows + (row - start.row);
    toCoord = (i) => ({ row: start.row + (i % rows), col: start.col + Math.floor(i / rows) });
  } else {
    index = (row - start.row) * cols + (col - start.col);
    toCoord = (i) => ({ row: start.row + Math.floor(i / cols), col: start.col + (i % cols) });
  }
  const step = dRow + dCol > 0 ? 1 : -1;
  const next = (((index + step) % total) + total) % total;
  return { ...selection, active: toCoord(next) };
}

/** Ctrl+방향키의 목적지(엑셀 규칙). 지금 셀과 다음 셀이 모두 차 있으면 이어진 데이터 블록의 끝, 그 외에는 그 방향의 다음 차 있는 셀, 없으면 시트 끝. */
export function jumpTarget(
  start: CellCoord,
  dRow: number,
  dCol: number,
  isFilled: (coord: CellCoord) => boolean,
): CellCoord {
  const step = (c: CellCoord) => ({ row: c.row + dRow, col: c.col + dCol });

  let current = step(start);
  if (!isInSheet(current)) return start;

  if (isFilled(start) && isFilled(current)) {
    for (let next = step(current); isInSheet(next) && isFilled(next); next = step(next)) {
      current = next;
    }
    return current;
  }
  while (!isFilled(current)) {
    const next = step(current);
    if (!isInSheet(next)) return current;
    current = next;
  }
  return current;
}

/** 시트 전체를 고름. active는 그대로 둠. */
export function selectAll(selection: Selection): Selection {
  return { anchor: SHEET_RANGE.start, focus: SHEET_RANGE.end, active: selection.active };
}

/** 행 전체를 고름(행 머리글 클릭·드래그). */
export function selectRows(fromRow: number, toRow: number): Selection {
  const anchor = clampCoord({ row: fromRow, col: 0 });
  return { anchor, active: anchor, focus: clampCoord({ row: toRow, col: COL_COUNT - 1 }) };
}

/** 열 전체를 고름(열 머리글 클릭·드래그). */
export function selectColumns(fromCol: number, toCol: number): Selection {
  const anchor = clampCoord({ row: 0, col: fromCol });
  return { anchor, active: anchor, focus: clampCoord({ row: ROW_COUNT - 1, col: toCol }) };
}
