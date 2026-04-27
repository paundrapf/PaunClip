import "server-only";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  burnAssSubtitles,
  centerCropPortrait,
  cutSegment,
  generateThumbnail,
  mixHookAudio
} from "@/server/media/ffmpeg";
import { buildAssSubtitles } from "@/server/captions/ass-renderer";
import { getFileSizeMb } from "@/server/storage/files";
import { sessionPath } from "@/server/storage/paths";
import { normalizeTranscriptForShorts } from "@/server/transcription/normalize-transcript";
import { sliceTranscript } from "@/server/transcription/srt";
import type { ClipRenderer, RenderClipInput } from "./types";

export class FfmpegClipRenderer implements ClipRenderer {
  async render(input: RenderClipInput) {
    const clipId = input.clipId ?? `clip_${randomUUID()}`;
    const clipDir = input.versionId
      ? sessionPath(input.sessionId, "clips", clipId, "versions", input.versionId)
      : sessionPath(input.sessionId, "clips", clipId);
    await mkdir(clipDir, { recursive: true });

    const rawPath = path.join(clipDir, "raw.mp4");
    const portraitPath = path.join(clipDir, "portrait.mp4");
    const assPath = path.join(clipDir, "captions.ass");
    const captionedPath = path.join(clipDir, "captioned.mp4");
    const masterPath = path.join(clipDir, "master.mp4");
    const thumbnailPath = path.join(clipDir, "thumbnail.jpg");
    const duration = input.highlight.endTime - input.highlight.startTime;

    await cutSegment(input.sourcePath, rawPath, input.highlight.startTime, input.highlight.endTime, {
      jobId: input.jobId
    });
    await centerCropPortrait(rawPath, portraitPath, { jobId: input.jobId });

    const clipTranscript = normalizeTranscriptForShorts(
      sliceTranscript(input.transcript, input.highlight.startTime, input.highlight.endTime)
    );
    const ass = buildAssSubtitles(clipTranscript, {
      width: 1080,
      height: 1920,
      style: input.captionStyle,
      hookText: input.highlight.hookText
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
    if (input.hookAudioPath) {
      try {
        await mixHookAudio(captionedPath, input.hookAudioPath, masterPath, { jobId: input.jobId });
        hookAdded = true;
      } catch {
        await copyFile(captionedPath, masterPath);
      }
    } else {
      await copyFile(captionedPath, masterPath);
    }

    await generateThumbnail(masterPath, thumbnailPath, Math.max(0.5, duration / 2), {
      jobId: input.jobId
    });

    return {
      clipId,
      masterPath,
      thumbnailPath,
      duration,
      fileSizeMb: await getFileSizeMb(masterPath),
      captionBurned,
      hookAdded
    };
  }
}
