"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { InfoGrid } from "@/components/common/info-grid";
import { SectionCard } from "@/components/common/section-card";
import { StatePanel } from "@/components/common/state-panel";
import { StatusChip } from "@/components/common/status-chip";
import {
  buildOutputAssetUrl,
  getSessionWorkspace,
  renderSessionSelection,
  retrySessionFailed,
  saveSessionWorkspace,
} from "@/lib/api";
import { formatDateTime, formatDuration, isFailedStatus, statusTone } from "@/lib/format";
import type { WorkspaceHighlight, WorkspacePayload } from "@/lib/types";
import { useProgressState } from "@/lib/use-progress";

type SessionWorkspaceProps = {
  sessionId: string;
};

type HighlightDraft = {
  title: string;
  description: string;
  hook_text: string;
  caption_override: string;
  tracking_mode: string;
  caption_mode: string;
  tts_voice: string;
  source_credit_enabled: boolean;
  watermark_preset: string;
};

type RenderOptions = {
  addHook: boolean;
  addCaptions: boolean;
};

const TRACKING_OPTIONS = [
  { value: "center_crop", label: "Center crop" },
  { value: "podcast_smart", label: "Podcast smart" },
  { value: "split_screen", label: "Split screen" },
  { value: "sports_beta", label: "Sports beta" },
];

const CAPTION_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "manual", label: "Manual override" },
];

const inputClass =
  "w-full rounded-card border border-stroke bg-panel-muted px-4 py-3 text-sm text-foreground outline-none transition focus:border-stroke-strong";

const textareaClass = `${inputClass} min-h-32 resize-y`;

const actionButtonClass =
  "inline-flex min-h-11 items-center rounded-pill border border-stroke px-4 text-sm font-semibold text-foreground-soft transition hover:border-stroke-strong hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50";

const primaryActionButtonClass =
  "inline-flex min-h-11 items-center rounded-pill border border-stroke-strong bg-accent/10 px-4 text-sm font-semibold text-foreground transition hover:bg-accent/14 disabled:cursor-not-allowed disabled:opacity-50";

const EMPTY_DRAFT: HighlightDraft = {
  title: "",
  description: "",
  hook_text: "",
  caption_override: "",
  tracking_mode: "center_crop",
  caption_mode: "auto",
  tts_voice: "nova",
  source_credit_enabled: true,
  watermark_preset: "default",
};

function serializeIds(ids: string[]) {
  return [...ids].filter(Boolean).sort().join("|");
}

function findHighlightById(workspace: WorkspacePayload | null, highlightId: string | null) {
  if (!workspace || !highlightId) {
    return null;
  }

  return workspace.highlights.find((highlight) => highlight.highlight_id === highlightId) || null;
}

function buildDraftFromHighlight(
  highlight: WorkspaceHighlight | null,
  defaults: WorkspacePayload["editor_defaults"] | undefined,
): HighlightDraft {
  const editor = highlight?.editor || {};

  return {
    title: String(highlight?.title || ""),
    description: String(highlight?.description || ""),
    hook_text: String(highlight?.hook_text || ""),
    caption_override: String(editor.caption_override || ""),
    tracking_mode: String(editor.tracking_mode || "center_crop"),
    caption_mode: String(editor.caption_mode || defaults?.caption_mode || "auto"),
    tts_voice: String(editor.tts_voice || defaults?.tts_voice || "nova"),
    source_credit_enabled:
      editor.source_credit_enabled !== undefined
        ? Boolean(editor.source_credit_enabled)
        : Boolean(defaults?.source_credit_enabled ?? true),
    watermark_preset: String(editor.watermark_preset || defaults?.watermark_preset || "default"),
  };
}

function draftsMatch(left: HighlightDraft, right: HighlightDraft) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function SessionWorkspace({ sessionId }: SessionWorkspaceProps) {
  const { progress } = useProgressState(1200);
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null);
  const [selectedHighlightIds, setSelectedHighlightIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<HighlightDraft>(EMPTY_DRAFT);
  const [renderOptions, setRenderOptions] = useState<RenderOptions>({
    addHook: true,
    addCaptions: true,
  });
  const [saving, setSaving] = useState(false);
  const [startingTask, setStartingTask] = useState(false);
  const [pendingTask, setPendingTask] = useState<"render" | "retry" | null>(null);

  const syncWorkspace = useCallback(
    (nextWorkspace: WorkspacePayload, preferredHighlightId?: string | null) => {
      const availableIds = nextWorkspace.highlights
        .map((highlight) => highlight.highlight_id)
        .filter((value): value is string => Boolean(value));

      const candidateIds = [preferredHighlightId, nextWorkspace.workspace_state.active_highlight_id].filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      );

      const resolvedActiveId =
        candidateIds.find((value) => availableIds.includes(value)) || availableIds[0] || null;

      setWorkspace(nextWorkspace);
      setActiveHighlightId(resolvedActiveId);
      setSelectedHighlightIds(nextWorkspace.default_selected_ids.filter(Boolean));
      setRenderOptions({
        addHook: Boolean(nextWorkspace.workspace_state.add_hook !== undefined ? nextWorkspace.workspace_state.add_hook : true),
        addCaptions: Boolean(
          nextWorkspace.workspace_state.add_captions !== undefined ? nextWorkspace.workspace_state.add_captions : true,
        ),
      });
      setDraft(buildDraftFromHighlight(findHighlightById(nextWorkspace, resolvedActiveId), nextWorkspace.editor_defaults));
      setError(null);
    },
    [],
  );

  const loadWorkspace = useCallback(
    async (preferredHighlightId?: string | null, successMessage?: string) => {
      setLoading(true);

      try {
        const nextWorkspace = await getSessionWorkspace(sessionId);
        syncWorkspace(nextWorkspace, preferredHighlightId);
        if (successMessage) {
          setNotice(successMessage);
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load session workspace.");
      } finally {
        setLoading(false);
      }
    },
    [sessionId, syncWorkspace],
  );

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const activeHighlight = useMemo(
    () => findHighlightById(workspace, activeHighlightId),
    [activeHighlightId, workspace],
  );

  const persistedDraft = useMemo(
    () => buildDraftFromHighlight(activeHighlight, workspace?.editor_defaults),
    [activeHighlight, workspace?.editor_defaults],
  );

  const persistedSelection = useMemo(
    () => serializeIds(workspace?.default_selected_ids || []),
    [workspace?.default_selected_ids],
  );

  const currentSelection = useMemo(() => serializeIds(selectedHighlightIds), [selectedHighlightIds]);

  const persistedActiveId = workspace?.workspace_state.active_highlight_id || workspace?.highlights[0]?.highlight_id || null;

  const persistedOptions = useMemo(
    () => ({
      addHook: Boolean(workspace?.workspace_state.add_hook !== undefined ? workspace.workspace_state.add_hook : true),
      addCaptions: Boolean(workspace?.workspace_state.add_captions !== undefined ? workspace.workspace_state.add_captions : true),
    }),
    [workspace?.workspace_state.add_captions, workspace?.workspace_state.add_hook],
  );

  const failedHighlightIds = useMemo(() => {
    return (workspace?.highlights || [])
      .filter((highlight) => Boolean(highlight.highlight_id) && isFailedStatus(highlight.clip_status))
      .map((highlight) => highlight.highlight_id);
  }, [workspace?.highlights]);

  const isCurrentSessionTask = progress.session_id === sessionId;
  const isCurrentSessionTaskRunning = isCurrentSessionTask && progress.is_running;
  const backendBusyElsewhere = progress.is_running && progress.session_id !== sessionId;

  useEffect(() => {
    if (!pendingTask || progress.session_id !== sessionId || progress.is_running || progress.status === "idle") {
      return;
    }

    setPendingTask(null);
    void loadWorkspace(
      activeHighlightId,
      progress.status === "complete"
        ? pendingTask === "retry"
          ? "Retry finished. Workspace refreshed."
          : "Render finished. Workspace refreshed."
        : progress.status,
    );
  }, [activeHighlightId, loadWorkspace, pendingTask, progress, sessionId]);

  const isDirty = useMemo(() => {
    if (!workspace) {
      return false;
    }

    return (
      activeHighlightId !== persistedActiveId ||
      currentSelection !== persistedSelection ||
      renderOptions.addHook !== persistedOptions.addHook ||
      renderOptions.addCaptions !== persistedOptions.addCaptions ||
      !draftsMatch(draft, persistedDraft)
    );
  }, [
    activeHighlightId,
    currentSelection,
    draft,
    persistedActiveId,
    persistedDraft,
    persistedOptions.addCaptions,
    persistedOptions.addHook,
    persistedSelection,
    renderOptions.addCaptions,
    renderOptions.addHook,
    workspace,
  ]);

  const saveDraft = useCallback(
    async (nextActiveHighlightId?: string | null, quiet = false) => {
      if (!workspace) {
        return false;
      }

      setSaving(true);
      if (!quiet) {
        setNotice("Saving draft…");
      }

      try {
        const savedWorkspace = await saveSessionWorkspace(sessionId, {
          session_dir: workspace.session.session_dir || undefined,
          highlight_id: activeHighlightId || undefined,
          updates: activeHighlightId ? draft : undefined,
          selected_highlight_ids: selectedHighlightIds,
          active_highlight_id: nextActiveHighlightId ?? activeHighlightId,
          add_hook: renderOptions.addHook,
          add_captions: renderOptions.addCaptions,
        });

        syncWorkspace(savedWorkspace, nextActiveHighlightId ?? activeHighlightId);
        setNotice(
          quiet
            ? "Draft saved."
            : nextActiveHighlightId && nextActiveHighlightId !== activeHighlightId
              ? "Draft saved and highlight changed."
              : "Draft saved.",
        );
        return true;
      } catch (saveError) {
        setNotice(saveError instanceof Error ? saveError.message : "Failed to save workspace draft.");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [
      activeHighlightId,
      draft,
      renderOptions.addCaptions,
      renderOptions.addHook,
      selectedHighlightIds,
      sessionId,
      syncWorkspace,
      workspace,
    ],
  );

  const chooseHighlight = useCallback(
    async (highlightId: string) => {
      if (!workspace || highlightId === activeHighlightId) {
        return;
      }

      if (isDirty) {
        const saved = await saveDraft(highlightId, true);
        if (!saved) {
          return;
        }
        return;
      }

      setActiveHighlightId(highlightId);
      setDraft(buildDraftFromHighlight(findHighlightById(workspace, highlightId), workspace.editor_defaults));
      setNotice("Highlight changed. Save remains available if you want that focus persisted.");
    },
    [activeHighlightId, isDirty, saveDraft, workspace],
  );

  const startRender = useCallback(
    async (retryOnly: boolean) => {
      if (!workspace) {
        return;
      }

      if (backendBusyElsewhere) {
        setNotice("The backend is already busy with another task. Wait for it to finish before starting a new render.");
        return;
      }

      if (!retryOnly && selectedHighlightIds.length === 0) {
        setNotice("Select at least one highlight before rendering.");
        return;
      }

      if (retryOnly && failedHighlightIds.length === 0) {
        setNotice("There are no failed clip jobs to retry.");
        return;
      }

      const saved = isDirty ? await saveDraft(undefined, true) : true;
      if (!saved) {
        return;
      }

      setStartingTask(true);
      setPendingTask(retryOnly ? "retry" : "render");
      setNotice(retryOnly ? "Retrying failed clips…" : "Starting render…");

      try {
        const response = retryOnly
          ? await retrySessionFailed(sessionId, {
              session_dir: workspace.session.session_dir || undefined,
              add_hook: renderOptions.addHook,
              add_captions: renderOptions.addCaptions,
            })
          : await renderSessionSelection(sessionId, {
              session_dir: workspace.session.session_dir || undefined,
              highlight_ids: selectedHighlightIds,
              add_hook: renderOptions.addHook,
              add_captions: renderOptions.addCaptions,
            });

        if (response.status !== "started") {
          setPendingTask(null);
          setNotice(response.message || "Render did not start.");
          return;
        }

        setNotice(retryOnly ? "Retry started. Waiting for backend progress…" : "Render started. Waiting for backend progress…");
      } catch (renderError) {
        setPendingTask(null);
        setNotice(renderError instanceof Error ? renderError.message : "Render failed to start.");
      } finally {
        setStartingTask(false);
      }
    },
    [
      backendBusyElsewhere,
      failedHighlightIds.length,
      isDirty,
      renderOptions.addCaptions,
      renderOptions.addHook,
      saveDraft,
      selectedHighlightIds,
      sessionId,
      workspace,
    ],
  );

  if (error) {
    return <StatePanel title="Workspace unavailable" message={error} />;
  }

  if (loading && !workspace) {
    return (
      <SectionCard
        eyebrow="Loading"
        title="Hydrating session workspace"
        description="The page is waiting for the persisted workspace payload from `/api/sessions/:id`."
      >
        <p className="text-sm leading-6 text-muted">Hold on while the workspace loads.</p>
      </SectionCard>
    );
  }

  const workspaceTitle = workspace?.session.video_info.title || workspace?.session.session_id || sessionId;
  const outputs = workspace?.output_clips || [];

  return (
    <div className="grid gap-6">
      <SectionCard
        eyebrow="Workspace summary"
        title={workspaceTitle}
        description={workspace?.provider_summary}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/sessions" className={actionButtonClass}>
              Back to sessions
            </Link>
            <button type="button" className={actionButtonClass} onClick={() => void loadWorkspace(activeHighlightId, "Workspace refreshed.")}>Refresh</button>
            <button type="button" className={actionButtonClass} disabled={!isDirty || saving || startingTask || isCurrentSessionTaskRunning} onClick={() => void saveDraft()}>
              {saving ? "Saving…" : "Save draft"}
            </button>
            <button
              type="button"
              className={primaryActionButtonClass}
              disabled={selectedHighlightIds.length === 0 || saving || startingTask || isCurrentSessionTaskRunning || backendBusyElsewhere}
              onClick={() => void startRender(false)}
            >
              {pendingTask === "render" ? "Rendering…" : "Render selected"}
            </button>
            <button
              type="button"
              className={actionButtonClass}
              disabled={failedHighlightIds.length === 0 || saving || startingTask || isCurrentSessionTaskRunning || backendBusyElsewhere}
              onClick={() => void startRender(true)}
            >
              {pendingTask === "retry" ? "Retrying…" : "Retry failed"}
            </button>
          </div>
        }
      >
        <div className="mb-4 flex flex-wrap gap-2">
          <StatusChip tone={statusTone(workspace?.session.status)}>{workspace?.session.status}</StatusChip>
          <StatusChip tone="neutral">{workspace?.session.stage}</StatusChip>
          {isCurrentSessionTaskRunning ? <StatusChip tone="brand">{progress.status}</StatusChip> : null}
        </div>

        <InfoGrid
          items={[
            { label: "Campaign", value: workspace?.session.campaign_label || "Manual or legacy" },
            { label: "Selected", value: selectedHighlightIds.length },
            { label: "Failed clips", value: failedHighlightIds.length },
            { label: "Updated", value: formatDateTime(workspace?.session.updated_at) },
            { label: "Video path", value: workspace?.session.video_path || "Not downloaded" },
            { label: "Subtitle file", value: workspace?.session.srt_path || "Not saved" },
          ]}
        />

        {notice ? <p className="mt-4 text-sm leading-6 text-muted-strong">{notice}</p> : null}
        {workspace?.session.last_error ? <p className="mt-2 text-sm leading-6 text-danger">{workspace.session.last_error}</p> : null}
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr_0.95fr]">
        <div className="grid gap-6">
          <SectionCard
            eyebrow="Left rail"
            title="Source summary"
            description="These rows come directly from the backend DTO builder, so they stay aligned with persisted session metadata."
          >
            <InfoGrid
              items={(workspace?.source_rows || []).map(([label, value]) => ({ label, value }))}
            />
          </SectionCard>

          <SectionCard
            eyebrow="Highlight selection"
            title="Selected highlights persist with the draft"
            description="Selection changes stay local until you save or trigger a render, which keeps the Save action meaningfully dirty-aware."
          >
            {workspace?.highlights.length ? (
              <div className="space-y-4">
                {workspace.highlights.map((highlight) => {
                  const highlightId = highlight.highlight_id;
                  const active = activeHighlightId === highlightId;
                  const selected = selectedHighlightIds.includes(highlightId);

                  return (
                    <div
                      key={highlightId}
                      className={`rounded-card border p-4 ${
                        active ? "border-stroke-strong bg-accent/6" : "border-stroke bg-panel-muted"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          aria-label={`Select ${highlight.title || highlightId}`}
                          checked={selected}
                          className="mt-1 h-4 w-4 accent-accent"
                          onChange={(event) => {
                            setSelectedHighlightIds((currentIds) => {
                              if (event.target.checked) {
                                return currentIds.includes(highlightId) ? currentIds : [...currentIds, highlightId];
                              }

                              return currentIds.filter((id) => id !== highlightId);
                            });
                          }}
                          type="checkbox"
                        />

                        <button type="button" className="flex-1 text-left" onClick={() => void chooseHighlight(highlightId)}>
                          <div className="flex flex-wrap items-center gap-2">
                            <strong className="text-sm text-foreground">{highlight.title || highlightId}</strong>
                            {highlight.clip_status ? (
                              <StatusChip tone={statusTone(highlight.clip_status)}>{highlight.clip_status}</StatusChip>
                            ) : null}
                          </div>
                          <p className="mt-2 text-sm leading-6 text-muted-strong">
                            {highlight.time_range || "No trim range recorded yet"}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-foreground-soft">
                            {highlight.description || "No saved description yet."}
                          </p>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm leading-6 text-muted">No highlights were found in this session yet.</p>
            )}
          </SectionCard>
        </div>

        <SectionCard
          eyebrow="Center editor"
          title="Focused draft editor"
          description="Editable draft fields, caption override, and render toggles all persist through the session save endpoint."
        >
          {activeHighlight ? (
            <div className="grid gap-4">
              <label className="flex flex-col gap-2 text-sm text-muted-strong">
                <span>Title</span>
                <input className={inputClass} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} value={draft.title} />
              </label>

              <label className="flex flex-col gap-2 text-sm text-muted-strong">
                <span>Description</span>
                <textarea className={textareaClass} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} value={draft.description} />
              </label>

              <label className="flex flex-col gap-2 text-sm text-muted-strong">
                <span>Hook text</span>
                <textarea className={textareaClass} onChange={(event) => setDraft((current) => ({ ...current, hook_text: event.target.value }))} value={draft.hook_text} />
              </label>

              <label className="flex flex-col gap-2 text-sm text-muted-strong">
                <span>Caption override</span>
                <textarea className={textareaClass} onChange={(event) => setDraft((current) => ({ ...current, caption_override: event.target.value }))} value={draft.caption_override} />
              </label>

              <div className="rounded-card border border-stroke bg-panel-muted px-4 py-3 text-sm leading-6 text-muted-strong">
                <span className="font-semibold text-foreground">Current highlight timing:</span>{" "}
                {activeHighlight.time_range || "No trim range recorded yet"}
              </div>
            </div>
          ) : (
            <p className="text-sm leading-6 text-muted">Pick a highlight from the left rail to begin editing.</p>
          )}
        </SectionCard>

        <div className="grid gap-6">
          <SectionCard
            eyebrow="Right rail"
            title="Render settings"
            description={workspace?.editor_defaults_hint}
          >
            <div className="grid gap-4">
              <label className="flex flex-col gap-2 text-sm text-muted-strong">
                <span>Tracking mode</span>
                <select className={inputClass} disabled={!activeHighlight} onChange={(event) => setDraft((current) => ({ ...current, tracking_mode: event.target.value }))} value={draft.tracking_mode}>
                  {TRACKING_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-2 text-sm text-muted-strong">
                <span>Caption mode</span>
                <select className={inputClass} disabled={!activeHighlight} onChange={(event) => setDraft((current) => ({ ...current, caption_mode: event.target.value }))} value={draft.caption_mode}>
                  {CAPTION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-2 text-sm text-muted-strong">
                <span>TTS voice</span>
                <input className={inputClass} disabled={!activeHighlight} onChange={(event) => setDraft((current) => ({ ...current, tts_voice: event.target.value }))} value={draft.tts_voice} />
              </label>

              <label className="flex flex-col gap-2 text-sm text-muted-strong">
                <span>Watermark preset</span>
                <input className={inputClass} disabled={!activeHighlight} onChange={(event) => setDraft((current) => ({ ...current, watermark_preset: event.target.value }))} value={draft.watermark_preset} />
              </label>

              <label className="flex items-center justify-between rounded-card border border-stroke bg-panel-muted px-4 py-3 text-sm text-foreground-soft">
                <span>Source credit enabled</span>
                <input checked={draft.source_credit_enabled} className="h-4 w-4 accent-accent" disabled={!activeHighlight} onChange={(event) => setDraft((current) => ({ ...current, source_credit_enabled: event.target.checked }))} type="checkbox" />
              </label>

              <label className="flex items-center justify-between rounded-card border border-stroke bg-panel-muted px-4 py-3 text-sm text-foreground-soft">
                <span>Add hook during render</span>
                <input checked={renderOptions.addHook} className="h-4 w-4 accent-accent" onChange={(event) => setRenderOptions((current) => ({ ...current, addHook: event.target.checked }))} type="checkbox" />
              </label>

              <label className="flex items-center justify-between rounded-card border border-stroke bg-panel-muted px-4 py-3 text-sm text-foreground-soft">
                <span>Add captions during render</span>
                <input checked={renderOptions.addCaptions} className="h-4 w-4 accent-accent" onChange={(event) => setRenderOptions((current) => ({ ...current, addCaptions: event.target.checked }))} type="checkbox" />
              </label>
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Queue state"
            title="Clip job summary"
            description="Retry Failed only enables when the workspace payload reports failed or partial clip states."
          >
            <InfoGrid
              items={[
                { label: "Total", value: workspace?.queue_summary.total || 0 },
                { label: "Queued", value: workspace?.queue_summary.queued || 0 },
                { label: "Rendering", value: workspace?.queue_summary.rendering || 0 },
                { label: "Completed", value: workspace?.queue_summary.completed || 0 },
                { label: "Failed", value: workspace?.queue_summary.failed || 0 },
                { label: "Dirty", value: workspace?.queue_summary.dirty || 0 },
              ]}
            />
          </SectionCard>
        </div>
      </div>

      <SectionCard
        eyebrow="Outputs"
        title="Rendered clips"
        description="Output cards are generated from the current workspace payload and link through the backend's static `/output` mount."
      >
        <div id="outputs" className="space-y-4">
          {outputs.length === 0 ? (
            <p className="text-sm leading-6 text-muted">No output clips are available yet for this session.</p>
          ) : (
            outputs.map((clip) => {
              const masterUrl = buildOutputAssetUrl(clip.master_path);
              const dataUrl = buildOutputAssetUrl(clip.data_path);

              return (
                <div key={clip.clip_id} className="rounded-card border border-stroke bg-panel-muted p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">{clip.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-muted-strong">
                        {[clip.revision_label, formatDuration(clip.duration)].filter(Boolean).join(" • ")}
                      </p>
                    </div>
                    <StatusChip tone={statusTone(clip.status)}>{clip.status}</StatusChip>
                  </div>

                  <p className="mt-3 text-sm leading-6 text-foreground-soft">
                    {clip.hook_text || "No hook text stored for this clip."}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {masterUrl ? (
                      <a className={primaryActionButtonClass} href={masterUrl} rel="noreferrer" target="_blank">
                        Open master.mp4
                      </a>
                    ) : null}
                    {dataUrl ? (
                      <a className={actionButtonClass} href={dataUrl} rel="noreferrer" target="_blank">
                        Open data.json
                      </a>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </SectionCard>
    </div>
  );
}
