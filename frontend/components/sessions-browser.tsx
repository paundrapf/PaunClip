"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { InfoGrid } from "@/components/common/info-grid";
import { SectionCard } from "@/components/common/section-card";
import { StatePanel } from "@/components/common/state-panel";
import { StatusChip } from "@/components/common/status-chip";
import { listSessions } from "@/lib/api";
import { formatDateTime, formatRelativeShort, statusTone } from "@/lib/format";
import type { SessionSummary } from "@/lib/types";
import { useProgressState } from "@/lib/use-progress";

type DateFilter = "all" | "24h" | "7d" | "30d" | "90d";

function classifySource(session: SessionSummary) {
  if (session.campaign_id || session.campaign_label) {
    return { value: "campaign", label: "Campaign video" };
  }

  if (session.is_legacy_session) {
    return { value: "legacy", label: "Legacy session" };
  }

  return { value: "manual", label: "Manual session" };
}

function sessionTimestamp(session: SessionSummary) {
  return session.updated_at || session.created_at || null;
}

function matchesDateRange(timestamp: string | null, dateFilter: DateFilter) {
  if (dateFilter === "all" || !timestamp) {
    return true;
  }

  const parsed = new Date(timestamp).getTime();
  if (Number.isNaN(parsed)) {
    return false;
  }

  const rangeLookup: Record<Exclude<DateFilter, "all">, number> = {
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
    "90d": 90 * 24 * 60 * 60 * 1000,
  };

  return Date.now() - parsed <= rangeLookup[dateFilter];
}

export function SessionsBrowser() {
  const { progress } = useProgressState();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const nextSessions = await listSessions();
      setSessions(nextSessions);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load session summaries.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const campaignOptions = useMemo(() => {
    return Array.from(
      new Set(
        sessions
          .map((session) => session.campaign_label?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    ).sort((left, right) => left.localeCompare(right));
  }, [sessions]);

  const statusOptions = useMemo(() => {
    return Array.from(
      new Set(sessions.map((session) => session.status).filter(Boolean)),
    ).sort((left, right) => left.localeCompare(right));
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    const query = search.trim().toLowerCase();

    return sessions.filter((session) => {
      const source = classifySource(session);
      const searchableText = [
        session.title,
        session.session_id,
        session.channel,
        session.campaign_label,
        session.last_error,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (query && !searchableText.includes(query)) {
        return false;
      }

      if (statusFilter !== "all" && session.status !== statusFilter) {
        return false;
      }

      if (sourceFilter !== "all" && source.value !== sourceFilter) {
        return false;
      }

      if (campaignFilter !== "all" && (session.campaign_label || "") !== campaignFilter) {
        return false;
      }

      return matchesDateRange(sessionTimestamp(session), dateFilter);
    });
  }, [campaignFilter, dateFilter, search, sessions, sourceFilter, statusFilter]);

  if (error) {
    return (
      <StatePanel
        title="Sessions unavailable"
        message={error}
        action={
          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded-pill border border-stroke-strong bg-accent/10 px-4 text-sm font-semibold text-foreground transition hover:bg-accent/14"
            onClick={() => void load()}
          >
            Retry request
          </button>
        }
      />
    );
  }

  return (
    <div className="grid gap-6">
      <SectionCard
        eyebrow="Recovery hub"
        title="Persisted session browser"
        description="This page consumes the real session list endpoint, keeps filtering honest with filesystem-backed data, and surfaces active backend work without inventing local-only session state."
        action={
          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded-pill border border-stroke-strong bg-accent/10 px-4 text-sm font-semibold text-foreground transition hover:bg-accent/14"
            onClick={() => void load()}
          >
            {loading ? "Refreshing…" : "Refresh sessions"}
          </button>
        }
      >
        {progress.is_running ? (
          <div className="mb-4 rounded-card border border-stroke-strong bg-accent/6 p-4 text-sm leading-6 text-foreground-soft">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip tone="brand">{progress.task_type || progress.status}</StatusChip>
              {progress.session_id ? <StatusChip tone="neutral">Session {progress.session_id}</StatusChip> : null}
            </div>
            <p className="mt-3">
              The backend is actively working, so the list can be refreshed at any time without losing persisted state.
            </p>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="flex flex-col gap-2 text-sm text-muted-strong xl:col-span-2">
            <span>Search sessions</span>
            <input
              className="rounded-card border border-stroke bg-panel-muted px-4 py-3 text-sm text-foreground outline-none transition focus:border-stroke-strong"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Title, ID, channel, campaign, error…"
              value={search}
            />
          </label>

          <label className="flex flex-col gap-2 text-sm text-muted-strong">
            <span>Status</span>
            <select
              className="rounded-card border border-stroke bg-panel-muted px-4 py-3 text-sm text-foreground outline-none transition focus:border-stroke-strong"
              onChange={(event) => setStatusFilter(event.target.value)}
              value={statusFilter}
            >
              <option value="all">All statuses</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2 text-sm text-muted-strong">
            <span>Source type</span>
            <select
              className="rounded-card border border-stroke bg-panel-muted px-4 py-3 text-sm text-foreground outline-none transition focus:border-stroke-strong"
              onChange={(event) => setSourceFilter(event.target.value)}
              value={sourceFilter}
            >
              <option value="all">All sources</option>
              <option value="campaign">Campaign video</option>
              <option value="manual">Manual session</option>
              <option value="legacy">Legacy session</option>
            </select>
          </label>

          <label className="flex flex-col gap-2 text-sm text-muted-strong">
            <span>Campaign</span>
            <select
              className="rounded-card border border-stroke bg-panel-muted px-4 py-3 text-sm text-foreground outline-none transition focus:border-stroke-strong"
              onChange={(event) => setCampaignFilter(event.target.value)}
              value={campaignFilter}
            >
              <option value="all">All campaigns</option>
              {campaignOptions.map((campaign) => (
                <option key={campaign} value={campaign}>
                  {campaign}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2 text-sm text-muted-strong">
            <span>Date range</span>
            <select
              className="rounded-card border border-stroke bg-panel-muted px-4 py-3 text-sm text-foreground outline-none transition focus:border-stroke-strong"
              onChange={(event) => setDateFilter(event.target.value as DateFilter)}
              value={dateFilter}
            >
              <option value="all">Any time</option>
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
          </label>
        </div>

        <div className="mt-4 rounded-card border border-stroke bg-panel-muted px-4 py-3 text-sm text-muted-strong">
          {loading
            ? "Loading persisted session manifests…"
            : `${filteredSessions.length} of ${sessions.length} sessions match the current filters.`}
        </div>
      </SectionCard>

      {loading ? (
        <SectionCard
          eyebrow="Loading"
          title="Fetching sessions"
          description="The browser is hydrating from `/api/sessions` so empty states and counts stay grounded in backend data."
        >
          <p className="text-sm leading-6 text-muted">Hold on while the persisted session summaries load.</p>
        </SectionCard>
      ) : null}

      {!loading && sessions.length === 0 ? (
        <SectionCard
          eyebrow="Empty state"
          title="No persisted sessions found"
          description="Once campaign processing or manual intake completes phase one, session manifests show up here for workspace hydration."
        >
          <p className="text-sm leading-6 text-muted">
            The browser is ready; it just needs saved session manifests from the backend output directory.
          </p>
        </SectionCard>
      ) : null}

      {!loading && sessions.length > 0 && filteredSessions.length === 0 ? (
        <SectionCard
          eyebrow="No matches"
          title="No sessions match the current filters"
          description="Clear or widen the filters to bring sessions back into view."
        >
          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded-pill border border-stroke-strong bg-accent/10 px-4 text-sm font-semibold text-foreground transition hover:bg-accent/14"
            onClick={() => {
              setSearch("");
              setStatusFilter("all");
              setSourceFilter("all");
              setCampaignFilter("all");
              setDateFilter("all");
            }}
          >
            Clear filters
          </button>
        </SectionCard>
      ) : null}

      {!loading && filteredSessions.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredSessions.map((session) => {
            const source = classifySource(session);
            const updatedAt = sessionTimestamp(session);

            return (
              <SectionCard
                key={session.session_id}
                eyebrow="Session"
                title={session.title}
                description={session.channel || session.session_id}
                action={
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/sessions/${encodeURIComponent(session.session_id)}`}
                      className="inline-flex min-h-11 items-center rounded-pill border border-stroke-strong bg-accent/10 px-4 text-sm font-semibold text-foreground transition hover:bg-accent/14"
                    >
                      Open workspace
                    </Link>
                    {session.has_clips ? (
                      <Link
                        href={`/sessions/${encodeURIComponent(session.session_id)}#outputs`}
                        className="inline-flex min-h-11 items-center rounded-pill border border-stroke px-4 text-sm font-semibold text-foreground-soft transition hover:border-stroke-strong hover:text-foreground"
                      >
                        Current outputs
                      </Link>
                    ) : null}
                  </div>
                }
              >
                <div className="mb-4 flex flex-wrap gap-2">
                  <StatusChip tone={statusTone(session.status)}>{session.status}</StatusChip>
                  <StatusChip tone="neutral">{source.label}</StatusChip>
                  <StatusChip tone="neutral">Updated {formatRelativeShort(updatedAt)}</StatusChip>
                </div>

                <InfoGrid
                  items={[
                    { label: "Campaign", value: session.campaign_label || "Manual or legacy" },
                    { label: "Highlights", value: session.highlight_count },
                    { label: "Selected", value: session.selected_highlight_count },
                    { label: "Clip jobs", value: session.clip_job_count },
                    { label: "Updated", value: formatDateTime(updatedAt) },
                    { label: "Last error", value: session.last_error || "None" },
                  ]}
                />
              </SectionCard>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
