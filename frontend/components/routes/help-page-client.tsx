"use client";

import { useEffect, useState } from "react";

import { InfoGrid } from "@/components/common/info-grid";
import { SectionCard } from "@/components/common/section-card";
import { StatusChip } from "@/components/common/status-chip";
import { useProgress } from "@/hooks/use-progress";
import { settingsApi } from "@/lib/api";
import { titleCaseLabel } from "@/lib/utils";
import type { AIProviderSettings } from "@/types/api";

const queueStates = [
  ["new", "Fetched but untouched", "Queue or skip"],
  ["queued", "Ready to process", "Process or skip"],
  ["downloading", "Source acquisition in progress", "Inspect only"],
  ["transcribing", "Transcript generation in progress", "Inspect only"],
  ["highlights_found", "Phase one completed", "Open session"],
  ["editing", "Session exists and has edits", "Open session"],
  ["rendering", "Render in progress", "Inspect logs or outputs"],
  ["completed", "Output exists", "Open output or parent session"],
  ["failed", "Processing failed", "Retry and inspect error"],
  ["skipped", "Intentionally ignored", "Queue again later"],
] as const;

export function HelpPageClient() {
  const { connection, data, lastError } = useProgress();
  const [providerType, setProviderType] = useState("ytclip");
  const [settings, setSettings] = useState<AIProviderSettings>({});

  useEffect(() => {
    Promise.all([settingsApi.providerType(), settingsApi.ai()])
      .then(([providerTypeResponse, aiSettings]) => {
        setProviderType(providerTypeResponse.provider_type);
        setSettings(aiSettings);
      })
      .catch(() => undefined);
  }, []);

  const highlightFinderReady = Boolean(settings.highlight_finder?.api_key && settings.highlight_finder?.model);

  return (
    <div className="grid gap-6">
      <SectionCard
        eyebrow="How it works"
        title="Operational help and diagnostics"
        description="This route keeps the in-app help direct, recovery-focused, and grounded in the existing backend surface rather than generic marketing copy."
        action={<StatusChip tone={connection === "offline" ? "danger" : "success"}>{connection === "offline" ? "Backend offline" : "Diagnostics live"}</StatusChip>}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {[
            "Campaign queue fetches channel videos and attaches deterministic sessions when processing begins.",
            "Session workspace is the persisted editing surface for highlights, clip jobs, and outputs.",
            "Render Selected targets chosen highlights only; Retry Failed targets failed clip jobs only.",
            "Refreshing the site should not lose state because the backend filesystem stays the source of truth.",
          ].map((item) => (
            <div key={item} className="rounded-card border border-stroke bg-panel-muted px-4 py-3 text-sm leading-6 text-foreground-soft">
              {item}
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard
          eyebrow="Queue explanation"
          title="Queue state matrix"
          description="These states come straight from the product map and the current FastAPI queue vocabulary."
        >
          <div className="grid gap-3">
            {queueStates.map(([state, meaning, action]) => (
              <div key={state} className="grid gap-3 rounded-card border border-stroke bg-panel-muted px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
                <StatusChip tone={state === "failed" ? "danger" : state === "completed" ? "success" : state === "queued" || state === "rendering" ? "brand" : "neutral"}>
                  {state}
                </StatusChip>
                <div className="space-y-1 text-sm leading-6 text-muted">
                  <p className="font-semibold text-foreground-soft">{meaning}</p>
                  <p>{action}</p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          eyebrow="Current system status"
          title="Live backend visibility"
          description="Only status that the current FastAPI surface can prove is shown as live diagnostics."
        >
          <InfoGrid
            items={[
              { label: "Backend", value: connection === "offline" ? "Offline" : "Online" },
              { label: "Provider mode", value: titleCaseLabel(providerType) },
              { label: "Highlight Finder", value: highlightFinderReady ? "Configured" : "Needs setup" },
              { label: "Worker", value: data.is_running ? titleCaseLabel(data.task_type ?? "active") : "Idle" },
              { label: "Current status", value: data.status || "No runtime status available" },
              { label: "Last stream error", value: lastError || "None" },
            ]}
          />
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard
          eyebrow="Cookies setup"
          title="YouTube cookies guidance"
          description="This follows the repo’s `COOKIES.md` instructions rather than inventing a new workflow."
        >
          <ol className="grid gap-3 pl-5 text-sm leading-6 text-muted">
            <li>Stay logged in to YouTube in your browser.</li>
            <li>Export a fresh `cookies.txt` from `youtube.com` using a cookies export extension.</li>
            <li>Make sure the file includes `SID`, `HSID`, `SSID`, `APISID`, `SAPISID`, and `LOGIN_INFO`.</li>
            <li>If YouTube returns 403 or bot warnings, re-export fresh cookies after normal viewing activity.</li>
            <li>Treat `cookies.txt` like a password and never share it.</li>
          </ol>
        </SectionCard>

        <SectionCard
          eyebrow="Troubleshooting"
          title="Required recovery actions"
          description="The product map locks these recovery paths so later UI work does not invent new behavior."
        >
          <div className="grid gap-3 md:grid-cols-2">
            {[
              "Retry the failed action from the relevant queue row or session.",
              "Open the related campaign or session to inspect persisted state.",
              "Go to Settings for provider or runtime configuration issues.",
              "Inspect current status output and queue-level last-error messages.",
            ].map((item) => (
              <div key={item} className="rounded-card border border-stroke bg-panel-muted px-4 py-3 text-sm leading-6 text-foreground-soft">
                {item}
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
