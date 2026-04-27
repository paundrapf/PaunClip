"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckSquare, FolderPlus, ListChecks, Loader2, PlayCircle, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { trpc } from "@/features/trpc/client";
import { sessionConfigSchema } from "@/shared/schemas/session";

export function CampaignsScreen() {
  const utils = trpc.useUtils();
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
      await utils.campaign.list.invalidate();
    }
  });
  const fetchVideos = trpc.campaign.fetchVideos.useMutation({
    onSuccess: async () => {
      setLocalSelectedVideoIds(null);
      setMessage("Videos fetched.");
      await utils.campaign.list.invalidate();
    }
  });
  const setVideoSelection = trpc.campaign.setVideoSelection.useMutation({
    onSuccess: async () => {
      setLocalSelectedVideoIds(null);
      await utils.campaign.list.invalidate();
    }
  });
  const startBatch = trpc.campaign.startBatch.useMutation({
    onSuccess: async (jobs) => {
      setMessage(`${jobs.length} videos queued.`);
      await utils.campaign.list.invalidate();
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

  return (
    <div className="mx-auto grid min-h-screen max-w-[1360px] gap-8 px-8 py-8">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-zinc-500">Campaign mode</p>
          <h1 className="mt-1 text-2xl font-bold">Channel batch processing</h1>
        </div>
        <Button
          variant="primary"
          onClick={() =>
            createCampaign.mutate({
              name: name || "Untitled campaign",
              channelUrl: channelUrl || undefined,
              config: sessionConfigSchema.parse({})
            })
          }
          disabled={createCampaign.isPending}
        >
          {createCampaign.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
          New campaign
        </Button>
      </header>

      {message ? <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-sm">{message}</div> : null}

      <section className="grid gap-6 rounded-lg border border-zinc-800 bg-zinc-950 p-6">
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_160px]">
          <label className="grid gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Campaign name
            </span>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Kisah inspiratif batch" />
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              YouTube channel
            </span>
            <Input
              value={channelUrl}
              onChange={(event) => setChannelUrl(event.target.value)}
              placeholder="https://www.youtube.com/@channelname"
            />
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Fetch limit
            </span>
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
              {value === 50 ? "All latest" : `${value} latest`}
            </Button>
          ))}
          <Button
            variant="secondary"
            disabled={!activeCampaign || fetchVideos.isPending}
            onClick={() =>
              activeCampaign &&
              fetchVideos.mutate({
                campaignId: activeCampaign.id,
                limit
              })
            }
          >
            {fetchVideos.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}
            Fetch videos
          </Button>
          <Button
            variant="primary"
            disabled={!activeCampaign || selectedVideoIds.length === 0 || startBatch.isPending}
            onClick={() =>
              activeCampaign &&
              startBatch.mutate({
                campaignId: activeCampaign.id,
                videoIds: selectedVideoIds
              })
            }
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

      <section className="grid gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent campaigns</h2>
          <Badge>{campaigns.data?.length ?? 0} total</Badge>
        </div>
        {campaigns.data?.length ? (
          <div className="grid gap-4">
            {campaigns.data.map((campaign) => (
              <article
                key={campaign.id}
                className={`rounded-lg border bg-zinc-950 p-5 ${
                  activeCampaign?.id === campaign.id ? "border-white" : "border-zinc-800"
                }`}
              >
                <button className="text-left" onClick={() => setActiveCampaignId(campaign.id)}>
                  <h3 className="font-semibold">{campaign.name}</h3>
                  <p className="mt-1 text-sm text-zinc-500">{campaign.channelUrl || "No channel URL"}</p>
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
                    <div key={video.id} className="overflow-hidden rounded-lg border border-zinc-800 bg-black">
                      <button
                        className="relative aspect-video w-full bg-zinc-900 text-left"
                        onClick={() => toggleCampaignVideo(campaign, video.id)}
                      >
                        {video.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={video.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="grid h-full place-items-center px-4 text-center text-xs text-zinc-500">
                            No thumbnail
                          </div>
                        )}
                        <span className="absolute left-2 top-2 grid h-9 w-9 place-items-center rounded-lg bg-black/75">
                          {(activeCampaign?.id === campaign.id
                            ? selectedVideoIds
                            : campaign.videos
                                .filter((item) => item.selected)
                                .map((item) => item.id)
                          ).includes(video.id) ? (
                            <CheckSquare className="h-5 w-5 text-lime-300" aria-hidden="true" />
                          ) : (
                            <Square className="h-5 w-5 text-white" aria-hidden="true" />
                          )}
                        </span>
                        {video.durationSeconds ? (
                          <span className="absolute right-2 top-2 rounded-full bg-black/75 px-2 py-1 text-xs font-semibold">
                            {formatDuration(video.durationSeconds)}
                          </span>
                        ) : null}
                      </button>
                      <div className="grid gap-2 p-3">
                        <p className="line-clamp-2 text-sm font-semibold">{video.title}</p>
                        <div className="flex items-center justify-between gap-2">
                          <Badge>{video.session?.jobs[0]?.progress ?? 0}%</Badge>
                          <span className="text-xs text-zinc-500">
                            {video.session?.stage ?? video.status}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-zinc-900">
                          <div
                            className="h-full rounded-full bg-lime-300"
                            style={{
                              width: `${video.session?.jobs[0]?.progress ?? (video.status === "completed" ? 100 : 0)}%`
                            }}
                          />
                        </div>
                      {video.sessionId ? (
                        <Link className="inline-flex text-xs font-semibold text-lime-300" href={`/results/${video.sessionId}`}>
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
          <div className="grid place-items-center rounded-lg border border-dashed border-zinc-800 py-20 text-zinc-500">
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
