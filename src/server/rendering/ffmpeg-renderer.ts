import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  burnAssSubtitles,
  centerCropPortrait,
  cutSegment,
  generateThumbnail
} from "@/server/media/ffmpeg";
import { buildAssSubtitles } from "@/server/captions/ass-renderer";
import { getFileSizeMb } from "@/server/storage/files";
import { sessionPath } from "@/server/storage/paths";
import { sliceTranscript } from "@/server/transcription/srt";
import type { ClipRenderer, RenderClipInput } from "./types";

export class FfmpegClipRenderer implements ClipRenderer {
  async render(input: RenderClipInput) {
    const clipId = `clip_${randomUUID()}`;
    const clipDir = sessionPath(input.sessionId, "clips", clipId);
    await mkdir(clipDir, { recursive: true });

    const rawPath = path.join(clipDir, "raw.mp4");
    const portraitPath = path.join(clipDir, "portrait.mp4");
    const assPath = path.join(clipDir, "captions.ass");
    const masterPath = path.join(clipDir, "master.mp4");
    const thumbnailPath = path.join(clipDir, "thumbnail.jpg");
    const duration = input.highlight.endTime - input.highlight.startTime;

    await cutSegment(input.sourcePath, rawPath, input.highlight.startTime, input.highlight.endTime);
    await centerCropPortrait(rawPath, portraitPath);

    const clipTranscript = sliceTranscript(
      input.transcript,
      input.highlight.startTime,
      input.highlight.endTime
    );
    const ass = buildAssSubtitles(clipTranscript, {
      width: 1080,
      height: 1920,
      style: input.captionStyle
    });
    await writeFile(assPath, ass, "utf8");

    await burnAssSubtitles(portraitPath, assPath, masterPath);
    await generateThumbnail(masterPath, thumbnailPath, Math.max(0.5, duration / 2));

    return {
      clipId,
      masterPath,
      thumbnailPath,
      duration,
      fileSizeMb: await getFileSizeMb(masterPath)
    };
  }
}
