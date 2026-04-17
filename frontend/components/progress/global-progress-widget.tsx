"use client";

import Link from "next/link";
import { ArrowRight, LoaderCircle, WifiOff } from "lucide-react";

import { StatusChip } from "@/components/common/status-chip";
import { useProgress } from "@/hooks/use-progress";
import { formatPercent, titleCaseLabel } from "@/lib/utils";

export function GlobalProgressWidget() {
  const { connection, data, lastError } = useProgress();
  const isOnline = connection === "online";

  const destination = data.session_id
    ? `/sessions/${data.session_id}`
    : data.campaign_id
      ? `/campaigns/${data.campaign_id}`
      : null;

  return (
    <div className="rounded-card border border-stroke bg-panel-muted p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
            Global progress
          </p>
          <h3 className="mt-2 text-sm font-semibold text-foreground">
            {data.is_running ? titleCaseLabel(data.task_type ?? "active") : "Runtime idle"}
          </h3>
        </div>
        <StatusChip tone={!isOnline ? "danger" : data.is_running ? "brand" : "neutral"}>
          {!isOnline ? "Offline" : data.is_running ? "Live" : "Idle"}
        </StatusChip>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-pill bg-white/6">
        <div
          className="h-full rounded-pill bg-gradient-to-r from-accent to-brand transition-[width] duration-300"
          style={{ width: `${Math.max(0, Math.min(data.progress, 1)) * 100}%` }}
        />
      </div>

      <div className="mt-3 space-y-2 text-sm leading-6 text-muted">
        <p className="text-foreground-soft">{data.status}</p>
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted">
          {isOnline ? <LoaderCircle className="size-3.5 animate-spin text-accent" /> : <WifiOff className="size-3.5 text-danger" />}
          <span>{isOnline ? formatPercent(data.progress) : lastError ?? "Backend unavailable"}</span>
        </div>
      </div>

      {destination ? (
        <Link
          href={destination}
          className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-accent transition hover:text-foreground"
        >
          Open active context
          <ArrowRight className="size-4" />
        </Link>
      ) : null}
    </div>
  );
}
