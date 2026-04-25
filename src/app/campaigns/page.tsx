import { AppShell } from "@/features/layout/app-shell";
import { CampaignsScreen } from "@/features/campaigns/campaigns-screen";

export default function CampaignsPage() {
  return (
    <AppShell active="/campaigns">
      <CampaignsScreen />
    </AppShell>
  );
}
