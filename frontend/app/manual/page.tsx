import { SectionCard } from "@/components/common/section-card";
import { StatusChip } from "@/components/common/status-chip";

export default function ManualPage() {
  return (
    <div className="grid gap-6">
      <SectionCard
        eyebrow="Compatibility path"
        title="Manual session intake scaffold"
        description="The backend already supports `POST /api/process/start`. This page intentionally stops at the shared UI foundation so later work can wire the real form without backfilling fake session state."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {[
            "Source type selector",
            "YouTube URL input",
            "Local file picker",
            "Clip count and transcript mode",
            "Start processing action",
            "Back-to-dashboard handoff",
          ].map((item) => (
            <div key={item} className="rounded-card border border-stroke bg-panel-muted px-4 py-3 text-sm text-foreground-soft">
              {item}
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Backend contract"
        title="FastAPI endpoint already available"
        description="Payload shape is locked by `server.py`, so later UI work can post directly without changing backend behavior."
      >
        <div className="space-y-3 rounded-card border border-stroke bg-panel-muted p-4 text-sm leading-6 text-muted-strong">
          <p>`url`, `num_clips`, `add_captions`, `add_hook`, and `subtitle_lang` map directly to `POST /api/process/start`.</p>
          <div className="flex flex-wrap gap-2">
            <StatusChip tone="brand">REST mutation</StatusChip>
            <StatusChip tone="brand">SSE progress</StatusChip>
            <StatusChip tone="neutral">No auth</StatusChip>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
