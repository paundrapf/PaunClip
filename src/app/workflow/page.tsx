import { Suspense } from "react";
import { AppShell } from "@/features/layout/app-shell";
import { WorkflowScreen } from "@/features/workflow/workflow-screen";

export default function WorkflowPage() {
  return (
    <AppShell active="/workflow">
      <Suspense fallback={<div className="p-8 text-zinc-500">Loading workflow...</div>}>
        <WorkflowScreen />
      </Suspense>
    </AppShell>
  );
}
