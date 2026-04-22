"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";

import { InfoGrid } from "@/components/common/info-grid";
import { SectionCard } from "@/components/common/section-card";
import { StatePanel } from "@/components/common/state-panel";
import { StatusChip } from "@/components/common/status-chip";
import { SurfaceCard } from "@/components/common/surface-card";
import { useProgress } from "@/hooks/use-progress";
import { campaignsApi } from "@/lib/api";
import { cx, formatDateTime, formatDuration, statusTone, titleCaseLabel } from "@/lib/utils";
import type { CampaignDetailPayload, WorkspacePayload } from "@/types/api";

type QueueFilter = "all" | "new" | "queued" | "active" | "failed" | "completed" | "skipped";
type QueueAction = "queue" | "process" | "skip" | "retry" | "session" | "source";

function computeQueueSummary(detail: CampaignDetailPayload | null) {
  const summary = {
    total: 0,
    new: 0,
    queued: 0,
    active: 0,
    failed: 0,
    completed: 0,
    skipped: 0,
  };

  if (!detail) {
    return summary;
  }

  summary.total = detail.channel_fetch.videos.length;
  for (const video of detail.channel_fetch.videos) {
    if (video.status === "new") summary.new += 1;
    if (video.status === "queued") summary.queued += 1;
    if (["downloading", "transcribing", "rendering"].includes(video.status)) summary.active += 1;
    if (video.status === "failed") summary.failed += 1;
    if (video.status === "completed") summary.completed += 1;
    if (video.status === "skipped") summary.skipped += 1;
  }

  return summary;
}

function resolveQueueActions(status: string): QueueAction[] {
  switch (status) {
    case "new":
      return ["queue", "skip", "source"];
    case "queued":
      return ["process", "skip", "source"];
    case "failed":
      return ["retry", "session", "source"];
    case "skipped":
      return ["queue", "source"];
    case "completed":
    case "editing":
    case "highlights_found":
    case "rendering":
      return ["session", "source"];
    default:
      return ["source"];
  }
}

export function CampaignDetailPageClient({ campaignId }: { campaignId: string }) {
  const { connection, data } = useProgress();
  const [detail, setDetail] = useState<CampaignDetailPayload | null>(null);
  const [workspacePreview, setWorkspacePreview] = useState<WorkspacePayload | null>(null);
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const workerActiveHere = data.is_running && data.campaign_id === campaignId;
  const [isMutating, setIsMutating] = useState(false);
  const queueSummary = useMemo(() => computeQueueSummary(detail), [detail]);

  const filteredVideos = useMemo(() => {
    const videos = detail?.channel_fetch.videos ?? [];

    if (filter === "all") {
      return videos;
    }

    if (filter === "active") {
      return videos.filter((video) => ["downloading", "transcribing", "rendering"].includes(video.status));
    }

    return videos.filter((video) => video.status === filter);
  }, [detail, filter]);

  const failedVideos = useMemo(
    () => (detail?.channel_fetch.videos ?? []).filter((video) => video.status === "failed"),
    [detail],
  );

  const loadDetail = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const nextDetail = await campaignsApi.detail(campaignId);
      setDetail(nextDetail);
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : "Campaign queue unavailable.");
    } finally {
      setIsLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    if (!workerActiveHere) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadDetail();
    }, 3500);

    return () => window.clearInterval(timer);
  }, [loadDetail, workerActiveHere]);

  async function runMutation(action: Promise<unknown>, successMessage: string) {
    setIsMutating(true);
    setError(null);
    setStatusMessage(null);

    try {
      const response = await action;
      if (typeof response === "object" && response !== null && "detail" in response) {
        setDetail((response as { detail?: CampaignDetailPayload }).detail ?? detail);
      } else {
        await loadDetail();
      }
      setStatusMessage(successMessage);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Queue action failed.");
    } finally {
      setIsMutating(false);
    }
  }

  async function handleOpenSession(videoId: string) {
    setError(null);

    try {
      const workspace = await campaignsApi.openSession(campaignId, videoId);
      setWorkspacePreview(workspace);
      setStatusMessage("Loaded linked session context from the backend.");
    } catch (workspaceError) {
      setWorkspacePreview(null);
      setError(workspaceError instanceof Error ? workspaceError.message : "Linked session unavailable.");
    }
  }

  if (error && !detail && !isLoading) {
    return (
      <StatePanel
        title="Campaign queue unavailable"
        message={error}
        action={
          <button
            className="inline-flex min-h-11 items-center gap-2 rounded-pill border border-stroke-strong bg-accent/10 px-4 text-sm font-semibold text-foreground transition hover:bg-accent/14"
            onClick={() => void loadDetail()}
            type="button"
          >
            <RefreshCw className="size-4" />
            Retry
          </button>
        }
      />
    );
  }

  return (
    <div className="grid gap-6">
      {connection === "offline" ? (
        <div className="rounded-card border border-danger/20 bg-danger/8 px-4 py-3 text-sm leading-6 text-muted-strong">
          Backend appears offline. Queue actions will resume when the connection returns.
        </div>
      ) : null}

      <SectionCard
        eyebrow="Campaign queue"
        title={detail?.campaign.name || "Campaign queue"}
        description={detail?.campaign.channel_url || "Queue hydration and row actions are driven by the live FastAPI campaign detail endpoint."}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone={connection === "offline" ? "danger" : workerActiveHere ? "brand" : "neutral"}>
              {connection === "offline" ? "Backend offline" : workerActiveHere ? `${titleCaseLabel(data.task_type ?? "active")} · live` : "Queue idle"}
            </StatusChip>
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-pill border border-stroke px-4 text-sm font-semibold text-foreground transition hover:border-stroke-strong hover:bg-white/6 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={connection === "offline"}
              onClick={() => void loadDetail()}
              type="button"
            >
              <RefreshCw className={cx("size-4", isLoading ? "animate-spin" : "")} />
              Refresh
            </button>
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-pill border border-stroke-strong bg-brand/15 px-4 text-sm font-semibold text-foreground transition hover:border-accent/50 hover:bg-accent/12 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isMutating || !detail}
              onClick={() => detail && void runMutation(campaignsApi.fetchVideos(campaignId, { channel_url: detail.campaign.channel_url || detail.channel_fetch.channel_url }), "Fetch started. The queue will refresh while the worker is active.")}
              type="button"
            >
              Fetch latest videos
            </button>
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-pill border border-stroke-strong bg-accent/10 px-4 text-sm font-semibold text-foreground transition hover:bg-accent/14 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isMutating || !detail}
              onClick={() => void runMutation(campaignsApi.queueAll(campaignId), "Queued all rows still marked as new.")}
              type="button"
            >
              Queue all new
            </button>
          </div>
        }
      >
        {statusMessage ? (
          <div className="rounded-card border border-stroke-strong bg-accent/8 px-4 py-3 text-sm leading-6 text-foreground-soft">
            {statusMessage}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-card border border-danger/25 bg-danger/8 px-4 py-3 text-sm leading-6 text-muted-strong">
            {error}
          </div>
        ) : null}

        <InfoGrid
          items={[
            { label: "Fetched at", value: formatDateTime(detail?.channel_fetch.fetched_at) },
            { label: "Channel id", value: detail?.channel_fetch.channel_id || "Not fetched yet" },
            { label: "Queue rows", value: queueSummary.total },
            { label: "Default clips", value: detail?.num_clips ?? "-" },
            { label: "Last fetch error", value: detail?.channel_fetch.last_error || "None" },
            { label: "Campaign updated", value: formatDateTime(detail?.campaign.updated_at) },
          ]}
        />
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.95fr]">
        <div className="grid gap-6">
          <SectionCard
            eyebrow="Queue control bar"
            title="Queue actions and filter surface"
            description="Bulk process and bulk retry remain visible as structural UI, but only the row-level actions already supported by FastAPI are wired as complete workflows."
          >
            <div className="grid gap-4 rounded-card border border-dashed border-stroke-strong bg-accent/6 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,0.7fr)_repeat(2,auto)] lg:items-end">
              <label className="space-y-2 text-sm text-muted">
                <span className="font-medium text-foreground-soft">Campaign channel URL</span>
                <input className="min-h-11 rounded-pill border border-stroke bg-panel-muted px-4 text-foreground outline-none" disabled value={detail?.campaign.channel_url || detail?.channel_fetch.channel_url || ""} />
              </label>
              <label className="space-y-2 text-sm text-muted">
                <span className="font-medium text-foreground-soft">Filter by status</span>
                <select
                  className="min-h-11 rounded-pill border border-stroke bg-panel-muted px-4 text-foreground outline-none"
                  onChange={(event) => setFilter(event.target.value as QueueFilter)}
                  value={filter}
                >
                  <option value="all">All rows</option>
                  <option value="new">New</option>
                  <option value="queued">Queued</option>
                  <option value="active">Active</option>
                  <option value="failed">Failed</option>
                  <option value="completed">Completed</option>
                  <option value="skipped">Skipped</option>
                </select>
              </label>
              <div className="rounded-pill border border-stroke bg-panel-muted px-4 py-3 text-sm text-muted">Process selected (not exposed)</div>
              <div className="rounded-pill border border-stroke bg-panel-muted px-4 py-3 text-sm text-muted">Retry failed (row-level only)</div>
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Queue rows"
            title="Persisted row states, actions, and recovery context"
            description="Rows only expose actions supported by the current queue state and backend surface: queue, process, skip, retry, open session, and open source URL."
          >
            {filteredVideos.length === 0 && !isLoading ? (
              <p className="text-sm leading-6 text-muted">No queue rows match the current filter. Fetch videos or switch the filter back to all rows.</p>
            ) : null}

            <div className="grid gap-4">
              {filteredVideos.map((video) => {
                const actions = resolveQueueActions(video.status);

                return (
                  <SurfaceCard key={video.video_id} className="border-stroke bg-panel/90">
                    <div className="grid gap-4 lg:grid-cols-[10rem_minmax(0,1fr)]">
                      <div className="overflow-hidden rounded-card border border-stroke bg-panel-muted">
                        {video.thumbnail_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img alt={video.title} className="h-full w-full object-cover" src={video.thumbnail_url} />
                        ) : (
                          <div className="flex aspect-video items-center justify-center text-sm text-muted">No thumbnail</div>
                        )}
                      </div>

                      <div className="grid gap-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-semibold text-foreground">{video.title}</h3>
                            <p className="mt-1 text-sm leading-6 text-muted">{video.channel_name || video.video_id}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <StatusChip tone={statusTone(video.status)}>{video.status}</StatusChip>
                            {video.last_error ? <StatusChip tone="danger">Error surfaced</StatusChip> : null}
                          </div>
                        </div>

                        <InfoGrid
                          items={[
                            { label: "Published", value: formatDateTime(video.published_at) },
                            { label: "Duration", value: formatDuration(video.duration_seconds) },
                            { label: "Session", value: video.session_id || "Not linked yet" },
                            { label: "Updated", value: formatDateTime(video.updated_at) },
                            { label: "Video id", value: video.video_id },
                            { label: "Last error", value: video.last_error || "None" },
                          ]}
                        />

                        <div className="flex flex-wrap gap-2 text-sm font-semibold">
                          {actions.includes("queue") ? (
                            <button
                              className="inline-flex min-h-11 items-center justify-center rounded-pill border border-stroke px-4 text-foreground transition hover:border-stroke-strong hover:bg-white/6 disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={isMutating}
                              onClick={() => void runMutation(campaignsApi.queueVideo(campaignId, video.video_id), "Queue row updated.")}
                              type="button"
                            >
                              Queue
                            </button>
                          ) : null}
                          {actions.includes("process") ? (
                            <button
                              className="inline-flex min-h-11 items-center justify-center rounded-pill border border-stroke-strong bg-brand/15 px-4 text-foreground transition hover:border-accent/50 hover:bg-accent/12 disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={isMutating}
                              onClick={() => void runMutation(campaignsApi.processVideo(campaignId, video.video_id), "Processing started. The runtime widget will follow the active row.")}
                              type="button"
                            >
                              Process
                            </button>
                          ) : null}
                          {actions.includes("skip") ? (
                            <button
                              className="inline-flex min-h-11 items-center justify-center rounded-pill border border-stroke px-4 text-foreground transition hover:border-stroke-strong hover:bg-white/6 disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={isMutating}
                              onClick={() => void runMutation(campaignsApi.skipVideo(campaignId, video.video_id), "Queue row marked as skipped.")}
                              type="button"
                            >
                              Skip
                            </button>
                          ) : null}
                          {actions.includes("retry") ? (
                            <button
                              className="inline-flex min-h-11 items-center justify-center rounded-pill border border-stroke px-4 text-foreground transition hover:border-warning/40 hover:bg-warning/10 disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={isMutating}
                              onClick={() => void runMutation(campaignsApi.retryVideo(campaignId, video.video_id), "Retry started for the failed row.")}
                              type="button"
                            >
                              Retry
                            </button>
                          ) : null}
                          {actions.includes("session") && video.session_id ? (
                            <>
                              <button
                                className="inline-flex min-h-11 items-center justify-center rounded-pill border border-stroke px-4 text-foreground transition hover:border-stroke-strong hover:bg-white/6"
                                onClick={() => void handleOpenSession(video.video_id)}
                                type="button"
                              >
                                Inspect session
                              </button>
                              <Link
                                href={`/sessions/${video.session_id}`}
                                className="inline-flex min-h-11 items-center justify-center rounded-pill border border-stroke px-4 text-foreground transition hover:border-stroke-strong hover:bg-white/6"
                              >
                                Open session
                              </Link>
                            </>
                          ) : null}
                          {actions.includes("source") ? (
                            <a
                              href={video.video_url}
                              rel="noreferrer"
                              target="_blank"
                              className="inline-flex min-h-11 items-center justify-center rounded-pill border border-stroke px-4 text-foreground transition hover:border-stroke-strong hover:bg-white/6"
                            >
                              Open source URL
                            </a>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </SurfaceCard>
                );
              })}
            </div>
          </SectionCard>
        </div>

        <div className="grid gap-6">
          <SectionCard
            eyebrow="Failed and partial summary"
            title="Recovery surface"
            description="Failed rows remain sticky here so recovery actions stay obvious after refreshes, retries, or backend restarts."
          >
            <InfoGrid
              items={[
                { label: "Total rows", value: queueSummary.total },
                { label: "New", value: queueSummary.new },
                { label: "Queued", value: queueSummary.queued },
                { label: "Active", value: queueSummary.active },
                { label: "Failed", value: queueSummary.failed },
                { label: "Completed", value: queueSummary.completed },
              ]}
            />

            {workerActiveHere ? (
              <div className="flex items-center gap-2 rounded-card border border-stroke-strong bg-accent/8 px-4 py-3 text-sm leading-6 text-foreground-soft">
                <LoaderCircle className="size-4 animate-spin text-accent" />
                <span>{data.status}</span>
              </div>
            ) : null}

            <div className="grid gap-3">
              {failedVideos.length === 0 ? (
                <p className="text-sm leading-6 text-muted">No failed rows are persisted for this campaign right now.</p>
              ) : (
                failedVideos.slice(0, 4).map((video) => (
                  <div key={video.video_id} className="rounded-card border border-danger/20 bg-danger/8 px-4 py-3 text-sm leading-6 text-muted-strong">
                    <p className="font-semibold text-foreground">{video.title}</p>
                    <p className="mt-2">{video.last_error || "Queue row failed without a persisted error message."}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        className="inline-flex min-h-10 items-center justify-center rounded-pill border border-danger/35 px-4 text-sm font-semibold text-foreground transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isMutating}
                        onClick={() => void runMutation(campaignsApi.retryVideo(campaignId, video.video_id), "Retry started for the failed row.")}
                        type="button"
                      >
                        Retry row
                      </button>
                      {video.session_id ? (
                        <Link href={`/sessions/${video.session_id}`} className="inline-flex min-h-10 items-center justify-center rounded-pill border border-stroke px-4 text-sm font-semibold text-foreground transition hover:border-stroke-strong hover:bg-white/6">
                          Open session
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Linked session context"
            title="Session preview"
            description="Inspect the queue row’s linked workspace payload without leaving the queue route."
          >
            {!workspacePreview ? (
              <p className="text-sm leading-6 text-muted">Use a row-level Inspect session action to load queue summary, provider summary, and output availability for the linked session.</p>
            ) : (
              <div className="grid gap-4">
                <div className="flex flex-wrap gap-2">
                  <StatusChip tone={statusTone(workspacePreview.session.status)}>{workspacePreview.session.status}</StatusChip>
                  <StatusChip tone="neutral">{workspacePreview.session.stage}</StatusChip>
                </div>
                <InfoGrid
                  items={[
                    { label: "Session", value: workspacePreview.session.session_id },
                    { label: "Campaign", value: workspacePreview.session.campaign_label || "Manual or legacy" },
                    { label: "Clip jobs", value: workspacePreview.queue_summary.total },
                    { label: "Completed outputs", value: workspacePreview.output_clips.length },
                    { label: "Provider", value: workspacePreview.provider_summary },
                    { label: "Last error", value: workspacePreview.session.last_error || "None" },
                  ]}
                />
                {workspacePreview.session.session_id ? (
                  <Link
                    href={`/sessions/${workspacePreview.session.session_id}`}
                    className="inline-flex min-h-11 items-center justify-center rounded-pill border border-stroke-strong bg-accent/10 px-4 text-sm font-semibold text-foreground transition hover:bg-accent/14"
                  >
                    Open full workspace
                  </Link>
                ) : null}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
