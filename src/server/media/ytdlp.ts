import "server-only";
import { readFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { ACCEPTED_VIDEO_EXTENSIONS } from "@/shared/constants/app";
import type { Transcript } from "@/shared/schemas/session";
import { parseSrt, parseVtt } from "@/server/transcription/srt";
import { ProcessError, runProcess, truncateOutput, type ProcessLine } from "./process";
import { getFfmpegCommand, getYtdlpCommand } from "./tool-resolver";

export type YoutubeMetadata = {
  id: string;
  title: string;
  channel?: string;
  duration?: number;
  thumbnail?: string;
  webpage_url?: string;
};

type DownloadAttempt = {
  label: string;
  format: string;
};

type DownloadAttemptResult = DownloadAttempt & {
  ok: boolean;
  exitCode?: number;
  output?: string;
};

type YoutubeSubtitleResult = {
  transcript: Transcript;
  subtitlePath: string;
  source: "manual" | "auto";
};

type DownloadLog = (message: string, data?: Record<string, unknown>) => Promise<void> | void;
type DownloadProgress = (progress: {
  percent?: number;
  speed?: string;
  eta?: string;
  line: string;
}) => Promise<void> | void;

export class YoutubeDownloadError extends Error {
  constructor(
    message: string,
    public readonly attempts: DownloadAttemptResult[],
    public readonly advice: string[]
  ) {
    super(message);
    this.name = "YoutubeDownloadError";
  }
}

const videoExtensions = new Set<string>(ACCEPTED_VIDEO_EXTENSIONS);
const subtitleExtensions = new Set([".srt", ".vtt"]);
const youtubeChallengeArgs = [
  "--js-runtimes",
  "node",
  "--remote-components",
  "ejs:github",
  "--extractor-args",
  "youtube:player_client=default,android,ios,web"
];

export async function getYoutubeMetadata(url: string, cookiesPath?: string) {
  const args = [
    "--dump-single-json",
    "--no-playlist",
    "--skip-download",
    ...youtubeChallengeArgs,
    ...(cookiesPath ? ["--cookies", cookiesPath] : []),
    url
  ];
  const result = await runProcess(getYtdlpCommand(), args, { timeoutMs: 120_000 });
  return JSON.parse(result.stdout) as YoutubeMetadata;
}

export async function downloadYoutubeVideo(params: {
  url: string;
  outputDir: string;
  cookiesPath?: string;
  jobId?: string;
  onLog?: DownloadLog;
  onProgress?: DownloadProgress;
}) {
  const outputTemplate = path.join(params.outputDir, "source.%(ext)s");
  const attempts: DownloadAttempt[] = [
    {
      label: "1080p merged video/audio",
      format: "bv*[height<=1080]+ba/b[height<=1080]/b"
    },
    {
      label: "720p merged video/audio fallback",
      format: "bv*[height<=720]+ba/b[height<=720]/b"
    },
    {
      label: "best separated video/audio fallback",
      format: "bv*+ba/b"
    },
    {
      label: "mp4 single-file fallback",
      format: "best[ext=mp4][height<=1080]/best[ext=mp4]/best[height<=1080]/best"
    }
  ];
  const attemptResults: DownloadAttemptResult[] = [];

  for (const attempt of attempts) {
    await cleanPreviousSourceFiles(params.outputDir);
    await params.onLog?.("yt-dlp download attempt started", {
      label: attempt.label,
      format: attempt.format
    });

    try {
      let lastProgressPercent = -1;
      await runProcess(
        getYtdlpCommand(),
        [
          "--no-playlist",
          "--newline",
          ...youtubeChallengeArgs,
          "-f",
          attempt.format,
          "--ffmpeg-location",
          getFfmpegCommand(),
          "--merge-output-format",
          "mp4",
          "--remux-video",
          "mp4",
          "-o",
          outputTemplate,
          ...(params.cookiesPath ? ["--cookies", params.cookiesPath] : []),
          params.url
        ],
        {
          timeoutMs: 30 * 60_000,
          idleTimeoutMs: 90_000,
          heartbeatMs: 15_000,
          jobId: params.jobId,
          onHeartbeat: ({ elapsedMs, idleMs }) =>
            params.onLog?.("yt-dlp download heartbeat", {
              elapsedSeconds: Math.round(elapsedMs / 1000),
              idleSeconds: Math.round(idleMs / 1000),
              label: attempt.label
            }),
          onLine: async (event) => {
            const progress = parseYtdlpProgress(event);
            if (!progress) {
              if (shouldLogYtdlpLine(event.line)) {
                await params.onLog?.("yt-dlp output", {
                  stream: event.stream,
                  line: truncateOutput(event.line, 500)
                });
              }
              return;
            }

            const percent = progress.percent ?? 0;
            if (Math.floor(percent) > Math.floor(lastProgressPercent)) {
              lastProgressPercent = percent;
              await params.onProgress?.(progress);
            }
          }
        }
      );

      const sourcePath = await findDownloadedSource(params.outputDir);
      if (!sourcePath) {
        throw new Error("yt-dlp finished but no downloadable video file was created.");
      }

      attemptResults.push({ ...attempt, ok: true });
      await params.onLog?.("yt-dlp download attempt completed", {
        label: attempt.label,
        outputPath: sourcePath
      });
      return sourcePath;
    } catch (error) {
      const output =
        error instanceof ProcessError
          ? truncateOutput(error.result.stderr || error.result.stdout)
          : error instanceof Error
            ? error.message
            : String(error);
      attemptResults.push({
        ...attempt,
        ok: false,
        exitCode: error instanceof ProcessError ? error.result.exitCode : undefined,
        output
      });
      await params.onLog?.("yt-dlp download attempt failed", {
        label: attempt.label,
        output
      });
    }
  }

  throw createYoutubeDownloadError(attemptResults);
}

export async function fetchYoutubeTranscript(params: {
  url: string;
  outputDir: string;
  language: string;
  cookiesPath?: string;
  jobId?: string;
  onLog?: DownloadLog;
}): Promise<YoutubeSubtitleResult | null> {
  await cleanPreviousSubtitleFiles(params.outputDir);
  const outputTemplate = path.join(params.outputDir, "subtitle.%(ext)s");
  const subLangs = buildSubtitleLanguageList(params.language);

  await params.onLog?.("Fetching YouTube subtitles before downloading source video", {
    language: params.language,
    subLangs
  });

  try {
    await runProcess(
      getYtdlpCommand(),
      [
        "--no-playlist",
        "--skip-download",
        "--write-subs",
        "--write-auto-subs",
        "--sub-langs",
        subLangs,
        "--sub-format",
        "srt/vtt/best",
        ...youtubeChallengeArgs,
        "-o",
        outputTemplate,
        ...(params.cookiesPath ? ["--cookies", params.cookiesPath] : []),
        params.url
      ],
      {
        timeoutMs: 180_000,
        idleTimeoutMs: 60_000,
        heartbeatMs: 15_000,
        jobId: params.jobId,
        onHeartbeat: ({ elapsedMs, idleMs }) =>
          params.onLog?.("yt-dlp subtitle heartbeat", {
            elapsedSeconds: Math.round(elapsedMs / 1000),
            idleSeconds: Math.round(idleMs / 1000)
          }),
        onLine: async (event) => {
          if (shouldLogYtdlpLine(event.line)) {
            await params.onLog?.("yt-dlp subtitle output", {
              stream: event.stream,
              line: truncateOutput(event.line, 500)
            });
          }
        }
      }
    );
  } catch (error) {
    await params.onLog?.("YouTube subtitle fetch failed; PaunClip will use transcription fallback", {
      error:
        error instanceof ProcessError
          ? truncateOutput(error.result.stderr || error.result.stdout)
          : error instanceof Error
            ? error.message
            : String(error)
    });
    return null;
  }

  const subtitlePath = await findDownloadedSubtitle(params.outputDir);
  if (!subtitlePath) {
    await params.onLog?.("No YouTube subtitle file found; PaunClip will use transcription fallback");
    return null;
  }

  const transcript = await parseSubtitleFile(subtitlePath, params.language);
  if (transcript.segments.length === 0) {
    await params.onLog?.("YouTube subtitle file was empty; PaunClip will use transcription fallback", {
      subtitlePath
    });
    return null;
  }

  await params.onLog?.("YouTube transcript loaded from subtitles", {
    subtitlePath,
    segments: transcript.segments.length
  });

  return {
    transcript,
    subtitlePath,
    source: "auto"
  };
}

export async function downloadYoutubeAudio(params: {
  url: string;
  outputDir: string;
  cookiesPath?: string;
  jobId?: string;
  onLog?: DownloadLog;
}) {
  await cleanPreviousAudioFiles(params.outputDir);
  const outputTemplate = path.join(params.outputDir, "audio.%(ext)s");
  await params.onLog?.("Downloading YouTube audio for transcription fallback");

  await runProcess(
    getYtdlpCommand(),
    [
      "--no-playlist",
      "--newline",
      ...youtubeChallengeArgs,
      "-f",
      "ba/bestaudio/b",
      "--extract-audio",
      "--audio-format",
      "wav",
      "--ffmpeg-location",
      getFfmpegCommand(),
      "-o",
      outputTemplate,
      ...(params.cookiesPath ? ["--cookies", params.cookiesPath] : []),
      params.url
    ],
    {
      timeoutMs: 20 * 60_000,
      idleTimeoutMs: 90_000,
      heartbeatMs: 15_000,
      jobId: params.jobId,
      onHeartbeat: ({ elapsedMs, idleMs }) =>
        params.onLog?.("yt-dlp audio heartbeat", {
          elapsedSeconds: Math.round(elapsedMs / 1000),
          idleSeconds: Math.round(idleMs / 1000)
        }),
      onLine: async (event) => {
        if (shouldLogYtdlpLine(event.line)) {
          await params.onLog?.("yt-dlp audio output", {
            stream: event.stream,
            line: truncateOutput(event.line, 500)
          });
        }
      }
    }
  );

  const audioPath = path.join(params.outputDir, "audio.wav");
  return audioPath;
}

export async function fetchChannelVideos(params: {
  channelUrl: string;
  limit: number;
  cookiesPath?: string;
}) {
  const result = await runProcess(
    getYtdlpCommand(),
    [
      "--flat-playlist",
      "--dump-single-json",
      "--playlist-end",
      String(params.limit),
      ...youtubeChallengeArgs,
      ...(params.cookiesPath ? ["--cookies", params.cookiesPath] : []),
      params.channelUrl
    ],
    { timeoutMs: 180_000 }
  );
  const parsed = JSON.parse(result.stdout) as {
    entries?: Array<{
      id: string;
      title: string;
      url: string;
      duration?: number;
      thumbnail?: string;
    }>;
  };

  return (parsed.entries ?? []).map((entry) => ({
    videoId: entry.id,
    title: entry.title,
    videoUrl: entry.url?.startsWith("http")
      ? entry.url
      : `https://www.youtube.com/watch?v=${entry.id}`,
    durationSeconds: entry.duration,
    thumbnailUrl: entry.thumbnail
  }));
}

async function cleanPreviousSourceFiles(outputDir: string) {
  const files = await readdir(outputDir).catch(() => []);
  await Promise.all(
    files
      .filter((file) => file.startsWith("source."))
      .map((file) => unlink(path.join(outputDir, file)).catch(() => undefined))
  );
}

async function cleanPreviousSubtitleFiles(outputDir: string) {
  const files = await readdir(outputDir).catch(() => []);
  await Promise.all(
    files
      .filter((file) => file.startsWith("subtitle."))
      .map((file) => unlink(path.join(outputDir, file)).catch(() => undefined))
  );
}

async function cleanPreviousAudioFiles(outputDir: string) {
  const files = await readdir(outputDir).catch(() => []);
  await Promise.all(
    files
      .filter((file) => file.startsWith("audio."))
      .map((file) => unlink(path.join(outputDir, file)).catch(() => undefined))
  );
}

async function findDownloadedSource(outputDir: string) {
  const files = await readdir(outputDir);
  const source = files.find((file) => {
    const parsed = path.parse(file);
    return parsed.name === "source" && videoExtensions.has(parsed.ext.toLowerCase());
  });
  return source ? path.join(outputDir, source) : null;
}

async function findDownloadedSubtitle(outputDir: string) {
  const files = await readdir(outputDir);
  const candidates = files.filter((file) => {
    const parsed = path.parse(file);
    return (
      (parsed.name === "subtitle" || parsed.name.startsWith("subtitle.")) &&
      subtitleExtensions.has(parsed.ext.toLowerCase())
    );
  });
  const subtitle = candidates.sort((a, b) => scoreSubtitleName(b) - scoreSubtitleName(a))[0];
  return subtitle ? path.join(outputDir, subtitle) : null;
}

async function parseSubtitleFile(subtitlePath: string, language: string) {
  const content = await readFile(subtitlePath, "utf8");
  const ext = path.extname(subtitlePath).toLowerCase();
  return ext === ".vtt" ? parseVtt(content, language) : parseSrt(content, language);
}

function buildSubtitleLanguageList(language: string) {
  const normalized = language.trim().toLowerCase() || "id";
  const roots = new Set([normalized, normalized.split("-")[0] ?? normalized, "id", "en"]);
  return Array.from(roots)
    .filter(Boolean)
    .flatMap((lang) => [lang, `${lang}.*`])
    .join(",");
}

function scoreSubtitleName(fileName: string) {
  let score = 0;
  if (fileName.endsWith(".srt")) {
    score += 10;
  }
  if (/\.(id|id-[^.]+)\./i.test(fileName)) {
    score += 5;
  }
  if (/\.(en|en-[^.]+)\./i.test(fileName)) {
    score += 2;
  }
  return score;
}

function createYoutubeDownloadError(attempts: DownloadAttemptResult[]) {
  const lastOutput = attempts
    .slice()
    .reverse()
    .find((attempt) => attempt.output)?.output;
  const combinedOutput = attempts.map((attempt) => attempt.output ?? "").join(" ");
  const needsAuth = /sign in|login|cookies|confirm|bot|captcha|challenge|not available/i.test(
    combinedOutput
  );
  const formatMissing = /requested format is not available|only images are available/i.test(
    combinedOutput
  );
  const reason = needsAuth
    ? "YouTube membatasi akses format video untuk URL ini."
    : formatMissing
      ? "yt-dlp tidak menemukan format video yang bisa diunduh untuk URL ini."
      : "yt-dlp gagal mengunduh video dari URL ini.";
  const advice = [
    "Pastikan yt-dlp sudah versi terbaru dan memiliki komponen yt-dlp-ejs.",
    "Pastikan Node.js bisa dipanggil dari terminal yang menjalankan npm run dev.",
    "Upload cookies.txt YouTube di Settings kalau video butuh login, age gate, atau terkena bot/challenge.",
    "Kalau YouTube tetap membatasi format, gunakan upload video lokal sebagai fallback development."
  ];

  return new YoutubeDownloadError(
    `${reason} Detail terakhir: ${lastOutput ?? "tidak ada output dari yt-dlp."}`,
    attempts,
    advice
  );
}

function parseYtdlpProgress(event: ProcessLine) {
  if (!event.line.includes("[download]")) {
    return null;
  }

  const percentMatch = event.line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/i);
  if (!percentMatch) {
    return null;
  }

  const speedMatch = event.line.match(/\bat\s+([^\s]+\/s)/i);
  const etaMatch = event.line.match(/\bETA\s+([^\s]+)/i);

  return {
    percent: Number(percentMatch[1]),
    speed: speedMatch?.[1],
    eta: etaMatch?.[1],
    line: event.line
  };
}

function shouldLogYtdlpLine(line: string) {
  return /\[youtube\]|warning|error|download destination|merging formats|deleting original|has already been downloaded|extracting url/i.test(
    line
  );
}
