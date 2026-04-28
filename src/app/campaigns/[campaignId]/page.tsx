import { AppShell } from "@/features/layout/app-shell";
import { CampaignWorkspaceScreen } from "@/features/campaigns/campaign-workspace-screen";

export default async function CampaignWorkspacePage({
  params
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  return (
    <AppShell active="/campaigns">
      <CampaignWorkspaceScreen campaignId={campaignId} />
    </AppShell>
  );
}
