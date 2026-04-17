import type { ReactNode } from "react";

import { cx } from "@/lib/utils";

interface SurfaceCardProps {
  children: ReactNode;
  className?: string;
}

export function SurfaceCard({ children, className }: SurfaceCardProps) {
  return (
    <section
      className={cx(
        "rounded-card border border-stroke bg-panel/90 p-5 shadow-[var(--shadow-panel)] backdrop-blur-xl sm:p-6",
        className,
      )}
    >
      {children}
    </section>
  );
}
