"use client";

import { useRef, useState } from "react";
import {
  Activity,
  CheckCircle2,
  EyeOff,
  FolderOpen,
  KeyRound,
  Loader2,
  RefreshCw,
  Upload,
  Volume2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import {
  AI_PROVIDER_PRESETS,
  buildProviderConfig,
  type AIProviderTask
} from "@/shared/constants/ai-providers";
import { DEFAULT_CAPTION_PRESETS } from "@/shared/constants/caption-presets";
import type { AIProviderConfig, AppSettings } from "@/shared/schemas/settings";
import { trpc } from "@/features/trpc/client";

const providerCards: Array<{
  key: AIProviderTask;
  title: string;
}> = [
  { key: "highlightFinder", title: "Highlight finder" },
  { key: "captionMaker", title: "Caption maker" },
  { key: "hookMaker", title: "Hook maker" },
  { key: "youtubeTitleMaker", title: "YouTube title maker" }
];

type HealthData = {
  ok: boolean;
  tools: Record<"ffmpeg" | "ffprobe" | "ytdlp", { ok: boolean; version?: string; error?: string }>;
  cookies: {
    ok: boolean;
    message: string;
    stats: {
      youtubeCookies: number;
      authCookies: number;
    };
  };
};

export function SettingsScreen() {
  const cookiesRef = useRef<HTMLInputElement>(null);
  const settings = trpc.settings.get.useQuery();
  const health = trpc.settings.health.useQuery(undefined, { refetchInterval: 15_000 });
  const utils = trpc.useUtils();
  const [active, setActive] = useState("AI providers");
  const [providerDrafts, setProviderDrafts] = useState<Partial<AppSettings["aiProviders"]>>({});
  const [modelOptions, setModelOptions] = useState<Partial<Record<AIProviderTask, string[]>>>({});
  const [outputDirectory, setOutputDirectory] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const updateProvider = trpc.settings.updateProvider.useMutation({
    onSuccess: async () => {
      setMessage("Provider saved.");
      await utils.settings.get.invalidate();
    },
    onError: (error) => setMessage(error.message)
  });
  const updateOutput = trpc.settings.updateOutputDirectory.useMutation({
    onSuccess: async () => {
      setMessage("Output directory saved.");
      await utils.settings.get.invalidate();
    },
    onError: (error) => setMessage(error.message)
  });
  const validateProvider = trpc.settings.validateProvider.useMutation({
    onSuccess: (result) => setMessage(result.message),
    onError: (error) => setMessage(error.message)
  });
  const loadModels = trpc.settings.loadProviderModels.useMutation({
    onSuccess: (models, variables) => {
      setModelOptions((current) => ({ ...current, [variables.task]: models }));
      setMessage(models.length ? `Loaded ${models.length} models.` : "No models returned.");
    },
    onError: (error) => setMessage(error.message)
  });

  function getDraft(task: AIProviderTask) {
    return providerDrafts[task] ?? settings.data?.aiProviders[task];
  }

  function setProviderField(
    task: AIProviderTask,
    field: keyof AIProviderConfig,
    value: string | number
  ) {
    setProviderDrafts((current) => {
      const base = current[task] ?? settings.data?.aiProviders[task];
      if (!base) {
        return current;
      }
      return {
        ...current,
        [task]: {
          ...base,
          [field]: value
        }
      };
    });
  }

  function changeProvider(task: AIProviderTask, provider: AIProviderConfig["provider"]) {
    const previous = getDraft(task);
    const next = buildProviderConfig(provider, task, {
      apiKey: previous?.apiKey ?? "",
      systemMessage: previous?.systemMessage
    });
    setProviderDrafts((current) => ({ ...current, [task]: next }));
  }

  async function uploadCookies(file: File) {
    const response = await fetch("/api/settings/cookies", {
      method: "POST",
      body: await file.text()
    });
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      validation?: { message?: string };
    } | null;

    if (!response.ok) {
      throw new Error(body?.error ?? "Cookie upload failed");
    }

    setMessage(body?.validation?.message ?? "cookies.txt saved.");
    await utils.settings.get.invalidate();
    await utils.settings.health.invalidate();
  }

  const tabs = ["AI providers", "Caption styles", "Output", "Cookies"];
  const currentOutputDirectory = outputDirectory ?? settings.data?.outputDirectory ?? "./storage/output";

  return (
    <div className="mx-auto grid min-h-screen max-w-[1360px] gap-8 px-8 py-8">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-zinc-500">Settings</p>
          <h1 className="mt-1 text-2xl font-bold">BYOK configuration</h1>
        </div>
        <Badge className="border-lime-300/40 bg-lime-300 text-black">Local only</Badge>
      </header>

      {message ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-200">
          {message}
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[280px_1fr]">
        <aside className="h-max rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          {tabs.map((item) => (
            <button
              key={item}
              onClick={() => setActive(item)}
              className={`flex h-11 w-full cursor-pointer items-center rounded-lg px-3 text-left text-sm font-semibold ${
                active === item ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-white"
              }`}
            >
              {item}
            </button>
          ))}
        </aside>

        <div className="grid gap-6">
          {active === "AI providers" && settings.data ? (
            <section className="grid gap-4">
              <SystemHealthPanel health={health.data} loading={health.isLoading} />
              <h2 className="text-lg font-semibold">AI providers</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {providerCards.map((provider) => {
                  const value = getDraft(provider.key);
                  if (!value) {
                    return null;
                  }

                  const preset = AI_PROVIDER_PRESETS[value.provider];
                  const busy =
                    updateProvider.isPending ||
                    validateProvider.isPending ||
                    loadModels.isPending ||
                    settings.isLoading;
                  const voices = preset.knownVoices ?? [];
                  const loadedModels = modelOptions[provider.key] ?? [];
                  const modelSelectOptions = Array.from(new Set([value.model, ...loadedModels].filter(Boolean)));

                  return (
                    <article
                      key={provider.key}
                      className="grid gap-4 rounded-lg border border-zinc-800 bg-zinc-950 p-5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-zinc-900">
                            {provider.key === "hookMaker" ? (
                              <Volume2 className="h-5 w-5 text-lime-300" aria-hidden="true" />
                            ) : (
                              <KeyRound className="h-5 w-5 text-lime-300" aria-hidden="true" />
                            )}
                          </span>
                          <div className="min-w-0">
                            <h3 className="font-semibold">{provider.title}</h3>
                            <p className="truncate text-sm text-zinc-500">{value.model || "No model"}</p>
                          </div>
                        </div>
                        <Badge>{preset.label}</Badge>
                      </div>

                      <SelectField
                        label="Provider"
                        value={value.provider}
                        onChange={(next) =>
                          changeProvider(provider.key, next as AIProviderConfig["provider"])
                        }
                        options={Object.values(AI_PROVIDER_PRESETS).map((item) => ({
                          label: item.label,
                          value: item.provider
                        }))}
                      />

                      <label className="grid gap-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                          Base URL
                        </span>
                        <Input
                          value={value.baseUrl}
                          onChange={(event) =>
                            setProviderField(provider.key, "baseUrl", event.target.value)
                          }
                        />
                      </label>

                      <label className="grid gap-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                          API key
                        </span>
                        <div className="relative">
                          <Input
                            value={value.apiKey}
                            onChange={(event) =>
                              setProviderField(provider.key, "apiKey", event.target.value)
                            }
                            placeholder={preset.keyPlaceholder}
                            className="pr-11"
                          />
                          <EyeOff className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                        </div>
                      </label>

                      <label className="grid gap-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                          Model
                        </span>
                        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                          <Input
                            list={`models-${provider.key}`}
                            value={value.model}
                            onChange={(event) =>
                              setProviderField(provider.key, "model", event.target.value)
                            }
                          />
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              loadModels.mutate({ task: provider.key, config: value })
                            }
                          >
                            <RefreshCw className="h-4 w-4" aria-hidden="true" />
                            Load
                          </Button>
                        </div>
                        <datalist id={`models-${provider.key}`}>
                          {modelSelectOptions.map((model) => (
                            <option key={model} value={model} />
                          ))}
                        </datalist>
                      </label>

                      {provider.key === "hookMaker" ? (
                        <div className="grid gap-4 rounded-lg border border-zinc-800 bg-black p-4">
                          <div className="flex items-center gap-2">
                            <Volume2 className="h-4 w-4 text-lime-300" aria-hidden="true" />
                            <p className="text-sm font-semibold">Hook voice</p>
                          </div>
                          <label className="grid gap-2">
                            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                              Voice
                            </span>
                            <Input
                              list="hook-voices"
                              value={value.ttsVoice ?? ""}
                              onChange={(event) =>
                                setProviderField(provider.key, "ttsVoice", event.target.value)
                              }
                              placeholder={voices[0] ?? "voice"}
                            />
                            <datalist id="hook-voices">
                              {voices.map((voice) => (
                                <option key={voice} value={voice} />
                              ))}
                            </datalist>
                          </label>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <SelectField
                              label="Format"
                              value={value.ttsFormat ?? "mp3"}
                              onChange={(next) => setProviderField(provider.key, "ttsFormat", next)}
                              options={[
                                { label: "MP3", value: "mp3" },
                                { label: "WAV", value: "wav" },
                                { label: "OPUS", value: "opus" }
                              ]}
                            />
                            <label className="grid gap-2">
                              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                                Speed
                              </span>
                              <Input
                                type="number"
                                min="0.25"
                                max="4"
                                step="0.05"
                                value={value.ttsSpeed ?? 1}
                                onChange={(event) =>
                                  setProviderField(
                                    provider.key,
                                    "ttsSpeed",
                                    Number(event.target.value)
                                  )
                                }
                              />
                            </label>
                          </div>
                        </div>
                      ) : null}

                      <div className="flex flex-wrap gap-3">
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={busy}
                          onClick={() => updateProvider.mutate({ task: provider.key, config: value })}
                        >
                          {updateProvider.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4" />
                          )}
                          Save
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          onClick={() => validateProvider.mutate({ task: provider.key, config: value })}
                        >
                          {validateProvider.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : null}
                          Validate
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          {active === "Caption styles" ? (
            <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Caption styles</h2>
                <Badge>{DEFAULT_CAPTION_PRESETS.length} presets</Badge>
              </div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
                {DEFAULT_CAPTION_PRESETS.map((preset) => (
                  <div key={preset.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                    <div className="grid aspect-[4/3] place-items-center rounded-lg bg-zinc-800 text-center text-sm font-black uppercase">
                      <span style={{ color: preset.config.wordHighlightColor ?? preset.config.textColor }}>
                        PaunClip
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-semibold">{preset.name}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {active === "Output" ? (
            <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
              <h2 className="text-lg font-semibold">Output</h2>
              <label className="mt-4 grid gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Directory
                </span>
                <div className="relative">
                  <Input
                    value={currentOutputDirectory}
                    onChange={(event) => setOutputDirectory(event.target.value)}
                    className="pr-11"
                  />
                  <FolderOpen className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                </div>
              </label>
              <Button
                className="mt-4"
                variant="primary"
                onClick={() => updateOutput.mutate(currentOutputDirectory)}
                disabled={updateOutput.isPending}
              >
                Save output directory
              </Button>
            </section>
          ) : null}

          {active === "Cookies" ? (
            <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
              <h2 className="text-lg font-semibold">Cookies</h2>
              <p className="mt-2 text-sm text-zinc-500">
                Upload Netscape-format cookies.txt for private, age-restricted, or bot-protected YouTube videos.
              </p>
              <div className="mt-4 rounded-lg border border-zinc-800 bg-black p-4">
                <p className="text-sm font-semibold">{health.data?.cookies.message ?? "Checking cookies..."}</p>
                <p className="mt-2 text-xs text-zinc-500">
                  YouTube cookies: {health.data?.cookies.stats.youtubeCookies ?? 0}. Auth cookies:{" "}
                  {health.data?.cookies.stats.authCookies ?? 0}.
                </p>
              </div>
              <input
                ref={cookiesRef}
                type="file"
                accept=".txt,text/plain"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) {
                    return;
                  }
                  uploadCookies(file).catch((error) =>
                    setMessage(error instanceof Error ? error.message : "Cookie upload failed")
                  );
                  event.currentTarget.value = "";
                }}
              />
              <div className="mt-4 flex items-center gap-3">
                <Button variant="secondary" onClick={() => cookiesRef.current?.click()}>
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  Upload cookies.txt
                </Button>
                <Badge>{settings.data?.cookies.youtubePath ? "Configured" : "Not configured"}</Badge>
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function SystemHealthPanel({
  health,
  loading
}: {
  health?: HealthData;
  loading: boolean;
}) {
  const tools = health?.tools;
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-zinc-900">
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
            ) : (
              <Activity className="h-5 w-5 text-lime-300" />
            )}
          </span>
          <div>
            <h2 className="text-lg font-semibold">System health</h2>
            <p className="text-sm text-zinc-500">
              {health?.ok ? "FFmpeg, FFprobe, and yt-dlp are reachable." : "Check tools before processing."}
            </p>
          </div>
        </div>
        <Badge className={health?.ok ? "border-lime-300/40 bg-lime-300 text-black" : "border-red-500/40 bg-red-500/15 text-red-100"}>
          {health?.ok ? "ready" : "needs attention"}
        </Badge>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <HealthItem label="FFmpeg" ok={tools?.ffmpeg.ok} detail={tools?.ffmpeg.version || tools?.ffmpeg.error} />
        <HealthItem label="FFprobe" ok={tools?.ffprobe.ok} detail={tools?.ffprobe.version || tools?.ffprobe.error} />
        <HealthItem label="yt-dlp" ok={tools?.ytdlp.ok} detail={tools?.ytdlp.version || tools?.ytdlp.error} />
        <HealthItem label="Cookies" ok={health?.cookies.ok} detail={health?.cookies.message} />
      </div>
    </section>
  );
}

function HealthItem({ label, ok, detail }: { label: string; ok?: boolean; detail?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-800 bg-black p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{label}</p>
        <span className={ok ? "h-2 w-2 rounded-full bg-lime-300" : "h-2 w-2 rounded-full bg-red-400"} />
      </div>
      <p className="mt-2 truncate text-xs text-zinc-500">{detail || "Not checked"}</p>
    </div>
  );
}
