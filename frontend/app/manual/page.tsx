"use client";

import { useCallback, useState } from "react";
import { ArrowRight, Film, LoaderCircle, Play, Upload } from "lucide-react";

import { SectionCard } from "@/components/common/section-card";
import { StatusChip } from "@/components/common/status-chip";
import { SurfaceCard } from "@/components/common/surface-card";
import { processApi } from "@/lib/api";

const YOUTUBE_REGEX = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;

function isValidYouTubeUrl(url: string): boolean {
  return YOUTUBE_REGEX.test(url.trim());
}

type SourceType = "youtube" | "local";

export default function ManualPage() {
  const [sourceType, setSourceType] = useState<SourceType>("youtube");
  const [url, setUrl] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [droppedFileName, setDroppedFileName] = useState<string | null>(null);
  const [numClips, setNumClips] = useState(5);
  const [addHook, setAddHook] = useState(false);
  const [addCaptions, setAddCaptions] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validate = useCallback((): string | null => {
    if (sourceType === "youtube") {
      if (!url.trim()) {
        return "Please enter a YouTube URL.";
      }
      if (!isValidYouTubeUrl(url)) {
        return "Please enter a valid YouTube URL.";
      }
    } else {
      if (!localPath.trim()) {
        return "Please enter the full path to the local video file.";
      }
    }
    if (numClips < 1 || numClips > 20) {
      return "Clip count must be between 1 and 20.";
    }
    return null;
  }, [sourceType, url, localPath, numClips]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setStatusMessage("Starting processing...");

    try {
      await processApi.start({
        url: sourceType === "youtube" ? url.trim() : localPath.trim(),
        num_clips: numClips,
        add_captions: addCaptions,
        add_hook: addHook,
        subtitle_lang: "id",
      });
      setStatusMessage("Processing started. Watch the runtime widget for progress.");
      setUrl("");
      setLocalPath("");
      setDroppedFileName(null);
    } catch (submitError) {
      setStatusMessage(null);
      setError(submitError instanceof Error ? submitError.message : "Failed to start processing.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      setDroppedFileName(file.name);
      setLocalPath((previous) => previous || `Drop path manually for: ${file.name}`);
    }
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
  }

  const sourceUrl = sourceType === "youtube" ? url : localPath;
  const isValid = sourceType === "youtube" ? isValidYouTubeUrl(url) : localPath.trim().length > 0;

  return (
    <div className="grid gap-6">
      <SectionCard
        eyebrow="Manual intake"
        title="Start a new clipping session"
        description="Provide a source, choose how many clips to generate, and kick off the backend pipeline."
      >
        <form onSubmit={handleSubmit} className="grid gap-6">
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
            <button
              className={`inline-flex min-h-11 items-center gap-2 rounded-pill border px-4 text-sm font-semibold transition ${sourceType === "youtube" ? "border-stroke-strong bg-accent/10 text-foreground" : "border-stroke text-foreground hover:border-stroke-strong hover:bg-white/6"}`}
              onClick={() => {
                setSourceType("youtube");
                setError(null);
              }}
              type="button"
            >
              <Play className="size-4" />
              YouTube URL
            </button>
            <button
              className={`inline-flex min-h-11 items-center gap-2 rounded-pill border px-4 text-sm font-semibold transition ${sourceType === "local" ? "border-stroke-strong bg-accent/10 text-foreground" : "border-stroke text-foreground hover:border-stroke-strong hover:bg-white/6"}`}
              onClick={() => {
                setSourceType("local");
                setError(null);
              }}
              type="button"
            >
              <Upload className="size-4" />
              Local file
            </button>
          </div>

          {sourceType === "youtube" ? (
            <label className="space-y-2 text-sm text-muted">
              <span className="font-medium text-foreground-soft">YouTube URL</span>
              <input
                className="min-h-11 w-full rounded-pill border border-stroke bg-panel-muted px-4 text-foreground outline-none transition focus:border-stroke-strong"
                onChange={(event) => {
                  setUrl(event.target.value);
                  setError(null);
                }}
                placeholder="https://www.youtube.com/watch?v=..."
                value={url}
              />
              {url && !isValidYouTubeUrl(url) ? (
                <p className="text-xs text-danger">Please enter a valid YouTube URL.</p>
              ) : null}
            </label>
          ) : (
            <div className="grid gap-4">
              <div
                className="grid gap-3 rounded-card border border-dashed border-stroke-strong bg-accent/6 p-6 text-center transition hover:border-accent/40 hover:bg-accent/10"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                <Upload className="mx-auto size-6 text-muted" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground-soft">Drag and drop a video file</p>
                  <p className="text-xs text-muted">Browsers cannot read absolute paths from dropped files. Enter the full path below.</p>
                </div>
                {droppedFileName ? (
                  <div className="inline-flex items-center gap-2 rounded-pill border border-stroke bg-panel-muted px-3 py-1.5 text-xs text-foreground-soft">
                    <Film className="size-3.5" />
                    {droppedFileName}
                  </div>
                ) : null}
              </div>
              <label className="space-y-2 text-sm text-muted">
                <span className="font-medium text-foreground-soft">Absolute file path</span>
                <input
                  className="min-h-11 w-full rounded-pill border border-stroke bg-panel-muted px-4 text-foreground outline-none transition focus:border-stroke-strong"
                  onChange={(event) => {
                    setLocalPath(event.target.value);
                    setError(null);
                  }}
                  placeholder="C:\\Users\\...\\video.mp4"
                  value={localPath}
                />
              </label>
            </div>
          )}

          <SurfaceCard className="border-stroke bg-panel-muted/90">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-foreground-soft">Clip count</label>
                  <span className="rounded-pill border border-stroke bg-panel px-3 py-1 text-xs font-semibold text-foreground-soft">{numClips}</span>
                </div>
                <input
                  className="w-full accent-accent"
                  max={20}
                  min={1}
                  onChange={(event) => setNumClips(Number(event.target.value))}
                  type="range"
                  value={numClips}
                />
                <div className="flex justify-between text-xs text-muted">
                  <span>1</span>
                  <span>20</span>
                </div>
              </div>

              <div className="flex flex-col justify-center gap-4">
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    checked={addCaptions}
                    className="size-5 accent-accent"
                    onChange={(event) => setAddCaptions(event.target.checked)}
                    type="checkbox"
                  />
                  <span className="text-sm text-foreground-soft">Add captions</span>
                </label>
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    checked={addHook}
                    className="size-5 accent-accent"
                    onChange={(event) => setAddHook(event.target.checked)}
                    type="checkbox"
                  />
                  <span className="text-sm text-foreground-soft">Add hook</span>
                </label>
              </div>
            </div>
          </SurfaceCard>

          <div className="flex flex-wrap items-center gap-3">
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-pill border border-stroke-strong bg-brand/15 px-5 text-sm font-semibold text-foreground transition hover:border-accent/50 hover:bg-accent/12 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isSubmitting || !isValid}
              type="submit"
            >
              {isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              Start processing
            </button>
            <StatusChip tone={sourceUrl && isValid ? "success" : "neutral"}>
              {sourceUrl && isValid ? "Ready" : "Waiting for input"}
            </StatusChip>
          </div>
        </form>
      </SectionCard>
    </div>
  );
}
