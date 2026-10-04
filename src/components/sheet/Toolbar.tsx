"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  Italic,
  PaintBucket,
  Redo2,
  RemoveFormatting,
  Sparkles,
  Strikethrough,
  Underline,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Popover } from "@/components/ui/Popover";
import { CELL_FILL_COLORS, CELL_TEXT_COLORS } from "@/resources/colors";
import { strings } from "@/resources/strings";
import { ICON } from "@/styles/icon";
import { isApplePlatform } from "@/lib/platform";
import { commonStyle, hasFormatEverywhere } from "@/lib/sheet/document";
import type { Alignment, FormatKey } from "@/lib/sheet/schema";
import { selectionRange } from "@/lib/sheet/selection";
import { useStore } from "@/lib/store";
import { useSelection, useSheet } from "./SheetContext";
import { useUndoState } from "@/hooks/sheet/useUndoState";
import { useDocVersion } from "@/hooks/sheet/useSheetSession";

const FORMAT_BUTTONS: { key: FormatKey; label: string; icon: LucideIcon; shortcut: string }[] = [
  { key: "bold", label: strings.toolbar.bold, icon: Bold, shortcut: "B" },
  { key: "italic", label: strings.toolbar.italic, icon: Italic, shortcut: "I" },
  { key: "underline", label: strings.toolbar.underline, icon: Underline, shortcut: "U" },
  { key: "strike", label: strings.toolbar.strike, icon: Strikethrough, shortcut: "5" },
];

const ALIGN_BUTTONS: { value: Alignment; label: string; icon: LucideIcon; shortcut: string }[] = [
  { value: "left", label: strings.toolbar.alignLeft, icon: AlignLeft, shortcut: "Shift+L" },
  { value: "center", label: strings.toolbar.alignCenter, icon: AlignCenter, shortcut: "Shift+E" },
  { value: "right", label: strings.toolbar.alignRight, icon: AlignRight, shortcut: "Shift+R" },
];

/** 툴바 오른쪽 끝의 AI 편집 버튼. 패널이 열려 있으면 aria-pressed */
const AI_TOGGLE =
  "ml-auto flex h-8 items-center gap-sm rounded-full px-lg text-body font-medium transition-colors " +
  "text-ai-ink hover:bg-ai-soft " +
  "aria-pressed:bg-ai aria-pressed:text-fg-inverse aria-pressed:hover:bg-ai/90";

/** 고른 색은 aria-checked */
const SWATCH =
  "size-5 rounded-sm border border-outline hover:scale-110 " +
  "aria-checked:ring-2 aria-checked:ring-accent aria-checked:ring-offset-1";

export function Toolbar() {
  const { session, controller, aiPanel } = useSheet();
  const aiOpen = useStore(aiPanel);
  const { doc, undoManager } = session;
  useDocVersion(doc);
  const range = selectionRange(useSelection());
  const { canUndo, canRedo } = useUndoState(undoManager);
  const mod = isApplePlatform() ? "⌘" : "Ctrl+";

  const run = (command: () => void) => {
    command();
    controller.focus();
  };

  return (
    <div
      role="toolbar"
      aria-label={strings.toolbar.label}
      className="flex h-10 shrink-0 items-center gap-2xs border-b border-line bg-surface-muted px-md"
      // 버튼을 눌러도 그리드의 포커스(편집 중인 셀 포함)를 빼앗지 않는다.
      onMouseDown={(e) => e.preventDefault()}
    >
      <ToolbarButton
        label={strings.toolbar.undo}
        shortcut={`${mod}Z`}
        disabled={!canUndo}
        onClick={() => run(() => controller.undo())}
      >
        <Undo2 size={ICON.md} />
      </ToolbarButton>
      <ToolbarButton
        label={strings.toolbar.redo}
        shortcut={`${mod}Y`}
        disabled={!canRedo}
        onClick={() => run(() => controller.redo())}
      >
        <Redo2 size={ICON.md} />
      </ToolbarButton>

      <Divider />

      {FORMAT_BUTTONS.map(({ key, label, icon: Icon, shortcut }) => (
        <ToolbarButton
          key={key}
          label={label}
          shortcut={`${mod}${shortcut}`}
          pressed={hasFormatEverywhere(doc, range, key)}
          onClick={() => run(() => controller.toggleFormat(key))}
        >
          <Icon size={ICON.md} />
        </ToolbarButton>
      ))}

      <Divider />

      <ColorMenu
        label={strings.toolbar.textColor}
        icon={Baseline}
        colors={CELL_TEXT_COLORS}
        value={commonStyle(doc, range, "color")}
        defaultSwatch="#000000"
        resetLabel={strings.toolbar.textColorReset}
        onPick={(color) => run(() => controller.setStyle("color", color))}
      />
      <ColorMenu
        label={strings.toolbar.fillColor}
        icon={PaintBucket}
        colors={CELL_FILL_COLORS}
        value={commonStyle(doc, range, "fill")}
        defaultSwatch="#ffffff"
        resetLabel={strings.toolbar.fillColorReset}
        onPick={(color) => run(() => controller.setStyle("fill", color))}
      />

      <Divider />

      {ALIGN_BUTTONS.map(({ value, label, icon: Icon, shortcut }) => (
        <ToolbarButton
          key={value}
          label={label}
          shortcut={`${mod}${shortcut}`}
          pressed={commonStyle(doc, range, "align") === value}
          onClick={() => run(() => controller.setStyle("align", value))}
        >
          <Icon size={ICON.md} />
        </ToolbarButton>
      ))}

      <Divider />

      <ToolbarButton
        label={strings.toolbar.clearFormat}
        shortcut={`${mod}\\`}
        onClick={() => run(() => controller.clearFormats())}
      >
        <RemoveFormatting size={ICON.md} />
      </ToolbarButton>

      <button
        type="button"
        aria-pressed={aiOpen}
        onClick={() => aiPanel.set((open) => !open)}
        className={AI_TOGGLE}
      >
        <Sparkles size={ICON.md} aria-hidden />
        {strings.toolbar.ai}
      </button>
    </div>
  );
}

function Divider() {
  return <div className="mx-xs h-5 w-px bg-line" aria-hidden />;
}

interface ToolbarButtonProps {
  label: string;
  shortcut?: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}

function ToolbarButton({
  label,
  shortcut,
  pressed,
  disabled,
  onClick,
  children,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={shortcut ? strings.toolbar.withShortcut(label, shortcut) : label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className="icon-btn"
    >
      {children}
    </button>
  );
}

interface ColorMenuProps {
  label: string;
  icon: LucideIcon;
  colors: string[];
  value: string | null;
  defaultSwatch: string;
  resetLabel: string;
  onPick: (color: string | null) => void;
}

function ColorMenu({
  label,
  icon: Icon,
  colors,
  value,
  defaultSwatch,
  resetLabel,
  onPick,
}: ColorMenuProps) {
  return (
    <Popover
      role="menu"
      label={label}
      triggerLabel={label}
      triggerTitle={label}
      triggerClassName="icon-btn flex-col"
      trigger={
        <>
          <Icon size={ICON.md} />
          <span
            className="mt-2xs h-[3px] w-4 rounded-sm border border-outline"
            style={{ backgroundColor: value ?? defaultSwatch }}
          />
        </>
      }
      panelClassName="top-9 left-0 w-[188px] p-md"
    >
      {(close) => {
        const pick = (color: string | null) => {
          close();
          onPick(color);
        };
        return (
          <>
            <button
              type="button"
              role="menuitem"
              onClick={() => pick(null)}
              className="mb-md w-full rounded-sm px-md py-xs text-left text-label text-fg-secondary hover:bg-hover"
            >
              {resetLabel}
            </button>
            <div className="grid grid-cols-8 gap-xs">
              {colors.map((color) => (
                <button
                  key={color}
                  type="button"
                  role="menuitemradio"
                  aria-checked={value === color}
                  aria-label={color}
                  title={color}
                  onClick={() => pick(color)}
                  className={SWATCH}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </>
        );
      }}
    </Popover>
  );
}
