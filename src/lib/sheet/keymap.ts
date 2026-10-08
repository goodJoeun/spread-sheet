import type { Alignment, FormatKey } from "./schema";

/**
 * 편집 모드(엑셀과 같은 구분)
 * - enter: 셀을 선택한 채 바로 타이핑해 시작. 방향키를 누르면 입력을 확정하고 이동함.
 * - edit: F2·더블클릭으로 시작. 방향키는 글자 사이 커서를 움직임.
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

/**
 * Ctrl(맥은 ⌘)과 함께 누르는 단축키. 키 판정(resolveGridKey)과 화면의 단축키 표기가 이 표를 함께 씀.
 * 그래서 단축키를 바꾸면 툴바 안내도 함께 바뀜.
 */
export interface Shortcut {
  /** 글자 키는 소문자로 적음. */
  key: string;
  shift?: boolean;
}

export const FORMAT_SHORTCUTS: Record<FormatKey, Shortcut> = {
  bold: { key: "b" },
  italic: { key: "i" },
  underline: { key: "u" },
  strike: { key: "5" }, // 엑셀 Ctrl+5
};

export const ALIGN_SHORTCUTS: Record<Alignment, Shortcut> = {
  left: { key: "l", shift: true },
  center: { key: "e", shift: true },
  right: { key: "r", shift: true },
};

export const COMMAND_SHORTCUTS = {
  undo: { key: "z" },
  redo: { key: "y" },
  clearFormat: { key: "\\" },
  selectAll: { key: "a" },
} as const satisfies Record<string, Shortcut>;

/** 다시 실행은 Ctrl+Shift+Z로도 받음(맥 관례). 화면에는 COMMAND_SHORTCUTS.redo만 보여 줌. */
const REDO_ALT: Shortcut = { key: "z", shift: true };

/** 화면에 보여 줄 표기. 예: "Ctrl+B", "⌘Shift+L" */
export function shortcutLabel({ key, shift }: Shortcut, isMac: boolean): string {
  return `${isMac ? "⌘" : "Ctrl+"}${shift ? "Shift+" : ""}${key.toUpperCase()}`;
}

function findShortcut<K extends string>(
  table: Record<K, Shortcut>,
  isPressed: (shortcut: Shortcut) => boolean,
): K | null {
  for (const name of Object.keys(table) as K[]) {
    if (isPressed(table[name])) return name;
  }
  return null;
}

/** null이면 브라우저 기본 동작(글자 입력, 커서 이동 등)에 맡김. */
export function resolveGridKey(
  e: KeyInput,
  editMode: EditMode | null,
  isMac: boolean,
): GridAction | null {
  const mod = isMac ? e.metaKey : e.ctrlKey;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const editing = editMode !== null;
  const isPressed = (shortcut: Shortcut) =>
    shortcut.key === key && (shortcut.shift ?? false) === e.shiftKey;

  if (mod && !e.altKey) {
    const format = findShortcut(FORMAT_SHORTCUTS, isPressed);
    if (format) return { type: "format", key: format };
    const align = findShortcut(ALIGN_SHORTCUTS, isPressed);
    if (align) return { type: "align", value: align };
    if (isPressed(COMMAND_SHORTCUTS.clearFormat)) return { type: "clearFormat" };
    // 편집 중의 Ctrl+Z/A는 입력칸의 기본 동작(글자 되돌리기, 전체 선택)에 맡김.
    if (!editing) {
      if (isPressed(COMMAND_SHORTCUTS.undo)) return { type: "undo" };
      if (isPressed(COMMAND_SHORTCUTS.redo) || isPressed(REDO_ALT)) return { type: "redo" };
      if (isPressed(COMMAND_SHORTCUTS.selectAll)) return { type: "selectAll" };
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
