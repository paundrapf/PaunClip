import type { ReactNode } from "react";

interface InfoGridProps {
  items: Array<{
    label: string;
    value: ReactNode;
  }>;
}

export function InfoGrid({ items }: InfoGridProps) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-card border border-stroke bg-panel-muted px-4 py-3">
          <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-muted">
            {item.label}
          </dt>
          <dd className="mt-2 text-sm leading-6 text-foreground-soft">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
