import type { LucideIcon } from "lucide-react";
import { Popover } from "@/components/ui/Popover";
import { ICON } from "@/styles/icon";

/** 고른 색은 aria-checked */
const SWATCH =
  "size-5 rounded-sm border border-outline hover:scale-110 " +
  "aria-checked:ring-2 aria-checked:ring-accent aria-checked:ring-offset-1";

interface ColorMenuProps {
  label: string;
  icon: LucideIcon;
  colors: string[];
  value: string | null;
  defaultSwatch: string;
  resetLabel: string;
  onPick: (color: string | null) => void;
}

export function ColorMenu({
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
