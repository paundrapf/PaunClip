"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Clock, Layers3, Loader2, Play, Upload, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import { useToast } from "@/components/ui/toast";
import { PreflightPanel } from "@/features/system/preflight-panel";
import { DEFAULT_CAPTION_PRESETS } from "@/shared/constants/caption-presets";
import { CONTENT_PRESET_OPTIONS, REFRAME_MODE_OPTIONS } from "@/shared/reframe";
import { sessionConfigSchema, type SessionConfig } from "@/shared/schemas/session";
import { trpc } from "@/features/trpc/client";

export function WorkflowScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { notify } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const srtInputRef = useRef<HTMLInputElement>(null);
  const [sourceUrl, setSourceUrl] = useState(searchParams.get("url") ?? "");
  const [uploadId, setUploadId] = useState("");
  const [uploadedName, setUploadedName] = useState("");
  const [manualTranscriptSrt, setManualTranscriptSrt] = useState("");
  const [error, setError] = useState("");
  const [config, setConfig] = useState<SessionConfig>(sessionConfigSchema.parse({}));
  const [preferencesApplied, setPreferencesApplied] = useState(false);
  const settings = trpc.settings.get.useQuery();
  const preflight = trpc.settings.preflight.useQuery({
    sourceType: uploadId ? "upload" : "youtube",
    operation: "create",
    config: sessionConfigSchema.parse({
      ...config,
      manualTranscriptSrt: manualTranscriptSrt || undefined
    }),
    hasTranscript: Boolean(manualTranscriptSrt)
  });
  const createSession = trpc.session.create.useMutation({
    onSuccess: ({ session }) => {
      notify({
        type: "success",
        title: "Workflow started",
        description: "Opening the processing workspace."
      });
      router.push(`/results/${session.id}`);
    },
    onError: (createError) => {
      setError(createError.message);
      notify({
        type: "error",
        title: "Workflow could not start",
        description: createError.message
      });
    }
  });

  const isWorking = createSession.isPending;
  const startBlocked = Boolean(preflight.data?.blockers.length);

  useEffect(() => {
    if (preferencesApplied || !settings.data?.preferences) {
      return;
    }
    const preferences = settings.data.preferences;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) {
        return;
      }
      setConfig((current) =>
        sessionConfigSchema.parse({
          ...current,
          clipModel: preferences.defaultClipModel,
          aspectRatio: preferences.defaultAspectRatio,
          language: preferences.defaultLanguage,
          contentPreset: preferences.defaultContentPreset,
          reframeMode: preferences.defaultReframeMode
        })
      );
      setPreferencesApplied(true);
    });
    return () => {
      cancelled = true;
    };
  }, [preferencesApplied, settings.data?.preferences]);

  function updateConfig<K extends keyof SessionConfig>(key: K, value: SessionConfig[K]) {
    setConfig((current) => ({ ...current, [key]: value }));
  }

  async function uploadVideo(file: File) {
    const response = await fetch("/api/upload", {
      method: "POST",
      headers: { "x-file-name": file.name },
      body: file
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? "Upload failed");
    }

    const data = (await response.json()) as { uploadId: string };
    setUploadId(data.uploadId);
    setUploadedName(file.name);
    setSourceUrl("");
    notify({
      type: "success",
      title: "Video uploaded",
      description: "This file is ready for the workflow."
    });
  }

  async function start() {
    setError("");
    const finalConfig = sessionConfigSchema.parse({
      ...config,
      manualTranscriptSrt: manualTranscriptSrt || undefined
    });
    if (startBlocked) {
      const message = preflight.data?.blockers[0]?.message ?? "Complete setup before clipping.";
      setError(message);
      notify({
        type: "warning",
        title: "Setup required",
        description: message
      });
      return;
    }

    if (uploadId) {
      await createSession
        .mutateAsync({
          sourceType: "upload",
          uploadId,
          config: finalConfig
        })
        .catch(() => undefined);
      return;
    }

    if (!sourceUrl.trim()) {
      setError("Masukkan YouTube URL atau upload file video dulu.");
      notify({
        type: "warning",
        title: "Source is empty",
        description: "Masukkan YouTube URL atau upload file video dulu."
      });
      return;
    }

    await createSession
      .mutateAsync({
        sourceType: "youtube",
        sourceUrl: sourceUrl.trim(),
        config: finalConfig
      })
      .catch(() => undefined);
  }

  return (
    <div className="mx-auto grid min-h-screen w-full max-w-[1360px] gap-7 overflow-hidden px-5 py-6 sm:px-8">
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--muted-soft)]">Workflow</p>
          <h1 className="mt-1 break-words text-2xl font-semibold text-[var(--text)] sm:text-3xl">
            AI clipping setup
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
            Pick a source, choose the rules, then decide whether PaunClip renders immediately or waits for review.
          </p>
        </div>
        <Button variant="primary" onClick={() => void start()} disabled={isWorking || startBlocked}>
          {isWorking ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
          {config.renderMode === "review" ? "Analyze first" : "Start clipping"}
        </Button>
      </header>

      <div className="grid gap-3 rounded-lg border border-[var(--border)] bg-[rgb(18_18_16_/_0.56)] p-3 sm:grid-cols-3">
        <StepBadge number="1" label="Source" active={Boolean(sourceUrl || uploadId)} />
        <StepBadge number="2" label="Clip rules" active={Boolean(config.prompt || config.genre !== "auto")} />
        <StepBadge number="3" label={config.renderMode === "review" ? "Review first" : "Auto render"} active />
      </div>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="min-w-0 rounded-lg border border-[var(--border)] bg-[rgb(18_18_16_/_0.72)] p-4 shadow-[var(--shadow-tight)]">
          <div className="aspect-video overflow-hidden rounded-lg bg-[linear-gradient(135deg,rgb(31_29_25),rgb(9_9_8))]">
            <div className="grid h-full place-items-center">
              <button
                className="grid h-14 w-14 place-items-center rounded-full bg-[var(--accent)] text-[#1d1308] shadow-[0_18px_38px_rgb(242_162_58_/_0.18)] transition hover:bg-[var(--accent-strong)]"
                aria-label="Preview source placeholder"
                onClick={() => fileInputRef.current?.click()}
              >
                <Play className="h-6 w-6 fill-current" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-4">
            <label className="grid gap-2">
              <span className="text-xs font-semibold text-[var(--muted-soft)]">YouTube URL</span>
              <Input
                value={sourceUrl}
                onChange={(event) => {
                  setSourceUrl(event.target.value);
                  setUploadId("");
                  setUploadedName("");
                }}
                placeholder="https://www.youtube.com/watch?v=..."
                disabled={Boolean(uploadId)}
              />
            </label>

            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/x-matroska,video/webm,video/x-msvideo"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  return;
                }
                uploadVideo(file).catch((uploadError) => {
                  const message =
                    uploadError instanceof Error ? uploadError.message : "Upload failed";
                  setError(message);
                  notify({
                    type: "error",
                    title: "Upload failed",
                    description: message
                  });
                });
                event.currentTarget.value = "";
              }}
            />
            <input
              ref={srtInputRef}
              type="file"
              accept=".srt,text/plain"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  return;
                }
                file
                  .text()
                  .then((text) => {
                    setManualTranscriptSrt(text);
                    notify({
                      type: "success",
                      title: "Transcript loaded",
                      description: "PaunClip will use this SRT for analysis."
                    });
                  })
                  .catch(() => {
                    setError("Gagal membaca SRT.");
                    notify({
                      type: "error",
                      title: "Could not read SRT",
                      description: "Try another subtitle file."
                    });
                  });
                event.currentTarget.value = "";
              }}
            />

            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4" />
                Upload video
              </Button>
              <Button variant="ghost" onClick={() => srtInputRef.current?.click()}>
                Upload SRT
              </Button>
            </div>
            {uploadedName ? <Badge>{uploadedName}</Badge> : null}
            {manualTranscriptSrt ? <Badge>SRT loaded</Badge> : null}
            {error ? <p className="break-words text-sm font-medium text-[#ff9a9a]">{error}</p> : null}
            <PreflightPanel report={preflight.data} />
          </div>
        </div>

        <div className="grid gap-6">
          <div className="grid min-w-0 gap-4 rounded-lg border border-[var(--border)] bg-[rgb(18_18_16_/_0.72)] p-5 shadow-[var(--shadow-tight)]">
            <div className="grid gap-4 md:grid-cols-4">
              <SelectField
                label="Clip model"
                value={config.clipModel}
                onChange={(value) => updateConfig("clipModel", value as SessionConfig["clipModel"])}
                options={[
                  { label: "Auto", value: "auto" },
                  { label: "ClipAnything", value: "clip_anything" },
                  { label: "ClipBasic", value: "clip_basic" }
                ]}
              />
              <SelectField
                label="Genre"
                value={config.genre}
                onChange={(value) => updateConfig("genre", value as SessionConfig["genre"])}
                options={[
                  { label: "Auto", value: "auto" },
                  { label: "Motivational speech", value: "motivational_speech" },
                  { label: "Podcast", value: "podcast" },
                  { label: "Commentary", value: "commentary" },
                  { label: "Academic", value: "academic" }
                ]}
              />
              <SelectField
                label="Clip length"
                value={config.clipLength}
                onChange={(value) => updateConfig("clipLength", value as SessionConfig["clipLength"])}
                options={[
                  { label: "Auto (0m-3m)", value: "auto" },
                  { label: "<30s", value: "lt_30s" },
                  { label: "30s-59s", value: "30s_59s" },
                  { label: "60s-89s", value: "60s_89s" },
                  { label: "90s-3m", value: "90s_3m" }
                ]}
              />
              <label className="grid gap-2">
                <span className="text-xs font-semibold text-[var(--muted-soft)]">Auto hook</span>
                <button
                  className="flex h-11 items-center justify-between rounded-lg border border-[var(--border)] bg-[rgb(9_9_8_/_0.72)] px-3 text-sm text-[var(--text)] transition hover:border-[var(--border-strong)]"
                  onClick={() => updateConfig("autoHook", !config.autoHook)}
                >
                  {config.autoHook ? "Enabled" : "Disabled"}
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--accent)] text-[#1d1308]">
                    <Check className="h-4 w-4" aria-hidden="true" />
                  </span>
                </button>
              </label>
            </div>

            <div className="grid gap-3 rounded-lg border border-[var(--border)] bg-[rgb(7_7_6_/_0.52)] p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold text-[var(--text)]">Render flow</h2>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {config.renderMode === "review"
                      ? "Analysis stops before rendering."
                      : "Selected highlights render automatically."}
                  </p>
                </div>
                <Layers3 className="h-5 w-5 text-[var(--muted-soft)]" aria-hidden="true" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={config.renderMode === "auto" ? "primary" : "secondary"}
                  onClick={() => updateConfig("renderMode", "auto")}
                >
                  Auto render
                </Button>
                <Button
                  type="button"
                  variant={config.renderMode === "review" ? "primary" : "secondary"}
                  onClick={() => updateConfig("renderMode", "review")}
                >
                  Review first
                </Button>
              </div>
            </div>

            <div className="grid gap-4 rounded-lg border border-[var(--border)] bg-[rgb(7_7_6_/_0.52)] p-4">
              <div>
                <h2 className="text-sm font-semibold text-[var(--text)]">Reframe</h2>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Keep speakers, screens, or full frames visible when converting landscape videos to vertical.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <SelectField
                  label="Content preset"
                  value={config.contentPreset}
                  onChange={(value) =>
                    updateConfig("contentPreset", value as SessionConfig["contentPreset"])
                  }
                  options={CONTENT_PRESET_OPTIONS.map((option) => ({
                    label: option.label,
                    value: option.value
                  }))}
                />
                <SelectField
                  label="Framing"
                  value={config.reframeMode}
                  onChange={(value) => updateConfig("reframeMode", value as SessionConfig["reframeMode"])}
                  options={REFRAME_MODE_OPTIONS.map((option) => ({
                    label: option.label,
                    value: option.value
                  }))}
                />
              </div>
            </div>

            <label className="grid gap-2">
              <span className="text-xs font-semibold text-[var(--muted-soft)]">Include specific moments</span>
              <textarea
                value={config.prompt}
                onChange={(event) => updateConfig("prompt", event.target.value)}
                className="min-h-28 resize-none rounded-lg border border-[var(--border)] bg-[rgb(7_7_6_/_0.6)] px-4 py-3 text-sm text-[var(--text)] outline-none transition-[border-color,box-shadow,background] placeholder:text-[var(--muted-soft)] focus:border-[var(--accent)]/70 focus:bg-[rgb(12_12_10_/_0.92)] focus:ring-2 focus:ring-[rgb(242_162_58_/_0.13)]"
                placeholder="Cari momen inspiratif dan kisah sukses"
              />
            </label>

            <div className="rounded-lg border border-[var(--border)] bg-[rgb(7_7_6_/_0.52)] p-4">
              <div className="mb-4 flex items-center justify-between text-sm">
                <span className="font-semibold text-[var(--text)]">Processing timeframe</span>
                <span className="flex items-center gap-2 text-[var(--muted)]">
                  <Clock className="h-4 w-4" aria-hidden="true" />
                  {config.processingStart ?? 0}s - {config.processingEnd ?? "end"}
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  type="number"
                  min={0}
                  value={config.processingStart}
                  onChange={(event) => updateConfig("processingStart", Number(event.target.value))}
                  placeholder="Start seconds"
                />
                <Input
                  type="number"
                  min={1}
                  value={config.processingEnd ?? ""}
                  onChange={(event) =>
                    updateConfig(
                      "processingEnd",
                      event.target.value ? Number(event.target.value) : undefined
                    )
                  }
                  placeholder="End seconds"
                />
              </div>
            </div>
          </div>

          <div className="min-w-0 rounded-lg border border-[var(--border)] bg-[rgb(18_18_16_/_0.72)] p-5 shadow-[var(--shadow-tight)]">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text)]">Caption</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">Quick presets</p>
              </div>
              <SelectField
                label="Aspect"
                value={config.aspectRatio}
                onChange={(value) => updateConfig("aspectRatio", value as SessionConfig["aspectRatio"])}
                options={[
                  { label: "9:16", value: "9:16" },
                  { label: "1:1", value: "1:1" },
                  { label: "16:9", value: "16:9" },
                  { label: "4:5", value: "4:5" }
                ]}
                className="w-32"
              />
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
              {DEFAULT_CAPTION_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => updateConfig("captionStyleId", preset.id)}
                  className={`grid min-w-0 gap-3 rounded-lg border bg-[rgb(9_9_8_/_0.62)] p-3 text-left transition hover:border-[var(--border-strong)] ${
                    config.captionStyleId === preset.id ? "border-[var(--accent)]" : "border-[var(--border)]"
                  }`}
                >
                  <span className="grid aspect-[4/3] place-items-center rounded-lg bg-[var(--panel-raised)] px-3 text-center text-sm font-black">
                    <span
                      style={{
                        color: preset.config.wordHighlightColor ?? preset.config.textColor,
                        fontFamily: preset.config.fontFamily,
                        fontWeight: preset.config.fontWeight
                      }}
                    >
                      To get started
                    </span>
                  </span>
                  <span className="break-words text-sm font-semibold text-[var(--text)]">{preset.name}</span>
                </button>
              ))}
            </div>
            <div className="mt-5 grid gap-3 rounded-lg border border-[var(--border)] bg-[rgb(7_7_6_/_0.52)] p-4 md:grid-cols-[1fr_180px] md:items-end">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text)]">Caption sync</h3>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {config.captionOffsetMs === 0
                    ? "No offset"
                    : `${config.captionOffsetMs > 0 ? "+" : ""}${config.captionOffsetMs}ms`}
                </p>
              </div>
              <Input
                type="number"
                min={-1500}
                max={1500}
                step={50}
                value={config.captionOffsetMs}
                onChange={(event) => updateConfig("captionOffsetMs", Number(event.target.value))}
                placeholder="Offset ms"
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function StepBadge({ number, label, active }: { number: string; label: string; active?: boolean }) {
  return (
    <div
      className={`flex min-w-0 items-center gap-3 rounded-lg border px-3 py-2 ${
        active
          ? "border-[rgb(242_162_58_/_0.32)] bg-[var(--accent-muted)]"
          : "border-[var(--border)] bg-[rgb(7_7_6_/_0.42)]"
      }`}
    >
      <span
        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${
          active
            ? "bg-[var(--accent)] text-[#1d1308]"
            : "bg-[var(--panel-raised)] text-[var(--muted)]"
        }`}
      >
        {number}
      </span>
      <span className="min-w-0 truncate text-sm font-semibold text-[var(--text)]">{label}</span>
    </div>
  );
}
