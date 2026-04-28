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
  hasAudio?: boolean;
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
    const audio = parsed.streams?.find((stream) => stream.codec_type === "audio");

    return {
      durationSeconds: Number(parsed.format?.duration ?? 0),
      width: video?.width,
      height: video?.height,
      fps: parseFps(video?.r_frame_rate),
      hasAudio: Boolean(audio)
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
  const seekStart = Math.max(0, start - 5);
  const innerSeek = Math.max(0, start - seekStart);
  await runProcess(getFfmpegCommand(), [
    "-y",
    "-ss",
    String(seekStart),
    "-i",
    inputPath,
    "-ss",
    String(innerSeek),
    "-t",
    String(Math.max(0.1, end - start)),
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
    "-c:v",
    "libx264",
    "-crf",
    "20",
    "-preset",
    "veryfast",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-movflags",
    "+faststart",
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

export async function cutAndCropPortraitSegment(
  inputPath: string,
  outputPath: string,
  start: number,
  end: number,
  options: MediaProcessOptions = {}
) {
  const seekStart = Math.max(0, start - 5);
  const innerSeek = Math.max(0, start - seekStart);
  await runProcess(getFfmpegCommand(), [
    "-y",
    "-ss",
    String(seekStart),
    "-i",
    inputPath,
    "-ss",
    String(innerSeek),
    "-t",
    String(Math.max(0.1, end - start)),
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
    "-vf",
    "crop=min(iw\\,ih*9/16):min(ih\\,iw*16/9):(iw-ow)/2:(ih-oh)/2,scale=1080:1920",
    "-c:v",
    "libx264",
    "-crf",
    "22",
    "-preset",
    "veryfast",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-movflags",
    "+faststart",
    "-avoid_negative_ts",
    "make_zero",
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

export type HookFreezeIntroResult = {
  hookDurationSeconds: number;
  clipDurationSeconds: number;
  outputDurationSeconds: number;
};

export async function prependHookAudioWithFreeze(
  inputPath: string,
  hookAudioPath: string,
  outputPath: string,
  options: MediaProcessOptions = {}
): Promise<HookFreezeIntroResult> {
  const [inputProbe, hookProbe] = await Promise.all([
    probeMedia(inputPath),
    probeMedia(hookAudioPath)
  ]);
  const clipDurationSeconds = Math.max(0.1, inputProbe.durationSeconds || 0);
  const hookDurationSeconds = Math.max(0.1, hookProbe.durationSeconds || 0);

  await runProcess(
    getFfmpegCommand(),
    buildHookFreezeIntroArgs({
      inputPath,
      hookAudioPath,
      outputPath,
      clipDurationSeconds,
      hookDurationSeconds,
      inputHasAudio: Boolean(inputProbe.hasAudio)
    }),
    { jobId: options.jobId, onLine: options.onLine }
  );

  const outputProbe = await probeMedia(outputPath);
  return {
    hookDurationSeconds,
    clipDurationSeconds,
    outputDurationSeconds: outputProbe.durationSeconds || hookDurationSeconds + clipDurationSeconds
  };
}

export function buildHookFreezeIntroArgs(input: {
  inputPath: string;
  hookAudioPath: string;
  outputPath: string;
  clipDurationSeconds: number;
  hookDurationSeconds: number;
  inputHasAudio: boolean;
}) {
  const clipDuration = formatFfmpegSeconds(input.clipDurationSeconds);
  const hookDuration = formatFfmpegSeconds(input.hookDurationSeconds);
  const clipAudio = input.inputHasAudio
    ? "[0:a]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:" +
      "channel_layouts=stereo,volume=1.0[clip]"
    : `anullsrc=r=48000:cl=stereo,atrim=0:${clipDuration},asetpts=PTS-STARTPTS[clip]`;
  return [
    "-y",
    "-i",
    input.inputPath,
    "-i",
    input.hookAudioPath,
    "-filter_complex",
    [
      `[0:v]tpad=start_duration=${hookDuration}:start_mode=clone,setpts=PTS-STARTPTS[v]`,
      "[1:a]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:" +
        "channel_layouts=stereo,volume=1.0[hook]",
      clipAudio,
      "[hook][clip]concat=n=2:v=0:a=1[a]"
    ].join(";"),
    "-map",
    "[v]",
    "-map",
    "[a]",
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
    "-movflags",
    "+faststart",
    "-shortest",
    input.outputPath
  ];
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

function formatFfmpegSeconds(value: number) {
  return Math.max(0, value).toFixed(3);
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
      height: sizeMatch ? Number(sizeMatch[2]) : undefined,
      hasAudio: /Audio:/i.test(message)
    };
  }

  return { durationSeconds: 60 };
}
