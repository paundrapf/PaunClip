"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Clock, Loader2, Play, Upload, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import { DEFAULT_CAPTION_PRESETS } from "@/shared/constants/caption-presets";
import { sessionConfigSchema, type SessionConfig } from "@/shared/schemas/session";
import { trpc } from "@/features/trpc/client";

export function WorkflowScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const srtInputRef = useRef<HTMLInputElement>(null);
  const [sourceUrl, setSourceUrl] = useState(searchParams.get("url") ?? "");
  const [uploadId, setUploadId] = useState("");
  const [uploadedName, setUploadedName] = useState("");
  const [manualTranscriptSrt, setManualTranscriptSrt] = useState("");
  const [error, setError] = useState("");
  const [config, setConfig] = useState<SessionConfig>(sessionConfigSchema.parse({}));
  const createSession = trpc.session.create.useMutation({
    onSuccess: ({ session }) => router.push(`/results/${session.id}`)
  });

  const isWorking = createSession.isPending;

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
  }

  async function start() {
    setError("");
    const finalConfig = sessionConfigSchema.parse({
      ...config,
      manualTranscriptSrt: manualTranscriptSrt || undefined
    });

    if (uploadId) {
      await createSession.mutateAsync({
        sourceType: "upload",
        uploadId,
        config: finalConfig
      });
      return;
    }

    if (!sourceUrl.trim()) {
      setError("Masukkan YouTube URL atau upload file video dulu.");
      return;
    }

    await createSession.mutateAsync({
      sourceType: "youtube",
      sourceUrl: sourceUrl.trim(),
      config: finalConfig
    });
  }

  return (
    <div className="mx-auto grid min-h-screen max-w-[1360px] gap-8 px-8 py-8">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-zinc-500">Workflow</p>
          <h1 className="mt-1 text-2xl font-bold">AI clipping</h1>
        </div>
        <Button variant="primary" onClick={() => void start()} disabled={isWorking}>
          {isWorking ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
          Get clips in 1 click
        </Button>
      </header>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_1fr]">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
          <div className="aspect-video overflow-hidden rounded-lg bg-zinc-900">
            <div className="grid h-full place-items-center">
              <button
                className="grid h-14 w-14 place-items-center rounded-full bg-white text-black"
                aria-label="Preview source placeholder"
                onClick={() => fileInputRef.current?.click()}
              >
                <Play className="h-6 w-6 fill-current" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-4">
            <label className="grid gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                YouTube URL
              </span>
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
                uploadVideo(file).catch((uploadError) =>
                  setError(uploadError instanceof Error ? uploadError.message : "Upload failed")
                );
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
                file.text().then(setManualTranscriptSrt).catch(() => setError("Gagal membaca SRT."));
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
            {error ? <p className="text-sm font-medium text-red-300">{error}</p> : null}
          </div>
        </div>

        <div className="grid gap-6">
          <div className="grid gap-4 rounded-lg border border-zinc-800 bg-zinc-950 p-5">
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
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Auto hook
                </span>
                <button
                  className="flex h-11 items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm"
                  onClick={() => updateConfig("autoHook", !config.autoHook)}
                >
                  {config.autoHook ? "Enabled" : "Disabled"}
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-lime-300 text-black">
                    <Check className="h-4 w-4" aria-hidden="true" />
                  </span>
                </button>
              </label>
            </div>

            <label className="grid gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Include specific moments
              </span>
              <textarea
                value={config.prompt}
                onChange={(event) => updateConfig("prompt", event.target.value)}
                className="min-h-28 resize-none rounded-lg border border-zinc-800 bg-black px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-zinc-500 focus:ring-2 focus:ring-white/10"
                placeholder="Cari momen inspiratif dan kisah sukses"
              />
            </label>

            <div className="rounded-lg border border-zinc-800 bg-black p-4">
              <div className="mb-4 flex items-center justify-between text-sm">
                <span className="font-semibold">Processing timeframe</span>
                <span className="flex items-center gap-2 text-zinc-500">
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

          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Caption</h2>
                <p className="mt-1 text-sm text-zinc-500">Quick presets</p>
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
                  className={`grid gap-3 rounded-lg border bg-zinc-900 p-3 text-left transition hover:border-zinc-500 ${
                    config.captionStyleId === preset.id ? "border-white" : "border-zinc-800"
                  }`}
                >
                  <span className="grid aspect-[4/3] place-items-center rounded-lg bg-zinc-800 px-3 text-center text-sm font-black uppercase">
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
                  <span className="text-sm font-semibold text-zinc-200">{preset.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
