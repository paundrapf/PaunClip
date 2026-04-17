"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { SectionCard } from "@/components/common/section-card";
import { InfoGrid } from "@/components/common/info-grid";
import { StatePanel } from "@/components/common/state-panel";
import { StatusChip } from "@/components/common/status-chip";
import { SurfaceCard } from "@/components/common/surface-card";
import { useProgress } from "@/hooks/use-progress";
import { resolveOutputAssetUrl } from "@/lib/config";
import { sessionsApi } from "@/lib/api";
import { formatDuration, formatRelativeDate, statusTone } from "@/lib/utils";
import type { OutputClipRecord, SessionSummary } from "@/types/api";

interface LibraryClip extends OutputClipRecord {
  sessionId: string;
  sessionTitle: string;
  sessionStatus: string;
  sessionUpdatedAt?: string;
  campaignId?: string | null;
  campaignLabel?: string | null;
}

type SortMode = "recent" | "title" | "duration";

export function LibraryPageClient() {
  const { connection, data } = useProgress();
  const [clips, setClips] = useState<LibraryClip[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    async function loadLibrary() {
      setIsLoading(true);
      setError(null);

      try {
        const sessions = await sessionsApi.list();
        const candidates = sessions.filter(
          (session) => session.has_clips || ["completed", "partial", "rendering", "editing"].includes(session.status),
        );

        const results = await Promise.allSettled(candidates.map((session) => sessionsApi.workspace(session.session_id)));
        const nextClips: LibraryClip[] = [];
        let failedHydrations = 0;

        results.forEach((result, index) => {
          const session = candidates[index] as SessionSummary | undefined;
          if (!session) {
            return;
          }

          if (result.status !== "fulfilled") {
            failedHydrations += 1;
            return;
          }

          result.value.output_clips.forEach((clip) => {
            nextClips.push({
              ...clip,
              sessionId: session.session_id,
              sessionTitle: session.title,
              sessionStatus: session.status,
              sessionUpdatedAt: session.updated_at,
              campaignId: session.campaign_id,
              campaignLabel: session.campaign_label,
            });
          });
        });

        setClips(nextClips);
        setNotice(
          failedHydrations > 0
            ? `${failedHydrations} session workspaces could not be hydrated, so this library view may be partial until a dedicated output summary endpoint exists.`
            : "The library currently hydrates from session workspace payloads because FastAPI does not expose a dedicated output summary endpoint yet.",
        );
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Library summary unavailable.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadLibrary();
  }, []);

  const filteredClips = useMemo(() => {
    const lookup = search.trim().toLowerCase();
    const result = clips.filter((clip) => {
      const matchesStatus = statusFilter === "all" || clip.status === statusFilter;
      const matchesSearch =
        !lookup ||
        [clip.title, clip.hook_text, clip.sessionTitle, clip.campaignLabel]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(lookup));

      return matchesStatus && matchesSearch;
    });

    return result.sort((left, right) => {
      if (sortMode === "title") {
        return left.title.localeCompare(right.title);
      }
      if (sortMode === "duration") {
        return (right.duration ?? 0) - (left.duration ?? 0);
      }

      return String(right.sessionUpdatedAt ?? "").localeCompare(String(left.sessionUpdatedAt ?? ""));
    });
  }, [clips, search, sortMode, statusFilter]);

  if (error && !clips.length && !isLoading) {
    return <StatePanel title="Library unavailable" message={error} />;
  }

  return (
    <div className="grid gap-6">
      <SectionCard
        eyebrow="Outputs"
        title="Global library"
        description="Browse rendered clips, preview assets, and jump back to the parent session or campaign while keeping backend limitations explicit."
        action={<StatusChip tone={connection === "offline" ? "danger" : data.is_running ? "brand" : "neutral"}>{connection === "offline" ? "Backend offline" : data.is_running ? "Worker active" : "Read-only ready"}</StatusChip>}
      >
        {notice ? (
          <div className="rounded-card border border-warning/25 bg-warning/8 px-4 py-3 text-sm leading-6 text-muted-strong">
            {notice}
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,0.7fr)_minmax(12rem,0.7fr)]">
          <label className="space-y-2 text-sm text-muted">
            <span className="font-medium text-foreground-soft">Search</span>
            <input
              className="min-h-11 rounded-pill border border-stroke bg-panel-muted px-4 text-foreground outline-none transition focus:border-stroke-strong"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Title, hook, session, or campaign"
              value={search}
            />
          </label>
          <label className="space-y-2 text-sm text-muted">
            <span className="font-medium text-foreground-soft">Status</span>
            <select
              className="min-h-11 rounded-pill border border-stroke bg-panel-muted px-4 text-foreground outline-none transition focus:border-stroke-strong"
              onChange={(event) => setStatusFilter(event.target.value)}
              value={statusFilter}
            >
              <option value="all">All statuses</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="rendering">Rendering</option>
            </select>
          </label>
          <label className="space-y-2 text-sm text-muted">
            <span className="font-medium text-foreground-soft">Sort</span>
            <select
              className="min-h-11 rounded-pill border border-stroke bg-panel-muted px-4 text-foreground outline-none transition focus:border-stroke-strong"
              onChange={(event) => setSortMode(event.target.value as SortMode)}
              value={sortMode}
            >
              <option value="recent">Most recent</option>
              <option value="title">Title</option>
              <option value="duration">Duration</option>
            </select>
          </label>
        </div>
      </SectionCard>

      {filteredClips.length === 0 && !isLoading ? (
        <SectionCard
          eyebrow="Empty state"
          title="No rendered clips yet"
          description="Outputs appear here once a session produces a persisted `master.mp4` and clip metadata payload."
        >
          <p className="text-sm leading-6 text-muted">Finish a render from the session workspace or campaign queue, then refresh the library view.</p>
        </SectionCard>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {filteredClips.map((clip) => {
          const clipUrl = resolveOutputAssetUrl(clip.master_path);

          return (
            <SurfaceCard key={`${clip.sessionId}-${clip.clip_id}`} className="border-stroke bg-panel/90">
              <div className="grid gap-4">
                <div className="overflow-hidden rounded-card border border-stroke bg-panel-muted">
                  {clipUrl ? (
                    <video className="aspect-video w-full bg-black object-cover" controls preload="metadata" src={clipUrl} />
                  ) : (
                    <div className="flex aspect-video items-center justify-center text-sm text-muted">Preview unavailable</div>
                  )}
                </div>

                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-foreground">{clip.title}</h3>
                    <p className="text-sm leading-6 text-muted">{clip.hook_text || "No hook text stored for this clip."}</p>
                  </div>
                  <StatusChip tone={statusTone(clip.status)}>{clip.status}</StatusChip>
                </div>

                <InfoGrid
                  items={[
                    { label: "Duration", value: formatDuration(clip.duration) },
                    { label: "Revision", value: clip.revision_label },
                    { label: "Session", value: clip.sessionTitle },
                    { label: "Campaign", value: clip.campaignLabel || "Manual or legacy" },
                    { label: "Session status", value: clip.sessionStatus },
                    { label: "Updated", value: formatRelativeDate(clip.sessionUpdatedAt) },
                  ]}
                />

                <div className="flex flex-wrap gap-2 text-sm font-semibold">
                  {clipUrl ? (
                    <a
                      href={clipUrl}
                      download
                      className="inline-flex min-h-11 items-center justify-center rounded-pill border border-stroke-strong bg-brand/15 px-4 text-foreground transition hover:border-accent/50 hover:bg-accent/12"
                    >
                      Download MP4
                    </a>
                  ) : null}
                  <Link href={`/sessions/${clip.sessionId}`} className="inline-flex min-h-11 items-center justify-center rounded-pill border border-stroke px-4 text-foreground transition hover:border-stroke-strong hover:bg-white/6">
                    Open parent session
                  </Link>
                  {clip.campaignId ? (
                    <Link href={`/campaigns/${clip.campaignId}`} className="inline-flex min-h-11 items-center justify-center rounded-pill border border-stroke px-4 text-foreground transition hover:border-stroke-strong hover:bg-white/6">
                      Open campaign
                    </Link>
                  ) : null}
                  <span className="inline-flex min-h-11 items-center justify-center rounded-pill border border-dashed border-stroke px-4 text-muted">
                    JSON export pending endpoint
                  </span>
                </div>
              </div>
            </SurfaceCard>
          );
        })}
      </div>
    </div>
  );
}
