"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, PencilLine, RefreshCw, ShieldAlert } from "lucide-react";

import { InfoGrid } from "@/components/common/info-grid";
import { SectionCard } from "@/components/common/section-card";
import { StatePanel } from "@/components/common/state-panel";
import { StatusChip } from "@/components/common/status-chip";
import { SurfaceCard } from "@/components/common/surface-card";
import { useProgress } from "@/hooks/use-progress";
import { campaignsApi } from "@/lib/api";
import { cx, formatDateTime, formatRelativeDate, statusTone } from "@/lib/utils";
import type { Campaign, CampaignDetailPayload } from "@/types/api";

function buildQueueSummary(detail: CampaignDetailPayload | null) {
  const summary = {
    fetched: 0,
    queued: 0,
    failed: 0,
    completed: 0,
    active: 0,
  };

  if (!detail) {
    return summary;
  }

  summary.fetched = detail.channel_fetch.videos.length;

  for (const video of detail.channel_fetch.videos) {
    if (video.status === "queued") {
      summary.queued += 1;
    }
    if (video.status === "failed") {
      summary.failed += 1;
    }
    if (video.status === "completed") {
      summary.completed += 1;
    }
    if (["downloading", "transcribing", "rendering"].includes(video.status)) {
      summary.active += 1;
    }
  }

  return summary;
}

export function CampaignsPageClient() {
  const router = useRouter();
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const { connection, data } = useProgress();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<CampaignDetailPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRenaming, setIsRenaming] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createChannelUrl, setCreateChannelUrl] = useState("");
  const [renameName, setRenameName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null,
    [campaigns, selectedCampaignId],
  );
  const queueSummary = useMemo(() => buildQueueSummary(selectedDetail), [selectedDetail]);
  const canMutate = connection === "online" && !data.is_running;

  const loadCampaigns = useCallback(async (nextSelectedId?: string | null) => {
    setIsLoading(true);
    setError(null);

    try {
      const nextCampaigns = await campaignsApi.list();
      setCampaigns(nextCampaigns);
      const selection = nextSelectedId ?? selectedCampaignId ?? nextCampaigns[0]?.id ?? null;
      setSelectedCampaignId(selection);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Campaign list unavailable.");
    } finally {
      setIsLoading(false);
    }
  }, [selectedCampaignId]);

  const loadCampaignDetail = useCallback(async (campaignId: string) => {
    try {
      const detail = await campaignsApi.detail(campaignId);
      setSelectedDetail(detail);
      setRenameName(detail.campaign.name);
    } catch (detailError) {
      setSelectedDetail(null);
      setError(detailError instanceof Error ? detailError.message : "Campaign detail unavailable.");
    }
  }, []);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  useEffect(() => {
    if (selectedCampaignId) {
      void loadCampaignDetail(selectedCampaignId);
    }
  }, [loadCampaignDetail, selectedCampaignId]);

  useEffect(() => {
    if (data.campaign_id && data.campaign_id === selectedCampaignId) {
      void loadCampaignDetail(data.campaign_id);
    }
  }, [data.campaign_id, data.is_running, loadCampaignDetail, selectedCampaignId]);

  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus();
    }
  }, [isRenaming]);

  async function handleCreateCampaign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!createName.trim() || !canMutate) {
      return;
    }

    setError(null);
    setStatusMessage("Creating campaign...");

    try {
      const response = await campaignsApi.create({
        name: createName.trim(),
        channel_url: createChannelUrl.trim(),
      });
      const nextCampaigns = response.campaigns ?? [];
      setCampaigns(nextCampaigns);
      setSelectedCampaignId(response.campaign?.id ?? nextCampaigns[0]?.id ?? null);
      setCreateName("");
      setCreateChannelUrl("");
      setStatusMessage("Campaign created. Open it to fetch videos and start queue processing.");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Campaign creation failed.");
      setStatusMessage(null);
    }
  }

  async function handleRenameCampaign() {
    if (!selectedCampaign || !renameName.trim() || !canMutate) {
      return;
    }

    setError(null);
    setStatusMessage("Renaming campaign...");

    try {
      const response = await campaignsApi.rename(selectedCampaign.id, { name: renameName.trim() });
      setCampaigns(response.campaigns ?? campaigns);
      setIsRenaming(false);
      setStatusMessage("Campaign renamed.");
      await loadCampaignDetail(selectedCampaign.id);
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "Campaign rename failed.");
      setStatusMessage(null);
    }
  }

  async function handleArchiveCampaign() {
    if (!selectedCampaign || !canMutate) {
      return;
    }

    const confirmed = window.confirm(`Archive ${selectedCampaign.name}?`);
    if (!confirmed) {
      return;
    }

    setError(null);
    setStatusMessage("Archiving campaign...");

    try {
      const response = await campaignsApi.archive(selectedCampaign.id);
      const nextCampaigns = response.campaigns ?? [];
      setCampaigns(nextCampaigns);
      setSelectedCampaignId(nextCampaigns[0]?.id ?? null);
      setStatusMessage("Campaign archived.");
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "Campaign archive failed.");
      setStatusMessage(null);
    }
  }

  if (error && campaigns.length === 0 && !isLoading) {
    return (
      <StatePanel
        title="Campaign list unavailable"
        message={error}
        action={
          <button
            className="inline-flex min-h-11 items-center gap-2 rounded-pill border border-stroke-strong bg-accent/10 px-4 text-sm font-semibold text-foreground transition hover:bg-accent/14"
            onClick={() => void loadCampaigns()}
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
      <SectionCard
        eyebrow="Campaign dashboard"
        title="Campaign management surface"
        description="Create, rename, archive, and open campaigns from the real FastAPI backend while keeping queue-ready summaries visible in the side rail."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone={connection === "offline" ? "danger" : data.is_running ? "brand" : "neutral"}>
              {connection === "offline" ? "Backend offline" : data.is_running ? "Worker active" : "Runtime idle"}
            </StatusChip>
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-pill border border-stroke px-4 text-sm font-semibold text-foreground transition hover:border-stroke-strong hover:bg-white/6 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={connection === "offline"}
              onClick={() => void loadCampaigns()}
              type="button"
            >
              <RefreshCw className={cx("size-4", isLoading ? "animate-spin" : "")} />
              Refresh
            </button>
          </div>
        }
      >
        {connection === "offline" ? (
          <SurfaceCard className="border-danger/20 bg-danger/8">
            <div className="flex items-start gap-3 text-sm leading-6 text-muted-strong">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-danger" />
              <p>Mutating actions are disabled until the FastAPI backend reconnects. The page avoids inventing cached state for create, rename, or archive workflows.</p>
            </div>
          </SurfaceCard>
        ) : null}

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

        <div className="grid gap-6 xl:grid-cols-[1.4fr_0.95fr]">
          <div className="grid gap-4">
            <form onSubmit={handleCreateCampaign} className="grid gap-4 rounded-card border border-dashed border-stroke-strong bg-accent/6 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] lg:items-end">
              <label className="space-y-2 text-sm text-muted">
                <span className="font-medium text-foreground-soft">Campaign name</span>
                <input
                  className="min-h-11 rounded-pill border border-stroke bg-panel-muted px-4 text-foreground outline-none transition focus:border-stroke-strong"
                  disabled={!canMutate}
                  onChange={(event) => setCreateName(event.target.value)}
                  placeholder="PaunClip Shorts"
                  value={createName}
                />
              </label>
              <label className="space-y-2 text-sm text-muted">
                <span className="font-medium text-foreground-soft">YouTube channel URL</span>
                <input
                  className="min-h-11 rounded-pill border border-stroke bg-panel-muted px-4 text-foreground outline-none transition focus:border-stroke-strong"
                  disabled={!canMutate}
                  onChange={(event) => setCreateChannelUrl(event.target.value)}
                  placeholder="https://www.youtube.com/@channel"
                  value={createChannelUrl}
                />
              </label>
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-pill border border-stroke-strong bg-brand/15 px-4 text-sm font-semibold text-foreground transition hover:border-accent/50 hover:bg-accent/12 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canMutate || !createName.trim()}
                type="submit"
              >
                Add campaign
                <ArrowRight className="size-4" />
              </button>
            </form>

            {campaigns.length === 0 && !isLoading ? (
              <SurfaceCard className="border-dashed border-stroke-strong bg-panel-muted/80">
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-foreground">No campaigns yet</h3>
                  <p className="text-sm leading-6 text-muted">This page explains why it is empty and what to do next: create a campaign, optionally save a channel URL, and then open the queue to fetch channel videos into deterministic rows.</p>
                </div>
              </SurfaceCard>
            ) : null}

            <div className="grid gap-4 xl:grid-cols-2">
              {campaigns.map((campaign) => (
                <button
                  key={campaign.id}
                  className={cx(
                    "rounded-card border bg-panel/90 p-5 text-left shadow-[var(--shadow-panel)] backdrop-blur-xl transition hover:border-stroke-strong hover:bg-panel-muted/90",
                    selectedCampaignId === campaign.id ? "border-stroke-strong" : "border-stroke",
                  )}
                  onClick={() => setSelectedCampaignId(campaign.id)}
                  type="button"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <h3 className="text-lg font-semibold text-foreground">{campaign.name}</h3>
                      <p className="text-sm leading-6 text-muted">{campaign.channel_url || "No channel URL configured yet."}</p>
                    </div>
                    <StatusChip tone={statusTone((campaign.failed_session_count ?? 0) > 0 ? "partial" : "completed")}> 
                      {(campaign.failed_session_count ?? 0) > 0 ? "Needs attention" : "Stable"}
                    </StatusChip>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-card border border-stroke bg-panel-muted px-4 py-3">
                      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-muted">Sessions</p>
                      <p className="mt-2 text-sm font-semibold text-foreground-soft">{campaign.session_count ?? 0}</p>
                    </div>
                    <div className="rounded-card border border-stroke bg-panel-muted px-4 py-3">
                      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-muted">Failed</p>
                      <p className="mt-2 text-sm font-semibold text-foreground-soft">{campaign.failed_session_count ?? 0}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3 text-sm text-muted">
                    <span>Last activity {formatRelativeDate(campaign.last_activity || campaign.updated_at)}</span>
                    <span>{campaign.channel_id || "No channel id yet"}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <SectionCard
            eyebrow="Selected campaign"
            title={selectedCampaign?.name || "Select a campaign"}
            description={selectedCampaign?.channel_url || "Open or create a campaign to inspect queue-aware summaries here."}
          >
            {!selectedCampaign ? (
              <p className="text-sm leading-6 text-muted">Open Campaign, Rename, and Archive only become available once one campaign is explicitly selected.</p>
            ) : (
              <div className="grid gap-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    className="inline-flex min-h-11 items-center gap-2 rounded-pill border border-stroke px-4 text-sm font-semibold text-foreground transition hover:border-stroke-strong hover:bg-white/6 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canMutate}
                    onClick={() => setIsRenaming(true)}
                    type="button"
                  >
                    <PencilLine className="size-4" />
                    Rename selected
                  </button>
                  <button
                    className="inline-flex min-h-11 items-center gap-2 rounded-pill border border-stroke px-4 text-sm font-semibold text-foreground transition hover:border-danger/40 hover:bg-danger/8 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canMutate}
                    onClick={() => void handleArchiveCampaign()}
                    type="button"
                  >
                    Archive selected
                  </button>
                  <button
                    className="inline-flex min-h-11 items-center gap-2 rounded-pill border border-stroke-strong bg-accent/10 px-4 text-sm font-semibold text-foreground transition hover:bg-accent/14"
                    onClick={() => router.push(`/campaigns/${selectedCampaign.id}`)}
                    type="button"
                  >
                    Open campaign
                    <ArrowRight className="size-4" />
                  </button>
                </div>

                {isRenaming ? (
                  <div className="grid gap-3 rounded-card border border-stroke bg-panel-muted p-4">
                    <label className="space-y-2 text-sm text-muted">
                      <span className="font-medium text-foreground-soft">Campaign name</span>
                      <input
                        ref={renameInputRef}
                        className="min-h-11 rounded-pill border border-stroke bg-panel px-4 text-foreground outline-none transition focus:border-stroke-strong"
                        onChange={(event) => setRenameName(event.target.value)}
                        value={renameName}
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="inline-flex min-h-11 items-center justify-center rounded-pill border border-stroke-strong bg-brand/15 px-4 text-sm font-semibold text-foreground transition hover:border-accent/50 hover:bg-accent/12 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!canMutate || !renameName.trim()}
                        onClick={() => void handleRenameCampaign()}
                        type="button"
                      >
                        Save name
                      </button>
                      <button
                        className="inline-flex min-h-11 items-center justify-center rounded-pill border border-stroke px-4 text-sm font-semibold text-foreground transition hover:border-stroke-strong hover:bg-white/6"
                        onClick={() => setIsRenaming(false)}
                        type="button"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

                <InfoGrid
                  items={[
                    { label: "Fetched rows", value: queueSummary.fetched },
                    { label: "Queued", value: queueSummary.queued },
                    { label: "Failed", value: queueSummary.failed },
                    { label: "Completed", value: queueSummary.completed },
                    { label: "Active rows", value: queueSummary.active },
                    {
                      label: "Last activity",
                      value: formatDateTime(selectedCampaign.last_activity || selectedCampaign.updated_at),
                    },
                  ]}
                />

                <SurfaceCard className="border-stroke bg-panel-muted/90">
                  <div className="space-y-3 text-sm leading-6 text-muted">
                    <p>
                      <span className="font-semibold text-foreground-soft">Channel id:</span>{" "}
                      {selectedDetail?.channel_fetch.channel_id || "Not fetched yet"}
                    </p>
                    <p>
                      <span className="font-semibold text-foreground-soft">Last fetch error:</span>{" "}
                      {selectedDetail?.channel_fetch.last_error || selectedCampaign.sync_state?.last_error || "None persisted"}
                    </p>
                    <p>
                      This summary rail stays queue-aware so the user can see whether a campaign has active work, failed rows, or nothing fetched yet before opening the queue route.
                    </p>
                  </div>
                </SurfaceCard>
              </div>
            )}
          </SectionCard>
        </div>
      </SectionCard>
    </div>
  );
}
