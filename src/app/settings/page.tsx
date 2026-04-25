import { AppShell } from "@/features/layout/app-shell";
import { SettingsScreen } from "@/features/settings/settings-screen";

export default function SettingsPage() {
  return (
    <AppShell active="/settings">
      <SettingsScreen />
    </AppShell>
  );
}
