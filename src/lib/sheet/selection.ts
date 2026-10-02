import { normalizeRange, type CellCoord, type CellRange } from "./address";
import { COL_COUNT, ROW_COUNT } from "./document";

/**
 * 선택 상태.
 * - anchor: 범위 선택을 시작한 고정 꼭짓점
 * - focus: Shift+방향키·드래그로 움직이는 반대쪽 꼭짓점
 * - active: 입력이 들어가는 셀. 보통 anchor와 같고, 범위 안에서 Enter/Tab으로 옮겨 다닌다.
 */
export interface Selection {
  anchor: CellCoord;
  focus: CellCoord;
  active: CellCoord;
}

export function clampCoord({ row, col }: CellCoord): CellCoord {
  return {
    row: Math.min(Math.max(row, 0), ROW_COUNT - 1),
    col: Math.min(Math.max(col, 0), COL_COUNT - 1),
  };
}

export function collapsedSelection(coord: CellCoord): Selection {
  const c = clampCoord(coord);
  return { anchor: c, focus: c, active: c };
}

export function selectionRange(selection: Selection): CellRange {
  return normalizeRange(selection.anchor, selection.focus);
}

export function isMultiCell(selection: Selection): boolean {
  const { anchor, focus } = selection;
  return anchor.row !== focus.row || anchor.col !== focus.col;
}

export function sameCoord(a: CellCoord, b: CellCoord): boolean {
  return a.row === b.row && a.col === b.col;
}

/** 범위를 해제하고 active 셀 기준으로 이동한다. */
export function moveSelection(selection: Selection, dRow: number, dCol: number): Selection {
  const { active } = selection;
  return collapsedSelection({ row: active.row + dRow, col: active.col + dCol });
}

/** anchor는 고정하고 focus만 움직여 범위를 넓히거나 줄인다. */
export function extendSelection(selection: Selection, dRow: number, dCol: number): Selection {
  const { focus } = selection;
  return { ...selection, focus: clampCoord({ row: focus.row + dRow, col: focus.col + dCol }) };
}

export function extendSelectionTo(selection: Selection, focus: CellCoord): Selection {
  return { ...selection, focus: clampCoord(focus) };
}

/**
 * 범위 안에서 Enter/Tab으로 active 셀을 옮긴다(엑셀·구글시트와 같은 동작).
 * Enter(세로)는 열 단위로, Tab(가로)은 행 단위로 순회하고 끝에 닿으면 처음으로 돌아간다.
 */
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

/**
 * Ctrl+방향키 이동 목적지(엑셀 규칙).
 * - 지금 셀과 다음 셀이 모두 채워져 있으면: 이어진 데이터 블록의 끝
 * - 그 외: 그 방향의 다음 채워진 셀, 없으면 시트 끝
 */
export function jumpTarget(
  start: CellCoord,
  dRow: number,
  dCol: number,
  isFilled: (coord: CellCoord) => boolean,
): CellCoord {
  const step = (c: CellCoord) => ({ row: c.row + dRow, col: c.col + dCol });
  const inSheet = (c: CellCoord) =>
    c.row >= 0 && c.row < ROW_COUNT && c.col >= 0 && c.col < COL_COUNT;

  let current = step(start);
  if (!inSheet(current)) return start;

  if (isFilled(start) && isFilled(current)) {
    for (let next = step(current); inSheet(next) && isFilled(next); next = step(next)) {
      current = next;
    }
    return current;
  }
  while (!isFilled(current)) {
    const next = step(current);
    if (!inSheet(next)) return current;
    current = next;
  }
  return current;
}

export function selectAll(selection: Selection): Selection {
  return {
    anchor: { row: 0, col: 0 },
    focus: { row: ROW_COUNT - 1, col: COL_COUNT - 1 },
    active: selection.active,
  };
}

export function selectRows(fromRow: number, toRow: number): Selection {
  const anchor = clampCoord({ row: fromRow, col: 0 });
  return { anchor, active: anchor, focus: clampCoord({ row: toRow, col: COL_COUNT - 1 }) };
}

export function selectColumns(fromCol: number, toCol: number): Selection {
  const anchor = clampCoord({ row: 0, col: fromCol });
  return { anchor, active: anchor, focus: clampCoord({ row: ROW_COUNT - 1, col: toCol }) };
}
