"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { FolderPlus, Loader2, Search, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { trpc } from "@/features/trpc/client";
import { getCampaignVideoDisplayStatus } from "@/shared/campaign/status";
import { sessionConfigSchema } from "@/shared/schemas/session";

export function CampaignsScreen() {
  const router = useRouter();
  const { notify } = useToast();
  const [name, setName] = useState("");
  const [channelUrl, setChannelUrl] = useState("");
  const campaigns = trpc.campaign.list.useQuery(undefined, { refetchInterval: 5000 });
  const createCampaign = trpc.campaign.create.useMutation();

  async function createWorkspace() {
    const campaignName = name.trim() || "Untitled campaign";
    const source = channelUrl.trim();
    if (!source) {
      notify({
        type: "warning",
        title: "YouTube source is empty",
        description: "Paste a channel, playlist, or @handle before creating a campaign."
      });
      return;
    }

    try {
      const campaign = await createCampaign.mutateAsync({
        name: campaignName,
        channelUrl: source,
        config: sessionConfigSchema.parse({
          renderMode: "review",
          promptMode: "campaign_batch"
        })
      });
      notify({
        type: "success",
        title: "Campaign workspace created",
        description: "Find the latest videos and choose what to clip next."
      });
      router.push(`/campaigns/${campaign.id}` as Route);
    } catch (error) {
      notify({
        type: "error",
        title: "Campaign could not be created",
        description: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return (
    <div className="mx-auto grid min-h-screen w-full max-w-[1400px] gap-7 overflow-hidden px-5 py-6 sm:px-8">
      <header className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--muted-soft)]">Campaign mode</p>
          <h1 className="mt-1 break-words text-2xl font-semibold text-[var(--text)] sm:text-3xl">
            Create a channel clipping workspace
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Start with a campaign workspace, then fetch recent videos, pick the best candidates, and track every queued video in one place.
          </p>
        </div>
        <div className="grid gap-2 rounded-lg border border-[var(--border)] bg-[rgb(18_18_16_/_0.62)] p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-[var(--text)]">Workspace pulse</span>
            <Badge>campaigns</Badge>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <SummaryMetric label="Total" value={campaigns.data?.length ?? 0} />
            <SummaryMetric label="Active" value={campaigns.data?.filter(hasActiveVideo).length ?? 0} />
            <SummaryMetric label="Review" value={campaigns.data?.filter(hasReviewVideo).length ?? 0} />
          </div>
        </div>
      </header>

      <section className="grid min-w-0 gap-5 rounded-lg border border-[var(--border)] bg-[rgb(18_18_16_/_0.72)] p-5 shadow-[var(--shadow-tight)] sm:p-6">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text)]">New campaign</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Give the batch a name and paste a YouTube channel, playlist, or @handle.
            </p>
          </div>
          <Badge>review mode default</Badge>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)_auto]">
          <label className="grid gap-2">
            <span className="text-xs font-semibold text-[var(--muted-soft)]">Campaign name</span>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="April launch clips" />
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-semibold text-[var(--muted-soft)]">YouTube source</span>
            <Input
              value={channelUrl}
              onChange={(event) => setChannelUrl(event.target.value)}
              placeholder="https://www.youtube.com/@channelname"
            />
          </label>
          <div className="flex items-end">
            <Button type="button" variant="primary" onClick={createWorkspace} disabled={createCampaign.isPending}>
              {createCampaign.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
              Create campaign
            </Button>
          </div>
        </div>
      </section>

      <section className="grid min-w-0 gap-4 border-t border-[var(--border)] pt-6">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[var(--text)]">Recent campaigns</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Open a workspace to fetch videos, start a batch, or review queued results.</p>
          </div>
          <Badge>{campaigns.data?.length ?? 0} total</Badge>
        </div>

        {campaigns.isLoading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-44 rounded-lg border border-[var(--border)] bg-[rgb(18_18_16_/_0.45)]" />
            ))}
          </div>
        ) : campaigns.data?.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {campaigns.data.map((campaign) => {
              const activeCount = campaign.videos.filter(hasActiveStatus).length;
              const reviewCount = campaign.videos.filter(hasReviewStatus).length;
              const completedCount = campaign.videos.filter(hasCompletedStatus).length;
              return (
                <article
                  key={campaign.id}
                  className="grid min-w-0 gap-4 rounded-lg border border-[var(--border)] bg-[rgb(18_18_16_/_0.56)] p-4 transition hover:border-[var(--border-strong)]"
                >
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="break-words text-sm font-semibold text-[var(--text)]">{campaign.name}</h3>
                      <Video className="h-4 w-4 shrink-0 text-[var(--accent-strong)]" aria-hidden="true" />
                    </div>
                    <p className="mt-1 line-clamp-1 break-words text-xs text-[var(--muted)]">{campaign.channelUrl || "No channel source"}</p>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <SummaryMetric label="Videos" value={campaign.videos.length} />
                    <SummaryMetric label="Active" value={activeCount} />
                    <SummaryMetric label="Review" value={reviewCount} />
                    <SummaryMetric label="Done" value={completedCount} />
                  </div>
                  <Link
                    href={`/campaigns/${campaign.id}` as Route}
                    className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--panel-raised)] px-5 text-sm font-semibold text-[var(--text)] ring-1 ring-[var(--border)] transition hover:bg-[var(--panel-soft)] hover:ring-[var(--border-strong)]"
                  >
                    Open workspace
                  </Link>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="grid place-items-center rounded-lg border border-dashed border-[var(--border-strong)] bg-[rgb(18_18_16_/_0.45)] py-20 text-center">
            <div className="grid max-w-md gap-3 px-5">
              <Search className="mx-auto h-8 w-8 text-[var(--muted-soft)]" aria-hidden="true" />
              <h3 className="text-base font-semibold text-[var(--text)]">No campaigns yet</h3>
              <p className="text-sm text-[var(--muted)]">Create a campaign workspace to fetch channel videos and process selected uploads.</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

type CampaignSummary = {
  videos: Array<Parameters<typeof getCampaignVideoDisplayStatus>[0]>;
};

function hasActiveVideo(campaign: CampaignSummary) {
  return campaign.videos.some(hasActiveStatus);
}

function hasReviewVideo(campaign: CampaignSummary) {
  return campaign.videos.some(hasReviewStatus);
}

function hasActiveStatus(video: Parameters<typeof getCampaignVideoDisplayStatus>[0]) {
  return ["queued", "processing"].includes(getCampaignVideoDisplayStatus(video));
}

function hasReviewStatus(video: Parameters<typeof getCampaignVideoDisplayStatus>[0]) {
  return getCampaignVideoDisplayStatus(video) === "needs_review";
}

function hasCompletedStatus(video: Parameters<typeof getCampaignVideoDisplayStatus>[0]) {
  return ["completed", "completed_with_warnings"].includes(getCampaignVideoDisplayStatus(video));
}

function SummaryMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[rgb(7_7_6_/_0.5)] px-3 py-2">
      <p className="text-lg font-semibold text-[var(--text)]">{value}</p>
      <p className="text-xs text-[var(--muted)]">{label}</p>
    </div>
  );
}
