import { AppShell } from "@/features/layout/app-shell";
import { DashboardScreen } from "@/features/dashboard/dashboard-screen";

export default function HomePage() {
  return (
    <AppShell active="/">
      <DashboardScreen />
    </AppShell>
  );
}
