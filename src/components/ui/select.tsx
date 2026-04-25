import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Option = {
  label: string;
  value: string;
};

export function SelectLike({
  label,
  value,
  options,
  className
}: {
  label: string;
  value: string;
  options: Option[];
  className?: string;
}) {
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <label className={cn("grid gap-2", className)}>
      <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</span>
      <span className="flex h-11 items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100">
        {selected?.label}
        <ChevronDown className="h-4 w-4 text-zinc-500" aria-hidden="true" />
      </span>
    </label>
  );
}
