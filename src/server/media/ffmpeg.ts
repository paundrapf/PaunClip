import "server-only";
import path from "node:path";
import { runProcess, type ProcessLine } from "./process";
import { getFfmpegCommand, getFfprobeCommand } from "./tool-resolver";

type MediaProcessOptions = {
  jobId?: string;
  onLine?: (event: ProcessLine) => void;
};

export type MediaProbe = {
  durationSeconds: number;
  width?: number;
  height?: number;
  fps?: number;
};

export async function probeMedia(inputPath: string): Promise<MediaProbe> {
  try {
    const result = await runProcess(
      getFfprobeCommand(),
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

export async function extractAudio(
  inputPath: string,
  outputPath: string,
  options: MediaProcessOptions = {}
) {
  await runProcess(getFfmpegCommand(), [
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
  ], { jobId: options.jobId, onLine: options.onLine });
}

export async function cutSegment(
  inputPath: string,
  outputPath: string,
  start: number,
  end: number,
  options: MediaProcessOptions = {}
) {
  await runProcess(getFfmpegCommand(), [
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
  ], { jobId: options.jobId, onLine: options.onLine });
}

export async function centerCropPortrait(
  inputPath: string,
  outputPath: string,
  options: MediaProcessOptions = {}
) {
  await runProcess(getFfmpegCommand(), [
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
  ], { jobId: options.jobId, onLine: options.onLine });
}

export async function burnAssSubtitles(
  inputPath: string,
  assPath: string,
  outputPath: string,
  options: MediaProcessOptions = {}
) {
  const assDir = path.dirname(assPath);
  const assFileName = path.basename(assPath);
  await runProcess(getFfmpegCommand(), [
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
  ], { cwd: assDir, jobId: options.jobId, onLine: options.onLine });
}

export async function mixHookAudio(
  inputPath: string,
  hookAudioPath: string,
  outputPath: string,
  options: MediaProcessOptions = {}
) {
  await runProcess(getFfmpegCommand(), [
    "-y",
    "-i",
    inputPath,
    "-i",
    hookAudioPath,
    "-filter_complex",
    "[0:a]volume=0.35[a0];[1:a]volume=1.0[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=0[a]",
    "-map",
    "0:v",
    "-map",
    "[a]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    outputPath
  ], { jobId: options.jobId, onLine: options.onLine });
}

export async function generateThumbnail(
  inputPath: string,
  outputPath: string,
  atSeconds: number,
  options: MediaProcessOptions = {}
) {
  await runProcess(getFfmpegCommand(), [
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
  ], { jobId: options.jobId, onLine: options.onLine });
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
    await runProcess(getFfmpegCommand(), ["-i", inputPath], { timeoutMs: 60_000 });
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
