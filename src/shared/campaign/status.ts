export type CampaignVideoStatusInput = {
  status?: string | null;
  sessionId?: string | null;
  session?: {
    status?: string | null;
    stage?: string | null;
    jobs?: Array<{
      status?: string | null;
      progress?: number | null;
    }>;
  } | null;
};

export type CampaignVideoDisplayStatus =
  | "not_queued"
  | "queued"
  | "processing"
  | "needs_review"
  | "completed"
  | "completed_with_warnings"
  | "failed"
  | "cancelled";

export function getCampaignVideoDisplayStatus(video: CampaignVideoStatusInput): CampaignVideoDisplayStatus {
  const latestJob = video.session?.jobs?.[0];
  const sessionStatus = video.session?.status ?? video.status;
  const sessionStage = video.session?.stage;
  const jobStatus = latestJob?.status;

  if (sessionStatus === "ready" || sessionStage === "ready_to_render") {
    return "needs_review";
  }
  if (jobStatus === "queued" || video.status === "queued") {
    return "queued";
  }
  if (jobStatus === "running" || video.status === "running") {
    return "processing";
  }
  if (sessionStatus === "partially_failed") {
    return "completed_with_warnings";
  }
  if (sessionStatus === "completed" || video.status === "completed") {
    return "completed";
  }
  if (sessionStatus === "failed" || jobStatus === "failed" || video.status === "failed") {
    return "failed";
  }
  if (sessionStatus === "cancelled" || jobStatus === "cancelled" || video.status === "cancelled") {
    return "cancelled";
  }

  return video.sessionId ? "processing" : "not_queued";
}

export function shouldSkipCampaignVideoStart(video: CampaignVideoStatusInput) {
  return getCampaignVideoDisplayStatus(video) !== "not_queued";
}

export function campaignVideoStatusLabel(status: CampaignVideoDisplayStatus) {
  switch (status) {
    case "queued":
      return "Queued";
    case "processing":
      return "Processing";
    case "needs_review":
      return "Needs review";
    case "completed":
      return "Completed";
    case "completed_with_warnings":
      return "Completed with warnings";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    case "not_queued":
    default:
      return "Not queued";
  }
}
