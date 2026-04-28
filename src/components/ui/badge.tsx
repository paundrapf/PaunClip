import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  children
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-full border border-[var(--border)] bg-[var(--panel-raised)] px-3 text-xs font-medium text-[var(--muted)] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.04)]",
        className
      )}
    >
      {children}
    </span>
  );
}
