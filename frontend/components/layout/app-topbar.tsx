"use client";

import Link from "next/link";
import { ArrowRight, LoaderCircle, WifiOff } from "lucide-react";

import { StatusChip } from "@/components/common/status-chip";
import { useProgress } from "@/hooks/use-progress";
import type { AppRouteDefinition } from "@/lib/navigation";
import { formatPercent, statusTone, titleCaseLabel } from "@/lib/utils";

interface AppTopbarProps {
  route: AppRouteDefinition;
}

export function AppTopbar({ route }: AppTopbarProps) {
  const { data, connection, lastError } = useProgress();
  const runtimeLabel = connection === "offline"
    ? "Backend offline"
    : data.is_running
      ? `${titleCaseLabel(data.task_type ?? "active")} · ${formatPercent(data.progress)}`
      : "Runtime idle";

  return (
    <header className="sticky top-0 z-20 border-b border-stroke/80 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
              {route.label}
            </p>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {route.title}
              </h1>
              <p className="max-w-3xl text-sm leading-6 text-muted sm:text-[0.95rem]">
                {route.description}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-start gap-3 xl:items-end">
            <StatusChip tone={connection === "offline" ? "danger" : data.is_running ? statusTone(data.status) : "neutral"}>
              {runtimeLabel}
            </StatusChip>

            {route.primaryAction ? (
              <Link
                href={route.primaryAction.href}
                className="inline-flex min-h-11 items-center gap-2 rounded-pill border border-stroke-strong bg-accent/10 px-4 text-sm font-semibold text-foreground transition hover:bg-accent/14 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {route.primaryAction.label}
                <ArrowRight className="size-4" />
              </Link>
            ) : null}
          </div>
        </div>

        {data.is_running || connection === "offline" ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            {connection === "offline" ? (
              <>
                <WifiOff className="size-4 text-danger" />
                <span>{lastError ?? "The FastAPI backend is unreachable."}</span>
              </>
            ) : (
              <>
                <LoaderCircle className="size-4 animate-spin text-accent" />
                <span>
                  {data.status} {data.session_id ? `· session ${data.session_id}` : ""}
                  {data.campaign_id ? ` · campaign ${data.campaign_id}` : ""}
                </span>
              </>
            )}
          </div>
        ) : null}
      </div>
    </header>
  );
}
