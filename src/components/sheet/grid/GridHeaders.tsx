import { memo } from "react";
import { colToLabel, type CellRange } from "@/lib/sheet/address";
import { COL_COUNT, ROW_COUNT } from "@/lib/sheet/schema";
import { Layer } from "./layers";

interface GridHeadersProps {
  range: CellRange;
}

/** 선택 범위에 걸친 머리글은 data-active */
const HEADER =
  "sticky flex items-center justify-center border-r border-b border-line select-none " +
  "bg-surface-muted text-caption text-fg-muted " +
  "data-active:bg-accent-soft data-active:font-semibold data-active:text-accent";

export const GridHeaders = memo(function GridHeaders({ range }: GridHeadersProps) {
  const items = [
    <div
      key="corner"
      className={`${HEADER} top-0 left-0`}
      style={{ gridRow: 1, gridColumn: 1, zIndex: Layer.corner }}
    />,
  ];
  for (let col = 0; col < COL_COUNT; col++) {
    const active = range.start.col <= col && col <= range.end.col;
    items.push(
      <div
        key={`c${col}`}
        className={`${HEADER} top-0`}
        data-active={active || undefined}
        style={{ gridRow: 1, gridColumn: col + 2, zIndex: Layer.header }}
      >
        {colToLabel(col)}
      </div>,
    );
  }
  for (let row = 0; row < ROW_COUNT; row++) {
    const active = range.start.row <= row && row <= range.end.row;
    items.push(
      <div
        key={`r${row}`}
        className={`${HEADER} left-0`}
        data-active={active || undefined}
        style={{ gridRow: row + 2, gridColumn: 1, zIndex: Layer.header }}
      >
        {row + 1}
      </div>,
    );
  }
  return items;
});
