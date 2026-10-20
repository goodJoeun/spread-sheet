import * as Y from "yjs";
import { forEachCell, toA1, type CellCoord, type CellRange } from "./address";
import {
  FORMAT_KEYS,
  STYLE_KEYS,
  clipToSheet,
  isInSheet,
  isValidStyle,
  type Alignment,
  type CellFormat,
  type FormatKey,
  type StyleKey,
} from "./schema";

// [결정] 그리드보다 데이터 모양을 먼저 정함. 저장 형식은 나중에 바꾸기 가장 어려운 결정이라서.
/**
 * 셀마다 Y.Map을 따로 두지 않고 평평한 키로 저장함(values "B2" → "100", formats "B2.bold" → true).
 * 빈 셀에 두 탭이 동시에 처음 쓰면, 셀마다 Map을 두는 방식은 각자 새 Map을 만들어 한쪽이 통째로 사라짐.
 * 평평한 키는 서로 다른 키라서 두 변경이 모두 남음.
 */

// [결정] AI 기능을 만들기 전에 'Ai 출처'부터 선언함. 실행 취소 기준은 나중에 바꾸기 어려워 AI 적용 자리를 미리 만듦.
/**
 * 트랜잭션 origin. UndoManager는 이 origin의 변경만 추적함.
 * 그래서 다른 탭에서 온 변경(origin = provider)이나 저장소에서 불러온 변경은 실행 취소 대상이 아님.
 */
export const EditOrigin = {
  User: "user-edit",
  Ai: "ai-apply",
} as const;
export type EditOrigin = (typeof EditOrigin)[keyof typeof EditOrigin];

/** 셀 값을 담은 Map("B2" → "100"). */
export function valuesOf(doc: Y.Doc): Y.Map<string> {
  return doc.getMap<string>("values");
}

/** 셀 서식을 담은 Map("B2.bold" → true, "B2.color" → "#ff0000"). */
export function formatsOf(doc: Y.Doc): Y.Map<true | string> {
  return doc.getMap<true | string>("formats");
}

/** 셀 주소와 서식 이름을 점으로 이음("B2", "bold" → "B2.bold"). */
const formatKey = (cell: string, key: FormatKey | StyleKey) => `${cell}.${key}`;

/** 셀 하나의 값. 없으면 빈 문자열. */
export function getValue(doc: Y.Doc, coord: CellCoord): string {
  return valuesOf(doc).get(toA1(coord)) ?? "";
}

/** 흩어진 서식 키를 모아 셀 하나의 서식 객체로 만듦. 형식이 틀린 값은 버림. */
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

// [기능 설명: 셀 편집 6/7] 셀 값은 "B2" 같은 평평한 키로 쓰고, 값이 같은 셀은 건너뜀.
/**
 * 여러 셀에 값을 한 트랜잭션(= 실행 취소 한 단계)으로 쓰고 바뀐 셀 수를 돌려줌.
 * 빈 문자열은 키를 지우고, 시트 밖은 무시하고, 값이 같은 셀은 건너뜀(실행 취소 기록에 빈 단계가 남지 않게).
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

/** 셀 하나에 씀. 값이 바뀌었으면 true. */
export function setValue(doc: Y.Doc, coord: CellCoord, value: string, origin: EditOrigin): boolean {
  return writeValues(doc, [{ coord, value }], origin) > 0;
}

/** 범위의 값만 지우고 서식은 남김(엑셀·구글 시트의 Delete 키와 같음). */
export function clearValues(doc: Y.Doc, range: CellRange, origin: EditOrigin): number {
  const clipped = clipToSheet(range);
  if (!clipped) return 0;
  const writes: CellWrite[] = [];
  forEachCell(clipped, (coord) => writes.push({ coord, value: "" }));
  return writeValues(doc, writes, origin);
}

/** 범위의 모든 셀에 그 서식이 켜져 있는지. 툴바 버튼 표시와 켜고 끄기 판단에 씀. */
export function hasFormatEverywhere(doc: Y.Doc, range: CellRange, key: FormatKey): boolean {
  const clipped = clipToSheet(range);
  if (!clipped) return false;
  const formats = formatsOf(doc);
  let everywhere = true;
  forEachCell(clipped, (coord) => {
    if (everywhere && !formats.get(formatKey(toA1(coord), key))) everywhere = false;
  });
  return everywhere;
}

/** 범위 전체에 서식을 켜거나 끔. 이미 그 상태인 셀은 건너뜀. */
export function setFormat(
  doc: Y.Doc,
  range: CellRange,
  key: FormatKey,
  enabled: boolean,
  origin: EditOrigin,
): void {
  const clipped = clipToSheet(range);
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

/** 범위의 굵게·기울임 등을 켜거나 끔. 전체에 켜져 있으면 끄고, 하나라도 꺼져 있으면 모두 켬(구글 시트와 같음). 켰으면 true. */
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

/** 범위에 글자색·채우기·정렬을 적용함. null이면 기본값으로 되돌리고, 형식이 틀린 값은 무시함. */
export function setStyle(
  doc: Y.Doc,
  range: CellRange,
  key: StyleKey,
  value: string | null,
  origin: EditOrigin,
): void {
  if (value !== null && !isValidStyle(key, value)) return;
  const clipped = clipToSheet(range);
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

/** 범위 전체에 같은 값 서식이 걸려 있으면 그 값, 섞여 있거나 기본값이면 null. 툴바 표시에 씀. */
export function commonStyle(doc: Y.Doc, range: CellRange, key: StyleKey): string | null {
  const clipped = clipToSheet(range);
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

/** 범위의 서식을 모두 지우고 값은 남김. */
export function clearFormats(doc: Y.Doc, range: CellRange, origin: EditOrigin): void {
  const clipped = clipToSheet(range);
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
