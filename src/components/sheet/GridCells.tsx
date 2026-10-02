import { memo } from "react";
import type * as Y from "yjs";
import { toA1 } from "@/lib/sheet/address";
import { COL_COUNT, ROW_COUNT, formatsOf, valuesOf } from "@/lib/sheet/document";

const NUMBER_PATTERN = /^[-+]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?%?$/;

interface CellProps {
  row: number;
  col: number;
  value: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
}

const Cell = memo(function Cell({ row, col, value, bold, italic, underline, strike }: CellProps) {
  const numeric = NUMBER_PATTERN.test(value);
  const decoration = [underline && "underline", strike && "line-through"].filter(Boolean).join(" ");
  return (
    <div
      className="overflow-hidden border-r border-b border-grid-line px-1 text-[13px] leading-[23px] whitespace-pre"
      style={{
        gridRow: row + 2,
        gridColumn: col + 2,
        textAlign: numeric ? "right" : "left",
        fontWeight: bold ? 700 : undefined,
        fontStyle: italic ? "italic" : undefined,
        textDecorationLine: decoration || undefined,
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
  const formats = formatsOf(doc);
  const cells = [];
  for (let row = 0; row < ROW_COUNT; row++) {
    for (let col = 0; col < COL_COUNT; col++) {
      const key = toA1({ row, col });
      cells.push(
        <Cell
          key={key}
          row={row}
          col={col}
          value={values.get(key) ?? ""}
          bold={formats.has(`${key}.bold`)}
          italic={formats.has(`${key}.italic`)}
          underline={formats.has(`${key}.underline`)}
          strike={formats.has(`${key}.strike`)}
        />,
      );
    }
  }
  return cells;
});
