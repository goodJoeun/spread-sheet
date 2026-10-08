import { describe, expect, it } from "vitest";
import {
  ALIGN_SHORTCUTS,
  COMMAND_SHORTCUTS,
  FORMAT_SHORTCUTS,
  resolveGridKey,
  shortcutLabel,
  type EditMode,
  type KeyInput,
  type Shortcut,
} from "@/lib/sheet/keymap";

const press = (key: string, mods: Partial<KeyInput> = {}): KeyInput => ({
  key,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...mods,
});
const win = (input: KeyInput, mode: EditMode | null = null) => resolveGridKey(input, mode, false);
const mac = (input: KeyInput, mode: EditMode | null = null) => resolveGridKey(input, mode, true);

describe("navigation (not editing)", () => {
  it("moves, extends and jumps with arrows", () => {
    expect(win(press("ArrowDown"))).toEqual({ type: "move", dRow: 1, dCol: 0 });
    expect(win(press("ArrowLeft", { shiftKey: true }))).toEqual({
      type: "extend",
      dRow: 0,
      dCol: -1,
    });
    expect(win(press("ArrowRight", { ctrlKey: true, shiftKey: true }))).toEqual({
      type: "jump",
      dRow: 0,
      dCol: 1,
      extend: true,
    });
  });

  it("advances with Enter/Tab like Excel", () => {
    expect(win(press("Enter"))).toEqual({ type: "advance", dRow: 1, dCol: 0 });
    expect(win(press("Enter", { shiftKey: true }))).toEqual({ type: "advance", dRow: -1, dCol: 0 });
    expect(win(press("Tab", { shiftKey: true }))).toEqual({ type: "advance", dRow: 0, dCol: -1 });
  });

  it("starts editing with F2 and clears with Delete/Backspace", () => {
    expect(win(press("F2"))).toEqual({ type: "startEdit" });
    expect(win(press("Delete"))).toEqual({ type: "clear" });
    expect(win(press("Backspace"))).toEqual({ type: "clear" });
  });

  it("leaves printable keys to the input so typing starts an edit", () => {
    expect(win(press("a"))).toBeNull();
    expect(win(press("Process"))).toBeNull(); // IME 조합 중인 키
  });
});

describe("shortcuts", () => {
  it("uses Ctrl on Windows and Cmd on macOS", () => {
    expect(win(press("b", { ctrlKey: true }))).toEqual({ type: "format", key: "bold" });
    expect(mac(press("b", { metaKey: true }))).toEqual({ type: "format", key: "bold" });
    expect(mac(press("b", { ctrlKey: true }))).toBeNull();
  });

  it("handles undo/redo variants and Caps Lock", () => {
    expect(win(press("z", { ctrlKey: true }))).toEqual({ type: "undo" });
    expect(win(press("Z", { ctrlKey: true }))).toEqual({ type: "undo" });
    expect(win(press("Z", { ctrlKey: true, shiftKey: true }))).toEqual({ type: "redo" });
    expect(win(press("y", { ctrlKey: true }))).toEqual({ type: "redo" });
  });

  it("aligns with Ctrl+Shift+L/E/R and clears formats with Ctrl+\\", () => {
    expect(win(press("L", { ctrlKey: true, shiftKey: true }))).toEqual({
      type: "align",
      value: "left",
    });
    expect(mac(press("e", { metaKey: true, shiftKey: true }))).toEqual({
      type: "align",
      value: "center",
    });
    expect(win(press("R", { ctrlKey: true, shiftKey: true }), "enter")).toEqual({
      type: "align",
      value: "right",
    });
    expect(win(press("\\", { ctrlKey: true }))).toEqual({ type: "clearFormat" });
  });

  it("applies formats even while editing, but leaves undo to the input", () => {
    expect(win(press("i", { ctrlKey: true }), "enter")).toEqual({ type: "format", key: "italic" });
    expect(win(press("z", { ctrlKey: true }), "edit")).toBeNull();
    expect(win(press("a", { ctrlKey: true }), "edit")).toBeNull();
  });
});

describe("shortcut tables", () => {
  const pressShortcut = ({ key, shift }: Shortcut) =>
    press(key, { ctrlKey: true, shiftKey: shift ?? false });

  it("resolves every listed shortcut to its action", () => {
    for (const [key, shortcut] of Object.entries(FORMAT_SHORTCUTS)) {
      expect(win(pressShortcut(shortcut))).toEqual({ type: "format", key });
    }
    for (const [value, shortcut] of Object.entries(ALIGN_SHORTCUTS)) {
      expect(win(pressShortcut(shortcut))).toEqual({ type: "align", value });
    }
    for (const [type, shortcut] of Object.entries(COMMAND_SHORTCUTS)) {
      expect(win(pressShortcut(shortcut))).toEqual({ type });
    }
  });

  it("labels shortcuts with Ctrl on Windows and ⌘ on macOS", () => {
    expect(shortcutLabel(FORMAT_SHORTCUTS.bold, false)).toBe("Ctrl+B");
    expect(shortcutLabel(FORMAT_SHORTCUTS.strike, true)).toBe("⌘5");
    expect(shortcutLabel(ALIGN_SHORTCUTS.left, false)).toBe("Ctrl+Shift+L");
    expect(shortcutLabel(ALIGN_SHORTCUTS.center, true)).toBe("⌘Shift+E");
    expect(shortcutLabel(COMMAND_SHORTCUTS.undo, true)).toBe("⌘Z");
    expect(shortcutLabel(COMMAND_SHORTCUTS.clearFormat, false)).toBe("Ctrl+\\");
  });
});

describe("while editing", () => {
  it("commits and moves with arrows only in enter mode", () => {
    expect(win(press("ArrowUp"), "enter")).toEqual({ type: "move", dRow: -1, dCol: 0 });
    expect(win(press("ArrowUp"), "edit")).toBeNull();
  });

  it("commits with Enter/Tab, cancels with Escape, toggles mode with F2", () => {
    expect(win(press("Enter"), "edit")).toEqual({ type: "advance", dRow: 1, dCol: 0 });
    expect(win(press("Tab"), "enter")).toEqual({ type: "advance", dRow: 0, dCol: 1 });
    expect(win(press("Escape"), "edit")).toEqual({ type: "cancelEdit" });
    expect(win(press("F2"), "enter")).toEqual({ type: "toggleEditMode" });
  });

  it("does not clear the sheet on Backspace/Delete", () => {
    expect(win(press("Backspace"), "enter")).toBeNull();
    expect(win(press("Delete"), "edit")).toBeNull();
  });
});
