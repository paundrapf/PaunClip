"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Captions,
  CheckSquare,
  Film,
  ListVideo,
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { trpc } from "@/features/trpc/client";
import { sessionConfigSchema, type SessionConfig } from "@/shared/schemas/session";
import type { CampaignBatchConfig, CampaignContentType } from "@/shared/schemas/campaign";

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

export function CampaignsScreen() {
  const utils = trpc.useUtils();
  const { notify } = useToast();
  const [name, setName] = useState("");
  const [channelUrl, setChannelUrl] = useState("");
  const [limit, setLimit] = useState(10);
  const [contentType, setContentType] = useState<CampaignContentType>("videos");
  const [activeCampaignId, setActiveCampaignId] = useState("");
  const [localSelectedVideoIds, setLocalSelectedVideoIds] = useState<string[] | null>(null);
  const [perVideoClipCounts, setPerVideoClipCounts] = useState<Record<string, number>>({});
  const [batchConfig, setBatchConfig] = useState<CampaignBatchConfig>(DEFAULT_BATCH_CONFIG);
  const [prepareOpen, setPrepareOpen] = useState(false);
  const [message, setMessage] = useState("");

  const campaigns = trpc.campaign.list.useQuery(undefined, { refetchInterval: 4000 });
  const settings = trpc.settings.get.useQuery();
  const createCampaign = trpc.campaign.create.useMutation();
  const fetchVideos = trpc.campaign.fetchVideos.useMutation();
  const setVideoSelection = trpc.campaign.setVideoSelection.useMutation({
    onSuccess: async () => {
      await utils.campaign.list.invalidate();
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

  const activeCampaign = campaigns.data?.find((campaign) => campaign.id === activeCampaignId);
  const selectedVideoIds =
    localSelectedVideoIds ??
    activeCampaign?.videos.filter((video) => video.selected).map((video) => video.id) ??
    [];
  const allVideosSelected =
    Boolean(activeCampaign?.videos.length) &&
    activeCampaign?.videos.every((video) => selectedVideoIds.includes(video.id));
  const captionPresets = settings.data?.captionPresets ?? [];
  const selectedClipTotal = selectedVideoIds.reduce((total, videoId) => total + getVideoClipCount(videoId), 0);

  function getVideoClipCount(videoId: string) {
    return perVideoClipCounts[videoId] ?? batchConfig.clipsPerVideo;
  }

  function updateBatchConfig(next: Partial<CampaignBatchConfig>) {
    setBatchConfig((current) => ({ ...current, ...next }));
  }

  function selectCampaign(campaign: NonNullable<typeof campaigns.data>[number]) {
    setActiveCampaignId(campaign.id);
    setLocalSelectedVideoIds(null);
    setName(campaign.name);
    setChannelUrl(campaign.channelUrl ?? "");
  }

  async function findLatestVideos() {
    const trimmedChannelUrl = channelUrl.trim();
    if (!trimmedChannelUrl) {
      notify({
        type: "warning",
        title: "YouTube channel is empty",
        description: "Paste a channel, playlist, or @handle before finding videos."
      });
      return;
    }

    const campaignName = name.trim() || "Untitled campaign";
    try {
      const campaignToUse =
        activeCampaign?.channelUrl === trimmedChannelUrl && activeCampaign.name === campaignName
          ? activeCampaign
          : await createCampaign.mutateAsync({
              name: campaignName,
              channelUrl: trimmedChannelUrl,
              config: sessionConfigSchema.parse({
                ...batchConfig,
                targetClipCount: batchConfig.clipsPerVideo,
                promptMode: "campaign_batch"
              })
            });

      setActiveCampaignId(campaignToUse.id);
      const campaign = await fetchVideos.mutateAsync({
        campaignId: campaignToUse.id,
        limit,
        contentType
      });
      setLocalSelectedVideoIds(null);
      setMessage(`${campaign?.videos.length ?? 0} videos ready to review.`);
      notify({
        type: "success",
        title: "Latest videos loaded",
        description: "Pick the videos you want PaunClip to clip."
      });
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
    if (!activeCampaign) {
      return;
    }
    setLocalSelectedVideoIds(videoIds);
    setVideoSelection.mutate({
      campaignId: activeCampaign.id,
      videoIds
    });
  }

  function toggleVideo(videoId: string) {
    const nextIds = selectedVideoIds.includes(videoId)
      ? selectedVideoIds.filter((id) => id !== videoId)
      : [...selectedVideoIds, videoId];
    persistVideoSelection(nextIds);
  }

  function toggleAllVideos() {
    if (!activeCampaign) {
      return;
    }
    persistVideoSelection(allVideosSelected ? [] : activeCampaign.videos.map((video) => video.id));
  }

  function setVideoClipCount(videoId: string, value: number) {
    setPerVideoClipCounts((current) => ({
      ...current,
      [videoId]: Math.min(10, Math.max(1, value))
    }));
  }

  function openPrepareBatch() {
    if (!activeCampaign || selectedVideoIds.length === 0) {
      notify({
        type: "warning",
        title: "No videos selected",
        description: "Select at least one video before starting a campaign batch."
      });
      return;
    }
    setPrepareOpen(true);
  }

  async function startSelectedVideos() {
    if (!activeCampaign) {
      return;
    }
    try {
      const jobs = await startBatch.mutateAsync({
        campaignId: activeCampaign.id,
        videoIds: selectedVideoIds,
        batchConfig,
        perVideoClipCounts: Object.fromEntries(
          selectedVideoIds.map((videoId) => [videoId, getVideoClipCount(videoId)])
        )
      });
      setPrepareOpen(false);
      setMessage(`${jobs.length} videos queued.`);
      notify({
        type: "success",
        title: "Batch queued",
        description: `${jobs.length} videos are processing.`
      });
      await utils.campaign.list.invalidate();
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

  return (
    <div className="mx-auto grid min-h-screen w-full max-w-[1400px] gap-7 overflow-hidden px-5 py-6 sm:px-8">
      <header className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--muted-soft)]">Campaign mode</p>
          <h1 className="mt-1 break-words text-2xl font-semibold text-[var(--text)] sm:text-3xl">
            Pick channel videos, then batch-create clips
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Find the latest videos from a channel, select the ones worth clipping, then choose simple batch rules before PaunClip starts.
          </p>
        </div>
        <div className="grid gap-2 rounded-lg border border-[var(--border)] bg-[rgb(18_18_16_/_0.62)] p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-[var(--text)]">Batch summary</span>
            <Badge>{activeCampaign ? "ready" : "setup"}</Badge>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <SummaryMetric label="Videos" value={selectedVideoIds.length} />
            <SummaryMetric label="Clips" value={selectedClipTotal} />
            <SummaryMetric label="Mode" value={batchConfig.renderMode === "review" ? "Review" : "Auto"} />
          </div>
        </div>
      </header>

      {message ? (
        <div className="rounded-lg border border-[rgb(242_162_58_/_0.3)] bg-[var(--accent-muted)] p-3 text-sm text-[var(--text)]">
          {message}
        </div>
      ) : null}

      <section className="grid min-w-0 gap-5 rounded-lg border border-[var(--border)] bg-[rgb(18_18_16_/_0.72)] p-5 shadow-[var(--shadow-tight)] sm:p-6">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text)]">Find videos</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Paste a channel or playlist. PaunClip will load candidates before anything is processed.</p>
          </div>
          <Badge>{limit} latest</Badge>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <label className="grid gap-2">
            <span className="text-xs font-semibold text-[var(--muted-soft)]">Campaign name</span>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="April launch clips" />
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-semibold text-[var(--muted-soft)]">YouTube channel, playlist, or @handle</span>
            <Input
              value={channelUrl}
              onChange={(event) => setChannelUrl(event.target.value)}
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
            <Button type="button" variant="primary" onClick={findLatestVideos} disabled={createCampaign.isPending || fetchVideos.isPending}>
              {createCampaign.isPending || fetchVideos.isPending ? (
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
            <p className="mt-1 text-sm text-[var(--muted)]">
              Select videos and set how many clips PaunClip should look for in each one.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {activeCampaign?.videos.length ? (
              <Button
                type="button"
                variant={allVideosSelected ? "primary" : "secondary"}
                disabled={setVideoSelection.isPending}
                onClick={toggleAllVideos}
              >
                {allVideosSelected ? "Clear selection" : "Select all"}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="primary"
              disabled={!activeCampaign || selectedVideoIds.length === 0 || startBatch.isPending}
              onClick={openPrepareBatch}
            >
              <PlayCircle className="h-4 w-4" />
              Start clipping selected videos
            </Button>
          </div>
        </div>

        {activeCampaign?.videos.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {activeCampaign.videos.map((video) => {
              const selected = selectedVideoIds.includes(video.id);
              const progress = video.session?.jobs[0]?.progress ?? (video.status === "completed" ? 100 : 0);
              return (
                <article
                  key={video.id}
                  className={`min-w-0 overflow-hidden rounded-lg border bg-[rgb(18_18_16_/_0.68)] transition ${
                    selected ? "border-[var(--accent)]" : "border-[var(--border)]"
                  }`}
                >
                  <button
                    type="button"
                    className="relative aspect-video w-full overflow-hidden bg-[var(--panel-raised)] text-left"
                    onClick={() => toggleVideo(video.id)}
                  >
                    {video.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={video.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full place-items-center px-4 text-center text-xs text-[var(--muted)]">
                        Thumbnail will appear when YouTube provides one
                      </div>
                    )}
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
                        {video.publishedAt ? formatDate(video.publishedAt) : video.status}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <ClipCountStepper
                        value={getVideoClipCount(video.id)}
                        onChange={(value) => setVideoClipCount(video.id, value)}
                      />
                      <Badge>{video.session?.stage ?? video.status}</Badge>
                    </div>

                    <div className="grid gap-2">
                      <div className="h-2 overflow-hidden rounded-full bg-[rgb(255_255_255_/_0.06)]">
                        <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${progress}%` }} />
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs text-[var(--muted)]">
                        <span>{progress}%</span>
                        {video.sessionId ? (
                          <Link className="font-semibold text-[var(--accent-strong)]" href={`/results/${video.sessionId}`}>
                            Open results
                          </Link>
                        ) : (
                          <span>Not queued</span>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="grid place-items-center rounded-lg border border-dashed border-[var(--border-strong)] bg-[rgb(18_18_16_/_0.45)] py-20 text-center">
            <div className="grid max-w-md gap-3 px-5">
              <ListVideo className="mx-auto h-8 w-8 text-[var(--muted-soft)]" aria-hidden="true" />
              <h3 className="text-base font-semibold text-[var(--text)]">No videos loaded yet</h3>
              <p className="text-sm text-[var(--muted)]">
                Fill the campaign name and YouTube channel above, then click Find latest videos.
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="grid min-w-0 gap-4 border-t border-[var(--border)] pt-6">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[var(--text)]">Recent campaigns</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Open an existing campaign to review its queue.</p>
          </div>
          <Badge>{campaigns.data?.length ?? 0} total</Badge>
        </div>
        {campaigns.data?.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {campaigns.data.map((campaign) => (
              <button
                key={campaign.id}
                type="button"
                onClick={() => selectCampaign(campaign)}
                className={`min-w-0 rounded-lg border p-4 text-left transition active:translate-y-px ${
                  activeCampaign?.id === campaign.id
                    ? "border-[var(--accent)] bg-[var(--accent-muted)]"
                    : "border-[var(--border)] bg-[rgb(18_18_16_/_0.56)] hover:border-[var(--border-strong)]"
                }`}
              >
                <h3 className="break-words text-sm font-semibold text-[var(--text)]">{campaign.name}</h3>
                <p className="mt-1 line-clamp-1 break-words text-xs text-[var(--muted)]">{campaign.channelUrl || "No channel URL"}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge>{campaign.videos.length} videos</Badge>
                  <Badge>{campaign.sessions.length} sessions</Badge>
                  <Badge>{campaign.videos.filter((video) => video.selected).length} selected</Badge>
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </section>

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
              <div className="grid gap-4 md:grid-cols-2">
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

function SummaryMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[rgb(7_7_6_/_0.5)] px-3 py-2">
      <p className="text-lg font-semibold text-[var(--text)]">{value}</p>
      <p className="text-xs text-[var(--muted)]">{label}</p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] py-2 text-sm last:border-b-0">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="font-semibold text-[var(--text)]">{value}</span>
    </div>
  );
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
