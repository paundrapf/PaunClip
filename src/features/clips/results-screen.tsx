"use client";

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckSquare,
  Clapperboard,
  Copy,
  Download,
  Filter,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Save,
  Scissors,
  Search,
  SlidersHorizontal,
  Square,
  Terminal,
  X
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { trpc } from "@/features/trpc/client";

type ClipEditorDraft = {
  clipId: string;
  title: string;
  startTime: string;
  endTime: string;
  hookText: string;
  captionStyleId: string;
};

type EventWithData = {
  dataJson?: string | null;
};

type DownloadProgressSnapshot = {
  percent: number;
  speed?: string;
  eta?: string;
};

export function ResultsScreen({ sessionId }: { sessionId: string }) {
  const [search, setSearch] = useState("");
  const [highScoreOnly, setHighScoreOnly] = useState(false);
  const [sortMode, setSortMode] = useState<"score" | "duration" | "recent">("score");
  const [showHookBanner, setShowHookBanner] = useState(true);
  const [showLogs, setShowLogs] = useState(true);
  const [previewClipId, setPreviewClipId] = useState<string | null>(null);
  const [localSelectedHighlightIds, setLocalSelectedHighlightIds] = useState<string[] | null>(null);
  const utils = trpc.useUtils();
  const { notify } = useToast();
  const session = trpc.session.getById.useQuery(sessionId, {
    refetchInterval: (query) => {
      const data = query.state.data;
      return ["completed", "failed", "partially_failed", "cancelled", "ready"].includes(data?.status ?? "")
        ? false
        : 2000;
    }
  });
  const retrySession = trpc.session.retry.useMutation({
    onSuccess: async () => {
      notify({
        type: "success",
        title: "Retry queued",
        description: "PaunClip will process this session again."
      });
      await utils.session.getById.invalidate(sessionId);
      await utils.session.list.invalidate();
    },
    onError: (error) => {
      notify({
        type: "error",
        title: "Retry failed",
        description: error.message
      });
    }
  });
  const setHighlightSelection = trpc.session.setHighlightSelection.useMutation({
    onSuccess: async () => {
      setLocalSelectedHighlightIds(null);
      await utils.session.getById.invalidate(sessionId);
      await utils.session.list.invalidate();
    },
    onError: (error) => {
      notify({
        type: "error",
        title: "Selection was not saved",
        description: error.message
      });
    }
  });
  const renderSelected = trpc.session.renderSelected.useMutation({
    onSuccess: async (_job, variables) => {
      setLocalSelectedHighlightIds(null);
      notify({
        type: "success",
        title: "Render queued",
        description: `${variables.highlightIds?.length ?? 0} selected highlights are rendering.`
      });
      await utils.session.getById.invalidate(sessionId);
      await utils.session.list.invalidate();
    },
    onError: (error) => {
      notify({
        type: "error",
        title: "Render could not start",
        description: error.message
      });
    }
  });
  const updateClipDraft = trpc.clip.updateDraft.useMutation({
    onSuccess: async (_clip, variables) => {
      notify({
        type: "success",
        title: "Draft saved",
        description: "Your clip edits are stored."
      });
      await utils.clip.editorData.invalidate(variables.clipId);
      await utils.session.getById.invalidate(sessionId);
      await utils.session.list.invalidate();
    },
    onError: (error) => {
      notify({
        type: "error",
        title: "Draft was not saved",
        description: error.message
      });
    }
  });
  const rerenderClip = trpc.clip.rerender.useMutation({
    onSuccess: async (_result, clipId) => {
      notify({
        type: "success",
        title: "Rerender queued",
        description: "PaunClip will rebuild this clip safely."
      });
      await utils.clip.editorData.invalidate(clipId);
      await utils.session.getById.invalidate(sessionId);
      await utils.session.list.invalidate();
    },
    onError: (error) => {
      notify({
        type: "error",
        title: "Rerender failed",
        description: error.message
      });
    }
  });
  const duplicateClip = trpc.clip.duplicate.useMutation({
    onSuccess: async (clip) => {
      setPreviewClipId(clip.id);
      notify({
        type: "success",
        title: "Clip duplicated",
        description: "The duplicated clip is ready to edit."
      });
      await utils.session.getById.invalidate(sessionId);
      await utils.session.list.invalidate();
    },
    onError: (error) => {
      notify({
        type: "error",
        title: "Duplicate failed",
        description: error.message
      });
    }
  });
  const cancelJob = trpc.job.cancel.useMutation({
    onSuccess: async () => {
      notify({
        type: "warning",
        title: "Cancellation requested",
        description: "PaunClip is stopping the running job."
      });
      await utils.session.getById.invalidate(sessionId);
      await utils.session.list.invalidate();
    },
    onError: (error) => {
      notify({
        type: "error",
        title: "Cancel failed",
        description: error.message
      });
    }
  });
  const editor = trpc.clip.editorData.useQuery(previewClipId ?? "", {
    enabled: Boolean(previewClipId)
  });
  const [draft, setDraft] = useState<ClipEditorDraft | null>(null);

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
  const editorDraft = useMemo<ClipEditorDraft | null>(() => {
    if (!editor.data) {
      return null;
    }
    if (draft?.clipId === editor.data.clip.id) {
      return draft;
    }
    return {
      clipId: editor.data.clip.id,
      title: editor.data.clip.title,
      startTime: editor.data.clip.startTime.toFixed(1),
      endTime: editor.data.clip.endTime.toFixed(1),
      hookText: editor.data.highlight.hookText ?? "",
      captionStyleId: editor.data.selectedCaptionStyleId
    };
  }, [draft, editor.data]);

  const latestJob = session.data?.jobs[0];
  const latestErrorEvent = latestJob?.events.find((event) => event.type === "error");
  const latestSignalEvent =
    latestErrorEvent ??
    latestJob?.events.find((event) => ["progress", "log", "status"].includes(event.type));
  const latestDownload = extractLatestDownloadProgress(latestJob?.events);
  const isFailed =
    session.data?.status === "failed" ||
    session.data?.status === "partially_failed" ||
    latestJob?.status === "failed";
  const isCancelled = session.data?.status === "cancelled" || latestJob?.status === "cancelled";
  const isReadyToRender =
    session.data?.status === "ready" || session.data?.stage === "ready_to_render";
  const isRunning = latestJob?.status === "running" || latestJob?.status === "queued";
  const isHighlightFinderFailure = session.data?.stage === "find_highlights_failed";
  const statusMessage = isReadyToRender
    ? "Highlights are ready for review"
    : isHighlightFinderFailure
      ? latestErrorEvent?.message ?? "Highlight Finder failed. Check the provider, model, or prompt before retrying."
      : latestDownload && !latestErrorEvent
        ? `Downloading source video: ${formatPercent(latestDownload.percent)}`
        : latestSignalEvent?.message ?? session.data?.stage ?? "Waiting for job";
  const progress =
    latestJob?.progress ??
    (session.data?.status === "completed" || isReadyToRender ? 100 : session.isLoading ? 0 : 0);
  const etaLabel =
    latestDownload && !latestErrorEvent
      ? formatDownloadEta(latestDownload)
      : progress > 0 && progress < 100
        ? estimateEta(progress)
        : "ready";
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

  function saveClipDraft() {
    if (!editorDraft) {
      return;
    }
    updateClipDraft.mutate({
      clipId: editorDraft.clipId,
      title: editorDraft.title.trim() || "Untitled clip",
      startTime: Number(editorDraft.startTime),
      endTime: Number(editorDraft.endTime),
      hookText: editorDraft.hookText.trim() || undefined,
      captionStyleId: editorDraft.captionStyleId || undefined
    });
  }

  function updateEditorDraft(patch: Partial<Omit<ClipEditorDraft, "clipId">>) {
    if (!editorDraft) {
      return;
    }
    setDraft({ ...editorDraft, ...patch });
  }

  function rerenderCurrentClip() {
    if (previewClipId) {
      rerenderClip.mutate(previewClipId);
    }
  }

  function duplicateCurrentClip() {
    if (previewClipId) {
      duplicateClip.mutate(previewClipId);
    }
  }

  if (session.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  if (!session.data) {
    return (
      <div className="grid min-h-screen place-items-center px-8 text-center">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text)]">Session not found</h1>
          <p className="mt-2 text-[var(--muted)]">Project ini belum ada atau sudah dihapus.</p>
          <Link className="mt-6 inline-flex rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[#1d1308]" href="/">
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto grid min-h-screen w-full min-w-0 max-w-[1500px] gap-7 overflow-x-clip px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,520px)_auto] xl:items-start">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--muted-soft)]">{session.data.sourceType}</p>
          <h1 className="mt-1 max-w-full break-words text-xl font-semibold leading-tight text-[var(--text)] sm:text-2xl">
            {session.data.sourceTitle || session.data.sourceUrl || "Local upload"}
          </h1>
        </div>
        <div className="flex min-w-0 justify-center xl:justify-self-center">
          <label className="relative w-full max-w-xl">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-soft)]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-12 w-full rounded-lg border border-[var(--border)] bg-[rgb(9_9_8_/_0.78)] pl-11 pr-4 text-sm text-[var(--text)] outline-none transition placeholder:text-[var(--muted-soft)] focus:border-[var(--accent)]/70 focus:ring-2 focus:ring-[rgb(242_162_58_/_0.13)]"
              placeholder="Find keywords or moments..."
            />
          </label>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2 xl:justify-end">
          <Button
            variant={allVisibleHighlightsSelected ? "primary" : "secondary"}
            size="sm"
            disabled={highlights.length === 0 || setHighlightSelection.isPending}
            onClick={toggleVisibleHighlightSelection}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            {allVisibleHighlightsSelected ? "Clear" : "Select all"}
          </Button>
          {highlights.length > 0 && !isRunning ? (
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
              ? "min-w-0 overflow-hidden rounded-lg border border-[rgb(255_107_107_/_0.35)] bg-[rgb(70_18_18_/_0.28)] p-5 shadow-[var(--shadow-tight)]"
              : "min-w-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[rgb(18_18_16_/_0.72)] p-5 shadow-[var(--shadow-tight)]"
          }
        >
          <div className="mb-4 flex min-w-0 flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              {isFailed ? (
                <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-[#ff9a9a]" aria-hidden="true" />
              ) : null}
              <div className="min-w-0">
                <h2 className="text-xl font-semibold text-[var(--text)]">
                  {isReadyToRender
                    ? "Highlights ready"
                    : isCancelled
                    ? "Processing cancelled"
                    : isFailed
                      ? "Processing failed"
                      : "Your video is processing"}
                </h2>
                <p className="mt-1 break-words text-sm leading-6 text-[var(--muted)]">{statusMessage}</p>
                {!isFailed && !isCancelled ? (
                  <p className="mt-1 text-xs text-[var(--muted-soft)]">ETA estimate: {etaLabel}</p>
                ) : null}
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
                  {isHighlightFinderFailure ? "Retry highlight analysis" : "Retry"}
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
              {isReadyToRender && !isRunning ? (
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
              <Badge className={isFailed ? "border-[rgb(255_107_107_/_0.38)] bg-[rgb(255_107_107_/_0.12)] text-[#ffd0d0]" : undefined}>
                {isReadyToRender
                  ? "ready"
                  : session.data.status === "cancelled"
                    ? "cancelled"
                    : isFailed
                      ? "failed"
                      : `${progress}% overall`}
              </Badge>
            </div>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-[rgb(255_255_255_/_0.06)]">
            <div
              className={isFailed ? "h-full rounded-full bg-[var(--danger)]" : "h-full rounded-full bg-[var(--accent)]"}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-5 grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {(latestJob?.steps ?? []).map((step) => (
              <div key={step.id} className="min-w-0 rounded-lg border border-[var(--border)] bg-[rgb(7_7_6_/_0.58)] p-3">
                <p className="break-words text-sm font-semibold text-[var(--text)]">{step.name.replace(/_/g, " ")}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">{step.status}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {highlights.length > 0 ? (
        <section className="min-w-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[rgb(18_18_16_/_0.72)] p-5 shadow-[var(--shadow-tight)]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-[var(--text)]">Highlights</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {selectedHighlightCount} selected of {highlights.length}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
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
              {!isRunning ? (
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
            </div>
          </div>
          {selectionError ? (
            <p className="mb-4 break-words rounded-lg border border-[rgb(255_107_107_/_0.35)] bg-[rgb(70_18_18_/_0.28)] px-3 py-2 text-sm text-[#ffd0d0]">
              {selectionError}
            </p>
          ) : null}
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {highlights.map((highlight) => {
              const selected = selectedHighlightIds.includes(highlight.id);
              const duration = Math.max(0, highlight.endTime - highlight.startTime);
              return (
                <article
                  key={highlight.id}
                  className={`min-w-0 rounded-lg border p-4 transition ${
                    selected
                      ? "border-[rgb(242_162_58_/_0.56)] bg-[var(--accent-muted)]"
                      : "border-[var(--border)] bg-[rgb(7_7_6_/_0.58)]"
                  }`}
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <button
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--panel-raised)] text-[var(--text)] ring-1 ring-[var(--border)]"
                      aria-label={selected ? "Deselect highlight" : "Select highlight"}
                      disabled={setHighlightSelection.isPending}
                      onClick={() => toggleHighlight(highlight.id)}
                    >
                      {selected ? (
                        <CheckSquare className="h-5 w-5 text-[var(--accent-strong)]" aria-hidden="true" />
                      ) : (
                        <Square className="h-5 w-5" aria-hidden="true" />
                      )}
                    </button>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Badge className="border-[rgb(242_162_58_/_0.36)] bg-[var(--accent)] text-[#1d1308]">
                        {highlight.viralityScore ?? 50}
                      </Badge>
                      <Badge>{Math.round(duration)}s</Badge>
                    </div>
                  </div>
                  <h3 className="line-clamp-2 break-words text-base font-semibold text-[var(--text)]">{highlight.title}</h3>
                  {highlight.description ? (
                    <p className="mt-2 line-clamp-3 break-words text-sm leading-6 text-[var(--muted)]">
                      {highlight.description}
                    </p>
                  ) : null}
                  <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-3 text-xs text-[var(--muted-soft)]">
                    <span className="min-w-0 break-words">
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
        <section className="min-w-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[rgb(18_18_16_/_0.72)] p-5 shadow-[var(--shadow-tight)]">
          <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-[var(--text)]">Processing logs</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">{latestJob.status} - {progress}% overall</p>
            </div>
            <Badge>{latestJob.events.length} events</Badge>
          </div>
          <div className="max-h-96 min-w-0 max-w-full overflow-auto rounded-lg border border-[var(--border)] bg-[rgb(7_7_6_/_0.7)]">
            {latestJob.events.length === 0 ? (
              <p className="p-4 text-sm text-[var(--muted)]">No logs yet.</p>
            ) : (
              latestJob.events.map((event) => {
                const detail = formatEventData(event.dataJson);
                return (
                  <article key={event.id} className="min-w-0 overflow-hidden border-b border-[var(--border)] p-4 last:border-b-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={eventTone(event.type)}>{event.type}</Badge>
                      <span className="font-mono text-xs text-[var(--muted-soft)]">
                        {new Date(event.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="mt-2 break-words text-sm leading-6 text-[var(--text)]">{event.message}</p>
                    {detail ? (
                      <pre className="mt-3 max-h-36 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[rgb(12_12_10_/_0.9)] p-3 text-xs leading-5 text-[var(--muted)]">
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
        <section className="min-w-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[rgb(18_18_16_/_0.72)] p-5 shadow-[var(--shadow-tight)]">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-xl font-semibold text-[var(--text)]">Auto hook</h2>
              <p className="mt-3 max-w-4xl break-words font-mono text-sm leading-7 text-[var(--muted)]">
                Hooks and captions are rendered into completed clips when the selected settings enable them.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowHookBanner(false)}>
              Hide
            </Button>
          </div>
        </section>
      ) : null}

      {clips.length === 0 ? (
        <section className="grid min-w-0 place-items-center rounded-lg border border-dashed border-[var(--border-strong)] bg-[rgb(18_18_16_/_0.45)] py-20 text-center">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text)]">No clips yet</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Clips will appear here after rendering finishes.
            </p>
          </div>
        </section>
      ) : (
        <section className="grid min-w-0 gap-4 overflow-hidden">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-[var(--text)]">Rendered clips</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">{clips.length} clips ready for review</p>
            </div>
            <Badge>{clips.filter((clip) => clip.status === "completed").length} completed</Badge>
          </div>
          <div className="grid min-w-0 grid-cols-1 justify-items-center gap-6 sm:grid-cols-[repeat(auto-fit,minmax(220px,260px))] sm:justify-start sm:justify-items-stretch">
            {clips.map((clip) => {
              const clipHighlight = (session.data?.highlights ?? []).find(
                (highlight) => highlight.id === clip.highlightId
              );
              return (
                <article key={clip.id} className="group grid w-full max-w-[280px] gap-3 sm:max-w-none">
                  <button
                    className="relative aspect-[9/16] w-full overflow-hidden rounded-lg bg-[var(--panel-raised)] text-left shadow-[var(--shadow-tight)]"
                    onClick={() => setPreviewClipId(clip.id)}
                  >
                    <div className="absolute left-3 top-3 z-10">
                      <Badge className="border-[rgb(242_162_58_/_0.36)] bg-[var(--accent)] text-[#1d1308]">
                        {clip.viralityScore ?? 50}
                      </Badge>
                    </div>
                    <div className="absolute right-3 top-3 z-10">
                      <Badge>{formatTimestamp(clip.duration)}</Badge>
                    </div>
                    {clip.thumbnailPath ? (
                      <img
                        src={`/api/clips/${clip.id}/thumbnail`}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-full place-items-center bg-[linear-gradient(180deg,var(--panel-raised),var(--bg))] px-5 text-center">
                        <p className="line-clamp-4 break-words rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-black text-[#1d1308]">
                          {clip.title}
                        </p>
                      </div>
                    )}
                    <div className="absolute inset-x-3 bottom-3 rounded-lg bg-[rgb(7_7_6_/_0.82)] p-3 backdrop-blur">
                      <p className="line-clamp-2 break-words text-sm font-semibold text-[var(--text)]">{clipHighlight?.hookText ?? clip.title}</p>
                      {clipHighlight?.description ? (
                        <p className="mt-1 line-clamp-2 break-words text-xs leading-5 text-[var(--muted)]">
                          {clipHighlight.description}
                        </p>
                      ) : null}
                    </div>
                  </button>
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <h3 className="line-clamp-2 min-w-0 break-words text-base font-semibold text-[var(--text)]">{clip.title}</h3>
                    <div className="flex gap-1 opacity-80 transition group-hover:opacity-100">
                      <a
                        className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--panel-raised)] text-[var(--text)]"
                        aria-label="Download clip"
                        href={`/api/clips/${clip.id}/download`}
                      >
                        <Download className="h-4 w-4" aria-hidden="true" />
                      </a>
                      <button
                        className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--panel-raised)] text-[var(--text)]"
                        aria-label="Edit clip"
                        onClick={() => setPreviewClipId(clip.id)}
                      >
                        <Scissors className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {previewClipId ? (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[rgb(0_0_0_/_0.78)] p-4 backdrop-blur-sm sm:p-6">
          <div className="grid max-h-[90vh] w-full min-w-0 max-w-6xl gap-5 overflow-auto rounded-lg border border-[var(--border)] bg-[rgb(18_18_16_/_0.96)] p-5 shadow-[var(--shadow-soft)] lg:grid-cols-[360px_minmax(0,1fr)]">
            {editor.isLoading ? (
              <div className="grid aspect-[9/16] place-items-center rounded-lg bg-[rgb(7_7_6_/_0.8)]">
                <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
              </div>
            ) : editor.data ? (
              <>
                <div className="grid min-w-0 content-start gap-3">
                  {editor.data.clip.masterPath ? (
                    <video
                      src={`/api/clips/${editor.data.clip.id}/download?inline=1`}
                      controls
                      className="aspect-[9/16] max-h-[70vh] w-full rounded-lg bg-[rgb(7_7_6_/_0.8)] object-contain"
                    />
                  ) : (
                    <div className="grid aspect-[9/16] place-items-center rounded-lg bg-[rgb(7_7_6_/_0.8)] px-6 text-center text-sm text-[var(--muted)]">
                      Render this draft to create a video preview.
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    <a
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-3 text-sm font-semibold text-[#1d1308]"
                      href={`/api/clips/${editor.data.clip.id}/download`}
                    >
                      <Download className="h-4 w-4" />
                      HD
                    </a>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={duplicateClip.isPending}
                      onClick={duplicateCurrentClip}
                    >
                      {duplicateClip.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                      Copy
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={rerenderClip.isPending || updateClipDraft.isPending}
                      onClick={rerenderCurrentClip}
                    >
                      {rerenderClip.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      Render
                    </Button>
                  </div>
                </div>

                <div className="grid min-w-0 content-start gap-5">
                  <div className="flex min-w-0 items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--muted-soft)]">Clip editor</p>
                      <h2 className="mt-1 break-words text-2xl font-semibold text-[var(--text)]">{editor.data.clip.title}</h2>
                      <p className="mt-2 text-sm text-[var(--muted)]">
                        {editor.data.clip.status} - {formatTimestamp(editor.data.clip.duration)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Close editor"
                      onClick={() => setPreviewClipId(null)}
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="grid gap-2">
                      <span className="text-xs font-semibold text-[var(--muted-soft)]">Title</span>
                      <input
                        value={editorDraft?.title ?? ""}
                        onChange={(event) => updateEditorDraft({ title: event.target.value })}
                        className="h-11 rounded-lg border border-[var(--border)] bg-[rgb(7_7_6_/_0.62)] px-3 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]/70"
                      />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-xs font-semibold text-[var(--muted-soft)]">Caption preset</span>
                      <select
                        value={editorDraft?.captionStyleId ?? ""}
                        onChange={(event) => updateEditorDraft({ captionStyleId: event.target.value })}
                        className="h-11 rounded-lg border border-[var(--border)] bg-[rgb(7_7_6_/_0.62)] px-3 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]/70"
                      >
                        {editor.data.captionPresets.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-2">
                      <span className="text-xs font-semibold text-[var(--muted-soft)]">Start</span>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={editorDraft?.startTime ?? ""}
                        onChange={(event) => updateEditorDraft({ startTime: event.target.value })}
                        className="h-11 rounded-lg border border-[var(--border)] bg-[rgb(7_7_6_/_0.62)] px-3 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]/70"
                      />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-xs font-semibold text-[var(--muted-soft)]">End</span>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={editorDraft?.endTime ?? ""}
                        onChange={(event) => updateEditorDraft({ endTime: event.target.value })}
                        className="h-11 rounded-lg border border-[var(--border)] bg-[rgb(7_7_6_/_0.62)] px-3 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]/70"
                      />
                    </label>
                  </div>

                  <label className="grid gap-2">
                    <span className="text-xs font-semibold text-[var(--muted-soft)]">Hook text</span>
                    <textarea
                      value={editorDraft?.hookText ?? ""}
                      onChange={(event) => updateEditorDraft({ hookText: event.target.value })}
                      rows={3}
                      className="resize-none rounded-lg border border-[var(--border)] bg-[rgb(7_7_6_/_0.62)] px-3 py-3 text-sm leading-6 text-[var(--text)] outline-none focus:border-[var(--accent)]/70"
                    />
                  </label>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="primary"
                      disabled={
                        updateClipDraft.isPending ||
                        !editorDraft ||
                        !Number.isFinite(Number(editorDraft.startTime)) ||
                        !Number.isFinite(Number(editorDraft.endTime)) ||
                        Number(editorDraft.endTime) <= Number(editorDraft.startTime)
                      }
                      onClick={saveClipDraft}
                    >
                      {updateClipDraft.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Save draft
                    </Button>
                    {(updateClipDraft.error || rerenderClip.error || duplicateClip.error) ? (
                      <p className="break-words text-sm text-[#ff9a9a]">
                        {updateClipDraft.error?.message ??
                          rerenderClip.error?.message ??
                          duplicateClip.error?.message}
                      </p>
                    ) : null}
                  </div>

                  <div className="min-w-0 rounded-lg border border-[var(--border)] bg-[rgb(7_7_6_/_0.62)] p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="font-semibold">Transcript slice</h3>
                      <Badge>{editor.data.transcriptSlice.segments.length} segments</Badge>
                    </div>
                    <div className="max-h-56 overflow-auto pr-2">
                      {editor.data.transcriptSlice.segments.length === 0 ? (
                        <p className="text-sm text-[var(--muted)]">No transcript segment in this range.</p>
                      ) : (
                        editor.data.transcriptSlice.segments.map((segment, index) => (
                          <p key={`${segment.start}-${index}`} className="break-words border-b border-[var(--border)] py-2 text-sm leading-6 text-[var(--muted)] last:border-b-0">
                            <span className="mr-2 font-mono text-xs text-[var(--muted-soft)]">
                              {segment.start.toFixed(1)}s
                            </span>
                            {segment.text}
                          </p>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="col-span-full grid min-h-80 place-items-center text-center">
                <div>
                  <h2 className="text-xl font-semibold text-[var(--text)]">Clip not found</h2>
                  <Button className="mt-4" variant="secondary" onClick={() => setPreviewClipId(null)}>
                    Close
                  </Button>
                </div>
              </div>
            )}
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

function extractLatestDownloadProgress(
  events?: EventWithData[]
): DownloadProgressSnapshot | null {
  for (const event of events ?? []) {
    const data = parseEventData(event.dataJson);
    const download = data?.download;
    if (!isRecord(download) || typeof download.percent !== "number") {
      continue;
    }

    return {
      percent: download.percent,
      speed: typeof download.speed === "string" ? download.speed : undefined,
      eta: typeof download.eta === "string" ? download.eta : undefined
    };
  }

  return null;
}

function parseEventData(dataJson?: string | null) {
  if (!dataJson) {
    return null;
  }

  try {
    const data = JSON.parse(dataJson) as unknown;
    return isRecord(data) ? data : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function formatPercent(value: number) {
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}%`;
}

function formatDownloadEta(download: DownloadProgressSnapshot) {
  const parts = [];
  if (download.eta) {
    parts.push(`download ETA ${download.eta}`);
  }
  if (download.speed) {
    parts.push(download.speed);
  }
  return parts.length > 0 ? parts.join(" at ") : "download in progress";
}

function eventTone(type: string) {
  if (type === "error") {
    return "border-[rgb(255_107_107_/_0.38)] bg-[rgb(255_107_107_/_0.12)] text-[#ffd0d0]";
  }
  if (type === "warning") {
    return "border-[rgb(242_162_58_/_0.38)] bg-[var(--accent-muted)] text-[var(--accent-strong)]";
  }
  if (type === "progress") {
    return "border-[rgb(242_162_58_/_0.36)] bg-[var(--accent)] text-[#1d1308]";
  }
  return "";
}

function formatTimestamp(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function estimateEta(progress: number) {
  if (progress < 20) {
    return "warming up";
  }
  if (progress < 60) {
    return "a few minutes";
  }
  if (progress < 90) {
    return "under 2 minutes";
  }
  return "final pass";
}
