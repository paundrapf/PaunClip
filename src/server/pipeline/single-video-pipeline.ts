import "server-only";
import { db } from "@/server/db/client";
import { AIProviderRouter } from "@/server/ai/provider-router";
import { findHighlights } from "@/server/ai/tasks/highlight-finder";
import { extractAudio, probeMedia } from "@/server/media/ffmpeg";
import { downloadYoutubeVideo, getYoutubeMetadata } from "@/server/media/ytdlp";
import { serializeError } from "@/server/logging/logger";
import { FfmpegClipRenderer } from "@/server/rendering/ffmpeg-renderer";
import { getSettings } from "@/server/config/settings-store";
import { setJobStep } from "@/server/jobs/job-store";
import { ensureSessionLayout, sessionPath } from "@/server/storage/paths";
import { parseJsonWithSchema, stringifyJson } from "@/shared/schemas/primitives";
import {
  sessionConfigSchema,
  transcriptSchema,
  type Highlight,
  type SessionConfig,
  type Transcript
} from "@/shared/schemas/session";
import { transcribeAudioWithOpenAICompatible } from "@/server/transcription/openai-transcriber";
import { parseSrt } from "@/server/transcription/srt";
import { createFallbackTranscript } from "@/server/transcription/fallback";
import type { JobContext } from "@/server/jobs/runner";

const renderer = new FfmpegClipRenderer();

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
    if (!session.downloadedPath) {
      throw new Error("No source video path available");
    }
    try {
      await extractAudio(session.downloadedPath, sessionPath(sessionId, "audio.wav"));
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

  await step(context, "render_clips", 90, "Rendering clips", async () => {
    await renderHighlights(sessionId, context);
  });

  await step(context, "finalize", 100, "Finalizing session", async () => {
    await db.session.update({
      where: { id: sessionId },
      data: {
        status: "completed",
        stage: "completed"
      }
    });
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
    const metadata = await getYoutubeMetadata(session.sourceUrl, settings.cookies.youtubePath ?? undefined);
    await context.log("Downloading YouTube source video", {
      title: metadata.title,
      channel: metadata.channel
    });
    const sourcePath = await downloadYoutubeVideo({
      url: session.sourceUrl,
      outputDir: sessionPath(sessionId),
      cookiesPath: settings.cookies.youtubePath ?? undefined,
      onLog: context.log
    });
    await context.log("Probing downloaded source", { sourcePath });
    const probe = await probeMedia(sourcePath);
    await db.session.update({
      where: { id: sessionId },
      data: {
        stage: "ingesting",
        sourceTitle: metadata.title,
        sourceChannel: metadata.channel,
        durationSeconds: Math.round(probe.durationSeconds),
        downloadedPath: sourcePath,
        configJson: stringifyJson({
          ...config,
          processingEnd: config.processingEnd ?? probe.durationSeconds
        })
      }
    });
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
  const audioPath = sessionPath(sessionId, "audio.wav");
  const language = config.language ?? "id";
  const transcript = config.manualTranscriptSrt
    ? parseSrt(config.manualTranscriptSrt, language)
    : await transcribeOrFallback({
        sessionId,
        audioPath,
        language,
        durationSeconds: session.durationSeconds ?? 60,
        captionConfig: settings.aiProviders.captionMaker,
        log: context.log
      });

  await db.session.update({
    where: { id: sessionId },
    data: {
      stage: "transcribing",
      transcriptJson: stringifyJson(transcript)
    }
  });
}

async function analyzeHighlights(sessionId: string, context: JobContext) {
  const session = await getSessionOrThrow(sessionId);
  const settings = await getSettings();
  const router = new AIProviderRouter(settings.aiProviders);
  const config = parseJsonWithSchema(sessionConfigSchema, session.configJson, defaultConfig());
  const language = config.language ?? "id";
  const transcript = parseJsonWithSchema(transcriptSchema, session.transcriptJson, {
    language,
    segments: []
  });
  const highlights = await findHighlights({
    router,
    transcript,
    prompt: config.prompt,
    targetCount: 8
  });
  await context.log("Highlight analysis completed", { count: highlights.length });

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
        hookText: highlight.hookText
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
  if (!session.downloadedPath) {
    throw new Error("No source video path available");
  }

  const settings = await getSettings();
  const config = parseJsonWithSchema(sessionConfigSchema, session.configJson, defaultConfig());
  const language = config.language ?? "id";
  const transcript = parseJsonWithSchema(transcriptSchema, session.transcriptJson, {
    language,
    segments: []
  });
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

  await db.session.update({
    where: { id: sessionId },
    data: {
      stage: "rendering"
    }
  });

  for (const highlightRecord of highlights) {
    const highlight: Highlight = {
      startTime: highlightRecord.startTime,
      endTime: highlightRecord.endTime,
      title: highlightRecord.title,
      description: highlightRecord.description ?? undefined,
      viralityScore: highlightRecord.viralityScore ?? undefined,
      selected: highlightRecord.selected,
      hookText: highlightRecord.hookText ?? undefined
    };

    const output = await renderer.render({
      sessionId,
      sourcePath: session.downloadedPath,
      highlightId: highlightRecord.id,
      highlight,
      transcript,
      captionStyle: captionPreset.config
    });
    await context.log("Clip rendered", {
      clipId: output.clipId,
      title: highlight.title,
      duration: output.duration
    });

    await db.clip.create({
      data: {
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
        captionBurned: true,
        sessionId,
        highlightId: highlightRecord.id
      }
    });

    await db.highlight.update({
      where: { id: highlightRecord.id },
      data: { status: "rendered" }
    });
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
    processingStart: 0,
    faceTrackingMode: "center_crop",
    language: "id"
  };
}

async function transcribeOrFallback(params: {
  sessionId: string;
  audioPath: string;
  language: string;
  durationSeconds: number;
  captionConfig: Parameters<typeof transcribeAudioWithOpenAICompatible>[0]["config"];
  log: JobContext["log"];
}): Promise<Transcript> {
  if (!params.captionConfig.apiKey) {
    await params.log("No transcription API key configured; using fallback transcript", {
      sessionId: params.sessionId
    });
    return createFallbackTranscript({
      durationSeconds: params.durationSeconds,
      language: params.language,
      label: "No API key"
    });
  }

  try {
    await params.log("Transcribing audio with configured AI provider", {
      language: params.language
    });
    return await transcribeAudioWithOpenAICompatible({
      audioPath: params.audioPath,
      config: params.captionConfig,
      language: params.language
    });
  } catch (error) {
    await params.log("AI transcription failed; using fallback transcript", {
      error: serializeError(error)
    });
    return createFallbackTranscript({
      durationSeconds: params.durationSeconds,
      language: params.language,
      label: "Transcription fallback"
    });
  }
}
