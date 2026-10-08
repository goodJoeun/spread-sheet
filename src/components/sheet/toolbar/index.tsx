"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  Italic,
  Lock,
  LockOpen,
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
import { useDocVersion } from "@/hooks/sheet/useDocVersion";
import { useUndoState } from "@/hooks/sheet/useUndoState";
import { useStore } from "@/hooks/useStore";
import { isApplePlatform } from "@/lib/platform";
import { commonStyle, hasFormatEverywhere } from "@/lib/sheet/document";
import {
  ALIGN_SHORTCUTS,
  COMMAND_SHORTCUTS,
  FORMAT_SHORTCUTS,
  shortcutLabel,
} from "@/lib/sheet/keymap";
import type { Alignment, FormatKey } from "@/lib/sheet/schema";
import { selectionRange } from "@/lib/sheet/selection";
import {
  CELL_FILL_COLORS,
  CELL_TEXT_COLORS,
  DEFAULT_FILL_COLOR,
  DEFAULT_TEXT_COLOR,
} from "@/resources/colors";
import { strings } from "@/resources/strings";
import { ICON } from "@/styles/icon";
import { useSelection, useSheet } from "../SheetContext";
import { ColorMenu } from "./ColorMenu";

const FORMAT_BUTTONS: { key: FormatKey; label: string; icon: LucideIcon }[] = [
  { key: "bold", label: strings.toolbar.bold, icon: Bold },
  { key: "italic", label: strings.toolbar.italic, icon: Italic },
  { key: "underline", label: strings.toolbar.underline, icon: Underline },
  { key: "strike", label: strings.toolbar.strike, icon: Strikethrough },
];

const ALIGN_BUTTONS: { value: Alignment; label: string; icon: LucideIcon }[] = [
  { value: "left", label: strings.toolbar.alignLeft, icon: AlignLeft },
  { value: "center", label: strings.toolbar.alignCenter, icon: AlignCenter },
  { value: "right", label: strings.toolbar.alignRight, icon: AlignRight },
];

/** 툴바 오른쪽 끝의 AI 편집 버튼. 패널이 열려 있으면 aria-pressed */
const AI_TOGGLE =
  "flex h-8 items-center gap-sm rounded-full px-lg text-body font-medium transition-colors " +
  "text-ai-ink hover:bg-ai-soft " +
  "aria-pressed:bg-ai aria-pressed:text-fg-inverse aria-pressed:hover:bg-ai/90";

/** AI 편집 버튼 왼쪽의 셀 잠금 스위치. 켜져 있으면 aria-pressed */
const AI_LOCK_TOGGLE =
  "flex h-8 items-center gap-xs rounded-full border border-line px-md text-label text-fg-muted " +
  "transition-colors hover:bg-hover " +
  "aria-pressed:border-ai aria-pressed:bg-ai-soft aria-pressed:text-ai-ink aria-pressed:hover:bg-ai-soft";

export function Toolbar() {
  const { session, controller, ai, aiPanel } = useSheet();
  const aiOpen = useStore(aiPanel);
  const lockCells = useStore(ai.lockCells);
  const { doc, undoManager } = session;
  useDocVersion(doc);
  const range = selectionRange(useSelection());
  const { canUndo, canRedo } = useUndoState(undoManager);
  const isMac = isApplePlatform();

  const run = (command: () => void) => {
    command();
    controller.focus();
  };

  return (
    <div
      role="toolbar"
      aria-label={strings.toolbar.label}
      className="flex h-10 shrink-0 items-center gap-2xs border-b border-line bg-surface-muted px-md"
      // 버튼을 눌러도 그리드의 포커스(편집 중인 셀 포함)를 빼앗지 않음.
      onMouseDown={(e) => e.preventDefault()}
    >
      <ToolbarButton
        label={strings.toolbar.undo}
        shortcut={shortcutLabel(COMMAND_SHORTCUTS.undo, isMac)}
        disabled={!canUndo}
        onClick={() => run(() => controller.undo())}
      >
        <Undo2 size={ICON.md} />
      </ToolbarButton>
      <ToolbarButton
        label={strings.toolbar.redo}
        shortcut={shortcutLabel(COMMAND_SHORTCUTS.redo, isMac)}
        disabled={!canRedo}
        onClick={() => run(() => controller.redo())}
      >
        <Redo2 size={ICON.md} />
      </ToolbarButton>

      <Divider />

      {FORMAT_BUTTONS.map(({ key, label, icon: Icon }) => (
        <ToolbarButton
          key={key}
          label={label}
          shortcut={shortcutLabel(FORMAT_SHORTCUTS[key], isMac)}
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
        defaultSwatch={DEFAULT_TEXT_COLOR}
        resetLabel={strings.toolbar.textColorReset}
        onPick={(color) => run(() => controller.setStyle("color", color))}
      />
      <ColorMenu
        label={strings.toolbar.fillColor}
        icon={PaintBucket}
        colors={CELL_FILL_COLORS}
        value={commonStyle(doc, range, "fill")}
        defaultSwatch={DEFAULT_FILL_COLOR}
        resetLabel={strings.toolbar.fillColorReset}
        onPick={(color) => run(() => controller.setStyle("fill", color))}
      />

      <Divider />

      {ALIGN_BUTTONS.map(({ value, label, icon: Icon }) => (
        <ToolbarButton
          key={value}
          label={label}
          shortcut={shortcutLabel(ALIGN_SHORTCUTS[value], isMac)}
          pressed={commonStyle(doc, range, "align") === value}
          onClick={() => run(() => controller.setStyle("align", value))}
        >
          <Icon size={ICON.md} />
        </ToolbarButton>
      ))}

      <Divider />

      <ToolbarButton
        label={strings.toolbar.clearFormat}
        shortcut={shortcutLabel(COMMAND_SHORTCUTS.clearFormat, isMac)}
        onClick={() => run(() => controller.clearFormats())}
      >
        <RemoveFormatting size={ICON.md} />
      </ToolbarButton>

      <div className="ml-auto flex items-center gap-sm">
        <button
          type="button"
          aria-pressed={lockCells}
          title={strings.toolbar.aiLockTitle}
          onClick={() => ai.lockCells.set((on) => !on)}
          className={AI_LOCK_TOGGLE}
        >
          {lockCells ? (
            <Lock size={ICON.sm} aria-hidden />
          ) : (
            <LockOpen size={ICON.sm} aria-hidden />
          )}
          {strings.toolbar.aiLock}
        </button>
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
