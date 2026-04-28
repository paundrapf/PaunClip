import * as React from "react";
import { cn } from "@/lib/utils";

export type SelectOption = {
  label: string;
  value: string;
};

export function SelectField({
  label,
  value,
  onChange,
  options,
  className
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  className?: string;
}) {
  return (
    <label className={cn("grid gap-2", className)}>
      <span className="text-xs font-medium uppercase text-[var(--muted-soft)]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-lg border border-[var(--border)] bg-[rgb(9_9_8_/_0.78)] px-3 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.03)] outline-none transition-[border-color,box-shadow,background] duration-200 focus:border-[var(--accent)]/70 focus:bg-[rgb(12_12_10_/_0.92)] focus:ring-2 focus:ring-[rgb(242_162_58_/_0.13)]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
