// [흐름 1 · c9498cf] 첫 코드. 모든 모듈이 셀 주소를 쓰므로, 아무것도 import하지 않는 가장 아래 모듈부터 만듦.
/*
 * 셀 주소를 두 가지 모양으로 다루고 서로 바꿔 준다.
 *   - A1 표기("B2", "A1:C3"): 사람이 읽는 모양. Y.Doc의 키, AI와 주고받는 주소, 화면 표시에 쓴다.
 *   - 좌표(CellCoord { row, col }, CellRange): 계산하는 모양. 선택, 이동, 위치 계산에 쓴다.
 * 행은 A1 표기에서 1부터, 좌표에서 0부터 센다. 변환 함수가 이 차이를 맡는다.
 * 아무것도 import하지 않는 순수 함수 모듈이라 서버 코드(프롬프트, 가짜 API)에서도 그대로 쓴다.
 */

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

/** 열 번호를 열 이름으로 바꿈(0 → "A", 25 → "Z", 26 → "AA"). 엑셀 열 이름에는 0에 해당하는 글자가 없어서 일반 26진법과 다르게 계산함. */
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

/** 열 이름을 열 번호로 바꿈("A" → 0, "AA" → 26). 소문자도 받고, 잘못된 입력이면 null. */
export function labelToCol(label: string): number | null {
  if (!/^[A-Za-z]+$/.test(label)) return null;
  let n = 0;
  for (const ch of label.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

/** 좌표를 "B2" 같은 A1 표기로 바꿈. */
export function toA1({ row, col }: CellCoord): string {
  return `${colToLabel(col)}${row + 1}`;
}

/** "B2" 같은 주소를 좌표({ row: 1, col: 1 })로 바꿈. 사람이나 AI가 쓴 주소가 들어오는 입구라 공백·소문자·$ 절대참조 표기도 받고, 그 외 형식이면 null. */
export function parseA1(input: string): CellCoord | null {
  const match = /^\$?([A-Za-z]+)\$?(\d+)$/.exec(input.trim());
  if (!match) return null;
  const col = labelToCol(match[1]);
  const rowNumber = Number(match[2]);
  if (col === null || rowNumber < 1) return null;
  return { row: rowNumber - 1, col };
}

/** 두 꼭짓점을 어떤 순서로 받아도 start가 왼쪽 위, end가 오른쪽 아래가 되게 정리함(아래에서 위로 드래그한 경우). */
export function normalizeRange(a: CellCoord, b: CellCoord): CellRange {
  return {
    start: { row: Math.min(a.row, b.row), col: Math.min(a.col, b.col) },
    end: { row: Math.max(a.row, b.row), col: Math.max(a.col, b.col) },
  };
}

/** "A1:C3"이나 단일 셀 "B2"를 정리된 범위로 바꿈. 거꾸로 써도("C3:A1") 같은 결과. 잘못된 형식이면 null. */
export function parseRangeA1(input: string): CellRange | null {
  const parts = input.split(":");
  if (parts.length > 2) return null;
  const a = parseA1(parts[0]);
  const b = parts.length === 2 ? parseA1(parts[1]) : a;
  if (!a || !b) return null;
  return normalizeRange(a, b);
}

/** 범위를 문자열로 바꿈. 셀 하나면 "B2", 아니면 "A1:C3". */
export function rangeToA1({ start, end }: CellRange): string {
  const s = toA1(start);
  const e = toA1(end);
  return s === e ? s : `${s}:${e}`;
}

/** 셀이 범위 안에 있는지. */
export function rangeContains({ start, end }: CellRange, { row, col }: CellCoord): boolean {
  return start.row <= row && row <= end.row && start.col <= col && col <= end.col;
}

/** 여러 셀을 모두 감싸는 가장 작은 범위(예: AI가 바꾼 셀들의 전체 영역). 셀이 없으면 null. */
export function boundingRange(coords: readonly CellCoord[]): CellRange | null {
  if (coords.length === 0) return null;
  let top = Infinity;
  let left = Infinity;
  let bottom = -Infinity;
  let right = -Infinity;
  for (const { row, col } of coords) {
    top = Math.min(top, row);
    left = Math.min(left, col);
    bottom = Math.max(bottom, row);
    right = Math.max(right, col);
  }
  return { start: { row: top, col: left }, end: { row: bottom, col: right } };
}

/** 범위 안의 셀을 행 순서(왼쪽→오른쪽, 위→아래)로 돌며 fn을 부름. 범위 지우기, 서식 적용에 씀. */
export function forEachCell({ start, end }: CellRange, fn: (coord: CellCoord) => void): void {
  for (let row = start.row; row <= end.row; row++) {
    for (let col = start.col; col <= end.col; col++) {
      fn({ row, col });
    }
  }
}

/** 두 범위가 겹치는 부분. 겹치지 않으면 null. 잠금·AI 작업 범위가 겹치는지 볼 때 씀. */
export function intersectRanges(a: CellRange, b: CellRange): CellRange | null {
  const start = {
    row: Math.max(a.start.row, b.start.row),
    col: Math.max(a.start.col, b.start.col),
  };
  const end = { row: Math.min(a.end.row, b.end.row), col: Math.min(a.end.col, b.end.col) };
  if (start.row > end.row || start.col > end.col) return null;
  return { start, end };
}
