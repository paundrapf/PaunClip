import { AppShell } from "@/features/layout/app-shell";
import { DashboardScreen } from "@/features/dashboard/dashboard-screen";

export default function ProjectsPage() {
  return (
    <AppShell active="/projects">
      <DashboardScreen mode="projects" />
    </AppShell>
  );
}
