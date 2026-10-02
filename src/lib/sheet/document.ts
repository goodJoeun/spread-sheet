import * as Y from "yjs";
import { forEachCell, intersectRanges, toA1, type CellCoord, type CellRange } from "./address";
import {
  FORMAT_KEYS,
  SHEET_RANGE,
  STYLE_KEYS,
  isInSheet,
  isValidStyle,
  type Alignment,
  type CellFormat,
  type FormatKey,
  type StyleKey,
} from "./schema";

/**
 * 시트 문서(Y.Doc) 읽기·쓰기.
 *
 * 셀마다 중첩 Y.Map을 두지 않고, 최상위 Map 두 개에 속성 단위의 평평한 키로 저장한다.
 *   values:  "B2"      → "100"
 *   formats: "B2.bold" → true, "B2.color" → "#cc0000"
 * 빈 셀에 두 탭이 동시에 처음 쓰는 경우(한쪽은 값, 한쪽은 서식), 중첩 Map이면 각자 새 Map을 만들어
 * 한쪽이 통째로 사라진다. 평평한 키는 서로 다른 키이므로 두 변경이 모두 살아남는다.
 * 시트 크기와 서식 종류는 schema.ts에 있다.
 */

/**
 * 트랜잭션 origin. UndoManager는 이 origin의 변경만 추적하므로,
 * 다른 탭에서 온 변경(origin = provider)이나 저장소에서 불러온 변경은 실행 취소 대상이 아니다.
 */
export const EditOrigin = {
  User: "user-edit",
  Ai: "ai-apply",
} as const;
export type EditOrigin = (typeof EditOrigin)[keyof typeof EditOrigin];

export function valuesOf(doc: Y.Doc): Y.Map<string> {
  return doc.getMap<string>("values");
}

export function formatsOf(doc: Y.Doc): Y.Map<true | string> {
  return doc.getMap<true | string>("formats");
}

const formatKey = (cell: string, key: FormatKey | StyleKey) => `${cell}.${key}`;

export function getValue(doc: Y.Doc, coord: CellCoord): string {
  return valuesOf(doc).get(toA1(coord)) ?? "";
}

export function getFormat(doc: Y.Doc, coord: CellCoord): CellFormat {
  const formats = formatsOf(doc);
  const cell = toA1(coord);
  const format: CellFormat = {};
  for (const key of FORMAT_KEYS) {
    if (formats.get(formatKey(cell, key)) === true) format[key] = true;
  }
  for (const key of STYLE_KEYS) {
    const value = formats.get(formatKey(cell, key));
    if (typeof value === "string" && isValidStyle(key, value)) {
      if (key === "align") format.align = value as Alignment;
      else format[key] = value;
    }
  }
  return format;
}

export interface CellWrite {
  coord: CellCoord;
  value: string;
}

/**
 * 여러 셀 값을 하나의 트랜잭션으로 쓴다(= 실행 취소 한 단계).
 * 빈 문자열은 키를 지우고, 현재 값과 같은 셀과 시트 밖 좌표는 건너뛴다.
 * 변경 없는 쓰기가 실행 취소 기록에 빈 단계로 남지 않게 하기 위해서다.
 * @returns 실제로 바뀐 셀 수
 */
export function writeValues(doc: Y.Doc, writes: readonly CellWrite[], origin: EditOrigin): number {
  const values = valuesOf(doc);
  let changed = 0;
  doc.transact(() => {
    for (const { coord, value } of writes) {
      if (!isInSheet(coord)) continue;
      const key = toA1(coord);
      if ((values.get(key) ?? "") === value) continue;
      if (value === "") values.delete(key);
      else values.set(key, value);
      changed++;
    }
  }, origin);
  return changed;
}

export function setValue(doc: Y.Doc, coord: CellCoord, value: string, origin: EditOrigin): boolean {
  return writeValues(doc, [{ coord, value }], origin) > 0;
}

/** 범위의 값만 지운다. 서식은 유지한다(엑셀·구글시트의 Delete 키와 같은 동작). */
export function clearValues(doc: Y.Doc, range: CellRange, origin: EditOrigin): number {
  const clipped = intersectRanges(range, SHEET_RANGE);
  if (!clipped) return 0;
  const writes: CellWrite[] = [];
  forEachCell(clipped, (coord) => writes.push({ coord, value: "" }));
  return writeValues(doc, writes, origin);
}

/** 범위의 모든 셀에 서식이 켜져 있는지. 툴바 활성 표시와 토글 방향 결정에 쓴다. */
export function hasFormatEverywhere(doc: Y.Doc, range: CellRange, key: FormatKey): boolean {
  const clipped = intersectRanges(range, SHEET_RANGE);
  if (!clipped) return false;
  const formats = formatsOf(doc);
  let everywhere = true;
  forEachCell(clipped, (coord) => {
    if (everywhere && !formats.get(formatKey(toA1(coord), key))) everywhere = false;
  });
  return everywhere;
}

export function setFormat(
  doc: Y.Doc,
  range: CellRange,
  key: FormatKey,
  enabled: boolean,
  origin: EditOrigin,
): void {
  const clipped = intersectRanges(range, SHEET_RANGE);
  if (!clipped) return;
  const formats = formatsOf(doc);
  doc.transact(() => {
    forEachCell(clipped, (coord) => {
      const k = formatKey(toA1(coord), key);
      const current = formats.get(k) === true;
      if (current === enabled) return;
      if (enabled) formats.set(k, true);
      else formats.delete(k);
    });
  }, origin);
}

/**
 * 구글시트와 같은 토글 규칙: 범위 전체에 이미 켜져 있으면 끄고, 하나라도 꺼져 있으면 모두 켠다.
 * @returns 적용 후 상태
 */
export function toggleFormat(
  doc: Y.Doc,
  range: CellRange,
  key: FormatKey,
  origin: EditOrigin,
): boolean {
  const enabled = !hasFormatEverywhere(doc, range, key);
  setFormat(doc, range, key, enabled, origin);
  return enabled;
}

/** 범위에 값 서식(글자색·채우기·정렬)을 적용한다. null이면 기본값으로 되돌린다. 잘못된 값은 무시한다. */
export function setStyle(
  doc: Y.Doc,
  range: CellRange,
  key: StyleKey,
  value: string | null,
  origin: EditOrigin,
): void {
  if (value !== null && !isValidStyle(key, value)) return;
  const clipped = intersectRanges(range, SHEET_RANGE);
  if (!clipped) return;
  const formats = formatsOf(doc);
  doc.transact(() => {
    forEachCell(clipped, (coord) => {
      const k = formatKey(toA1(coord), key);
      const current = formats.get(k);
      if ((current ?? null) === value) return;
      if (value === null) formats.delete(k);
      else formats.set(k, value);
    });
  }, origin);
}

/** 범위 전체가 같은 값을 가지면 그 값, 섞여 있거나 기본값이면 null. 툴바 표시에 쓴다. */
export function commonStyle(doc: Y.Doc, range: CellRange, key: StyleKey): string | null {
  const clipped = intersectRanges(range, SHEET_RANGE);
  if (!clipped) return null;
  const formats = formatsOf(doc);
  let common: string | null | undefined;
  forEachCell(clipped, (coord) => {
    if (common === null) return;
    const value = formats.get(formatKey(toA1(coord), key));
    const normalized = typeof value === "string" ? value : null;
    common = common === undefined || common === normalized ? normalized : null;
  });
  return common ?? null;
}

/** 범위의 서식을 모두 지운다. 값은 그대로 둔다. */
export function clearFormats(doc: Y.Doc, range: CellRange, origin: EditOrigin): void {
  const clipped = intersectRanges(range, SHEET_RANGE);
  if (!clipped) return;
  const formats = formatsOf(doc);
  doc.transact(() => {
    forEachCell(clipped, (coord) => {
      const cell = toA1(coord);
      for (const key of [...FORMAT_KEYS, ...STYLE_KEYS]) {
        const k = formatKey(cell, key);
        if (formats.has(k)) formats.delete(k);
      }
    });
  }, origin);
}
