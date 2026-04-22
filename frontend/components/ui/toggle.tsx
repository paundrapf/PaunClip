import type { ChangeEvent } from "react";

import { cn } from "@/lib/utils";

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: ToggleProps) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.checked);
  };

  return (
    <label
      className={cn(
        "inline-flex cursor-pointer items-center gap-3",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <div className="relative inline-flex h-6 w-11 shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={handleChange}
          disabled={disabled}
          className="peer sr-only"
        />

        <span
          className={cn(
            "absolute inset-0 rounded-pill border transition-colors",
            "bg-panel-muted border-stroke",
            "peer-checked:bg-accent peer-checked:border-accent",
            "peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40",
          )}
        />

        <span
          className={cn(
            "absolute top-1 left-1 h-4 w-4 rounded-pill bg-white shadow-sm transition-transform",
            checked && "translate-x-5",
          )}
        />
      </div>

      {label ? (
        <span className="text-sm font-medium text-foreground-soft">
          {label}
        </span>
      ) : null}
    </label>
  );
}
