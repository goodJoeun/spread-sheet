import { memo } from "react";
import { colToLabel, type CellRange } from "@/lib/sheet/address";
import { COL_COUNT, ROW_COUNT } from "@/lib/sheet/document";

interface GridHeadersProps {
  range: CellRange;
}

const headerBase =
  "sticky flex items-center justify-center border-r border-b border-header-line text-[11px] select-none";

/** 열·행 머리글. 선택 범위에 걸친 머리글은 강조한다. */
export const GridHeaders = memo(function GridHeaders({ range }: GridHeadersProps) {
  const items = [
    <div
      key="corner"
      className={`${headerBase} top-0 left-0 z-30 bg-header`}
      style={{ gridRow: 1, gridColumn: 1 }}
    />,
  ];
  for (let col = 0; col < COL_COUNT; col++) {
    const active = col >= range.start.col && col <= range.end.col;
    items.push(
      <div
        key={`c${col}`}
        className={`${headerBase} top-0 z-20 ${active ? "bg-header-active font-semibold text-accent" : "bg-header text-neutral-600"}`}
        style={{ gridRow: 1, gridColumn: col + 2 }}
      >
        {colToLabel(col)}
      </div>,
    );
  }
  for (let row = 0; row < ROW_COUNT; row++) {
    const active = row >= range.start.row && row <= range.end.row;
    items.push(
      <div
        key={`r${row}`}
        className={`${headerBase} left-0 z-20 ${active ? "bg-header-active font-semibold text-accent" : "bg-header text-neutral-600"}`}
        style={{ gridRow: row + 2, gridColumn: 1 }}
      >
        {row + 1}
      </div>,
    );
  }
  return items;
});
