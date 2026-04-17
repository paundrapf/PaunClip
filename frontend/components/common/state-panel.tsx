import type { ReactNode } from "react";

import { SurfaceCard } from "@/components/common/surface-card";

interface StatePanelProps {
  title: string;
  message: string;
  action?: ReactNode;
}

export function StatePanel({ title, message, action }: StatePanelProps) {
  return (
    <SurfaceCard className="border-danger/20 bg-danger/8">
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-strong">{message}</p>
        </div>
        {action ? <div>{action}</div> : null}
      </div>
    </SurfaceCard>
  );
}
