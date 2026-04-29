import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/server/db/client";
import { AIProviderRouter } from "@/server/ai/provider-router";
import { findHighlights } from "@/server/ai/tasks/highlight-finder";
import { generateHookSpeech } from "@/server/ai/tasks/hook-tts";
import { extractAudio, probeMedia } from "@/server/media/ffmpeg";
import {
  downloadYoutubeAudio,
  downloadYoutubeVideoSection,
  downloadYoutubeVideo,
  fetchYoutubeTranscript,
  getYoutubeMetadata
} from "@/server/media/ytdlp";
import { serializeError } from "@/server/logging/logger";
import { FfmpegClipRenderer } from "@/server/rendering/ffmpeg-renderer";
import {
  buildClipRenderMetadata,
  buildClipRenderSignature,
  readClipRenderMetadata
} from "@/server/rendering/render-signature";
import { getSettings } from "@/server/config/settings-store";
import { withRetry } from "@/server/jobs/retry";
import { setJobStep } from "@/server/jobs/job-store";
import { fileExists } from "@/server/storage/files";
import { ensureSessionLayout, sessionPath } from "@/server/storage/paths";
import { parseJsonWithSchema, stringifyJson } from "@/shared/schemas/primitives";
import { providerSupportsCapability } from "@/shared/constants/ai-providers";
import { REFRAME_RENDERER_VERSION } from "@/shared/reframe";
import { getHighlightBoundaryScorerVersion } from "@/server/ai/tasks/highlight-quality";
import {
  sessionConfigSchema,
  transcriptSchema,
  type Highlight,
  type SessionConfig,
  type Transcript
} from "@/shared/schemas/session";
import { transcribeAudioWithOpenAICompatible } from "@/server/transcription/openai-transcriber";
import { normalizeTranscriptForShorts } from "@/server/transcription/normalize-transcript";
import { parseSrt } from "@/server/transcription/srt";
import type { JobContext } from "@/server/jobs/runner";

const renderer = new FfmpegClipRenderer();
const RENDER_SOURCE_VERSION = "section_source_v1";

type PipelineSession = Awaited<ReturnType<typeof getSessionOrThrow>>;

export async function runSingleVideoPipeline(context: JobContext) {
  const sessionId = context.sessionId;
  if (!sessionId) {
    throw new Error("Session id is required for single video pipeline");
  }

  await step(context, "ingest_source", 5, "Preparing source video", async () => {
    await ingestSource(sessionId, context);
  });

  await step(context, "extract_audio", 20, "Extracting audio", async () => {
    const session = await getSessionOrThrow(sessionId);
    if (session.transcriptJson) {
      await context.log("Transcript already exists; skipping audio extraction");
      return;
    }

    try {
      if (session.sourceType === "youtube" && session.sourceUrl && !session.downloadedPath) {
        const settings = await getSettings();
        await withRetry(
          () =>
            downloadYoutubeAudio({
              url: session.sourceUrl!,
              outputDir: sessionPath(sessionId),
              cookiesPath: settings.cookies.youtubePath ?? undefined,
              jobId: context.jobId,
              onLog: context.log
            }),
          retryOptions(context, "download_youtube_audio", 2)
        );
        return;
      }

      if (!session.downloadedPath) {
        throw new Error("No source video path available");
      }

      await withRetry(
        () =>
          extractAudio(session.downloadedPath!, sessionPath(sessionId, "audio.wav"), {
            jobId: context.jobId
          }),
        retryOptions(context, "extract_audio", 2)
      );
    } catch (error) {
      await context.log("Audio extraction failed; PaunClip will continue with transcript fallback.", {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  await step(context, "transcribe", 40, "Transcribing audio", async () => {
    await transcribeSession(sessionId, context);
  });

  await step(context, "find_highlights", 60, "Finding highlight clips", async () => {
    await analyzeHighlights(sessionId, context);
  });

  const config = await getSessionConfig(sessionId);
  if (config.renderMode === "review") {
    await step(context, "finalize", 100, "Waiting for clip selection", async () => {
      await db.session.update({
        where: { id: sessionId },
        data: {
          status: "ready",
          stage: "ready_to_render"
        }
      });
      await context.log("Analysis ready for review; rendering is paused until clips are selected");
    });
    return;
  }

  await step(context, "render_clips", 90, "Rendering clips", async () => {
    await renderHighlights(sessionId, context);
  });

  await step(context, "finalize", 100, "Finalizing session", async () => {
    await finalizeSession(sessionId, context);
  });
}

export async function runRenderSelectedClips(context: JobContext) {
  const sessionId = context.sessionId;
  if (!sessionId) {
    throw new Error("Session id is required for selected clip rendering");
  }

  await step(context, "render_clips", 20, "Rendering selected clips", async () => {
    await db.session.update({
      where: { id: sessionId },
      data: {
        status: "created",
        stage: "rendering"
      }
    });
    await renderHighlights(sessionId, context);
  });

  await step(context, "finalize", 100, "Finalizing rendered clips", async () => {
    await finalizeSession(sessionId, context);
  });
}

export async function runRerenderClip(context: JobContext) {
  const clipId = typeof context.payload.clipId === "string" ? context.payload.clipId : "";
  if (!clipId) {
    throw new Error("Clip id is required for rerender_clip jobs");
  }

  await step(context, "render_clips", 40, "Rerendering clip", async () => {
    await rerenderClip(clipId, context);
  });

  await step(context, "finalize", 100, "Finalizing rerender", async () => {
    if (context.sessionId) {
      await finalizeSession(context.sessionId, context);
    }
  });
}

async function ingestSource(sessionId: string, context: JobContext) {
  const session = await getSessionOrThrow(sessionId);
  const config = parseJsonWithSchema(sessionConfigSchema, session.configJson, defaultConfig());
  const settings = await getSettings();
  await ensureSessionLayout(sessionId);

  if (session.sourceType === "youtube") {
    if (!session.sourceUrl) {
      throw new Error("YouTube session requires sourceUrl");
    }
    await context.log("Fetching YouTube metadata", { url: session.sourceUrl });
    const metadata = await withRetry(
      () => getYoutubeMetadata(session.sourceUrl!, settings.cookies.youtubePath ?? undefined),
      retryOptions(context, "youtube_metadata", 2)
    );
    await context.log("YouTube metadata loaded", {
      title: metadata.title,
      channel: metadata.channel
    });

    const subtitleResult = await withRetry(
      () =>
        fetchYoutubeTranscript({
          url: session.sourceUrl!,
          outputDir: sessionPath(sessionId),
          language: config.language ?? "id",
          cookiesPath: settings.cookies.youtubePath ?? undefined,
          jobId: context.jobId,
          onLog: context.log
        }),
      retryOptions(context, "youtube_subtitle_fetch", 2)
    );
    const durationSeconds = Math.round(metadata.duration ?? session.durationSeconds ?? 60);
    const normalizedSubtitleTranscript = subtitleResult
      ? withTranscriptMetadata(
          normalizeTranscriptForShorts(subtitleResult.transcript, { language: config.language ?? "id" }),
          "youtube_subtitle",
          undefined,
          "segment_timestamps"
        )
      : undefined;

    await db.session.update({
      where: { id: sessionId },
      data: {
        stage: "ingesting",
        sourceTitle: metadata.title,
        sourceChannel: metadata.channel,
        durationSeconds,
        thumbnailPath: metadata.thumbnail ?? session.thumbnailPath,
        transcriptJson: normalizedSubtitleTranscript
          ? stringifyJson(normalizedSubtitleTranscript)
          : session.transcriptJson,
        configJson: stringifyJson({
          ...config,
          processingEnd: config.processingEnd ?? metadata.duration ?? durationSeconds
        })
      }
    });
    if (subtitleResult) {
      await context.log("Transcript-first ingest succeeded; full video download is deferred until render", {
        subtitlePath: subtitleResult.subtitlePath,
        segments: subtitleResult.transcript.segments.length
      });
    } else {
      await context.log("Transcript-first ingest did not find subtitles; audio fallback will be used");
    }
    return;
  }

  if (session.downloadedPath) {
    await context.log("Using uploaded source video", { sourcePath: session.downloadedPath });
    const probe = await probeMedia(session.downloadedPath);
    await db.session.update({
      where: { id: sessionId },
      data: {
        durationSeconds: Math.round(probe.durationSeconds)
      }
    });
    return;
  }

  throw new Error(`Unsupported or incomplete source type: ${session.sourceType}`);
}

async function transcribeSession(sessionId: string, context: JobContext) {
  const session = await getSessionOrThrow(sessionId);
  if (session.transcriptJson) {
    await context.log("Transcript already exists; skipping transcription");
    return;
  }

  const settings = await getSettings();
  const config = parseJsonWithSchema(sessionConfigSchema, session.configJson, defaultConfig());
  const audioPath = await resolveTranscriptAudioPath(sessionId);
  const language = config.language ?? "id";
  const transcript = config.manualTranscriptSrt
    ? withTranscriptMetadata(parseSrt(config.manualTranscriptSrt, language), "manual_srt", undefined, "segment_timestamps")
    : await transcribeOrThrow({
        sessionId,
        audioPath,
        language,
        durationSeconds: session.durationSeconds ?? 60,
        captionConfig: settings.aiProviders.captionMaker,
        log: context.log
      });
  const normalizedTranscript = withTranscriptMetadata(
    normalizeTranscriptForShorts(transcript, { language }),
    transcript.source ?? "ai_transcription",
    transcript.failureReason,
    transcript.quality
  );

  await db.session.update({
    where: { id: sessionId },
    data: {
      stage: "transcribing",
      transcriptJson: stringifyJson(normalizedTranscript)
    }
  });
}

async function resolveTranscriptAudioPath(sessionId: string) {
  const candidates = ["audio.mp3", "audio.m4a", "audio.webm", "audio.wav"].map((name) => sessionPath(sessionId, name));
  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }
  return sessionPath(sessionId, "audio.wav");
}

async function analyzeHighlights(sessionId: string, context: JobContext) {
  const session = await getSessionOrThrow(sessionId);
  const settings = await getSettings();
  const router = new AIProviderRouter(settings.aiProviders);
  const highlightConfig = settings.aiProviders.highlightFinder;
  const config = parseJsonWithSchema(sessionConfigSchema, session.configJson, defaultConfig());
  const language = config.language ?? "id";
  const transcript = parseJsonWithSchema(transcriptSchema, session.transcriptJson, {
    language,
    segments: []
  });
  assertUsableTranscript(transcript);
  await context.log("Transcript ready for highlight analysis", {
    source: transcript.source ?? "unknown",
    quality: transcript.quality ?? "unknown",
    segments: transcript.segments.length,
    averageSegmentDuration: getAverageSegmentDuration(transcript),
    targetClipCount: config.targetClipCount,
    clipLength: config.clipLength,
    processingStart: config.processingStart,
    processingEnd: config.processingEnd
  });
  let highlights: Highlight[];
  try {
    highlights = await withRetry(
      () =>
        findHighlights({
          router,
          transcript,
          prompt: config.prompt,
          promptMode: config.promptMode,
          targetCount: config.targetClipCount,
          clipLength: config.clipLength,
          processingStart: config.processingStart,
          processingEnd: config.processingEnd,
          onLog: context.log
        }),
      retryOptions(context, "find_highlights", 2)
    );
  } catch (error) {
    await db.highlight.deleteMany({ where: { sessionId } });
    await db.session.update({
      where: { id: sessionId },
      data: {
        status: "failed",
        stage: "find_highlights_failed"
      }
    });
    await context.log("Highlight Finder failed", {
      provider: highlightConfig.provider,
      model: highlightConfig.model,
      error: serializeError(error)
    });
    throw error;
  }
  await context.log("Highlight analysis completed", {
    requestedCount: config.targetClipCount,
    count: highlights.length,
    boundaryScorerVersion: getHighlightBoundaryScorerVersion()
  });

  await db.highlight.deleteMany({ where: { sessionId } });

  if (highlights.length > 0) {
    await db.highlight.createMany({
      data: highlights.map((highlight) => ({
        sessionId,
        startTime: highlight.startTime,
        endTime: highlight.endTime,
        title: highlight.title,
        description: highlight.description,
        viralityScore: highlight.viralityScore,
        selected: highlight.selected,
        hookText: highlight.hookText,
        analysisJson: stringifyJson({
          targetClipCount: config.targetClipCount,
          clipLength: config.clipLength,
          boundaryScorerVersion: getHighlightBoundaryScorerVersion()
        })
      }))
    });
  }

  await db.session.update({
    where: { id: sessionId },
    data: {
      stage: "analyzing"
    }
  });
}

async function renderHighlights(sessionId: string, context: JobContext) {
  const session = await getSessionOrThrow(sessionId);

  const settings = await getSettings();
  const config = parseJsonWithSchema(sessionConfigSchema, session.configJson, defaultConfig());
  const language = config.language ?? "id";
  const transcript = parseJsonWithSchema(transcriptSchema, session.transcriptJson, {
    language,
    segments: []
  });
  assertUsableTranscript(transcript);
  const captionPreset =
    settings.captionPresets.find((preset) => preset.id === config.captionStyleId) ??
    settings.captionPresets[0];
  if (!captionPreset) {
    throw new Error("No caption preset configured");
  }

  const highlights = await db.highlight.findMany({
    where: { sessionId, selected: true },
    orderBy: { viralityScore: "desc" },
    take: 10
  });
  await context.log("Rendering selected highlights", { count: highlights.length });
  if (highlights.length === 0) {
    await context.log("No selected highlights found; rendering skipped");
    return;
  }

  await db.session.update({
    where: { id: sessionId },
    data: {
      stage: "rendering"
    }
  });

  let renderedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  for (const highlightRecord of highlights) {
    const existingClip = await db.clip.findUnique({
      where: { highlightId: highlightRecord.id }
    });
    const highlight: Highlight = {
      startTime: highlightRecord.startTime,
      endTime: highlightRecord.endTime,
      title: highlightRecord.title,
      description: highlightRecord.description ?? undefined,
      viralityScore: highlightRecord.viralityScore ?? undefined,
      selected: highlightRecord.selected,
      hookText: highlightRecord.hookText ?? undefined
    };
    const renderSource = await resolveRenderSourceForHighlight(session, highlight, highlightRecord.id, context);
    const renderSignature = buildClipRenderSignature({
      sourcePath: renderSource.sourcePath,
      sourceMode: renderSource.sourceMode,
      sourceTimeOffsetSeconds: renderSource.sourceTimeOffsetSeconds,
      sourceSection: renderSource.sourceSection,
      highlight,
      transcript,
      captionStyle: captionPreset.config,
      captionOffsetMs: config.captionOffsetMs ?? 0,
      captionModel: settings.aiProviders.captionMaker.model,
      captionProvider: settings.aiProviders.captionMaker.provider,
      aspectRatio: config.aspectRatio,
      rendererVersion: getRenderSignatureVersion(),
      reframe: {
        mode: config.reframeMode,
        contentPreset: config.contentPreset,
        faceTrackingMode: config.faceTrackingMode
      },
      hook: buildHookSignature(config.autoHook, highlight.hookText, settings.aiProviders.hookMaker)
    });
    const existingMetadata = readClipRenderMetadata(existingClip?.renderJson);
    if (
      existingClip?.status === "completed" &&
      existingClip.masterPath &&
      existingMetadata.signature === renderSignature &&
      (await fileExists(existingClip.masterPath))
    ) {
      skippedCount += 1;
      await context.log("Render cache hit; skipping clip render", {
        clipId: existingClip.id,
        highlightId: highlightRecord.id,
        title: highlightRecord.title
      });
      continue;
    }

    const hookAudioPath = await prepareHookAudio({
      sessionId,
      highlightId: highlightRecord.id,
      hookText: highlight.hookText,
      enabled: config.autoHook,
      hookConfig: settings.aiProviders.hookMaker,
      log: context.log
    });

    try {
      const versionId = existingClip ? createRenderVersionId() : undefined;
      const output = await withRetry(
        () =>
          renderer.render({
            sessionId,
            jobId: context.jobId,
            clipId: existingClip?.id,
            versionId,
            sourcePath: renderSource.sourcePath,
            sourceMode: renderSource.sourceMode,
            sourceTimeOffsetSeconds: renderSource.sourceTimeOffsetSeconds,
            highlightId: highlightRecord.id,
            highlight,
            transcript,
            captionStyle: captionPreset.config,
            captionConfig: settings.aiProviders.captionMaker,
            captionOffsetMs: config.captionOffsetMs ?? 0,
            language,
            onLog: context.log,
            hookAudioPath,
            contentPreset: config.contentPreset,
            reframeMode: config.reframeMode
          }),
        retryOptions(context, "render_clip", 2)
      );
      await context.log("Clip rendered", {
        clipId: output.clipId,
        title: highlight.title,
        duration: output.duration
      });

      await db.clip.upsert({
        where: { highlightId: highlightRecord.id },
        create: {
          id: output.clipId,
          title: highlight.title,
          duration: output.duration,
          startTime: highlight.startTime,
          endTime: highlight.endTime,
          masterPath: output.masterPath,
          thumbnailPath: output.thumbnailPath,
          fileSizeMb: output.fileSizeMb,
          status: "completed",
          viralityScore: highlight.viralityScore,
          captionBurned: output.captionBurned,
          hookAdded: output.hookAdded,
          renderJson: stringifyJson(
            buildClipRenderMetadata({
              signature: renderSignature,
              versionId,
              cropPlan: output.cropPlan
            })
          ),
          sessionId,
          highlightId: highlightRecord.id
        },
        update: {
          title: highlight.title,
          duration: output.duration,
          startTime: highlight.startTime,
          endTime: highlight.endTime,
          masterPath: output.masterPath,
          thumbnailPath: output.thumbnailPath,
          fileSizeMb: output.fileSizeMb,
          status: "completed",
          viralityScore: highlight.viralityScore,
          captionBurned: output.captionBurned,
          hookAdded: output.hookAdded,
          renderJson: stringifyJson(
            buildClipRenderMetadata({
              signature: renderSignature,
              versionId,
              cropPlan: output.cropPlan
            })
          )
        }
      });
      renderedCount += 1;

      await db.highlight.update({
        where: { id: highlightRecord.id },
        data: { status: "rendered" }
      });
    } catch (error) {
      failedCount += 1;
      const serialized = serializeError(error);
      await context.log("Clip render failed; continuing with remaining clips", {
        highlightId: highlightRecord.id,
        title: highlight.title,
        error: serialized
      });

      await db.clip.upsert({
        where: { highlightId: highlightRecord.id },
        create: {
          id: `clip_${randomUUID()}`,
          title: highlight.title,
          duration: Math.max(0.1, highlight.endTime - highlight.startTime),
          startTime: highlight.startTime,
          endTime: highlight.endTime,
          status: "failed",
          viralityScore: highlight.viralityScore,
          captionBurned: false,
          hookAdded: false,
          renderJson: stringifyJson({
            signature: renderSignature,
            failedAt: new Date().toISOString(),
            error: serialized
          }),
          sessionId,
          highlightId: highlightRecord.id
        },
        update: {
          status: "failed",
          renderJson: stringifyJson({
            signature: renderSignature,
            failedAt: new Date().toISOString(),
            error: serialized
          })
        }
      });

      await db.highlight.update({
        where: { id: highlightRecord.id },
        data: {
          status: "failed",
          analysisJson: stringifyJson({ renderError: serialized })
        }
      });
    }
  }

  await context.log("Selected highlight rendering finished", {
    renderedCount,
    skippedCount,
    failedCount
  });
}

type RenderSource = {
  sourcePath: string;
  sourceMode: "full" | "section";
  sourceTimeOffsetSeconds: number;
  sourceSection?: {
    startTime: number;
    endTime: number;
  };
};

async function resolveRenderSourceForHighlight(
  session: PipelineSession,
  highlight: Highlight,
  highlightId: string,
  context: JobContext
): Promise<RenderSource> {
  const latestDownloadedPath =
    session.downloadedPath ??
    (
      await db.session.findUnique({
        where: { id: session.id },
        select: { downloadedPath: true }
      })
    )?.downloadedPath;
  if (latestDownloadedPath || session.sourceType !== "youtube" || !session.sourceUrl) {
    return {
      sourcePath: latestDownloadedPath ?? (await ensureSourceVideoForRendering(session, context)),
      sourceMode: "full",
      sourceTimeOffsetSeconds: 0
    };
  }

  const settings = await getSettings();
  const sectionDir = sessionPath(session.id, "source-sections", highlightId);
  try {
    await context.log("Downloading YouTube source section for rendering", {
      highlightId,
      startTime: highlight.startTime,
      endTime: highlight.endTime
    });
    const section = await withRetry(
      () =>
        downloadYoutubeVideoSection({
          url: session.sourceUrl!,
          outputDir: sectionDir,
          startTime: highlight.startTime,
          endTime: highlight.endTime,
          cookiesPath: settings.cookies.youtubePath ?? undefined,
          jobId: context.jobId,
          onLog: context.log,
          onProgress: async (download) => {
            const progress = Math.min(89, 70 + Math.round((download.percent ?? 0) * 0.18));
            await context.progress(progress, "Downloading source section for rendering", {
              step: "render_clips",
              download,
              highlightId
            });
          }
        }),
      retryOptions(context, "download_youtube_video_section", 2)
    );
    await context.log("YouTube source section ready", {
      highlightId,
      sourcePath: section.sourcePath,
      sectionStartTime: section.sectionStartTime,
      sectionEndTime: section.sectionEndTime
    });
    return {
      sourcePath: section.sourcePath,
      sourceMode: "section",
      sourceTimeOffsetSeconds: section.sectionStartTime,
      sourceSection: {
        startTime: section.sectionStartTime,
        endTime: section.sectionEndTime
      }
    };
  } catch (error) {
    await context.log("YouTube section download failed; falling back to full source video", {
      highlightId,
      error: serializeError(error)
    });
    return {
      sourcePath: await ensureSourceVideoForRendering(session, context),
      sourceMode: "full",
      sourceTimeOffsetSeconds: 0
    };
  }
}

async function ensureSourceVideoForRendering(session: PipelineSession, context: JobContext) {
  if (session.downloadedPath) {
    return session.downloadedPath;
  }

  const latestSession =
    session.downloadedPath
      ? session
      : await db.session.findUnique({
          where: { id: session.id },
          select: { downloadedPath: true }
        });
  if (latestSession?.downloadedPath) {
    return latestSession.downloadedPath;
  }

  if (session.sourceType !== "youtube" || !session.sourceUrl) {
    throw new Error("No source video path available");
  }

  const settings = await getSettings();
  await context.log("Downloading full YouTube source video for rendering", {
    url: session.sourceUrl
  });
  const sourcePath = await withRetry(
    () =>
      downloadYoutubeVideo({
        url: session.sourceUrl!,
        outputDir: sessionPath(session.id),
        cookiesPath: settings.cookies.youtubePath ?? undefined,
        jobId: context.jobId,
        onLog: context.log,
        onProgress: async (download) => {
          const progress = Math.min(89, 70 + Math.round((download.percent ?? 0) * 0.18));
          await context.progress(progress, "Downloading source video for rendering", {
            step: "render_clips",
            download
          });
        }
      }),
    retryOptions(context, "download_youtube_video", 2)
  );
  await context.log("Probing downloaded source", { sourcePath });
  const probe = await withRetry(() => probeMedia(sourcePath), retryOptions(context, "probe_media", 2));
  await db.session.update({
    where: { id: session.id },
    data: {
      downloadedPath: sourcePath,
      durationSeconds: Math.round(probe.durationSeconds || session.durationSeconds || 60)
    }
  });
  return sourcePath;
}

async function rerenderClip(clipId: string, context: JobContext) {
  const clip = await db.clip.findUnique({
    where: { id: clipId },
    include: {
      highlight: true,
      session: true
    }
  });
  if (!clip) {
    throw new Error(`Clip not found: ${clipId}`);
  }

  const settings = await getSettings();
  const config = parseJsonWithSchema(sessionConfigSchema, clip.session.configJson, defaultConfig());
  const language = config.language ?? "id";
  const transcript = parseJsonWithSchema(transcriptSchema, clip.session.transcriptJson, {
    language,
    segments: []
  });
  assertUsableTranscript(transcript);
  const metadata = readClipRenderMetadata(clip.renderJson);
  const captionStyleId = metadata.draft?.captionStyleId ?? config.captionStyleId;
  const captionPreset =
    settings.captionPresets.find((preset) => preset.id === captionStyleId) ??
    settings.captionPresets[0];
  if (!captionPreset) {
    throw new Error("No caption preset configured");
  }

  const highlight: Highlight = {
    startTime: clip.startTime,
    endTime: clip.endTime,
    title: clip.title,
    description: clip.highlight.description ?? undefined,
    viralityScore: clip.viralityScore ?? undefined,
    selected: clip.highlight.selected,
    hookText: clip.highlight.hookText ?? undefined
  };
  const renderSource = await resolveRenderSourceForHighlight(clip.session, highlight, clip.highlightId, context);
  const signature = buildClipRenderSignature({
    sourcePath: renderSource.sourcePath,
    sourceMode: renderSource.sourceMode,
    sourceTimeOffsetSeconds: renderSource.sourceTimeOffsetSeconds,
    sourceSection: renderSource.sourceSection,
    highlight,
    transcript,
    captionStyle: captionPreset.config,
    captionOffsetMs: config.captionOffsetMs ?? 0,
    captionModel: settings.aiProviders.captionMaker.model,
    captionProvider: settings.aiProviders.captionMaker.provider,
    aspectRatio: config.aspectRatio,
    rendererVersion: getRenderSignatureVersion(),
    reframe: {
      mode: config.reframeMode,
      contentPreset: config.contentPreset,
      faceTrackingMode: config.faceTrackingMode
    },
    hook: buildHookSignature(config.autoHook, highlight.hookText, settings.aiProviders.hookMaker)
  });

  if (clip.status === "completed" && clip.masterPath && metadata.signature === signature && (await fileExists(clip.masterPath))) {
    await db.clip.update({
      where: { id: clip.id },
      data: {
        renderJson: stringifyJson(
          buildClipRenderMetadata({
            signature,
            versionId: metadata.versionId,
            draft: metadata.draft,
            cacheHit: true,
            cropPlan: metadata.cropPlan
          })
        )
      }
    });
    await context.log("Rerender skipped because clip render cache is still valid", {
      clipId: clip.id
    });
    return;
  }

  await db.clip.update({
    where: { id: clip.id },
    data: { status: "rendering" }
  });

  const hookAudioPath = await prepareHookAudio({
    sessionId: clip.sessionId,
    highlightId: clip.highlightId,
    hookText: highlight.hookText,
    enabled: config.autoHook,
    hookConfig: settings.aiProviders.hookMaker,
    log: context.log
  });
  const versionId = createRenderVersionId();
  let output: Awaited<ReturnType<typeof renderer.render>>;
  try {
    output = await withRetry(
      () =>
        renderer.render({
          sessionId: clip.sessionId,
          jobId: context.jobId,
          clipId: clip.id,
          versionId,
          sourcePath: renderSource.sourcePath,
          sourceMode: renderSource.sourceMode,
          sourceTimeOffsetSeconds: renderSource.sourceTimeOffsetSeconds,
          highlightId: clip.highlightId,
          highlight,
          transcript,
          captionStyle: captionPreset.config,
          captionConfig: settings.aiProviders.captionMaker,
          captionOffsetMs: config.captionOffsetMs ?? 0,
          language,
          onLog: context.log,
          hookAudioPath,
          contentPreset: config.contentPreset,
          reframeMode: config.reframeMode
        }),
      retryOptions(context, "rerender_clip", 2)
    );
  } catch (error) {
    const serialized = serializeError(error);
    await db.clip.update({
      where: { id: clip.id },
      data: {
        status: "failed",
        renderJson: stringifyJson({
          signature,
          versionId,
          failedAt: new Date().toISOString(),
          error: serialized
        })
      }
    });
    throw error;
  }

  await db.clip.update({
    where: { id: clip.id },
    data: {
      title: highlight.title,
      duration: output.duration,
      startTime: highlight.startTime,
      endTime: highlight.endTime,
      masterPath: output.masterPath,
      thumbnailPath: output.thumbnailPath,
      fileSizeMb: output.fileSizeMb,
      status: "completed",
      captionBurned: output.captionBurned,
      hookAdded: output.hookAdded,
      renderJson: stringifyJson(
        buildClipRenderMetadata({
          signature,
          versionId,
          cropPlan: output.cropPlan
        })
      )
    }
  });
  await db.highlight.update({
    where: { id: clip.highlightId },
    data: { status: "rendered" }
  });
  await context.log("Clip rerendered safely", {
    clipId: clip.id,
    versionId,
    masterPath: output.masterPath
  });
}

function buildHookSignature(
  enabled: boolean | undefined,
  hookText: string | undefined,
  hookConfig: Awaited<ReturnType<typeof getSettings>>["aiProviders"]["hookMaker"]
) {
  const hookEnabled = Boolean(enabled && hookText);
  return {
    enabled: hookEnabled,
    text: hookText ?? "",
    provider: hookConfig.provider,
    model: hookConfig.model,
    voice: hookConfig.ttsVoice,
    format: hookConfig.ttsFormat,
    ...(hookEnabled ? { introMode: "freeze_prepend_v1" } : {})
  };
}

function createRenderVersionId() {
  return `v_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

async function prepareHookAudio(params: {
  sessionId: string;
  highlightId: string;
  hookText?: string;
  enabled?: boolean;
  hookConfig: Awaited<ReturnType<typeof getSettings>>["aiProviders"]["hookMaker"];
  log: JobContext["log"];
}) {
  if (!params.enabled || !params.hookText) {
    return undefined;
  }

  if (!params.hookConfig.apiKey && params.hookConfig.provider !== "custom") {
    await params.log("Hook Maker skipped; no API key configured", {
      highlightId: params.highlightId
    });
    return undefined;
  }

  const outputPath = sessionPath(
    params.sessionId,
    "hooks",
    `${params.highlightId}.${params.hookConfig.ttsFormat ?? "mp3"}`
  );

  try {
    const result = await withRetry(
      () =>
        generateHookSpeech({
          text: params.hookText!,
          config: params.hookConfig,
          outputPath
        }),
      {
        label: "generate_hook_speech",
        attempts: 2,
        onRetry: async ({ attempt, maxAttempts, delayMs, error }) =>
          params.log("Hook Maker retry scheduled", {
            highlightId: params.highlightId,
            attempt,
            maxAttempts,
            delayMs,
            error: serializeError(error)
          })
      }
    );
    await params.log("Hook Maker audio generated", {
      highlightId: params.highlightId,
      model: result.model,
      voice: result.voice,
      format: result.format
    });
    return result.audioPath;
  } catch (error) {
    await params.log("Hook Maker failed; clip will render without hook audio", {
      highlightId: params.highlightId,
      error: serializeError(error)
    });
    return undefined;
  }
}

async function step(
  context: JobContext,
  name: Parameters<typeof setJobStep>[1],
  progress: number,
  message: string,
  work: () => Promise<void>
) {
  await setJobStep(context.jobId, name, { status: "running", progress, message });
  await context.log("Step started", { step: name, progress, message });
  await context.progress(progress, message, { step: name });
  try {
    await work();
    await setJobStep(context.jobId, name, { status: "completed", progress, message });
    await context.log("Step completed", { step: name, progress, message });
  } catch (error) {
    await setJobStep(context.jobId, name, { status: "failed", progress, message, error });
    await context.log("Step failed", { step: name, progress, message, error: serializeError(error) });
    throw error;
  }
}

async function getSessionOrThrow(sessionId: string) {
  const session = await db.session.findUnique({ where: { id: sessionId } });
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  return session;
}

function defaultConfig(): SessionConfig {
  return {
    clipModel: "auto",
    genre: "auto",
    clipLength: "auto",
    autoHook: true,
    prompt: "",
    captionStyleId: "karaoke",
    aspectRatio: "9:16",
    renderMode: "auto",
    processingStart: 0,
    contentPreset: "auto",
    reframeMode: "auto_fast",
    faceTrackingMode: "center_crop",
    captionOffsetMs: 0,
    language: "id",
    targetClipCount: 3,
    promptMode: "single_video"
  };
}

function getRenderSignatureVersion() {
  return `${REFRAME_RENDERER_VERSION}:${getHighlightBoundaryScorerVersion()}:${RENDER_SOURCE_VERSION}`;
}

async function getSessionConfig(sessionId: string) {
  const session = await getSessionOrThrow(sessionId);
  return parseJsonWithSchema(sessionConfigSchema, session.configJson, defaultConfig());
}

async function finalizeSession(sessionId: string, context: JobContext) {
  const [completedClips, failedClips] = await Promise.all([
    db.clip.count({ where: { sessionId, status: "completed" } }),
    db.clip.count({ where: { sessionId, status: "failed" } })
  ]);
  const status =
    failedClips > 0 && completedClips > 0
      ? "partially_failed"
      : failedClips > 0
        ? "failed"
        : "completed";

  await db.session.update({
    where: { id: sessionId },
    data: {
      status,
      stage: status
    }
  });
  await context.log("Session finalized", {
    status,
    completedClips,
    failedClips
  });
}

function retryOptions(context: JobContext, label: string, attempts = 3) {
  return {
    label,
    attempts,
    onRetry: async ({
      attempt,
      maxAttempts,
      delayMs,
      error
    }: {
      attempt: number;
      maxAttempts: number;
      delayMs: number;
      error: unknown;
    }) =>
      context.log("Retry scheduled", {
        label,
        attempt,
        maxAttempts,
        delayMs,
        error: serializeError(error)
      })
  };
}

async function transcribeOrThrow(params: {
  sessionId: string;
  audioPath: string;
  language: string;
  durationSeconds: number;
  captionConfig: Parameters<typeof transcribeAudioWithOpenAICompatible>[0]["config"];
  log: JobContext["log"];
}): Promise<Transcript> {
  if (!params.captionConfig.apiKey) {
    await params.log("No transcription API key configured", {
      sessionId: params.sessionId
    });
    throw new Error("Configure Caption Maker before clipping, or upload an SRT transcript.");
  }

  if (!providerSupportsCapability(params.captionConfig, "transcription")) {
    await params.log("AI transcription skipped; caption provider does not support audio transcription", {
      provider: params.captionConfig.provider,
      model: params.captionConfig.model
    });
    throw new Error("Caption Maker provider does not support transcription. Choose OpenAI, Groq, or upload SRT.");
  }

  try {
    await params.log("Transcribing audio with configured AI provider", {
      language: params.language
    });
    const transcript = await withRetry(
      () =>
        transcribeAudioWithOpenAICompatible({
          audioPath: params.audioPath,
          config: params.captionConfig,
          language: params.language
        }),
      {
        label: "ai_transcription",
        attempts: 2,
        onRetry: async ({ attempt, maxAttempts, delayMs, error }) =>
          params.log("AI transcription retry scheduled", {
            attempt,
            maxAttempts,
            delayMs,
            error: serializeError(error)
          })
      }
    );
    return withTranscriptMetadata(transcript, "ai_transcription");
  } catch (error) {
    await params.log("AI transcription failed", {
      error: serializeError(error)
    });
    throw new Error("Transcription failed. Check Caption Maker settings or upload an SRT transcript.");
  }
}

function withTranscriptMetadata(
  transcript: Transcript,
  source: NonNullable<Transcript["source"]>,
  failureReason?: string,
  quality?: NonNullable<Transcript["quality"]>
): Transcript {
  return {
    ...transcript,
    source,
    quality: quality ?? (source === "fallback" ? "fallback" : inferTranscriptQuality(transcript)),
    failureReason
  };
}

function inferTranscriptQuality(transcript: Transcript): NonNullable<Transcript["quality"]> {
  return transcript.segments.some((segment) => segment.words.length > 0)
    ? "word_timestamps"
    : "segment_timestamps";
}

function assertUsableTranscript(transcript: Transcript) {
  if (transcript.source === "fallback" || transcript.quality === "fallback") {
    throw new Error("Transcript fallback cannot be analyzed. Configure Caption Maker or upload an SRT transcript.");
  }
  if (transcript.segments.length === 0) {
    throw new Error("No transcript is available. Configure Caption Maker or upload an SRT transcript.");
  }
}

function getAverageSegmentDuration(transcript: Transcript) {
  if (transcript.segments.length === 0) {
    return 0;
  }
  const total = transcript.segments.reduce(
    (sum, segment) => sum + Math.max(0, segment.end - segment.start),
    0
  );
  return Math.round((total / transcript.segments.length) * 10) / 10;
}
