"use client";

import { useState } from "react";
import Link from "next/link";
import { FolderPlus, ListChecks, Loader2, PlayCircle } from "lucide-react";
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
      setMessage("Videos fetched.");
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
            disabled={!activeCampaign || activeCampaign.videos.length === 0 || startBatch.isPending}
            onClick={() => activeCampaign && startBatch.mutate(activeCampaign.id)}
          >
            {startBatch.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            Start batch
          </Button>
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
                <div className="mt-4 grid gap-2 md:grid-cols-3">
                  {campaign.videos.map((video) => (
                    <div key={video.id} className="rounded-lg border border-zinc-800 bg-black p-3">
                      <p className="line-clamp-2 text-sm font-semibold">{video.title}</p>
                      <p className="mt-1 text-xs text-zinc-500">{video.status}</p>
                      {video.sessionId ? (
                        <Link className="mt-2 inline-flex text-xs font-semibold text-lime-300" href={`/results/${video.sessionId}`}>
                          Open results
                        </Link>
                      ) : null}
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
