"use client";

import { useRef, useState } from "react";
import type { RefObject } from "react";
import Link from "next/link";
import {
  Captions,
  CheckSquare,
  CircleAlert,
  Clock3,
  Eye,
  Film,
  Loader2,
  MessageSquareText,
  Minus,
  PlayCircle,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Square,
  X
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { trpc } from "@/features/trpc/client";
import {
  campaignVideoStatusLabel,
  getCampaignVideoDisplayStatus,
  type CampaignVideoDisplayStatus
} from "@/shared/campaign/status";
import type { CampaignBatchConfig, CampaignContentType } from "@/shared/schemas/campaign";
import { sessionConfigSchema, type SessionConfig } from "@/shared/schemas/session";

const DEFAULT_BATCH_CONFIG: CampaignBatchConfig = {
  clipsPerVideo: 3,
  autoHook: true,
  captionStyleId: "karaoke",
  renderMode: "review",
  clipLength: "auto",
  language: "id",
  prompt: ""
};

const CONTENT_TYPE_OPTIONS: Array<{ value: CampaignContentType; label: string; helper: string }> = [
  { value: "videos", label: "Videos", helper: "Latest long-form uploads" },
  { value: "shorts", label: "Shorts", helper: "Latest shorts tab" },
  { value: "all", label: "Videos + Shorts", helper: "Merge both tabs" }
];

const CLIP_LENGTH_OPTIONS: Array<{ value: SessionConfig["clipLength"]; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "lt_30s", label: "<30s" },
  { value: "30s_59s", label: "30s-59s" },
  { value: "60s_89s", label: "60s-89s" },
  { value: "90s_3m", label: "90s-3m" }
];

const STATUS_FILTERS: Array<{ value: "all" | "selected" | "needs_review" | "failed"; label: string }> = [
  { value: "all", label: "All" },
  { value: "selected", label: "Selected" },
  { value: "needs_review", label: "Needs review" },
  { value: "failed", label: "Failed" }
];

export function CampaignWorkspaceScreen({ campaignId }: { campaignId: string }) {
  const utils = trpc.useUtils();
  const { notify } = useToast();
  const progressRef = useRef<HTMLElement | null>(null);
  const [draftName, setDraftName] = useState<string | null>(null);
  const [draftChannelUrl, setDraftChannelUrl] = useState<string | null>(null);
  const [limit, setLimit] = useState(10);
  const [contentType, setContentType] = useState<CampaignContentType>("videos");
  const [localSelectedVideoIds, setLocalSelectedVideoIds] = useState<string[] | null>(null);
  const [perVideoClipCounts, setPerVideoClipCounts] = useState<Record<string, number>>({});
  const [batchConfig, setBatchConfig] = useState<CampaignBatchConfig>(DEFAULT_BATCH_CONFIG);
  const [prepareOpen, setPrepareOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]["value"]>("all");
  const [focusedStep, setFocusedStep] = useState<"find" | "pick" | "prepare" | "progress" | "review">("find");

  const campaignQuery = trpc.campaign.getById.useQuery(campaignId, {
    refetchInterval: 2000
  });
  const settings = trpc.settings.get.useQuery();
  const updateCampaign = trpc.campaign.update.useMutation();
  const fetchVideos = trpc.campaign.fetchVideos.useMutation();
  const setVideoSelection = trpc.campaign.setVideoSelection.useMutation({
    onSuccess: async () => {
      await utils.campaign.getById.invalidate(campaignId);
    },
    onError: (error) => {
      notify({
        type: "error",
        title: "Selection was not saved",
        description: error.message
      });
    }
  });
  const startBatch = trpc.campaign.startBatch.useMutation();

  const campaign = campaignQuery.data;
  const campaignName = draftName ?? campaign?.name ?? "";
  const channelUrl = draftChannelUrl ?? campaign?.channelUrl ?? "";
  const videos = campaign?.videos ?? [];
  const selectedVideoIds =
    localSelectedVideoIds ?? videos.filter((video) => video.selected).map((video) => video.id);
  const allVideosSelected = Boolean(videos.length) && videos.every((video) => selectedVideoIds.includes(video.id));
  const selectedClipTotal = selectedVideoIds.reduce((total, videoId) => total + getVideoClipCount(videoId), 0);
  const captionPresets = settings.data?.captionPresets ?? [];

  const visibleVideos = (() => {
    const query = searchQuery.trim().toLowerCase();
    return videos.filter((video) => {
      const status = getCampaignVideoDisplayStatus(video);
      if (statusFilter === "selected" && !selectedVideoIds.includes(video.id)) {
        return false;
      }
      if (statusFilter === "needs_review" && status !== "needs_review") {
        return false;
      }
      if (statusFilter === "failed" && status !== "failed" && status !== "cancelled") {
        return false;
      }
      return !query || video.title.toLowerCase().includes(query);
    });
  })();

  const summary = (() => {
    const statuses = videos.map((video) => getCampaignVideoDisplayStatus(video));
    return {
      selected: selectedVideoIds.length,
      plannedClips: selectedClipTotal,
      active: statuses.filter((status) => status === "queued" || status === "processing").length,
      needsReview: statuses.filter((status) => status === "needs_review").length,
      completed: statuses.filter((status) => status === "completed" || status === "completed_with_warnings").length,
      failed: statuses.filter((status) => status === "failed" || status === "cancelled").length
    };
  })();

  const currentStep = getCurrentStep({
    focusedStep,
    videoCount: videos.length,
    selectedCount: selectedVideoIds.length,
    activeCount: summary.active,
    reviewCount: summary.needsReview,
    completedCount: summary.completed,
    failedCount: summary.failed
  });

  function getVideoClipCount(videoId: string) {
    return perVideoClipCounts[videoId] ?? batchConfig.clipsPerVideo;
  }

  function updateBatchConfig(next: Partial<CampaignBatchConfig>) {
    setBatchConfig((current) => ({ ...current, ...next }));
  }

  async function findLatestVideos() {
    const source = channelUrl.trim();
    if (!source) {
      notify({
        type: "warning",
        title: "YouTube source is empty",
        description: "Paste a channel, playlist, or @handle before finding videos."
      });
      return;
    }

    try {
      await updateCampaign.mutateAsync({
        campaignId,
        name: campaignName.trim() || "Untitled campaign",
        channelUrl: source,
        config: sessionConfigSchema.parse({
          ...batchConfig,
          targetClipCount: batchConfig.clipsPerVideo,
          promptMode: "campaign_batch"
        })
      });
      const nextCampaign = await fetchVideos.mutateAsync({
        campaignId,
        limit,
        contentType
      });
      setLocalSelectedVideoIds(null);
      setFocusedStep("pick");
      setMessage(`${nextCampaign?.videos.length ?? 0} videos ready to review.`);
      notify({
        type: "success",
        title: "Latest videos loaded",
        description: "Pick the videos you want PaunClip to clip."
      });
      await utils.campaign.getById.invalidate(campaignId);
      await utils.campaign.list.invalidate();
    } catch (error) {
      const description = error instanceof Error ? error.message : String(error);
      setMessage(description);
      notify({
        type: "error",
        title: "Could not find videos",
        description
      });
    }
  }

  function persistVideoSelection(videoIds: string[]) {
    setLocalSelectedVideoIds(videoIds);
    setVideoSelection.mutate({
      campaignId,
      videoIds
    });
  }

  function toggleVideo(videoId: string) {
    const nextIds = selectedVideoIds.includes(videoId)
      ? selectedVideoIds.filter((id) => id !== videoId)
      : [...selectedVideoIds, videoId];
    persistVideoSelection(nextIds);
  }

  function selectVisibleVideos() {
    const visibleIds = visibleVideos.map((video) => video.id);
    persistVideoSelection(Array.from(new Set([...selectedVideoIds, ...visibleIds])));
  }

  function clearSelection() {
    persistVideoSelection([]);
  }

  function toggleAllVideos() {
    persistVideoSelection(allVideosSelected ? [] : videos.map((video) => video.id));
  }

  function setVideoClipCount(videoId: string, value: number) {
    setPerVideoClipCounts((current) => ({
      ...current,
      [videoId]: Math.min(10, Math.max(1, value))
    }));
  }

  function openPrepareBatch() {
    if (selectedVideoIds.length === 0) {
      notify({
        type: "warning",
        title: "No videos selected",
        description: "Select at least one video before starting a campaign batch."
      });
      return;
    }
    setFocusedStep("prepare");
    setPrepareOpen(true);
  }

  async function startSelectedVideos() {
    try {
      const result = await startBatch.mutateAsync({
        campaignId,
        videoIds: selectedVideoIds,
        batchConfig,
        perVideoClipCounts: Object.fromEntries(
          selectedVideoIds.map((videoId) => [videoId, getVideoClipCount(videoId)])
        )
      });
      setPrepareOpen(false);
      setFocusedStep("progress");
      setLocalSelectedVideoIds(null);
      setMessage(`${result.queuedCount} videos queued${result.skippedCount ? `, ${result.skippedCount} skipped` : ""}.`);
      notify({
        type: result.queuedCount ? "success" : "warning",
        title: result.queuedCount ? "Batch queued" : "No new videos queued",
        description: result.skippedCount
          ? `${result.queuedCount} queued, ${result.skippedCount} already had sessions.`
          : `${result.queuedCount} videos are processing.`
      });
      await utils.campaign.getById.invalidate(campaignId);
      await utils.campaign.list.invalidate();
      window.setTimeout(() => {
        progressRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    } catch (error) {
      const description = error instanceof Error ? error.message : String(error);
      setMessage(description);
      notify({
        type: "error",
        title: "Batch could not start",
        description
      });
    }
  }

  if (campaignQuery.isLoading) {
    return (
      <div className="mx-auto grid min-h-screen w-full max-w-[1400px] gap-5 overflow-hidden px-5 py-6 sm:px-8">
        <div className="h-32 rounded-lg border border-[var(--border)] bg-[rgb(18_18_16_/_0.45)]" />
        <div className="h-72 rounded-lg border border-[var(--border)] bg-[rgb(18_18_16_/_0.45)]" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="mx-auto grid min-h-screen w-full max-w-[900px] place-items-center px-5 py-6 text-center sm:px-8">
        <div className="grid gap-4 rounded-lg border border-[var(--border)] bg-[rgb(18_18_16_/_0.72)] p-8">
          <CircleAlert className="mx-auto h-8 w-8 text-[var(--danger)]" aria-hidden="true" />
          <h1 className="text-xl font-semibold text-[var(--text)]">Campaign not found</h1>
          <p className="text-sm text-[var(--muted)]">The workspace may have been deleted or the URL is invalid.</p>
          <Link className="font-semibold text-[var(--accent-strong)]" href="/campaigns">
            Back to campaigns
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto grid min-h-screen w-full max-w-[1500px] gap-7 overflow-hidden px-5 py-6 sm:px-8">
      <header className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_440px]">
        <div className="min-w-0">
          <Link href="/campaigns" className="text-sm font-semibold text-[var(--accent-strong)]">
            Campaigns
          </Link>
          <h1 className="mt-2 break-words text-2xl font-semibold text-[var(--text)] sm:text-3xl">{campaign.name}</h1>
          <p className="mt-2 max-w-2xl break-words text-sm leading-6 text-[var(--muted)]">
            {campaign.channelUrl || "Add a YouTube channel, playlist, or @handle to begin."}
          </p>
        </div>
        <div className="grid gap-3 rounded-lg border border-[var(--border)] bg-[rgb(18_18_16_/_0.62)] p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-[var(--text)]">Batch summary</span>
            <Badge>{campaignVideoStatusLabel(currentStepToStatus(currentStep))}</Badge>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-6 xl:grid-cols-3">
            <SummaryMetric label="Selected" value={summary.selected} />
            <SummaryMetric label="Clips" value={summary.plannedClips} />
            <SummaryMetric label="Active" value={summary.active} />
            <SummaryMetric label="Review" value={summary.needsReview} />
            <SummaryMetric label="Done" value={summary.completed} />
            <SummaryMetric label="Failed" value={summary.failed} />
          </div>
        </div>
      </header>

      <StepRail currentStep={currentStep} />

      {message ? (
        <div className="rounded-lg border border-[rgb(242_162_58_/_0.3)] bg-[var(--accent-muted)] p-3 text-sm text-[var(--text)]">
          {message}
        </div>
      ) : null}

      <section className="grid min-w-0 gap-5 rounded-lg border border-[var(--border)] bg-[rgb(18_18_16_/_0.72)] p-5 shadow-[var(--shadow-tight)] sm:p-6">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text)]">Find videos</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Load recent uploads before anything is processed.</p>
          </div>
          <Badge>{limit} latest</Badge>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <label className="grid gap-2">
            <span className="text-xs font-semibold text-[var(--muted-soft)]">Campaign name</span>
            <Input value={campaignName} onChange={(event) => setDraftName(event.target.value)} placeholder="April launch clips" />
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-semibold text-[var(--muted-soft)]">YouTube channel, playlist, or @handle</span>
            <Input
              value={channelUrl}
              onChange={(event) => setDraftChannelUrl(event.target.value)}
              placeholder="https://www.youtube.com/@channelname"
            />
          </label>
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex min-w-0 flex-wrap gap-2">
            {CONTENT_TYPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setContentType(option.value)}
                className={`rounded-lg border px-4 py-3 text-left transition active:translate-y-px ${
                  contentType === option.value
                    ? "border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--text)]"
                    : "border-[var(--border)] bg-[rgb(7_7_6_/_0.52)] text-[var(--muted)] hover:border-[var(--border-strong)]"
                }`}
              >
                <span className="block text-sm font-semibold">{option.label}</span>
                <span className="mt-1 block text-xs">{option.helper}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            {[5, 10, 20, 50].map((value) => (
              <Button
                key={value}
                type="button"
                variant={limit === value ? "primary" : "secondary"}
                size="sm"
                onClick={() => setLimit(value)}
              >
                {value}
              </Button>
            ))}
            <Button type="button" variant="primary" onClick={findLatestVideos} disabled={updateCampaign.isPending || fetchVideos.isPending}>
              {updateCampaign.isPending || fetchVideos.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Find latest videos
            </Button>
          </div>
        </div>
      </section>

      <section className="grid min-w-0 gap-4">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[var(--text)]">Pick videos</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Select videos and set how many clips PaunClip should look for in each one.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {videos.length ? (
              <>
                <Button type="button" variant="secondary" disabled={setVideoSelection.isPending} onClick={selectVisibleVideos}>
                  Select visible
                </Button>
                <Button type="button" variant={allVideosSelected ? "primary" : "secondary"} disabled={setVideoSelection.isPending} onClick={toggleAllVideos}>
                  {allVideosSelected ? "Clear all" : "Select all"}
                </Button>
              </>
            ) : null}
            <Button type="button" variant="primary" disabled={selectedVideoIds.length === 0 || startBatch.isPending} onClick={openPrepareBatch}>
              <PlayCircle className="h-4 w-4" />
              Start clipping selected videos
            </Button>
          </div>
        </div>

        {videos.length ? (
          <div className="grid gap-3 rounded-lg border border-[var(--border)] bg-[rgb(18_18_16_/_0.45)] p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <label className="relative block min-w-0">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-soft)]" aria-hidden="true" />
              <Input className="pl-11" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search fetched videos..." />
            </label>
            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map((filter) => (
                <Button
                  key={filter.value}
                  type="button"
                  size="sm"
                  variant={statusFilter === filter.value ? "primary" : "secondary"}
                  onClick={() => setStatusFilter(filter.value)}
                >
                  {filter.label}
                </Button>
              ))}
              {selectedVideoIds.length ? (
                <Button type="button" size="sm" variant="ghost" onClick={clearSelection}>
                  Clear selection
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {videos.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleVideos.map((video) => (
              <CampaignVideoCard
                key={video.id}
                video={video}
                selected={selectedVideoIds.includes(video.id)}
                clipCount={getVideoClipCount(video.id)}
                onToggle={() => toggleVideo(video.id)}
                onClipCountChange={(value) => setVideoClipCount(video.id, value)}
              />
            ))}
          </div>
        ) : (
          <div className="grid place-items-center rounded-lg border border-dashed border-[var(--border-strong)] bg-[rgb(18_18_16_/_0.45)] py-20 text-center">
            <div className="grid max-w-md gap-3 px-5">
              <Film className="mx-auto h-8 w-8 text-[var(--muted-soft)]" aria-hidden="true" />
              <h3 className="text-base font-semibold text-[var(--text)]">No videos loaded yet</h3>
              <p className="text-sm text-[var(--muted)]">Click Find latest videos to load candidates from this campaign source.</p>
            </div>
          </div>
        )}
      </section>

      <BatchProgressPanel refNode={progressRef} videos={videos} />

      {prepareOpen ? (
        <PrepareBatchModal
          batchConfig={batchConfig}
          captionPresets={captionPresets}
          selectedVideoCount={selectedVideoIds.length}
          selectedClipTotal={selectedClipTotal}
          startPending={startBatch.isPending}
          onClose={() => setPrepareOpen(false)}
          onConfirm={startSelectedVideos}
          onChange={updateBatchConfig}
        />
      ) : null}
    </div>
  );
}

function CampaignVideoCard({
  video,
  selected,
  clipCount,
  onToggle,
  onClipCountChange
}: {
  video: {
    id: string;
    videoId: string;
    title: string;
    thumbnailUrl?: string | null;
    durationSeconds?: number | null;
    publishedAt?: Date | string | null;
    status: string;
    sessionId?: string | null;
    session?: {
      status?: string | null;
      stage?: string | null;
      jobs?: Array<{ status?: string | null; progress?: number | null }>;
    } | null;
  };
  selected: boolean;
  clipCount: number;
  onToggle: () => void;
  onClipCountChange: (value: number) => void;
}) {
  const status = getCampaignVideoDisplayStatus(video);
  const progress = getVideoProgress(video, status);

  return (
    <article
      className={`min-w-0 overflow-hidden rounded-lg border bg-[rgb(18_18_16_/_0.68)] transition ${
        selected ? "border-[var(--accent)]" : "border-[var(--border)]"
      }`}
    >
      <button type="button" className="relative aspect-video w-full overflow-hidden bg-[var(--panel-raised)] text-left" onClick={onToggle}>
        <YoutubeThumbnail videoId={video.videoId} src={video.thumbnailUrl} title={video.title} />
        <span className="absolute left-3 top-3 grid h-10 w-10 place-items-center rounded-lg bg-[rgb(7_7_6_/_0.84)] shadow-[inset_0_0_0_1px_rgb(255_255_255_/_0.08)]">
          {selected ? (
            <CheckSquare className="h-5 w-5 text-[var(--accent-strong)]" aria-hidden="true" />
          ) : (
            <Square className="h-5 w-5 text-[var(--text)]" aria-hidden="true" />
          )}
        </span>
        {video.durationSeconds ? (
          <span className="absolute right-3 top-3 rounded-full bg-[rgb(7_7_6_/_0.84)] px-2 py-1 text-xs font-semibold text-[var(--text)]">
            {formatDuration(video.durationSeconds)}
          </span>
        ) : null}
      </button>

      <div className="grid min-w-0 gap-4 p-4">
        <div className="min-w-0">
          <p className="line-clamp-2 break-words text-sm font-semibold text-[var(--text)]">{video.title}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {video.publishedAt ? formatDate(video.publishedAt) : campaignVideoStatusLabel(status)}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <ClipCountStepper value={clipCount} onChange={onClipCountChange} />
          <StatusBadge status={status} />
        </div>

        <div className="grid gap-2">
          <div className="h-2 overflow-hidden rounded-full bg-[rgb(255_255_255_/_0.06)]">
            <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-[var(--muted)]">
            <span>{progress}%</span>
            <VideoAction status={status} sessionId={video.sessionId} />
          </div>
        </div>
      </div>
    </article>
  );
}

function BatchProgressPanel({
  refNode,
  videos
}: {
  refNode: RefObject<HTMLElement | null>;
  videos: Array<Parameters<typeof getCampaignVideoDisplayStatus>[0] & {
    id: string;
    videoId: string;
    title: string;
    thumbnailUrl?: string | null;
    sessionId?: string | null;
  }>;
}) {
  const queuedVideos = videos.filter((video) => getCampaignVideoDisplayStatus(video) !== "not_queued");

  return (
    <section ref={refNode} className="grid min-w-0 gap-4 rounded-lg border border-[var(--border)] bg-[rgb(18_18_16_/_0.68)] p-5 sm:p-6">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[var(--text)]">Batch progress</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Track every selected video. Review mode pauses each video after moments are found.</p>
        </div>
        <Badge>{queuedVideos.length} queued sessions</Badge>
      </div>

      {queuedVideos.length ? (
        <div className="grid gap-3">
          {queuedVideos.map((video) => {
            const status = getCampaignVideoDisplayStatus(video);
            const progress = getVideoProgress(video, status);
            return (
              <div key={video.id} className="grid min-w-0 gap-3 rounded-lg border border-[var(--border)] bg-[rgb(7_7_6_/_0.5)] p-3 md:grid-cols-[96px_minmax(0,1fr)_180px]">
                <div className="aspect-video overflow-hidden rounded-md bg-[var(--panel-raised)]">
                  <YoutubeThumbnail videoId={video.videoId} src={video.thumbnailUrl} title={video.title} />
                </div>
                <div className="grid min-w-0 content-center gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <StatusBadge status={status} />
                    <span className="text-xs text-[var(--muted)]">{progress}%</span>
                  </div>
                  <p className="line-clamp-2 break-words text-sm font-semibold text-[var(--text)]">{video.title}</p>
                  <div className="h-2 overflow-hidden rounded-full bg-[rgb(255_255_255_/_0.06)]">
                    <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${progress}%` }} />
                  </div>
                </div>
                <div className="flex items-center justify-start md:justify-end">
                  <VideoAction status={status} sessionId={video.sessionId} button />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid place-items-center rounded-lg border border-dashed border-[var(--border-strong)] bg-[rgb(7_7_6_/_0.4)] py-12 text-center">
          <div className="grid max-w-md gap-3 px-5">
            <Clock3 className="mx-auto h-8 w-8 text-[var(--muted-soft)]" aria-hidden="true" />
            <h3 className="text-base font-semibold text-[var(--text)]">No batch running yet</h3>
            <p className="text-sm text-[var(--muted)]">Select videos above, prepare the batch, then this panel becomes your progress monitor.</p>
          </div>
        </div>
      )}
    </section>
  );
}

function YoutubeThumbnail({ videoId, src, title }: { videoId: string; src?: string | null; title: string }) {
  const candidates = Array.from(
    new Set(
      [
        src,
        `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`,
        `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg`
      ].filter(Boolean) as string[]
    )
  );
  const [index, setIndex] = useState(0);
  const current = candidates[index];

  if (!current) {
    return (
      <div className="grid h-full w-full place-items-center px-4 text-center text-xs text-[var(--muted)]">
        Thumbnail unavailable
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={current}
      alt={title}
      className="h-full w-full object-cover"
      onError={() => setIndex((next) => Math.min(next + 1, candidates.length))}
    />
  );
}

function PrepareBatchModal({
  batchConfig,
  captionPresets,
  selectedVideoCount,
  selectedClipTotal,
  startPending,
  onClose,
  onConfirm,
  onChange
}: {
  batchConfig: CampaignBatchConfig;
  captionPresets: Array<{ id: string; name: string }>;
  selectedVideoCount: number;
  selectedClipTotal: number;
  startPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onChange: (next: Partial<CampaignBatchConfig>) => void;
}) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-[rgb(0_0_0_/_0.72)] px-4 py-6 backdrop-blur-sm">
      <div className="max-h-[92dvh] w-full max-w-4xl overflow-y-auto rounded-lg border border-[var(--border-strong)] bg-[rgb(18_18_16_/_0.96)] p-5 shadow-[0_28px_80px_rgb(0_0_0_/_0.42)] sm:p-6">
        <div className="flex min-w-0 items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--muted-soft)]">Final check</p>
            <h2 className="mt-1 text-2xl font-semibold text-[var(--text)]">Prepare batch</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">
              These rules apply to every selected video unless you changed a per-video clip count.
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close prepare batch">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="grid gap-5">
            <section className="grid gap-3 rounded-lg border border-[var(--border)] bg-[rgb(7_7_6_/_0.45)] p-4">
              <div className="flex items-center gap-2">
                <Film className="h-4 w-4 text-[var(--accent-strong)]" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-[var(--text)]">Clips per video</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {[1, 3, 5, 8].map((value) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={batchConfig.clipsPerVideo === value ? "primary" : "secondary"}
                    onClick={() => onChange({ clipsPerVideo: value })}
                  >
                    {value} clips
                  </Button>
                ))}
              </div>
            </section>

            <section className="grid gap-3 rounded-lg border border-[var(--border)] bg-[rgb(7_7_6_/_0.45)] p-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[var(--accent-strong)]" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-[var(--text)]">Hook and review mode</h3>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <ToggleCard
                  active={batchConfig.autoHook}
                  title="Enable AI hook"
                  description="Add a short spoken hook before each clip."
                  onClick={() => onChange({ autoHook: !batchConfig.autoHook })}
                />
                <ToggleCard
                  active={batchConfig.renderMode === "review"}
                  title="Review before render"
                  description="Recommended for campaign batches."
                  onClick={() => onChange({ renderMode: batchConfig.renderMode === "review" ? "auto" : "review" })}
                />
              </div>
            </section>

            <section className="grid gap-4 rounded-lg border border-[var(--border)] bg-[rgb(7_7_6_/_0.45)] p-4">
              <div className="grid gap-4 md:grid-cols-3">
                <label className="grid gap-2">
                  <span className="flex items-center gap-2 text-xs font-semibold text-[var(--muted-soft)]">
                    <Captions className="h-4 w-4" aria-hidden="true" />
                    Caption style
                  </span>
                  <select
                    value={batchConfig.captionStyleId}
                    onChange={(event) => onChange({ captionStyleId: event.target.value })}
                    className="h-12 rounded-lg border border-[var(--border)] bg-[rgb(9_9_8_/_0.78)] px-4 text-sm text-[var(--text)] outline-none"
                  >
                    {(captionPresets.length ? captionPresets : [{ id: "karaoke", name: "Karaoke" }]).map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2">
                  <span className="flex items-center gap-2 text-xs font-semibold text-[var(--muted-soft)]">
                    <Settings2 className="h-4 w-4" aria-hidden="true" />
                    Clip length
                  </span>
                  <select
                    value={batchConfig.clipLength}
                    onChange={(event) => onChange({ clipLength: event.target.value as SessionConfig["clipLength"] })}
                    className="h-12 rounded-lg border border-[var(--border)] bg-[rgb(9_9_8_/_0.78)] px-4 text-sm text-[var(--text)] outline-none"
                  >
                    {CLIP_LENGTH_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2">
                  <span className="text-xs font-semibold text-[var(--muted-soft)]">Language</span>
                  <select
                    value={batchConfig.language}
                    onChange={(event) => onChange({ language: event.target.value })}
                    className="h-12 rounded-lg border border-[var(--border)] bg-[rgb(9_9_8_/_0.78)] px-4 text-sm text-[var(--text)] outline-none"
                  >
                    <option value="id">Indonesian</option>
                    <option value="en">English</option>
                  </select>
                </label>
              </div>

              <label className="grid gap-2">
                <span className="flex items-center gap-2 text-xs font-semibold text-[var(--muted-soft)]">
                  <MessageSquareText className="h-4 w-4" aria-hidden="true" />
                  Find moments about
                </span>
                <textarea
                  value={batchConfig.prompt}
                  onChange={(event) => onChange({ prompt: event.target.value })}
                  className="min-h-24 resize-none rounded-lg border border-[var(--border)] bg-[rgb(9_9_8_/_0.78)] px-4 py-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted-soft)] focus:border-[var(--accent)]/70 focus:ring-2 focus:ring-[rgb(242_162_58_/_0.13)]"
                  placeholder="Optional: cari bagian tentang bisnis, konflik lucu, cerita gagal, atau momen emosional."
                />
              </label>
            </section>
          </div>

          <aside className="grid content-start gap-3 rounded-lg border border-[var(--border)] bg-[rgb(7_7_6_/_0.55)] p-4">
            <h3 className="text-sm font-semibold text-[var(--text)]">Before starting</h3>
            <SummaryRow label="Selected videos" value={selectedVideoCount} />
            <SummaryRow label="Maximum clips" value={selectedClipTotal} />
            <SummaryRow label="Hook" value={batchConfig.autoHook ? "Enabled" : "Disabled"} />
            <SummaryRow label="Mode" value={batchConfig.renderMode === "review" ? "Review" : "Auto render"} />
            <SummaryRow label="Language" value={batchConfig.language.toUpperCase()} />
            <Button type="button" variant="primary" className="mt-3 w-full" onClick={onConfirm} disabled={startPending}>
              {startPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
              Start batch
            </Button>
          </aside>
        </div>
      </div>
    </div>
  );
}

function StepRail({ currentStep }: { currentStep: "find" | "pick" | "prepare" | "progress" | "review" }) {
  const steps = [
    { id: "find", label: "Find videos" },
    { id: "pick", label: "Pick videos" },
    { id: "prepare", label: "Prepare batch" },
    { id: "progress", label: "Track progress" },
    { id: "review", label: "Review results" }
  ] as const;
  const activeIndex = steps.findIndex((step) => step.id === currentStep);

  return (
    <nav className="grid gap-2 rounded-lg border border-[var(--border)] bg-[rgb(18_18_16_/_0.55)] p-3 lg:grid-cols-5">
      {steps.map((step, index) => {
        const active = step.id === currentStep;
        const done = index < activeIndex;
        return (
          <div
            key={step.id}
            className={`flex items-center gap-3 rounded-lg border px-3 py-3 text-sm font-semibold ${
              active || done
                ? "border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--text)]"
                : "border-[var(--border)] bg-[rgb(7_7_6_/_0.5)] text-[var(--muted)]"
            }`}
          >
            <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--panel-raised)] text-xs">{index + 1}</span>
            {step.label}
          </div>
        );
      })}
    </nav>
  );
}

function ClipCountStepper({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[rgb(7_7_6_/_0.45)] p-1">
      <button
        type="button"
        className="grid h-8 w-8 place-items-center rounded-full bg-[var(--panel-raised)] text-[var(--text)] disabled:opacity-40"
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
        aria-label="Reduce clips to make"
      >
        <Minus className="h-4 w-4" aria-hidden="true" />
      </button>
      <span className="w-16 text-center text-xs font-semibold text-[var(--text)]">{value} clips</span>
      <button
        type="button"
        className="grid h-8 w-8 place-items-center rounded-full bg-[var(--panel-raised)] text-[var(--text)] disabled:opacity-40"
        disabled={value >= 10}
        onClick={() => onChange(value + 1)}
        aria-label="Increase clips to make"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function ToggleCard({
  active,
  title,
  description,
  onClick
}: {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border p-4 text-left transition active:translate-y-px ${
        active
          ? "border-[var(--accent)] bg-[var(--accent-muted)]"
          : "border-[var(--border)] bg-[rgb(9_9_8_/_0.58)] hover:border-[var(--border-strong)]"
      }`}
    >
      <span className="block text-sm font-semibold text-[var(--text)]">{title}</span>
      <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">{description}</span>
    </button>
  );
}

function StatusBadge({ status }: { status: CampaignVideoDisplayStatus }) {
  const danger = status === "failed" || status === "cancelled";
  const good = status === "completed" || status === "completed_with_warnings" || status === "needs_review";
  return (
    <Badge
      className={
        danger
          ? "border-[rgb(255_93_106_/_0.35)] bg-[rgb(255_93_106_/_0.12)] text-[var(--danger)]"
          : good
            ? "border-[rgb(172_255_72_/_0.28)] bg-[rgb(172_255_72_/_0.12)] text-[var(--accent-strong)]"
            : undefined
      }
    >
      {campaignVideoStatusLabel(status)}
    </Badge>
  );
}

function VideoAction({ status, sessionId, button = false }: { status: CampaignVideoDisplayStatus; sessionId?: string | null; button?: boolean }) {
  if (!sessionId || status === "not_queued") {
    return <span>Not queued</span>;
  }

  const label =
    status === "needs_review"
      ? "Review moments"
      : status === "queued" || status === "processing"
        ? "Open live result"
        : status === "failed" || status === "cancelled"
          ? "Open error"
          : "View results";

  return (
    <Link
      className={
        button
          ? "inline-flex h-10 items-center justify-center rounded-full bg-[var(--panel-raised)] px-4 text-sm font-semibold text-[var(--accent-strong)] ring-1 ring-[var(--border)] transition hover:bg-[var(--panel-soft)]"
          : "font-semibold text-[var(--accent-strong)]"
      }
      href={`/results/${sessionId}`}
    >
      {button ? <Eye className="mr-2 h-4 w-4" aria-hidden="true" /> : null}
      {label}
    </Link>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[rgb(7_7_6_/_0.5)] px-3 py-2">
      <p className="text-lg font-semibold text-[var(--text)]">{value}</p>
      <p className="text-xs text-[var(--muted)]">{label}</p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string | number; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] py-2 text-sm last:border-b-0">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="font-semibold text-[var(--text)]">{value}</span>
    </div>
  );
}

function getCurrentStep(input: {
  focusedStep: "find" | "pick" | "prepare" | "progress" | "review";
  videoCount: number;
  selectedCount: number;
  activeCount: number;
  reviewCount: number;
  completedCount: number;
  failedCount: number;
}) {
  if (input.focusedStep === "progress" || input.activeCount > 0) {
    return "progress";
  }
  if (input.focusedStep === "review" || input.reviewCount > 0 || input.completedCount > 0 || input.failedCount > 0) {
    return "review";
  }
  if (input.focusedStep === "prepare" || input.selectedCount > 0) {
    return "prepare";
  }
  if (input.videoCount > 0) {
    return "pick";
  }
  return "find";
}

function currentStepToStatus(step: "find" | "pick" | "prepare" | "progress" | "review"): CampaignVideoDisplayStatus {
  if (step === "progress") {
    return "processing";
  }
  if (step === "review") {
    return "needs_review";
  }
  return "not_queued";
}

function getVideoProgress(video: { session?: { jobs?: Array<{ progress?: number | null }> } | null }, status: CampaignVideoDisplayStatus) {
  if (status === "completed" || status === "completed_with_warnings" || status === "needs_review") {
    return 100;
  }
  return video.session?.jobs?.[0]?.progress ?? 0;
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatDate(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return "Published date unavailable";
  }
  return date.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}
