import { AppShell } from "@/features/layout/app-shell";
import { ResultsScreen } from "@/features/clips/results-screen";

export default async function ResultsPage({
  params
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return (
    <AppShell active="/results">
      <ResultsScreen sessionId={sessionId} />
    </AppShell>
  );
}
