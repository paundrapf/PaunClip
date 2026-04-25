import "server-only";
import ffmpegStatic from "ffmpeg-static";
import path from "node:path";
import { env } from "@/server/config/env";
import { runProcess } from "./process";

const ffmpegPath = env.FFMPEG_PATH || ffmpegStatic || "ffmpeg";
const ffprobePath = env.FFPROBE_PATH || "ffprobe";

export type MediaProbe = {
  durationSeconds: number;
  width?: number;
  height?: number;
  fps?: number;
};

export async function probeMedia(inputPath: string): Promise<MediaProbe> {
  try {
    const result = await runProcess(
      ffprobePath,
      [
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        inputPath
      ],
      { timeoutMs: 60_000 }
    );
    const parsed = JSON.parse(result.stdout) as {
      format?: { duration?: string };
      streams?: Array<{
        codec_type?: string;
        width?: number;
        height?: number;
        r_frame_rate?: string;
      }>;
    };
    const video = parsed.streams?.find((stream) => stream.codec_type === "video");

    return {
      durationSeconds: Number(parsed.format?.duration ?? 0),
      width: video?.width,
      height: video?.height,
      fps: parseFps(video?.r_frame_rate)
    };
  } catch {
    return probeMediaWithFfmpeg(inputPath);
  }
}

export async function extractAudio(inputPath: string, outputPath: string) {
  await runProcess(ffmpegPath, [
    "-y",
    "-i",
    inputPath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "pcm_s16le",
    outputPath
  ]);
}

export async function cutSegment(inputPath: string, outputPath: string, start: number, end: number) {
  await runProcess(ffmpegPath, [
    "-y",
    "-ss",
    String(start),
    "-i",
    inputPath,
    "-t",
    String(Math.max(0.1, end - start)),
    "-c",
    "copy",
    "-avoid_negative_ts",
    "make_zero",
    outputPath
  ]);
}

export async function centerCropPortrait(inputPath: string, outputPath: string) {
  await runProcess(ffmpegPath, [
    "-y",
    "-i",
    inputPath,
    "-vf",
    "crop=min(iw\\,ih*9/16):min(ih\\,iw*16/9):(iw-ow)/2:(ih-oh)/2,scale=1080:1920",
    "-c:v",
    "libx264",
    "-crf",
    "23",
    "-preset",
    "fast",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    outputPath
  ]);
}

export async function burnAssSubtitles(inputPath: string, assPath: string, outputPath: string) {
  const assDir = path.dirname(assPath);
  const assFileName = path.basename(assPath);
  await runProcess(ffmpegPath, [
    "-y",
    "-i",
    inputPath,
    "-vf",
    `ass=${assFileName}`,
    "-c:v",
    "libx264",
    "-crf",
    "23",
    "-preset",
    "fast",
    "-c:a",
    "copy",
    outputPath
  ], { cwd: assDir });
}

export async function generateThumbnail(inputPath: string, outputPath: string, atSeconds: number) {
  await runProcess(ffmpegPath, [
    "-y",
    "-ss",
    String(atSeconds),
    "-i",
    inputPath,
    "-vframes",
    "1",
    "-q:v",
    "2",
    outputPath
  ]);
}

function parseFps(value?: string) {
  if (!value) {
    return undefined;
  }
  const [num, den] = value.split("/").map(Number);
  if (!num || !den) {
    return undefined;
  }
  return num / den;
}

async function probeMediaWithFfmpeg(inputPath: string): Promise<MediaProbe> {
  try {
    await runProcess(ffmpegPath, ["-i", inputPath], { timeoutMs: 60_000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const durationMatch = message.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    const sizeMatch = message.match(/,\s*(\d{2,5})x(\d{2,5})[\s,]/);
    return {
      durationSeconds: durationMatch
        ? Number(durationMatch[1]) * 3600 +
          Number(durationMatch[2]) * 60 +
          Number(durationMatch[3])
        : 60,
      width: sizeMatch ? Number(sizeMatch[1]) : undefined,
      height: sizeMatch ? Number(sizeMatch[2]) : undefined
    };
  }

  return { durationSeconds: 60 };
}
