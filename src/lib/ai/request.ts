import type * as Y from "yjs";
import { parseA1, type CellCoord } from "@/lib/sheet/address";
import { valuesOf } from "@/lib/sheet/document";
import { AI_LIMITS, type AiCell, type AiHistoryItem } from "./protocol";
import type { AiMessage } from "./run";

/** 요청에 싣는 시트와 대화. 서버가 받는 상한(AI_LIMITS)에 맞춰 자름. */

/** 비어 있지 않은 셀을 읽는 순서(행 우선)대로 모음 */
export function snapshotCells(doc: Y.Doc): AiCell[] {
  const cells: Array<AiCell & { coord: CellCoord }> = [];
  valuesOf(doc).forEach((value, key) => {
    const coord = parseA1(key);
    if (coord && value !== "") cells.push({ coord, cell: key, value });
  });
  cells.sort((a, b) => a.coord.row - b.coord.row || a.coord.col - b.coord.col);
  return cells
    .slice(0, AI_LIMITS.cells)
    .map(({ cell, value }) => ({ cell, value: value.slice(0, AI_LIMITS.cellValue) }));
}

/** 최근 대화. 글로 답하지 않은 실행은 뺌. */
export function conversationHistory(messages: readonly AiMessage[]): AiHistoryItem[] {
  const items: AiHistoryItem[] = [];
  for (const m of messages) {
    if (m.role === "user") items.push({ role: "user", text: m.text });
    else if (m.run.text) items.push({ role: "assistant", text: m.run.text });
  }
  return items
    .slice(-AI_LIMITS.history)
    .map((item) => ({ ...item, text: item.text.slice(0, AI_LIMITS.historyText) }));
}
