"use client";

import { useEffect, useMemo, useState } from "react";

import { InfoGrid } from "@/components/common/info-grid";
import { SectionCard } from "@/components/common/section-card";
import { StatePanel } from "@/components/common/state-panel";
import { StatusChip } from "@/components/common/status-chip";
import { SurfaceCard } from "@/components/common/surface-card";
import { useProgress } from "@/hooks/use-progress";
import { settingsApi } from "@/lib/api";
import { titleCaseLabel } from "@/lib/utils";
import type { AIProviderConfig, AIProviderSettings } from "@/types/api";

const providerModes = ["ytclip", "openai", "custom"] as const;
const providerTasks = [
  {
    key: "highlight_finder",
    label: "Highlight Finder",
    description: "Required before campaign queue processing can run.",
  },
  {
    key: "caption_maker",
    label: "Caption Maker",
    description: "Used for caption or transcript generation at render time.",
  },
  {
    key: "hook_maker",
    label: "Hook Maker",
    description: "Used for TTS and hook generation in render workflows.",
  },
] as const;

type ProviderTaskKey = (typeof providerTasks)[number]["key"];

function normalizeConfig(value: unknown): AIProviderConfig {
  return typeof value === "object" && value !== null ? (value as AIProviderConfig) : {};
}

export function SettingsPageClient() {
  const { connection, data } = useProgress();
  const [providerType, setProviderType] = useState<string>("ytclip");
  const [settings, setSettings] = useState<AIProviderSettings>({});
  const [modelOptions, setModelOptions] = useState<Record<string, string[]>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [validationState, setValidationState] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const canMutate = connection === "online" && !data.is_running;

  async function loadSettings() {
    setIsLoading(true);
    setError(null);

    try {
      const [providerTypeResponse, aiSettings] = await Promise.all([
        settingsApi.providerType(),
        settingsApi.ai(),
      ]);
      setProviderType(providerTypeResponse.provider_type);
      setSettings({ ...aiSettings, _provider_type: providerTypeResponse.provider_type });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Settings unavailable.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
  }, []);

  function updateProviderField(taskKey: ProviderTaskKey, field: keyof AIProviderConfig, value: string) {
    setSettings((previous) => ({
      ...previous,
      _provider_type: providerType,
      [taskKey]: {
        ...normalizeConfig(previous[taskKey]),
        [field]: value,
      },
    }));

    if (field === "model" && value) {
      setModelOptions((previous) => ({
        ...previous,
        [taskKey]: Array.from(new Set([value, ...(previous[taskKey] ?? [])])),
      }));
    }
  }

  async function handleValidate(taskKey: ProviderTaskKey) {
    const config = normalizeConfig(settings[taskKey]);
    if (!config.base_url || !config.api_key || !canMutate) {
      setValidationState((previous) => ({
        ...previous,
        [taskKey]: "Base URL and API key are required before validation.",
      }));
      return;
    }

    setValidationState((previous) => ({ ...previous, [taskKey]: "Validating..." }));
    try {
      const result = await settingsApi.validate({
        base_url: config.base_url,
        api_key: config.api_key,
      });
      setValidationState((previous) => ({
        ...previous,
        [taskKey]: result.status === "ok" ? "Connection validated." : result.message || "Validation failed.",
      }));
    } catch (validationError) {
      setValidationState((previous) => ({
        ...previous,
        [taskKey]: validationError instanceof Error ? validationError.message : "Validation failed.",
      }));
    }
  }

  async function handleLoadModels(taskKey: ProviderTaskKey) {
    const config = normalizeConfig(settings[taskKey]);
    if (!config.base_url || !config.api_key || !canMutate) {
      setValidationState((previous) => ({
        ...previous,
        [taskKey]: "Base URL and API key are required before model discovery.",
      }));
      return;
    }

    setValidationState((previous) => ({ ...previous, [taskKey]: "Loading models..." }));
    try {
      const result = await settingsApi.models({
        base_url: config.base_url,
        api_key: config.api_key,
      });
      setModelOptions((previous) => ({
        ...previous,
        [taskKey]: Array.from(new Set([config.model || "", ...result.models].filter(Boolean))),
      }));
      setValidationState((previous) => ({
        ...previous,
        [taskKey]: result.models.length ? "Models loaded." : "No models returned by provider.",
      }));
    } catch (modelsError) {
      setValidationState((previous) => ({
        ...previous,
        [taskKey]: modelsError instanceof Error ? modelsError.message : "Model lookup failed.",
      }));
    }
  }

  async function handleSave() {
    if (!canMutate) {
      return;
    }

    setError(null);
    setStatusMessage("Saving AI settings...");

    try {
      await settingsApi.saveAi({
        ...settings,
        _provider_type: providerType,
      });
      setStatusMessage("AI settings saved to the live backend runtime.");
      await loadSettings();
    } catch (saveError) {
      setStatusMessage(null);
      setError(saveError instanceof Error ? saveError.message : "Settings save failed.");
    }
  }

  const readiness = useMemo(
    () =>
      providerTasks.map((task) => {
        const config = normalizeConfig(settings[task.key]);
        return {
          key: task.key,
          label: task.label,
          ready: Boolean(config.api_key && config.model),
        };
      }),
    [settings],
  );

  if (error && !isLoading && !Object.keys(settings).length) {
    return <StatePanel title="Settings unavailable" message={error} />;
  }

  return (
    <div className="grid gap-6">
      <SectionCard
        eyebrow="Runtime configuration"
        title="Provider readiness and live settings"
        description="These controls use the existing FastAPI settings endpoints for save, validate, and model discovery instead of pretending unsupported config surfaces are complete."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone={connection === "offline" ? "danger" : data.is_running ? "warning" : "success"}>
              {connection === "offline" ? "Backend offline" : data.is_running ? "Worker busy" : "Ready"}
            </StatusChip>
            <button
              className="inline-flex min-h-11 items-center justify-center rounded-pill border border-stroke-strong bg-accent/10 px-4 text-sm font-semibold text-foreground transition hover:bg-accent/14 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canMutate}
              onClick={() => void handleSave()}
              type="button"
            >
              Save AI settings
            </button>
          </div>
        }
      >
        {statusMessage ? (
          <div className="rounded-card border border-stroke-strong bg-accent/8 px-4 py-3 text-sm leading-6 text-foreground-soft">
            {statusMessage}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-card border border-danger/25 bg-danger/8 px-4 py-3 text-sm leading-6 text-muted-strong">
            {error}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {providerModes.map((mode) => (
            <button
              key={mode}
              className={`inline-flex min-h-11 items-center justify-center rounded-pill border px-4 text-sm font-semibold transition ${providerType === mode ? "border-stroke-strong bg-accent/10 text-foreground" : "border-stroke text-foreground hover:border-stroke-strong hover:bg-white/6"}`}
              disabled={!canMutate}
              onClick={() => {
                setProviderType(mode);
                setSettings((previous) => ({ ...previous, _provider_type: mode }));
              }}
              type="button"
            >
              {titleCaseLabel(mode)}
            </button>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          {providerTasks.map((task) => {
            const config = normalizeConfig(settings[task.key]);
            const models = Array.from(new Set([config.model || "", ...(modelOptions[task.key] ?? [])].filter(Boolean)));
            const ready = Boolean(config.api_key && config.model);

            return (
              <SurfaceCard key={task.key} className="border-stroke bg-panel/90">
                <div className="grid gap-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <h3 className="text-lg font-semibold text-foreground">{task.label}</h3>
                      <p className="text-sm leading-6 text-muted">{task.description}</p>
                    </div>
                    <StatusChip tone={ready ? "success" : "warning"}>{ready ? "Configured" : "Needs setup"}</StatusChip>
                  </div>

                  <label className="space-y-2 text-sm text-muted">
                    <span className="font-medium text-foreground-soft">Base URL</span>
                    <input
                      className="min-h-11 rounded-pill border border-stroke bg-panel-muted px-4 text-foreground outline-none transition focus:border-stroke-strong"
                      onChange={(event) => updateProviderField(task.key, "base_url", event.target.value)}
                      placeholder="https://api.openai.com/v1"
                      value={config.base_url || ""}
                    />
                  </label>

                  <label className="space-y-2 text-sm text-muted">
                    <span className="font-medium text-foreground-soft">API key</span>
                    <div className="flex gap-2">
                      <input
                        className="min-h-11 flex-1 rounded-pill border border-stroke bg-panel-muted px-4 text-foreground outline-none transition focus:border-stroke-strong"
                        onChange={(event) => updateProviderField(task.key, "api_key", event.target.value)}
                        placeholder="sk-..."
                        type={showKeys[task.key] ? "text" : "password"}
                        value={config.api_key || ""}
                      />
                      <button
                        className="inline-flex min-h-11 items-center justify-center rounded-pill border border-stroke px-4 text-sm font-semibold text-foreground transition hover:border-stroke-strong hover:bg-white/6"
                        onClick={() => setShowKeys((previous) => ({ ...previous, [task.key]: !previous[task.key] }))}
                        type="button"
                      >
                        {showKeys[task.key] ? "Hide" : "Show"}
                      </button>
                    </div>
                  </label>

                  <label className="space-y-2 text-sm text-muted">
                    <span className="font-medium text-foreground-soft">Model</span>
                    {models.length > 0 ? (
                      <select
                        className="min-h-11 rounded-pill border border-stroke bg-panel-muted px-4 text-foreground outline-none transition focus:border-stroke-strong"
                        onChange={(event) => updateProviderField(task.key, "model", event.target.value)}
                        value={config.model || ""}
                      >
                        <option value="">Select model</option>
                        {models.map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="min-h-11 rounded-pill border border-stroke bg-panel-muted px-4 text-foreground outline-none transition focus:border-stroke-strong"
                        onChange={(event) => updateProviderField(task.key, "model", event.target.value)}
                        placeholder="gpt-4.1 / whisper-1 / tts-1"
                        value={config.model || ""}
                      />
                    )}
                  </label>

                  <div className="flex flex-wrap gap-2">
                    <button
                      className="inline-flex min-h-11 items-center justify-center rounded-pill border border-stroke px-4 text-sm font-semibold text-foreground transition hover:border-stroke-strong hover:bg-white/6 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!canMutate}
                      onClick={() => void handleValidate(task.key)}
                      type="button"
                    >
                      Validate
                    </button>
                    <button
                      className="inline-flex min-h-11 items-center justify-center rounded-pill border border-stroke px-4 text-sm font-semibold text-foreground transition hover:border-stroke-strong hover:bg-white/6 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!canMutate}
                      onClick={() => void handleLoadModels(task.key)}
                      type="button"
                    >
                      Load models
                    </button>
                  </div>

                  <p className="text-sm leading-6 text-muted">{validationState[task.key] || "Validation messages appear here with live backend feedback."}</p>
                </div>
              </SurfaceCard>
            );
          })}
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard
          eyebrow="Runtime readiness"
          title="What the backend is ready to do right now"
          description="Settings should reflect real runtime readiness, not stale config alone."
        >
          <InfoGrid
            items={[
              { label: "Provider mode", value: titleCaseLabel(providerType) },
              { label: "Backend", value: connection === "offline" ? "Offline" : "Online" },
              { label: "Worker", value: data.is_running ? "Busy" : "Idle" },
              {
                label: "Configured groups",
                value: readiness.filter((item) => item.ready).length,
              },
            ]}
          />
        </SectionCard>

        <SectionCard
          eyebrow="Known backend gap"
          title="Render defaults and system controls"
          description="This structure is visible because the product map requires it, but the current FastAPI surface does not expose these controls yet."
        >
          <div className="grid gap-3 text-sm leading-6 text-muted">
            <div className="rounded-card border border-dashed border-stroke bg-panel-muted px-4 py-3">Render defaults such as tracking mode and watermark presets are not exposed by `server.py` yet.</div>
            <div className="rounded-card border border-dashed border-stroke bg-panel-muted px-4 py-3">System controls such as restart worker, clear logs, and dependency diagnostics need dedicated backend endpoints before this page can wire them honestly.</div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
