import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "h-12 w-full rounded-lg border border-[var(--border)] bg-[rgb(9_9_8_/_0.78)] px-4 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.03)] outline-none transition-[border-color,box-shadow,background] duration-200 placeholder:text-[var(--muted-soft)] focus:border-[var(--accent)]/70 focus:bg-[rgb(12_12_10_/_0.92)] focus:ring-2 focus:ring-[rgb(242_162_58_/_0.13)]",
        className
      )}
      {...props}
    />
  );
}
