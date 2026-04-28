import "server-only";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  burnAssSubtitles,
  cutAndCropPortraitSegment,
  extractAudio,
  generateThumbnail,
  prependHookAudioWithFreeze,
  probeMedia
} from "@/server/media/ffmpeg";
import { buildAssSubtitles } from "@/server/captions/ass-renderer";
import { getFileSizeMb } from "@/server/storage/files";
import { sessionPath } from "@/server/storage/paths";
import { transcribeAudioWithOpenAICompatible } from "@/server/transcription/openai-transcriber";
import { sliceTranscript } from "@/server/transcription/srt";
import { providerSupportsCapability } from "@/shared/constants/ai-providers";
import type { ClipRenderer, RenderClipInput } from "./types";

export class FfmpegClipRenderer implements ClipRenderer {
  async render(input: RenderClipInput) {
    const clipId = input.clipId ?? `clip_${randomUUID()}`;
    const clipDir = input.versionId
      ? sessionPath(input.sessionId, "clips", clipId, "versions", input.versionId)
      : sessionPath(input.sessionId, "clips", clipId);
    await mkdir(clipDir, { recursive: true });

    const portraitPath = path.join(clipDir, "portrait.mp4");
    const assPath = path.join(clipDir, "captions.ass");
    const captionAudioPath = path.join(clipDir, "caption-audio.wav");
    const renderTranscriptPath = path.join(clipDir, "render-transcript.json");
    const captionedPath = path.join(clipDir, "captioned.mp4");
    const masterPath = path.join(clipDir, "master.mp4");
    const thumbnailPath = path.join(clipDir, "thumbnail.jpg");
    const duration = input.highlight.endTime - input.highlight.startTime;

    await cutAndCropPortraitSegment(
      input.sourcePath,
      portraitPath,
      input.highlight.startTime,
      input.highlight.endTime,
      { jobId: input.jobId }
    );

    const fallbackTranscript = sliceTranscript(
      input.transcript,
      input.highlight.startTime,
      input.highlight.endTime
    );
    const clipTranscript = await this.buildRenderTranscript({
      mediaPath: portraitPath,
      audioPath: captionAudioPath,
      fallbackTranscript,
      renderTranscriptPath,
      input
    });
    const ass = buildAssSubtitles(clipTranscript, {
      width: 1080,
      height: 1920,
      style: input.captionStyle,
      hookText: input.highlight.hookText,
      captionOffsetMs: input.captionOffsetMs ?? 0
    });
    await writeFile(assPath, ass, "utf8");

    let captionBurned = true;
    try {
      await burnAssSubtitles(portraitPath, assPath, captionedPath, { jobId: input.jobId });
    } catch {
      captionBurned = false;
      await copyFile(portraitPath, captionedPath);
    }

    let hookAdded = false;
    let hookDurationSeconds = 0;
    let outputDuration = duration;
    if (input.hookAudioPath) {
      try {
        const hookIntro = await prependHookAudioWithFreeze(
          captionedPath,
          input.hookAudioPath,
          masterPath,
          { jobId: input.jobId }
        );
        hookDurationSeconds = hookIntro.hookDurationSeconds;
        outputDuration = hookIntro.outputDurationSeconds;
        hookAdded = true;
        await input.onLog?.("Hook intro prepended with frozen video", {
          hookDurationSeconds: hookIntro.hookDurationSeconds,
          clipDurationSeconds: hookIntro.clipDurationSeconds,
          outputDurationSeconds: hookIntro.outputDurationSeconds
        });
      } catch {
        await input.onLog?.("Hook intro render failed; clip will render without hook audio");
        await copyFile(captionedPath, masterPath);
      }
    } else {
      await copyFile(captionedPath, masterPath);
    }

    if (!hookAdded) {
      const outputProbe = await probeMedia(masterPath);
      outputDuration = outputProbe.durationSeconds || duration;
    }

    const thumbnailAt = hookAdded
      ? Math.max(0.5, hookDurationSeconds + duration / 2)
      : Math.max(0.5, duration / 2);
    const safeThumbnailAt = Math.max(0.1, Math.min(Math.max(0.1, outputDuration - 0.1), thumbnailAt));
    await generateThumbnail(masterPath, thumbnailPath, safeThumbnailAt, {
      jobId: input.jobId
    });

    return {
      clipId,
      masterPath,
      thumbnailPath,
      duration: outputDuration,
      fileSizeMb: await getFileSizeMb(masterPath),
      captionBurned,
      hookAdded
    };
  }

  private async buildRenderTranscript(params: {
    mediaPath: string;
    audioPath: string;
    fallbackTranscript: ReturnType<typeof sliceTranscript>;
    renderTranscriptPath: string;
    input: RenderClipInput;
  }) {
    const captionConfig = params.input.captionConfig;
    if (!captionConfig?.apiKey) {
      await params.input.onLog?.("Render caption alignment skipped; caption provider API key is missing", {
        captionSource: "analysis_fallback"
      });
      await writeFile(
        params.renderTranscriptPath,
        JSON.stringify(
          {
            source: "analysis_fallback",
            reason: "caption provider api key is not configured",
            transcript: params.fallbackTranscript
          },
          null,
          2
        ),
        "utf8"
      );
      return params.fallbackTranscript;
    }

    if (!providerSupportsCapability(captionConfig, "transcription")) {
      await params.input.onLog?.(
        "Render caption alignment skipped; caption provider does not support audio transcription",
        {
          captionSource: "analysis_fallback",
          provider: captionConfig.provider,
          model: captionConfig.model
        }
      );
      await writeFile(
        params.renderTranscriptPath,
        JSON.stringify(
          {
            source: "analysis_fallback",
            reason: "caption provider does not support audio transcription",
            transcript: params.fallbackTranscript
          },
          null,
          2
        ),
        "utf8"
      );
      return params.fallbackTranscript;
    }

    try {
      await extractAudio(params.mediaPath, params.audioPath, { jobId: params.input.jobId });
      const transcript = await transcribeAudioWithOpenAICompatible({
        audioPath: params.audioPath,
        config: captionConfig,
        language: params.input.language
      });
      await writeFile(
        params.renderTranscriptPath,
        JSON.stringify({ source: "render_audio", transcript }, null, 2),
        "utf8"
      );
      await params.input.onLog?.("Render caption alignment completed from clip audio", {
        captionSource: "render_audio",
        provider: captionConfig.provider,
        model: captionConfig.model,
        segments: transcript.segments.length
      });
      return transcript;
    } catch (error) {
      await params.input.onLog?.("Render caption alignment failed; using estimated transcript timing", {
        captionSource: "analysis_fallback",
        provider: captionConfig.provider,
        model: captionConfig.model,
        error: error instanceof Error ? error.message : String(error)
      });
      await writeFile(
        params.renderTranscriptPath,
        JSON.stringify(
          {
            source: "analysis_fallback",
            reason: error instanceof Error ? error.message : String(error),
            transcript: params.fallbackTranscript
          },
          null,
          2
        ),
        "utf8"
      );
      return params.fallbackTranscript;
    }
  }
}
