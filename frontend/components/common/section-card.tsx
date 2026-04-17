import type { ReactNode } from "react";

import { SurfaceCard } from "@/components/common/surface-card";

interface SectionCardProps {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}

export function SectionCard({
  eyebrow,
  title,
  description,
  action,
  children,
}: SectionCardProps) {
  return (
    <SurfaceCard>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            {eyebrow ? (
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
                {eyebrow}
              </p>
            ) : null}
            <div className="space-y-2">
              <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                {title}
              </h2>
              {description ? (
                <p className="max-w-3xl text-sm leading-6 text-muted sm:text-[0.95rem]">
                  {description}
                </p>
              ) : null}
            </div>
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
        {children}
      </div>
    </SurfaceCard>
  );
}
