import type { Alignment, FormatKey } from "./schema";

/**
 * 편집 모드(엑셀과 같은 구분)
 * - enter: 셀을 선택한 채 바로 타이핑해 시작. 방향키를 누르면 입력을 확정하고 이동한다.
 * - edit: F2·더블클릭으로 시작. 방향키는 글자 사이 커서를 움직인다.
 */
export type EditMode = "enter" | "edit";

export type GridAction =
  | { type: "move"; dRow: number; dCol: number }
  | { type: "extend"; dRow: number; dCol: number }
  | { type: "jump"; dRow: number; dCol: number; extend: boolean }
  | { type: "advance"; dRow: number; dCol: number }
  | { type: "page"; direction: 1 | -1; extend: boolean }
  | { type: "rowStart" }
  | { type: "sheetStart" }
  | { type: "startEdit" }
  | { type: "toggleEditMode" }
  | { type: "cancelEdit" }
  | { type: "clear" }
  | { type: "selectAll" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "format"; key: FormatKey }
  | { type: "align"; value: Alignment }
  | { type: "clearFormat" };

export interface KeyInput {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

const ARROWS: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

const FORMAT_SHORTCUTS: Record<string, FormatKey> = {
  b: "bold",
  i: "italic",
  u: "underline",
  "5": "strike", // 엑셀 Ctrl+5
};

const ALIGN_SHORTCUTS: Record<string, Alignment> = {
  l: "left",
  e: "center",
  r: "right",
};

/** null이면 브라우저 기본 동작(글자 입력, 커서 이동 등)에 맡긴다. */
export function resolveGridKey(
  e: KeyInput,
  editMode: EditMode | null,
  isMac: boolean,
): GridAction | null {
  const mod = isMac ? e.metaKey : e.ctrlKey;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const editing = editMode !== null;

  if (mod && !e.altKey) {
    if (!e.shiftKey && FORMAT_SHORTCUTS[key]) return { type: "format", key: FORMAT_SHORTCUTS[key] };
    if (e.shiftKey && ALIGN_SHORTCUTS[key]) return { type: "align", value: ALIGN_SHORTCUTS[key] };
    if (!e.shiftKey && key === "\\") return { type: "clearFormat" };
    // 편집 중의 Ctrl+Z/A는 입력칸의 기본 동작(글자 되돌리기, 전체 선택)에 맡긴다.
    if (!editing) {
      if (key === "z") return { type: e.shiftKey ? "redo" : "undo" };
      if (key === "y" && !e.shiftKey) return { type: "redo" };
      if (key === "a" && !e.shiftKey) return { type: "selectAll" };
      if (key === "Home") return { type: "sheetStart" };
    }
  }

  if (e.altKey) return null;

  if (key === "Enter") return { type: "advance", dRow: e.shiftKey ? -1 : 1, dCol: 0 };
  if (key === "Tab") return { type: "advance", dRow: 0, dCol: e.shiftKey ? -1 : 1 };

  if (editing) {
    if (key === "Escape") return { type: "cancelEdit" };
    if (key === "F2") return { type: "toggleEditMode" };
    if (editMode === "enter" && ARROWS[key] && !mod) {
      const [dRow, dCol] = ARROWS[key];
      return { type: e.shiftKey ? "extend" : "move", dRow, dCol };
    }
    return null;
  }

  if (ARROWS[key]) {
    const [dRow, dCol] = ARROWS[key];
    if (mod) return { type: "jump", dRow, dCol, extend: e.shiftKey };
    return { type: e.shiftKey ? "extend" : "move", dRow, dCol };
  }
  if (mod) return null;

  switch (key) {
    case "F2":
      return { type: "startEdit" };
    case "Delete":
    case "Backspace":
      return { type: "clear" };
    case "PageDown":
      return { type: "page", direction: 1, extend: e.shiftKey };
    case "PageUp":
      return { type: "page", direction: -1, extend: e.shiftKey };
    case "Home":
      return { type: "rowStart" };
    default:
      return null;
  }
}
