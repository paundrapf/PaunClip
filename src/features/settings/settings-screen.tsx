"use client";

import { useRef, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Copy,
  EyeOff,
  FolderOpen,
  KeyRound,
  Loader2,
  Palette,
  RefreshCw,
  Save,
  Upload,
  Volume2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import { useToast } from "@/components/ui/toast";
import {
  AI_PROVIDER_PRESETS,
  buildProviderConfig,
  type AIProviderTask
} from "@/shared/constants/ai-providers";
import { DEFAULT_CAPTION_PRESETS } from "@/shared/constants/caption-presets";
import type { CaptionPreset } from "@/shared/schemas/caption-style";
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
  const { notify } = useToast();
  const settings = trpc.settings.get.useQuery();
  const health = trpc.settings.health.useQuery(undefined, { refetchInterval: 15_000 });
  const storageStats = trpc.settings.storageStats.useQuery(undefined, { refetchInterval: 15_000 });
  const utils = trpc.useUtils();
  const [active, setActive] = useState("AI providers");
  const [providerDrafts, setProviderDrafts] = useState<Partial<AppSettings["aiProviders"]>>({});
  const [captionDrafts, setCaptionDrafts] = useState<Record<string, CaptionPreset>>({});
  const [activeCaptionId, setActiveCaptionId] = useState("karaoke");
  const [modelOptions, setModelOptions] = useState<Partial<Record<AIProviderTask, string[]>>>({});
  const [outputDirectory, setOutputDirectory] = useState<string | null>(null);
  const [cleanupOptions, setCleanupOptions] = useState({
    temp: true,
    failedArtifacts: false,
    sourceVideos: false
  });
  const [message, setMessage] = useState("");

  function showMessage(
    type: "success" | "error" | "warning" | "info",
    title: string,
    description?: string,
  ) {
    setMessage(description ?? title);
    notify({ type, title, description });
  }

  const updateProvider = trpc.settings.updateProvider.useMutation({
    onSuccess: async () => {
      showMessage("success", "Provider saved", "The AI provider configuration is ready.");
      await utils.settings.get.invalidate();
    },
    onError: (error) =>
      showMessage("error", "Provider save failed", error.message)
  });
  const updateOutput = trpc.settings.updateOutputDirectory.useMutation({
    onSuccess: async () => {
      showMessage("success", "Output directory saved");
      await utils.settings.get.invalidate();
    },
    onError: (error) =>
      showMessage("error", "Output directory was not saved", error.message)
  });
  const openOutput = trpc.settings.openOutputDirectory.useMutation({
    onSuccess: (result) => showMessage("success", "Output folder opened", result.path),
    onError: (error) =>
      showMessage("error", "Output folder could not open", error.message)
  });
  const cleanupStorage = trpc.settings.cleanupStorage.useMutation({
    onSuccess: async (result) => {
      showMessage("success", "Cleanup completed", `Removed ${result.removedLabel}.`);
      await utils.settings.storageStats.invalidate();
      await utils.settings.get.invalidate();
    },
    onError: (error) =>
      showMessage("error", "Cleanup failed", error.message)
  });
  const validateProvider = trpc.settings.validateProvider.useMutation({
    onSuccess: (result) =>
      showMessage(
        result.ok ? "success" : "warning",
        result.ok ? "Provider validated" : "Provider needs attention",
        result.message,
      ),
    onError: (error) =>
      showMessage("error", "Provider validation failed", error.message)
  });
  const loadModels = trpc.settings.loadProviderModels.useMutation({
    onSuccess: (models, variables) => {
      setModelOptions((current) => ({ ...current, [variables.task]: models }));
      showMessage(
        models.length ? "success" : "warning",
        models.length ? "Models loaded" : "No models returned",
        models.length ? `Loaded ${models.length} models.` : "Check the base URL or API key.",
      );
    },
    onError: (error) =>
      showMessage("error", "Could not load models", error.message)
  });
  const updateCaptionPreset = trpc.settings.updateCaptionPreset.useMutation({
    onSuccess: async () => {
      showMessage("success", "Caption preset saved");
      await utils.settings.get.invalidate();
    },
    onError: (error) =>
      showMessage("error", "Caption preset was not saved", error.message)
  });
  const duplicateCaptionPreset = trpc.settings.duplicateCaptionPreset.useMutation({
    onSuccess: async (nextSettings) => {
      const latestPreset = nextSettings.captionPresets.at(-1);
      if (latestPreset) {
        setActiveCaptionId(latestPreset.id);
      }
      showMessage("success", "Caption preset duplicated");
      await utils.settings.get.invalidate();
    },
    onError: (error) =>
      showMessage("error", "Caption preset was not duplicated", error.message)
  });

  function getDraft(task: AIProviderTask) {
    return providerDrafts[task] ?? settings.data?.aiProviders[task];
  }

  const captionPresets = settings.data?.captionPresets?.length
    ? settings.data.captionPresets
    : DEFAULT_CAPTION_PRESETS;
  const activeCaption =
    captionDrafts[activeCaptionId] ??
    captionPresets.find((preset) => preset.id === activeCaptionId) ??
    captionPresets[0];

  function setCaptionDraft(preset: CaptionPreset) {
    setCaptionDrafts((current) => ({ ...current, [preset.id]: preset }));
  }

  function setCaptionConfigField(
    field: keyof CaptionPreset["config"],
    value: string | number | CaptionPreset["config"]["shadow"]
  ) {
    if (!activeCaption) {
      return;
    }
    const nextConfig = {
      ...activeCaption.config,
      [field]: value
    };
    setCaptionDraft({
      ...activeCaption,
      isCustom: true,
      config: nextConfig
    });
  }

  function setCaptionShadowField(field: "color" | "blur" | "offsetX" | "offsetY", value: string | number) {
    if (!activeCaption) {
      return;
    }
    setCaptionConfigField("shadow", {
      ...(activeCaption.config.shadow ?? { color: "#000000", blur: 0, offsetX: 0, offsetY: 0 }),
      [field]: value
    });
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

    showMessage(
      "success",
      "Cookies uploaded",
      body?.validation?.message ?? "cookies.txt saved.",
    );
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
                  const ttsFormats = preset.supportedTtsFormats ?? ["mp3", "wav", "opus"];
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
                              options={ttsFormats.map((format) => ({
                                label: format.toUpperCase(),
                                value: format
                              }))}
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
                          {value.provider === "groq" ? (
                            <p className="text-xs leading-5 text-zinc-500">
                              Groq Orpheus currently uses WAV output and supports bracketed vocal directions in the hook text.
                            </p>
                          ) : null}
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
            <section className="grid gap-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Caption style manager</h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Edit ASS/libass presets used by FFmpeg renders.
                  </p>
                </div>
                <Badge>{captionPresets.length} presets</Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                {captionPresets.map((preset) => (
                  <button
                    key={preset.id}
                    className={`rounded-lg border p-3 text-left ${
                      activeCaption?.id === preset.id
                        ? "border-lime-300/60 bg-lime-300/10"
                        : "border-zinc-800 bg-zinc-950"
                    }`}
                    onClick={() => setActiveCaptionId(preset.id)}
                  >
                    <div
                      className="grid aspect-[4/3] place-items-center rounded-lg text-center text-sm font-black uppercase"
                      style={{
                        color: preset.config.textColor,
                        background:
                          preset.config.backgroundType === "none"
                            ? "#18181b"
                            : preset.config.backgroundColor ?? "#111111"
                      }}
                    >
                      <span style={{ color: preset.config.wordHighlightColor ?? preset.config.textColor }}>
                        PaunClip
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-semibold">{preset.name}</p>
                    <p className="mt-1 text-xs text-zinc-500">{preset.config.animation}</p>
                  </button>
                ))}
              </div>

              {activeCaption ? (
                <div className="grid gap-5 rounded-lg border border-zinc-800 bg-zinc-950 p-5 xl:grid-cols-[320px_1fr]">
                  <div className="grid content-start gap-4">
                    <div className="grid aspect-[9/16] place-items-center rounded-lg bg-black p-5 text-center">
                      <div
                        className="max-w-full px-4 py-3 text-center font-black"
                        style={{
                          color: activeCaption.config.textColor,
                          background:
                            activeCaption.config.backgroundType === "none"
                              ? "transparent"
                              : activeCaption.config.backgroundColor ?? "#111111",
                          borderRadius: activeCaption.config.borderRadius ?? 8,
                          fontSize: `${Math.round(activeCaption.config.fontSize * 240)}px`,
                          fontFamily: activeCaption.config.fontFamily,
                          textTransform:
                            activeCaption.config.textTransform === "none"
                              ? "none"
                              : activeCaption.config.textTransform,
                          WebkitTextStroke: `${activeCaption.config.strokeWidth ?? 0}px ${
                            activeCaption.config.strokeColor ?? "transparent"
                          }`
                        }}
                      >
                        Hook line
                        <br />
                        <span style={{ color: activeCaption.config.wordHighlightColor }}>
                          goes here
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={updateCaptionPreset.isPending}
                        onClick={() => updateCaptionPreset.mutate(activeCaption)}
                      >
                        {updateCaptionPreset.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        Save
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={duplicateCaptionPreset.isPending}
                        onClick={() => duplicateCaptionPreset.mutate(activeCaption.id)}
                      >
                        {duplicateCaptionPreset.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                        Duplicate
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-2">
                      <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Name
                      </span>
                      <Input
                        value={activeCaption.name}
                        onChange={(event) =>
                          setCaptionDraft({
                            ...activeCaption,
                            name: event.target.value,
                            isCustom: true,
                            config: { ...activeCaption.config, name: event.target.value }
                          })
                        }
                      />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Font family
                      </span>
                      <Input
                        value={activeCaption.config.fontFamily}
                        onChange={(event) => setCaptionConfigField("fontFamily", event.target.value)}
                      />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Font size
                      </span>
                      <Input
                        type="number"
                        min="0.02"
                        max="0.2"
                        step="0.002"
                        value={activeCaption.config.fontSize}
                        onChange={(event) => setCaptionConfigField("fontSize", Number(event.target.value))}
                      />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Font weight
                      </span>
                      <Input
                        type="number"
                        min="100"
                        max="1000"
                        step="100"
                        value={activeCaption.config.fontWeight}
                        onChange={(event) => setCaptionConfigField("fontWeight", Number(event.target.value))}
                      />
                    </label>
                    <SelectField
                      label="Position"
                      value={activeCaption.config.position}
                      onChange={(next) => setCaptionConfigField("position", next)}
                      options={[
                        { label: "Top", value: "top" },
                        { label: "Center", value: "center" },
                        { label: "Bottom", value: "bottom" }
                      ]}
                    />
                    <SelectField
                      label="Animation"
                      value={activeCaption.config.animation}
                      onChange={(next) => setCaptionConfigField("animation", next)}
                      options={[
                        { label: "None", value: "none" },
                        { label: "Karaoke", value: "karaoke" },
                        { label: "Pop", value: "pop" },
                        { label: "Bounce", value: "bounce" },
                        { label: "Fade", value: "fade" },
                        { label: "Slide", value: "slide" },
                        { label: "Typewriter", value: "typewriter" },
                        { label: "Glitch", value: "glitch" },
                        { label: "Shake", value: "shake" }
                      ]}
                    />
                    <SelectField
                      label="Background"
                      value={activeCaption.config.backgroundType}
                      onChange={(next) => setCaptionConfigField("backgroundType", next)}
                      options={[
                        { label: "None", value: "none" },
                        { label: "Pill", value: "pill" },
                        { label: "Rectangle", value: "rectangle" },
                        { label: "Glow", value: "glow" }
                      ]}
                    />
                    <SelectField
                      label="Text transform"
                      value={activeCaption.config.textTransform}
                      onChange={(next) => setCaptionConfigField("textTransform", next)}
                      options={[
                        { label: "None", value: "none" },
                        { label: "Uppercase", value: "uppercase" },
                        { label: "Lowercase", value: "lowercase" },
                        { label: "Capitalize", value: "capitalize" }
                      ]}
                    />
                    <ColorField
                      label="Text"
                      value={activeCaption.config.textColor}
                      onChange={(value) => setCaptionConfigField("textColor", value)}
                    />
                    <ColorField
                      label="Highlight"
                      value={activeCaption.config.wordHighlightColor ?? "#b7ff3c"}
                      onChange={(value) => setCaptionConfigField("wordHighlightColor", value)}
                    />
                    <ColorField
                      label="Background"
                      value={activeCaption.config.backgroundColor ?? "#111111"}
                      onChange={(value) => setCaptionConfigField("backgroundColor", value)}
                    />
                    <ColorField
                      label="Stroke"
                      value={activeCaption.config.strokeColor ?? "#000000"}
                      onChange={(value) => setCaptionConfigField("strokeColor", value)}
                    />
                    <label className="grid gap-2">
                      <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Stroke width
                      </span>
                      <Input
                        type="number"
                        min="0"
                        max="20"
                        step="1"
                        value={activeCaption.config.strokeWidth ?? 0}
                        onChange={(event) => setCaptionConfigField("strokeWidth", Number(event.target.value))}
                      />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Letter spacing
                      </span>
                      <Input
                        type="number"
                        min="0"
                        max="10"
                        step="0.5"
                        value={activeCaption.config.letterSpacing ?? 0}
                        onChange={(event) => setCaptionConfigField("letterSpacing", Number(event.target.value))}
                      />
                    </label>
                    <ColorField
                      label="Shadow"
                      value={activeCaption.config.shadow?.color ?? "#000000"}
                      onChange={(value) => setCaptionShadowField("color", value)}
                    />
                    <label className="grid gap-2">
                      <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Shadow blur
                      </span>
                      <Input
                        type="number"
                        min="0"
                        max="64"
                        step="1"
                        value={activeCaption.config.shadow?.blur ?? 0}
                        onChange={(event) => setCaptionShadowField("blur", Number(event.target.value))}
                      />
                    </label>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-5 text-sm text-zinc-500">
                  No caption preset available.
                </div>
              )}
            </section>
          ) : null}

          {active === "Output" ? (
            <section className="grid gap-5 rounded-lg border border-zinc-800 bg-zinc-950 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Output and storage</h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Local artifacts, temp files, and rendered output controls.
                  </p>
                </div>
                <Badge>{storageStats.data?.storageLabel ?? "checking"}</Badge>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <StorageMetric label="Storage root" value={storageStats.data?.storageLabel ?? "..."} />
                <StorageMetric label="Temp files" value={storageStats.data?.tempLabel ?? "..."} />
                <StorageMetric label="Output folder" value={storageStats.data?.outputLabel ?? "..."} />
              </div>
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
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="primary"
                  onClick={() => updateOutput.mutate(currentOutputDirectory)}
                  disabled={updateOutput.isPending}
                >
                  {updateOutput.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save output directory
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => openOutput.mutate()}
                  disabled={openOutput.isPending}
                >
                  {openOutput.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FolderOpen className="h-4 w-4" />
                  )}
                  Open output folder
                </Button>
              </div>

              <div className="grid gap-3 rounded-lg border border-zinc-800 bg-black p-4">
                <h3 className="font-semibold">Cleanup policy</h3>
                <CleanupToggle
                  label="Temp render folders"
                  checked={cleanupOptions.temp}
                  onChange={(checked) => setCleanupOptions((current) => ({ ...current, temp: checked }))}
                />
                <CleanupToggle
                  label="Failed or cancelled clip artifacts"
                  checked={cleanupOptions.failedArtifacts}
                  onChange={(checked) =>
                    setCleanupOptions((current) => ({ ...current, failedArtifacts: checked }))
                  }
                />
                <CleanupToggle
                  label="Downloaded source/audio after render"
                  checked={cleanupOptions.sourceVideos}
                  onChange={(checked) =>
                    setCleanupOptions((current) => ({ ...current, sourceVideos: checked }))
                  }
                />
                <Button
                  variant="danger"
                  disabled={
                    cleanupStorage.isPending ||
                    (!cleanupOptions.temp &&
                      !cleanupOptions.failedArtifacts &&
                      !cleanupOptions.sourceVideos)
                  }
                  onClick={() => cleanupStorage.mutate(cleanupOptions)}
                >
                  {cleanupStorage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Run cleanup
                </Button>
              </div>
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
                  uploadCookies(file).catch((error) => {
                    showMessage(
                      "error",
                      "Cookie upload failed",
                      error instanceof Error ? error.message : "Cookie upload failed",
                    );
                  });
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

function ColorField({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</span>
      <div className="grid grid-cols-[44px_1fr] gap-2">
        <span
          className="grid h-11 place-items-center rounded-lg border border-zinc-800 bg-black"
          style={{ color: value }}
        >
          <Palette className="h-4 w-4" aria-hidden="true" />
        </span>
        <Input value={value} onChange={(event) => onChange(event.target.value)} />
      </div>
    </label>
  );
}

function StorageMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-black p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 text-xl font-bold">{value}</p>
    </div>
  );
}

function CleanupToggle({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-lg border border-zinc-900 bg-zinc-950 px-3 py-2">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-lime-300"
      />
    </label>
  );
}
