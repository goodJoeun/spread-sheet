/** 0부터 시작하는 행/열 */
export interface CellCoord {
  row: number;
  col: number;
}

/** start <= end로 정리된 사각형 범위 */
export interface CellRange {
  start: CellCoord;
  end: CellCoord;
}

/** 0 → "A", 25 → "Z", 26 → "AA" */
export function colToLabel(col: number): string {
  if (!Number.isInteger(col) || col < 0) {
    throw new RangeError(`Invalid column index: ${col}`);
  }
  let label = "";
  let n = col + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

/** "A" → 0, "AA" → 26. 잘못된 입력이면 null. */
export function labelToCol(label: string): number | null {
  if (!/^[A-Za-z]+$/.test(label)) return null;
  let n = 0;
  for (const ch of label.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

export function toA1({ row, col }: CellCoord): string {
  return `${colToLabel(col)}${row + 1}`;
}

/** "B2" → { row: 1, col: 1 }. 공백·소문자·$ 절대참조 표기는 허용하고, 그 외 형식이면 null. */
export function parseA1(input: string): CellCoord | null {
  const match = /^\$?([A-Za-z]+)\$?(\d+)$/.exec(input.trim());
  if (!match) return null;
  const col = labelToCol(match[1]);
  const rowNumber = Number(match[2]);
  if (col === null || rowNumber < 1) return null;
  return { row: rowNumber - 1, col };
}

export function normalizeRange(a: CellCoord, b: CellCoord): CellRange {
  return {
    start: { row: Math.min(a.row, b.row), col: Math.min(a.col, b.col) },
    end: { row: Math.max(a.row, b.row), col: Math.max(a.col, b.col) },
  };
}

/** "A1:C3" 또는 단일 셀 "B2" → 정규화된 범위. 잘못된 형식이면 null. */
export function parseRangeA1(input: string): CellRange | null {
  const parts = input.split(":");
  if (parts.length > 2) return null;
  const a = parseA1(parts[0]);
  const b = parts.length === 2 ? parseA1(parts[1]) : a;
  if (!a || !b) return null;
  return normalizeRange(a, b);
}

/** 단일 셀 범위면 "B2", 아니면 "A1:C3" */
export function rangeToA1({ start, end }: CellRange): string {
  const s = toA1(start);
  const e = toA1(end);
  return s === e ? s : `${s}:${e}`;
}

export function rangeContains({ start, end }: CellRange, { row, col }: CellCoord): boolean {
  return row >= start.row && row <= end.row && col >= start.col && col <= end.col;
}

/** 범위 안의 셀을 행 우선(좌→우, 위→아래)으로 순회한다. */
export function forEachCell({ start, end }: CellRange, fn: (coord: CellCoord) => void): void {
  for (let row = start.row; row <= end.row; row++) {
    for (let col = start.col; col <= end.col; col++) {
      fn({ row, col });
    }
  }
}

export function intersectRanges(a: CellRange, b: CellRange): CellRange | null {
  const start = {
    row: Math.max(a.start.row, b.start.row),
    col: Math.max(a.start.col, b.start.col),
  };
  const end = { row: Math.min(a.end.row, b.end.row), col: Math.min(a.end.col, b.end.col) };
  if (start.row > end.row || start.col > end.col) return null;
  return { start, end };
}
