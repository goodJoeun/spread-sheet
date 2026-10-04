import { memo } from "react";
import type * as Y from "yjs";
import { toA1 } from "@/lib/sheet/address";
import { getFormat, valuesOf } from "@/lib/sheet/document";
import { COL_COUNT, ROW_COUNT, type Alignment } from "@/lib/sheet/schema";

const NUMBER_PATTERN = /^[-+]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?%?$/;

interface CellProps {
  row: number;
  col: number;
  value: string;
  bold?: true;
  italic?: true;
  underline?: true;
  strike?: true;
  color?: string;
  fill?: string;
  align?: Alignment;
}

const Cell = memo(function Cell({
  row,
  col,
  value,
  bold,
  italic,
  underline,
  strike,
  color,
  fill,
  align,
}: CellProps) {
  // 정렬을 지정하지 않으면 스프레드시트 관례대로 숫자는 오른쪽, 글자는 왼쪽.
  const textAlign = align ?? (NUMBER_PATTERN.test(value) ? "right" : "left");
  const decoration = [underline && "underline", strike && "line-through"].filter(Boolean).join(" ");
  return (
    <div
      className="cell"
      style={{
        gridRow: row + 2,
        gridColumn: col + 2,
        textAlign,
        fontWeight: bold ? 700 : undefined,
        fontStyle: italic ? "italic" : undefined,
        textDecorationLine: decoration || undefined,
        color,
        backgroundColor: fill,
      }}
    >
      {value}
    </div>
  );
});

interface GridCellsProps {
  doc: Y.Doc;
  /** 문서 버전. 바뀔 때만 셀 전체를 다시 그린다(선택 변경으로는 다시 그리지 않음). */
  version: number;
}

export const GridCells = memo(function GridCells({ doc }: GridCellsProps) {
  const values = valuesOf(doc);
  const cells = [];
  for (let row = 0; row < ROW_COUNT; row++) {
    for (let col = 0; col < COL_COUNT; col++) {
      const coord = { row, col };
      const key = toA1(coord);
      // 서식 값은 모두 원시값이라 Cell의 memo 비교가 그대로 동작한다.
      cells.push(
        <Cell
          key={key}
          row={row}
          col={col}
          value={values.get(key) ?? ""}
          {...getFormat(doc, coord)}
        />,
      );
    }
  }
  return cells;
});
