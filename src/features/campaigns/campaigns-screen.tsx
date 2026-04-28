"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckSquare, FolderPlus, ListChecks, Loader2, PlayCircle, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { trpc } from "@/features/trpc/client";
import { sessionConfigSchema } from "@/shared/schemas/session";

export function CampaignsScreen() {
  const utils = trpc.useUtils();
  const { notify } = useToast();
  const [name, setName] = useState("");
  const [channelUrl, setChannelUrl] = useState("");
  const [limit, setLimit] = useState(10);
  const [activeCampaignId, setActiveCampaignId] = useState("");
  const [localSelectedVideoIds, setLocalSelectedVideoIds] = useState<string[] | null>(null);
  const [message, setMessage] = useState("");
  const campaigns = trpc.campaign.list.useQuery(undefined, { refetchInterval: 4000 });
  const createCampaign = trpc.campaign.create.useMutation({
    onSuccess: async (campaign) => {
      setActiveCampaignId(campaign.id);
      setMessage("Campaign created.");
      notify({
        type: "success",
        title: "Campaign created",
        description: "Next step: fetch videos from the channel."
      });
      await utils.campaign.list.invalidate();
    },
    onError: (error) => {
      setMessage(error.message);
      notify({
        type: "error",
        title: "Campaign could not be created",
        description: error.message
      });
    }
  });
  const fetchVideos = trpc.campaign.fetchVideos.useMutation({
    onSuccess: async (campaign) => {
      setLocalSelectedVideoIds(null);
      const count = campaign?.videos.length ?? 0;
      setMessage(`${count} videos fetched.`);
      notify({
        type: "success",
        title: "Videos fetched",
        description: `${count} videos are ready to select.`
      });
      await utils.campaign.list.invalidate();
    },
    onError: (error) => {
      setMessage(error.message);
      notify({
        type: "error",
        title: "Could not fetch videos",
        description: error.message
      });
    }
  });
  const setVideoSelection = trpc.campaign.setVideoSelection.useMutation({
    onSuccess: async () => {
      setLocalSelectedVideoIds(null);
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
  const startBatch = trpc.campaign.startBatch.useMutation({
    onSuccess: async (jobs) => {
      setMessage(`${jobs.length} videos queued.`);
      notify({
        type: "success",
        title: "Batch queued",
        description: `${jobs.length} selected videos are processing.`
      });
      await utils.campaign.list.invalidate();
    },
    onError: (error) => {
      setMessage(error.message);
      notify({
        type: "error",
        title: "Batch could not start",
        description: error.message
      });
    }
  });

  const activeCampaign =
    campaigns.data?.find((campaign) => campaign.id === activeCampaignId) ?? campaigns.data?.[0];
  const selectedVideoIds =
    localSelectedVideoIds ??
    activeCampaign?.videos.filter((video) => video.selected).map((video) => video.id) ??
    [];
  const allVideosSelected =
    Boolean(activeCampaign?.videos.length) &&
    activeCampaign?.videos.every((video) => selectedVideoIds.includes(video.id));

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

  function toggleCampaignVideo(
    campaign: { id: string; videos: Array<{ id: string; selected: boolean }> },
    videoId: string
  ) {
    const campaignSelectedIds =
      activeCampaign?.id === campaign.id && localSelectedVideoIds
        ? localSelectedVideoIds
        : campaign.videos.filter((video) => video.selected).map((video) => video.id);
    const nextIds = campaignSelectedIds.includes(videoId)
      ? campaignSelectedIds.filter((id) => id !== videoId)
      : [...campaignSelectedIds, videoId];

    setActiveCampaignId(campaign.id);
    setLocalSelectedVideoIds(nextIds);
    setVideoSelection.mutate({
      campaignId: campaign.id,
      videoIds: nextIds
    });
  }

  function toggleAllVideos() {
    if (!activeCampaign) {
      return;
    }
    persistVideoSelection(allVideosSelected ? [] : activeCampaign.videos.map((video) => video.id));
  }

  function createNewCampaign() {
    const trimmedChannelUrl = channelUrl.trim();

    if (!trimmedChannelUrl) {
      setMessage("Paste a YouTube channel or playlist URL first.");
      notify({
        type: "warning",
        title: "Channel URL is empty",
        description: "Paste a YouTube channel or playlist URL before creating a campaign."
      });
      return;
    }

    createCampaign.mutate({
      name: name.trim() || "Untitled campaign",
      channelUrl: trimmedChannelUrl,
      config: sessionConfigSchema.parse({})
    });
  }

  function fetchCampaignVideos() {
    if (!activeCampaign) {
      notify({
        type: "warning",
        title: "No active campaign",
        description: "Create or select a campaign first."
      });
      return;
    }

    fetchVideos.mutate({
      campaignId: activeCampaign.id,
      limit
    });
  }

  function startSelectedVideos() {
    if (!activeCampaign) {
      notify({
        type: "warning",
        title: "No active campaign",
        description: "Create or select a campaign first."
      });
      return;
    }

    if (selectedVideoIds.length === 0) {
      notify({
        type: "warning",
        title: "No videos selected",
        description: "Select at least one video before starting the batch."
      });
      return;
    }

    startBatch.mutate({
      campaignId: activeCampaign.id,
      videoIds: selectedVideoIds
    });
  }

  return (
    <div className="mx-auto grid min-h-screen w-full max-w-[1360px] gap-7 overflow-hidden px-5 py-6 sm:px-8">
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--muted-soft)]">Campaign mode</p>
          <h1 className="mt-1 break-words text-2xl font-semibold text-[var(--text)] sm:text-3xl">
            Channel batch processing
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
            Create a campaign, fetch channel videos, select the best candidates, then queue only what you want to process.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={createNewCampaign}
          disabled={createCampaign.isPending}
        >
          {createCampaign.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
          New campaign
        </Button>
      </header>

      {message ? (
        <div className="rounded-lg border border-[rgb(242_162_58_/_0.3)] bg-[var(--accent-muted)] p-3 text-sm text-[var(--text)]">
          {message}
        </div>
      ) : null}

      <section className="grid min-w-0 gap-6 rounded-lg border border-[var(--border)] bg-[rgb(18_18_16_/_0.72)] p-5 shadow-[var(--shadow-tight)] sm:p-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <CampaignStep number="1" label="Create campaign" active={Boolean(activeCampaign)} />
          <CampaignStep number="2" label="Fetch videos" active={Boolean(activeCampaign?.videos.length)} />
          <CampaignStep number="3" label={`Start selected (${selectedVideoIds.length})`} active={selectedVideoIds.length > 0} />
        </div>
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_160px]">
          <label className="grid gap-2">
            <span className="text-xs font-semibold text-[var(--muted-soft)]">Campaign name</span>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Kisah inspiratif batch" />
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-semibold text-[var(--muted-soft)]">YouTube channel</span>
            <Input
              value={channelUrl}
              onChange={(event) => setChannelUrl(event.target.value)}
              placeholder="https://www.youtube.com/@channelname"
            />
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-semibold text-[var(--muted-soft)]">Fetch limit</span>
            <Input
              type="number"
              min={1}
              max={50}
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-3">
          {[5, 10, 20, 50].map((value) => (
            <Button
              key={value}
              variant={limit === value ? "primary" : "secondary"}
              size="sm"
              onClick={() => setLimit(value)}
            >
              {`${value} latest`}
            </Button>
          ))}
          <Button
            variant="secondary"
            disabled={!activeCampaign || fetchVideos.isPending}
            onClick={fetchCampaignVideos}
          >
            {fetchVideos.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}
            Fetch videos
          </Button>
          <Button
            variant="primary"
            disabled={!activeCampaign || selectedVideoIds.length === 0 || startBatch.isPending}
            onClick={startSelectedVideos}
          >
            {startBatch.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            Start selected ({selectedVideoIds.length})
          </Button>
          {activeCampaign?.videos.length ? (
            <Button
              variant={allVideosSelected ? "primary" : "ghost"}
              disabled={setVideoSelection.isPending}
              onClick={toggleAllVideos}
            >
              {allVideosSelected ? "Clear selection" : "Select all"}
            </Button>
          ) : null}
        </div>
      </section>

      <section className="grid min-w-0 gap-4">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[var(--text)]">Recent campaigns</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Select a campaign to manage its video queue.</p>
          </div>
          <Badge>{campaigns.data?.length ?? 0} total</Badge>
        </div>
        {campaigns.data?.length ? (
          <div className="grid gap-4">
            {campaigns.data.map((campaign) => (
              <article
                key={campaign.id}
                className={`min-w-0 rounded-lg border bg-[rgb(18_18_16_/_0.68)] p-5 shadow-[var(--shadow-tight)] ${
                  activeCampaign?.id === campaign.id ? "border-[var(--accent)]" : "border-[var(--border)]"
                }`}
              >
                <button className="min-w-0 text-left" onClick={() => setActiveCampaignId(campaign.id)}>
                  <h3 className="break-words font-semibold text-[var(--text)]">{campaign.name}</h3>
                  <p className="mt-1 break-words text-sm text-[var(--muted)]">{campaign.channelUrl || "No channel URL"}</p>
                </button>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Badge>{campaign.videos.length} videos</Badge>
                  <Badge>{campaign.sessions.length} sessions</Badge>
                  {activeCampaign?.id === campaign.id ? (
                    <Badge>{selectedVideoIds.length} selected</Badge>
                  ) : null}
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {campaign.videos.map((video) => (
                    <div key={video.id} className="min-w-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[rgb(7_7_6_/_0.64)]">
                      <button
                        className="relative aspect-video w-full bg-[var(--panel-raised)] text-left"
                        onClick={() => toggleCampaignVideo(campaign, video.id)}
                      >
                        {video.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={video.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="grid h-full place-items-center px-4 text-center text-xs text-[var(--muted)]">
                            No thumbnail
                          </div>
                        )}
                        <span className="absolute left-2 top-2 grid h-9 w-9 place-items-center rounded-lg bg-[rgb(7_7_6_/_0.82)] shadow-[inset_0_0_0_1px_rgb(255_255_255_/_0.08)]">
                          {(activeCampaign?.id === campaign.id
                            ? selectedVideoIds
                            : campaign.videos
                                .filter((item) => item.selected)
                                .map((item) => item.id)
                          ).includes(video.id) ? (
                            <CheckSquare className="h-5 w-5 text-[var(--accent-strong)]" aria-hidden="true" />
                          ) : (
                            <Square className="h-5 w-5 text-[var(--text)]" aria-hidden="true" />
                          )}
                        </span>
                        {video.durationSeconds ? (
                          <span className="absolute right-2 top-2 rounded-full bg-[rgb(7_7_6_/_0.82)] px-2 py-1 text-xs font-semibold text-[var(--text)]">
                            {formatDuration(video.durationSeconds)}
                          </span>
                        ) : null}
                      </button>
                      <div className="grid gap-2 p-3">
                        <p className="line-clamp-2 break-words text-sm font-semibold text-[var(--text)]">{video.title}</p>
                        <div className="flex items-center justify-between gap-2">
                          <Badge>{video.session?.jobs[0]?.progress ?? 0}%</Badge>
                          <span className="truncate text-xs text-[var(--muted)]">
                            {video.session?.stage ?? video.status}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-[rgb(255_255_255_/_0.06)]">
                          <div
                            className="h-full rounded-full bg-[var(--accent)]"
                            style={{
                              width: `${video.session?.jobs[0]?.progress ?? (video.status === "completed" ? 100 : 0)}%`
                            }}
                          />
                        </div>
                      {video.sessionId ? (
                        <Link className="inline-flex text-xs font-semibold text-[var(--accent-strong)]" href={`/results/${video.sessionId}`}>
                          Open results
                        </Link>
                      ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="grid place-items-center rounded-lg border border-dashed border-[var(--border-strong)] bg-[rgb(18_18_16_/_0.45)] py-20 text-[var(--muted)]">
            No campaigns yet
          </div>
        )}
      </section>
    </div>
  );
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function CampaignStep({ number, label, active }: { number: string; label: string; active?: boolean }) {
  return (
    <div
      className={`flex min-w-0 items-center gap-3 rounded-lg border px-3 py-2 ${
        active
          ? "border-[rgb(242_162_58_/_0.32)] bg-[var(--accent-muted)]"
          : "border-[var(--border)] bg-[rgb(7_7_6_/_0.42)]"
      }`}
    >
      <span
        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${
          active
            ? "bg-[var(--accent)] text-[#1d1308]"
            : "bg-[var(--panel-raised)] text-[var(--muted)]"
        }`}
      >
        {number}
      </span>
      <span className="min-w-0 truncate text-sm font-semibold text-[var(--text)]">{label}</span>
    </div>
  );
}
