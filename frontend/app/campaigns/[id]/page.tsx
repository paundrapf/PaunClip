"use client";

import { use } from "react";

import { CampaignDetailPageClient } from "@/components/routes/campaign-detail-page-client";

type CampaignPageProps = {
  params: Promise<{ id: string }>;
};

export default function CampaignDetailPage({ params }: CampaignPageProps) {
  const { id } = use(params);

  return <CampaignDetailPageClient campaignId={id} />;
}
