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
import { useCallback, useRef, useState, type ReactNode } from "react";
import { useDismiss } from "@/components/ui/useDismiss";
import { isApplePlatform } from "@/lib/platform";
import { commonStyle, hasFormatEverywhere } from "@/lib/sheet/document";
import type { Alignment, FormatKey } from "@/lib/sheet/schema";
import { selectionRange } from "@/lib/sheet/selection";
import { useStore } from "@/lib/store";
import { useSelection, useSheet } from "./SheetContext";
import { useUndoState } from "./useUndoState";
import { useDocVersion } from "./useSheetSession";

const TEXT_COLORS = [
  "#000000",
  "#434343",
  "#666666",
  "#999999",
  "#cc0000",
  "#e69138",
  "#bf9000",
  "#38761d",
  "#134f5c",
  "#1155cc",
  "#351c75",
  "#741b47",
];

const FILL_COLORS = [
  "#f4cccc",
  "#fce5cd",
  "#fff2cc",
  "#d9ead3",
  "#d0e0e3",
  "#cfe2f3",
  "#d9d2e9",
  "#ead1dc",
  "#ea9999",
  "#f9cb9c",
  "#ffe599",
  "#b6d7a8",
  "#a2c4c9",
  "#9fc5e8",
  "#b4a7d6",
  "#d5a6bd",
];

const FORMAT_BUTTONS: { key: FormatKey; label: string; icon: LucideIcon; shortcut: string }[] = [
  { key: "bold", label: "굵게", icon: Bold, shortcut: "B" },
  { key: "italic", label: "기울임꼴", icon: Italic, shortcut: "I" },
  { key: "underline", label: "밑줄", icon: Underline, shortcut: "U" },
  { key: "strike", label: "취소선", icon: Strikethrough, shortcut: "5" },
];

const ALIGN_BUTTONS: { value: Alignment; label: string; icon: LucideIcon; shortcut: string }[] = [
  { value: "left", label: "왼쪽 정렬", icon: AlignLeft, shortcut: "Shift+L" },
  { value: "center", label: "가운데 정렬", icon: AlignCenter, shortcut: "Shift+E" },
  { value: "right", label: "오른쪽 정렬", icon: AlignRight, shortcut: "Shift+R" },
];

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
      aria-label="서식 도구"
      className="flex h-10 shrink-0 items-center gap-0.5 border-b border-header-line bg-header px-2"
      // 버튼을 눌러도 그리드의 포커스(편집 중인 셀 포함)를 빼앗지 않는다.
      onMouseDown={(e) => e.preventDefault()}
    >
      <ToolbarButton
        label="실행 취소"
        shortcut={`${mod}Z`}
        disabled={!canUndo}
        onClick={() => run(() => controller.undo())}
      >
        <Undo2 size={16} />
      </ToolbarButton>
      <ToolbarButton
        label="다시 실행"
        shortcut={`${mod}Y`}
        disabled={!canRedo}
        onClick={() => run(() => controller.redo())}
      >
        <Redo2 size={16} />
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
          <Icon size={16} />
        </ToolbarButton>
      ))}

      <Divider />

      <ColorMenu
        label="텍스트 색상"
        icon={Baseline}
        colors={TEXT_COLORS}
        value={commonStyle(doc, range, "color")}
        defaultSwatch="#000000"
        resetLabel="기본 색상"
        onPick={(color) => run(() => controller.setStyle("color", color))}
      />
      <ColorMenu
        label="채우기 색상"
        icon={PaintBucket}
        colors={FILL_COLORS}
        value={commonStyle(doc, range, "fill")}
        defaultSwatch="#ffffff"
        resetLabel="채우기 없음"
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
          <Icon size={16} />
        </ToolbarButton>
      ))}

      <Divider />

      <ToolbarButton
        label="서식 지우기"
        shortcut={`${mod}\\`}
        onClick={() => run(() => controller.clearFormats())}
      >
        <RemoveFormatting size={16} />
      </ToolbarButton>

      <button
        type="button"
        aria-pressed={aiOpen}
        onClick={() => aiPanel.set((open) => !open)}
        className={`ml-auto flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors ${
          aiOpen ? "bg-ai text-white hover:bg-ai/90" : "text-ai-ink hover:bg-ai-soft"
        }`}
      >
        <Sparkles size={15} aria-hidden />
        AI 편집
      </button>
    </div>
  );
}

function Divider() {
  return <div className="mx-1 h-5 w-px bg-header-line" aria-hidden />;
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
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`flex size-8 items-center justify-center rounded text-neutral-700 transition-colors hover:bg-black/5 disabled:text-neutral-300 disabled:hover:bg-transparent ${
        pressed ? "bg-header-active text-accent hover:bg-header-active" : ""
      }`}
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
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);
  useDismiss(rootRef, open, close);

  const pick = (color: string | null) => {
    setOpen(false);
    onPick(color);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex size-8 flex-col items-center justify-center rounded text-neutral-700 hover:bg-black/5 ${open ? "bg-black/5" : ""}`}
      >
        <Icon size={15} />
        <span
          className="mt-0.5 h-[3px] w-4 rounded-sm border border-black/10"
          style={{ backgroundColor: value ?? defaultSwatch }}
        />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          className="absolute top-9 left-0 z-50 w-[188px] rounded-md border border-header-line bg-white p-2 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => pick(null)}
            className="mb-2 w-full rounded px-2 py-1 text-left text-xs text-neutral-700 hover:bg-black/5"
          >
            {resetLabel}
          </button>
          <div className="grid grid-cols-8 gap-1">
            {colors.map((color) => (
              <button
                key={color}
                type="button"
                role="menuitemradio"
                aria-checked={value === color}
                aria-label={color}
                title={color}
                onClick={() => pick(color)}
                className={`size-5 rounded-sm border border-black/10 hover:scale-110 ${value === color ? "ring-2 ring-accent ring-offset-1" : ""}`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
