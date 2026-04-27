"use client";

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckSquare,
  Clapperboard,
  Download,
  Filter,
  Loader2,
  MoreHorizontal,
  Scissors,
  Search,
  SlidersHorizontal,
  Square,
  Terminal,
  X
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/features/trpc/client";

export function ResultsScreen({ sessionId }: { sessionId: string }) {
  const [search, setSearch] = useState("");
  const [highScoreOnly, setHighScoreOnly] = useState(false);
  const [sortMode, setSortMode] = useState<"score" | "duration" | "recent">("score");
  const [showHookBanner, setShowHookBanner] = useState(true);
  const [showLogs, setShowLogs] = useState(true);
  const [previewClipId, setPreviewClipId] = useState<string | null>(null);
  const [localSelectedHighlightIds, setLocalSelectedHighlightIds] = useState<string[] | null>(null);
  const utils = trpc.useUtils();
  const session = trpc.session.getById.useQuery(sessionId, {
    refetchInterval: (query) => {
      const data = query.state.data;
      return ["completed", "failed", "cancelled", "ready"].includes(data?.status ?? "")
        ? false
        : 2000;
    }
  });
  const retrySession = trpc.session.retry.useMutation({
    onSuccess: async () => {
      await utils.session.getById.invalidate(sessionId);
      await utils.session.list.invalidate();
    }
  });
  const setHighlightSelection = trpc.session.setHighlightSelection.useMutation({
    onSuccess: async () => {
      setLocalSelectedHighlightIds(null);
      await utils.session.getById.invalidate(sessionId);
      await utils.session.list.invalidate();
    }
  });
  const renderSelected = trpc.session.renderSelected.useMutation({
    onSuccess: async () => {
      setLocalSelectedHighlightIds(null);
      await utils.session.getById.invalidate(sessionId);
      await utils.session.list.invalidate();
    }
  });
  const cancelJob = trpc.job.cancel.useMutation({
    onSuccess: async () => {
      await utils.session.getById.invalidate(sessionId);
      await utils.session.list.invalidate();
    }
  });

  const clips = useMemo(() => {
    const raw = session.data?.clips ?? [];
    return raw
      .filter((clip) => clip.title.toLowerCase().includes(search.toLowerCase()))
      .filter((clip) => !highScoreOnly || (clip.viralityScore ?? 0) >= 80)
      .sort((a, b) => {
        if (sortMode === "duration") {
          return a.duration - b.duration;
        }
        if (sortMode === "recent") {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        return (b.viralityScore ?? 0) - (a.viralityScore ?? 0);
      });
  }, [highScoreOnly, search, session.data?.clips, sortMode]);

  const highlights = useMemo(() => {
    const raw = session.data?.highlights ?? [];
    return raw
      .filter((highlight) => highlight.title.toLowerCase().includes(search.toLowerCase()))
      .filter((highlight) => !highScoreOnly || (highlight.viralityScore ?? 0) >= 80)
      .sort((a, b) => (b.viralityScore ?? 0) - (a.viralityScore ?? 0));
  }, [highScoreOnly, search, session.data?.highlights]);

  const serverSelectedHighlightIds = useMemo(
    () =>
      (session.data?.highlights ?? [])
        .filter((highlight) => highlight.selected)
        .map((highlight) => highlight.id)
        .sort(),
    [session.data?.highlights]
  );
  const selectedHighlightIds = localSelectedHighlightIds ?? serverSelectedHighlightIds;

  const latestJob = session.data?.jobs[0];
  const latestErrorEvent = latestJob?.events.find((event) => event.type === "error");
  const latestSignalEvent =
    latestErrorEvent ??
    latestJob?.events.find((event) => ["progress", "log", "status"].includes(event.type));
  const isFailed = session.data?.status === "failed" || latestJob?.status === "failed";
  const isCancelled = session.data?.status === "cancelled" || latestJob?.status === "cancelled";
  const isReadyToRender =
    session.data?.status === "ready" || session.data?.stage === "ready_to_render";
  const isRunning = latestJob?.status === "running" || latestJob?.status === "queued";
  const statusMessage = isReadyToRender
    ? "Highlights are ready for review"
    : latestSignalEvent?.message ?? session.data?.stage ?? "Waiting for job";
  const progress =
    latestJob?.progress ??
    (session.data?.status === "completed" || isReadyToRender ? 100 : session.isLoading ? 0 : 0);
  const previewClip = clips.find((clip) => clip.id === previewClipId) ?? null;
  const selectedHighlightCount = selectedHighlightIds.length;
  const allVisibleHighlightsSelected =
    highlights.length > 0 &&
    highlights.every((highlight) => selectedHighlightIds.includes(highlight.id));
  const canRenderSelected = highlights.length > 0 && selectedHighlightCount > 0 && !isRunning;
  const selectionError =
    setHighlightSelection.error?.message ?? renderSelected.error?.message ?? "";

  function persistHighlightSelection(nextIds: string[]) {
    setLocalSelectedHighlightIds(nextIds);
    setHighlightSelection.mutate({
      sessionId,
      highlightIds: nextIds
    });
  }

  function toggleHighlight(highlightId: string) {
    const nextIds = selectedHighlightIds.includes(highlightId)
      ? selectedHighlightIds.filter((id) => id !== highlightId)
      : [...selectedHighlightIds, highlightId];
    persistHighlightSelection(nextIds);
  }

  function renderSelectedHighlights() {
    renderSelected.mutate({
      sessionId,
      highlightIds: selectedHighlightIds
    });
  }

  function toggleVisibleHighlightSelection() {
    persistHighlightSelection(
      allVisibleHighlightsSelected ? [] : highlights.map((highlight) => highlight.id)
    );
  }

  if (session.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!session.data) {
    return (
      <div className="grid min-h-screen place-items-center px-8 text-center">
        <div>
          <h1 className="text-2xl font-bold">Session not found</h1>
          <p className="mt-2 text-zinc-500">Project ini belum ada atau sudah dihapus.</p>
          <Link className="mt-6 inline-flex rounded-full bg-white px-5 py-3 text-sm font-semibold text-black" href="/">
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto grid min-h-screen max-w-[1500px] gap-8 px-8 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-zinc-500">{session.data.sourceType}</p>
          <h1 className="mt-1 text-2xl font-bold">
            {session.data.sourceTitle || session.data.sourceUrl || "Local upload"}
          </h1>
        </div>
        <div className="flex min-w-[320px] flex-1 justify-center">
          <label className="relative w-full max-w-xl">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-12 w-full rounded-lg border border-zinc-800 bg-zinc-950 pl-11 pr-4 text-sm outline-none placeholder:text-zinc-500"
              placeholder="Find keywords or moments..."
            />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={allVisibleHighlightsSelected ? "primary" : "secondary"}
            size="sm"
            disabled={highlights.length === 0 || setHighlightSelection.isPending}
            onClick={toggleVisibleHighlightSelection}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            {allVisibleHighlightsSelected ? "Clear" : "Select all"}
          </Button>
          {highlights.length > 0 ? (
            <Button
              variant="primary"
              size="sm"
              disabled={!canRenderSelected || renderSelected.isPending}
              onClick={renderSelectedHighlights}
            >
              {renderSelected.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Clapperboard className="h-4 w-4" aria-hidden="true" />
              )}
              Render selected
            </Button>
          ) : null}
          {latestJob ? (
            <Button
              variant={showLogs ? "secondary" : "ghost"}
              size="icon"
              aria-label="Toggle processing logs"
              onClick={() => setShowLogs((value) => !value)}
            >
              <Terminal className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : null}
          <Button
            variant={highScoreOnly ? "primary" : "ghost"}
            size="icon"
            aria-label="Filter high score clips"
            onClick={() => setHighScoreOnly((value) => !value)}
          >
            <Filter className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Cycle sort mode"
            onClick={() =>
              setSortMode((value) =>
                value === "score" ? "duration" : value === "duration" ? "recent" : "score"
              )
            }
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </header>

      {session.data.status !== "completed" || isReadyToRender ? (
        <section
          className={
            isFailed
              ? "rounded-lg border border-red-950 bg-red-950/20 p-5"
              : "rounded-lg border border-zinc-800 bg-zinc-950 p-5"
          }
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex min-w-0 items-start gap-3">
              {isFailed ? (
                <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-red-300" aria-hidden="true" />
              ) : null}
              <div className="min-w-0">
                <h2 className="text-xl font-bold">
                  {isReadyToRender
                    ? "Highlights ready"
                    : isCancelled
                    ? "Processing cancelled"
                    : isFailed
                      ? "Processing failed"
                      : "Your video is processing"}
                </h2>
                <p className="mt-1 text-sm leading-6 text-zinc-400">{statusMessage}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {isFailed ? (
                <Button
                  variant="danger"
                  size="sm"
                  disabled={retrySession.isPending}
                  onClick={() => retrySession.mutate(sessionId)}
                >
                  {retrySession.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Retry
                </Button>
              ) : null}
              {isRunning && latestJob ? (
                <Button
                  variant="danger"
                  size="sm"
                  disabled={cancelJob.isPending}
                  onClick={() => cancelJob.mutate(latestJob.id)}
                >
                  {cancelJob.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Cancel
                </Button>
              ) : null}
              {isReadyToRender ? (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!canRenderSelected || renderSelected.isPending}
                  onClick={renderSelectedHighlights}
                >
                  {renderSelected.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Render selected
                </Button>
              ) : null}
              <Badge className={isFailed ? "border-red-500/40 bg-red-500/15 text-red-100" : undefined}>
                {isReadyToRender
                  ? "ready"
                  : session.data.status === "cancelled"
                    ? "cancelled"
                    : isFailed
                      ? "failed"
                      : `${progress}%`}
              </Badge>
            </div>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-zinc-900">
            <div
              className={isFailed ? "h-full rounded-full bg-red-400" : "h-full rounded-full bg-lime-300"}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-5 grid gap-2 md:grid-cols-4">
            {(latestJob?.steps ?? []).map((step) => (
              <div key={step.id} className="rounded-lg border border-zinc-800 bg-black p-3">
                <p className="text-sm font-semibold">{step.name.replace(/_/g, " ")}</p>
                <p className="mt-1 text-xs text-zinc-500">{step.status}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {highlights.length > 0 ? (
        <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Highlights</h2>
              <p className="mt-1 text-sm text-zinc-500">
                {selectedHighlightCount} selected of {highlights.length}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={setHighlightSelection.isPending}
                onClick={() => persistHighlightSelection(highlights.map((highlight) => highlight.id))}
              >
                Select all
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={setHighlightSelection.isPending}
                onClick={() => persistHighlightSelection([])}
              >
                Clear
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!canRenderSelected || renderSelected.isPending}
                onClick={renderSelectedHighlights}
              >
                {renderSelected.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Clapperboard className="h-4 w-4" aria-hidden="true" />
                )}
                Render selected
              </Button>
            </div>
          </div>
          {selectionError ? (
            <p className="mb-4 rounded-lg border border-red-950 bg-red-950/30 px-3 py-2 text-sm text-red-200">
              {selectionError}
            </p>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {highlights.map((highlight) => {
              const selected = selectedHighlightIds.includes(highlight.id);
              const duration = Math.max(0, highlight.endTime - highlight.startTime);
              return (
                <article
                  key={highlight.id}
                  className={`rounded-lg border p-4 transition ${
                    selected
                      ? "border-lime-300/60 bg-lime-300/10"
                      : "border-zinc-800 bg-black"
                  }`}
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <button
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-zinc-900 text-zinc-200 ring-1 ring-zinc-800"
                      aria-label={selected ? "Deselect highlight" : "Select highlight"}
                      disabled={setHighlightSelection.isPending}
                      onClick={() => toggleHighlight(highlight.id)}
                    >
                      {selected ? (
                        <CheckSquare className="h-5 w-5 text-lime-300" aria-hidden="true" />
                      ) : (
                        <Square className="h-5 w-5" aria-hidden="true" />
                      )}
                    </button>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Badge className="border-lime-300/40 bg-lime-300 text-black">
                        {highlight.viralityScore ?? 50}
                      </Badge>
                      <Badge>{Math.round(duration)}s</Badge>
                    </div>
                  </div>
                  <h3 className="line-clamp-2 text-base font-semibold">{highlight.title}</h3>
                  {highlight.description ? (
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-zinc-500">
                      {highlight.description}
                    </p>
                  ) : null}
                  <div className="mt-3 flex items-center justify-between gap-3 text-xs text-zinc-500">
                    <span>
                      {highlight.startTime.toFixed(1)}s - {highlight.endTime.toFixed(1)}s
                    </span>
                    <span>{highlight.status}</span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {latestJob && showLogs ? (
        <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">Processing logs</h2>
              <p className="mt-1 text-sm text-zinc-500">{latestJob.status} · {progress}%</p>
            </div>
            <Badge>{latestJob.events.length} events</Badge>
          </div>
          <div className="max-h-96 overflow-auto rounded-lg border border-zinc-900 bg-black">
            {latestJob.events.length === 0 ? (
              <p className="p-4 text-sm text-zinc-500">No logs yet.</p>
            ) : (
              latestJob.events.map((event) => {
                const detail = formatEventData(event.dataJson);
                return (
                  <article key={event.id} className="border-b border-zinc-900 p-4 last:border-b-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={eventTone(event.type)}>{event.type}</Badge>
                      <span className="font-mono text-xs text-zinc-500">
                        {new Date(event.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-zinc-200">{event.message}</p>
                    {detail ? (
                      <pre className="mt-3 max-h-36 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-950 p-3 text-xs leading-5 text-zinc-400">
                        {detail}
                      </pre>
                    ) : null}
                  </article>
                );
              })
            )}
          </div>
        </section>
      ) : null}

      {showHookBanner ? (
        <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">Auto hook</h2>
              <p className="mt-3 max-w-4xl font-mono text-sm leading-7 text-zinc-300">
                Hooks and captions are rendered into completed clips when the selected settings enable them.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowHookBanner(false)}>
              Disable
            </Button>
          </div>
        </section>
      ) : null}

      {clips.length === 0 ? (
        <section className="grid place-items-center rounded-lg border border-dashed border-zinc-800 py-20 text-center">
          <div>
            <h2 className="text-lg font-semibold">No clips yet</h2>
            <p className="mt-2 text-sm text-zinc-500">
              Clips will appear here after rendering finishes.
            </p>
          </div>
        </section>
      ) : (
        <section className="grid grid-cols-2 gap-6 lg:grid-cols-5">
          {clips.map((clip) => (
            <article key={clip.id} className="group grid gap-3">
              <button
                className="relative aspect-[9/16] overflow-hidden rounded-lg bg-zinc-900 text-left"
                onClick={() => setPreviewClipId(clip.id)}
              >
                <div className="absolute left-3 top-3 z-10">
                  <Badge className="border-lime-300/40 bg-lime-300 text-black">
                    {clip.viralityScore ?? 50}
                  </Badge>
                </div>
                <div className="absolute right-3 top-3 z-10">
                  <Badge>{Math.round(clip.duration)}s</Badge>
                </div>
                {clip.thumbnailPath ? (
                  <img
                    src={`/api/clips/${clip.id}/thumbnail`}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="grid h-full place-items-center bg-gradient-to-b from-zinc-800 via-zinc-900 to-black px-5 text-center">
                    <p className="rounded-lg bg-white px-3 py-2 text-sm font-black uppercase text-black">
                      {clip.title}
                    </p>
                  </div>
                )}
              </button>
              <div className="flex items-start justify-between gap-3">
                <h3 className="line-clamp-2 text-base font-semibold">{clip.title}</h3>
                <div className="flex gap-1 opacity-80 transition group-hover:opacity-100">
                  <a
                    className="grid h-9 w-9 place-items-center rounded-lg bg-zinc-900"
                    aria-label="Download clip"
                    href={`/api/clips/${clip.id}/download`}
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                  </a>
                  <button
                    className="grid h-9 w-9 place-items-center rounded-lg bg-zinc-900"
                    aria-label="Edit clip"
                    onClick={() => setPreviewClipId(clip.id)}
                  >
                    <Scissors className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      {previewClip ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-6">
          <div className="grid max-h-[90vh] w-full max-w-5xl gap-5 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-5 lg:grid-cols-[360px_1fr]">
            <video
              src={`/api/clips/${previewClip.id}/download?inline=1`}
              controls
              className="aspect-[9/16] w-full rounded-lg bg-black object-contain"
            />
            <div className="grid content-start gap-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold">{previewClip.title}</h2>
                  <p className="mt-2 text-sm text-zinc-500">
                    {previewClip.startTime.toFixed(1)}s - {previewClip.endTime.toFixed(1)}s
                  </p>
                </div>
                <Button variant="ghost" size="icon" aria-label="Close preview" onClick={() => setPreviewClipId(null)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-3">
                <a
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-black"
                  href={`/api/clips/${previewClip.id}/download`}
                >
                  <Download className="h-4 w-4" />
                  Download HD
                </a>
                <Button variant="secondary" onClick={() => setSortMode("score")}>
                  Sort by score
                </Button>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-black p-4">
                <h3 className="font-semibold">Clip data</h3>
                <pre className="mt-3 overflow-auto text-xs text-zinc-400">
                  {JSON.stringify(previewClip, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatEventData(dataJson?: string | null) {
  if (!dataJson) {
    return "";
  }

  try {
    return JSON.stringify(JSON.parse(dataJson), null, 2);
  } catch {
    return dataJson;
  }
}

function eventTone(type: string) {
  if (type === "error") {
    return "border-red-500/40 bg-red-500/15 text-red-100";
  }
  if (type === "warning") {
    return "border-amber-500/40 bg-amber-500/15 text-amber-100";
  }
  if (type === "progress") {
    return "border-lime-300/40 bg-lime-300 text-black";
  }
  return "";
}
