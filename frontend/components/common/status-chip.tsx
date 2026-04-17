import type { ReactNode } from "react";

import { cx } from "@/lib/utils";

type StatusTone = "neutral" | "brand" | "success" | "warning" | "danger";

const toneClasses: Record<StatusTone, string> = {
  neutral: "border-white/10 bg-white/6 text-foreground-soft",
  brand: "border-accent/30 bg-accent/12 text-accent",
  success: "border-success/30 bg-success/12 text-success",
  warning: "border-warning/30 bg-warning/12 text-warning",
  danger: "border-danger/30 bg-danger/12 text-danger",
};

interface StatusChipProps {
  children: ReactNode;
  tone?: StatusTone;
  className?: string;
}

export function StatusChip({ children, tone = "neutral", className }: StatusChipProps) {
  return (
    <span
      className={cx(
        "inline-flex min-h-7 items-center rounded-pill border px-3 text-xs font-semibold tracking-[0.18em] uppercase",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
