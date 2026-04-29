import "server-only";
import { mkdir, readFile, readdir, unlink } from "node:fs/promises";
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

export async function downloadYoutubeVideoSection(params: {
  url: string;
  outputDir: string;
  startTime: number;
  endTime: number;
  paddingBefore?: number;
  paddingAfter?: number;
  cookiesPath?: string;
  jobId?: string;
  onLog?: DownloadLog;
  onProgress?: DownloadProgress;
}) {
  await mkdir(params.outputDir, { recursive: true });
  const sectionStartTime = Math.max(0, params.startTime - (params.paddingBefore ?? 6));
  const sectionEndTime = Math.max(sectionStartTime + 1, params.endTime + (params.paddingAfter ?? 4));
  const outputTemplate = path.join(params.outputDir, "source.%(ext)s");
  const section = `*${formatYoutubeSectionTime(sectionStartTime)}-${formatYoutubeSectionTime(sectionEndTime)}`;
  const attempts: DownloadAttempt[] = [
    {
      label: "1080p section video/audio",
      format: "bv*[height<=1080]+ba/b[height<=1080]/b"
    },
    {
      label: "720p section video/audio fallback",
      format: "bv*[height<=720]+ba/b[height<=720]/b"
    },
    {
      label: "mp4 section single-file fallback",
      format: "best[ext=mp4][height<=1080]/best[ext=mp4]/best[height<=1080]/best"
    }
  ];
  const attemptResults: DownloadAttemptResult[] = [];

  for (const attempt of attempts) {
    await cleanPreviousSourceFiles(params.outputDir);
    await params.onLog?.("yt-dlp section download attempt started", {
      label: attempt.label,
      format: attempt.format,
      section,
      sectionStartTime,
      sectionEndTime
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
          "--download-sections",
          section,
          "--force-keyframes-at-cuts",
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
          timeoutMs: 20 * 60_000,
          idleTimeoutMs: 90_000,
          heartbeatMs: 15_000,
          jobId: params.jobId,
          onHeartbeat: ({ elapsedMs, idleMs }) =>
            params.onLog?.("yt-dlp section download heartbeat", {
              elapsedSeconds: Math.round(elapsedMs / 1000),
              idleSeconds: Math.round(idleMs / 1000),
              label: attempt.label
            }),
          onLine: async (event) => {
            const progress = parseYtdlpProgress(event);
            if (!progress) {
              if (shouldLogYtdlpLine(event.line)) {
                await params.onLog?.("yt-dlp section output", {
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
        throw new Error("yt-dlp finished but no section video file was created.");
      }

      attemptResults.push({ ...attempt, ok: true });
      await params.onLog?.("yt-dlp section download attempt completed", {
        label: attempt.label,
        outputPath: sourcePath,
        sectionStartTime,
        sectionEndTime
      });
      return {
        sourcePath,
        sectionStartTime,
        sectionEndTime
      };
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
      await params.onLog?.("yt-dlp section download attempt failed", {
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
      "mp3",
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

  const audioPath = path.join(params.outputDir, "audio.mp3");
  return audioPath;
}

export async function fetchChannelVideos(params: {
  channelUrl: string;
  limit: number;
  contentType?: "videos" | "shorts" | "all";
  cookiesPath?: string;
}) {
  const urls = normalizeYoutubeChannelTargets(params.channelUrl, params.contentType ?? "videos");
  const seen = new Set<string>();
  const videos: Array<{
    videoId: string;
    title: string;
    videoUrl: string;
    durationSeconds?: number;
    thumbnailUrl?: string;
    publishedAt?: Date;
  }> = [];

  for (const url of urls) {
    const result = await runProcess(
      getYtdlpCommand(),
      [
        "--flat-playlist",
        "--dump-single-json",
        "--playlist-end",
        String(params.limit),
        ...youtubeChallengeArgs,
        ...(params.cookiesPath ? ["--cookies", params.cookiesPath] : []),
        url
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
        timestamp?: number;
        upload_date?: string;
      }>;
    };

    for (const entry of parsed.entries ?? []) {
      if (!entry.id || seen.has(entry.id)) {
        continue;
      }
      seen.add(entry.id);
      videos.push({
        videoId: entry.id,
        title: entry.title,
        videoUrl: entry.url?.startsWith("http")
          ? entry.url
          : `https://www.youtube.com/watch?v=${entry.id}`,
        durationSeconds: entry.duration,
        thumbnailUrl: deriveYoutubeThumbnailUrl(entry.id, entry.thumbnail),
        publishedAt: parseYoutubePublishedAt(entry.timestamp, entry.upload_date)
      });
      if (videos.length >= params.limit) {
        break;
      }
    }

    if (videos.length >= params.limit) {
      break;
    }
  }

  return videos.sort((a, b) => {
    const aTime = a.publishedAt?.getTime() ?? 0;
    const bTime = b.publishedAt?.getTime() ?? 0;
    return bTime - aTime;
  });
}

export function deriveYoutubeThumbnailUrl(videoId: string, providedThumbnail?: string) {
  if (providedThumbnail?.trim()) {
    return providedThumbnail;
  }
  return youtubeThumbnailCandidates(videoId)[0];
}

export function youtubeThumbnailCandidates(videoId: string) {
  const encodedVideoId = encodeURIComponent(videoId);
  return [
    `https://i.ytimg.com/vi/${encodedVideoId}/hqdefault.jpg`,
    `https://i.ytimg.com/vi/${encodedVideoId}/mqdefault.jpg`
  ];
}

export function normalizeYoutubeChannelTargets(
  channelUrl: string,
  contentType: "videos" | "shorts" | "all" = "videos"
) {
  const trimmed = channelUrl.trim();
  if (/^@[\w.-]+$/i.test(trimmed)) {
    return buildYoutubeTabTargets(`https://www.youtube.com/${trimmed}`, contentType);
  }

  const url = parseYoutubeUrl(trimmed);
  if (!url) {
    return [trimmed];
  }

  const hasPlaylist = url.searchParams.has("list") || url.pathname.startsWith("/playlist");
  if (hasPlaylist) {
    return [url.toString()];
  }

  const cleanPath = url.pathname.replace(/\/+$/, "");
  const withoutTab = cleanPath.replace(/\/(videos|shorts|streams|featured|playlists)$/i, "");
  return buildYoutubeTabTargets(`${url.origin}${withoutTab || cleanPath || "/"}`, contentType);
}

function buildYoutubeTabTargets(baseUrl: string, contentType: "videos" | "shorts" | "all") {
  const base = baseUrl.replace(/\/$/, "");
  const targets =
    contentType === "all"
      ? [`${base}/videos`, `${base}/shorts`]
      : [`${base}/${contentType}`];

  return targets.map((target) => target.replace("://www.youtube.com//", "://www.youtube.com/"));
}

function parseYoutubeUrl(value: string) {
  try {
    const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const url = new URL(withProtocol);
    if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$/i.test(url.hostname)) {
      return undefined;
    }
    if (/youtu\.be$/i.test(url.hostname)) {
      return url;
    }
    url.hostname = "www.youtube.com";
    return url;
  } catch {
    return undefined;
  }
}

function parseYoutubePublishedAt(timestamp?: number, uploadDate?: string) {
  if (timestamp) {
    return new Date(timestamp * 1000);
  }
  const match = uploadDate?.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!match) {
    return undefined;
  }
  return new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
}

function formatYoutubeSectionTime(value: number) {
  const totalMillis = Math.max(0, Math.round(value * 1000));
  const hours = Math.floor(totalMillis / 3_600_000);
  const minutes = Math.floor((totalMillis % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMillis % 60_000) / 1000);
  const millis = totalMillis % 1000;
  return `${padTime(hours)}:${padTime(minutes)}:${padTime(seconds)}.${String(millis).padStart(3, "0")}`;
}

function padTime(value: number) {
  return String(value).padStart(2, "0");
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
