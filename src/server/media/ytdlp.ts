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
  clientProfile?: YoutubeClientProfile;
  forceKeyframes?: boolean;
  ffmpegCommand?: string;
};

type DownloadAttemptResult = DownloadAttempt & {
  ok: boolean;
  exitCode?: number;
  output?: string;
  failureKind?: YtdlpFailureKind;
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
    public readonly advice: string[],
    public readonly primaryFailureKind: YtdlpFailureKind
  ) {
    super(message);
    this.name = "YoutubeDownloadError";
  }
}

export type YtdlpFailureKind =
  | "bot_challenge"
  | "cookies_invalid"
  | "po_token_required"
  | "format_unavailable"
  | "ffmpeg_crash"
  | "network_or_unknown";

export type YoutubeClientProfile =
  | "android"
  | "ios"
  | "web"
  | "default,android,ios,web";

export type YoutubeLiveProbeStep = {
  ok: boolean;
  label: string;
  failureKind?: YtdlpFailureKind;
  message?: string;
  clientProfile?: YoutubeClientProfile;
};

export type YoutubeLiveReadiness = {
  ok: boolean;
  checkedAt: string;
  url: string;
  metadata: YoutubeLiveProbeStep;
  subtitles: YoutubeLiveProbeStep;
  media: YoutubeLiveProbeStep;
  advice: string[];
};

const videoExtensions = new Set<string>(ACCEPTED_VIDEO_EXTENSIONS);
const subtitleExtensions = new Set([".srt", ".vtt"]);
const defaultYoutubeClientProfile: YoutubeClientProfile = "default,android,ios,web";
const mediaClientProfiles: YoutubeClientProfile[] = [
  "android",
  "ios",
  "web",
  "default,android,ios,web"
];

function youtubeChallengeArgs(clientProfile: YoutubeClientProfile = defaultYoutubeClientProfile) {
  return [
    "--js-runtimes",
    "node",
    "--remote-components",
    "ejs:github",
    "--extractor-args",
    `youtube:player_client=${clientProfile}`
  ];
}

export async function getYoutubeMetadata(url: string, cookiesPath?: string) {
  const args = [
    "--dump-single-json",
    "--no-playlist",
    "--skip-download",
    ...youtubeChallengeArgs(),
    ...(cookiesPath ? ["--cookies", cookiesPath] : []),
    url
  ];
  const result = await runProcess(getYtdlpCommand(), args, { timeoutMs: 120_000 });
  return JSON.parse(result.stdout) as YoutubeMetadata;
}

export async function probeYoutubeAccess(
  params: {
    url: string;
    cookiesPath?: string;
  },
  runner: typeof runProcess = runProcess
): Promise<YoutubeLiveReadiness> {
  const metadata = await runProbeStep(
    "YouTube metadata",
    [
      "--dump-single-json",
      "--no-playlist",
      "--skip-download",
      ...youtubeChallengeArgs(),
      ...(params.cookiesPath ? ["--cookies", params.cookiesPath] : []),
      params.url
    ],
    runner
  );

  const subtitles = await runProbeStep(
    "YouTube subtitles",
    [
      "--list-subs",
      "--no-playlist",
      ...youtubeChallengeArgs(),
      ...(params.cookiesPath ? ["--cookies", params.cookiesPath] : []),
      params.url
    ],
    runner
  );

  const media = await probeYoutubeMediaStream(params, runner);
  return {
    ok: metadata.ok && media.ok,
    checkedAt: new Date().toISOString(),
    url: params.url,
    metadata,
    subtitles,
    media,
    advice: buildYoutubeAdvice(selectPrimaryFailureKind([
      metadata.ok ? { label: metadata.label, format: "probe", ok: true } : {
        label: metadata.label,
        format: "probe",
        ok: false,
        failureKind: metadata.failureKind,
        output: metadata.message
      },
      subtitles.ok ? { label: subtitles.label, format: "probe", ok: true } : {
        label: subtitles.label,
        format: "probe",
        ok: false,
        failureKind: subtitles.failureKind,
        output: subtitles.message
      },
      media.ok ? { label: media.label, format: "probe", ok: true } : {
        label: media.label,
        format: "probe",
        ok: false,
        failureKind: media.failureKind,
        output: media.message
      }
    ]))
  };
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
  const formatAttempts: DownloadAttempt[] = [
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
  const skipClientProfiles = new Set<YoutubeClientProfile>();
  const attempts = mediaClientProfiles.flatMap((clientProfile) =>
    formatAttempts.map((attempt) => ({
      ...attempt,
      clientProfile
    }))
  );

  for (const attempt of attempts) {
    if (skipClientProfiles.has(attempt.clientProfile)) {
      continue;
    }

    await cleanPreviousSourceFiles(params.outputDir);
    await params.onLog?.("yt-dlp download attempt started", {
      label: attempt.label,
      format: attempt.format,
      clientProfile: attempt.clientProfile
    });

    try {
      let lastProgressPercent = -1;
      await runProcess(
        getYtdlpCommand(),
        [
          "--no-playlist",
          "--newline",
          ...youtubeChallengeArgs(attempt.clientProfile),
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
        outputPath: sourcePath,
        clientProfile: attempt.clientProfile
      });
      return {
        sourcePath,
        clientProfile: attempt.clientProfile
      };
    } catch (error) {
      const output =
        error instanceof ProcessError
          ? truncateOutput(error.result.stderr || error.result.stdout)
          : error instanceof Error
            ? error.message
            : String(error);
      const failureKind = classifyYtdlpFailure(output);
      attemptResults.push({
        ...attempt,
        ok: false,
        exitCode: error instanceof ProcessError ? error.result.exitCode : undefined,
        output,
        failureKind
      });
      await params.onLog?.("yt-dlp download attempt failed", {
        label: attempt.label,
        clientProfile: attempt.clientProfile,
        failureKind,
        output
      });

      if (isFatalYoutubeAccessFailure(failureKind)) {
        throw createYoutubeDownloadError(attemptResults);
      }
      if (shouldSkipRemainingFormatsForClient(failureKind)) {
        skipClientProfiles.add(attempt.clientProfile);
        await params.onLog?.("yt-dlp download client profile blocked; skipping remaining formats", {
          clientProfile: attempt.clientProfile,
          failureKind
        });
      }
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
  const formatAttempts: DownloadAttempt[] = [
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
  const primaryFfmpegCommand = getFfmpegCommand();
  const fallbackFfmpegCommands = await resolveFallbackFfmpegCommands(primaryFfmpegCommand);
  const skipClientProfiles = new Set<YoutubeClientProfile>();
  const attempts = mediaClientProfiles.flatMap((clientProfile) =>
    formatAttempts.map((attempt) => ({
      ...attempt,
      clientProfile
    }))
  );

  for (const baseAttempt of attempts) {
    if (skipClientProfiles.has(baseAttempt.clientProfile)) {
      continue;
    }

    const variants: DownloadAttempt[] = [
      {
        ...baseAttempt,
        forceKeyframes: true,
        ffmpegCommand: primaryFfmpegCommand
      }
    ];
    let fallbackFfmpegQueued = false;

    while (variants.length > 0) {
      const attempt = variants.shift()!;
      await cleanPreviousSourceFiles(params.outputDir);
      await params.onLog?.("yt-dlp section download attempt started", {
        label: attempt.label,
        format: attempt.format,
        clientProfile: attempt.clientProfile,
        forceKeyframes: attempt.forceKeyframes,
        ffmpegCommand: attempt.ffmpegCommand,
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
            ...youtubeChallengeArgs(attempt.clientProfile),
            "-f",
            attempt.format,
            "--download-sections",
            section,
            ...(attempt.forceKeyframes ? ["--force-keyframes-at-cuts"] : []),
            "--ffmpeg-location",
            attempt.ffmpegCommand ?? primaryFfmpegCommand,
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
                label: attempt.label,
                clientProfile: attempt.clientProfile
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
          clientProfile: attempt.clientProfile,
          forceKeyframes: attempt.forceKeyframes,
          ffmpegCommand: attempt.ffmpegCommand,
          sectionStartTime,
          sectionEndTime
        });
        return {
          sourcePath,
          sectionStartTime,
          sectionEndTime,
          clientProfile: attempt.clientProfile
        };
      } catch (error) {
        const output =
          error instanceof ProcessError
            ? truncateOutput(error.result.stderr || error.result.stdout)
            : error instanceof Error
              ? error.message
              : String(error);
        const failureKind = classifyYtdlpFailure(output);
        attemptResults.push({
          ...attempt,
          ok: false,
          exitCode: error instanceof ProcessError ? error.result.exitCode : undefined,
          output,
          failureKind
        });
        await params.onLog?.("yt-dlp section download attempt failed", {
          label: attempt.label,
          clientProfile: attempt.clientProfile,
          forceKeyframes: attempt.forceKeyframes,
          ffmpegCommand: attempt.ffmpegCommand,
          failureKind,
          output
        });

        if (isFatalYoutubeAccessFailure(failureKind)) {
          throw createYoutubeDownloadError(attemptResults);
        }
        if (attempt.clientProfile && shouldSkipRemainingFormatsForClient(failureKind)) {
          skipClientProfiles.add(attempt.clientProfile);
          await params.onLog?.("yt-dlp section client profile blocked; skipping remaining formats", {
            clientProfile: attempt.clientProfile,
            failureKind
          });
          break;
        }

        if (failureKind !== "ffmpeg_crash") {
          break;
        }

        if (attempt.forceKeyframes) {
          variants.unshift({
            ...baseAttempt,
            forceKeyframes: false,
            ffmpegCommand: attempt.ffmpegCommand
          });
          continue;
        }

        if (!fallbackFfmpegQueued) {
          fallbackFfmpegQueued = true;
          variants.unshift(
            ...fallbackFfmpegCommands.map((ffmpegCommand) => ({
              ...baseAttempt,
              forceKeyframes: false,
              ffmpegCommand
            }))
          );
        }
      }
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
        ...youtubeChallengeArgs(),
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
      ...youtubeChallengeArgs(),
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
        ...youtubeChallengeArgs(),
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

async function runProbeStep(
  label: string,
  args: string[],
  runner: typeof runProcess
): Promise<YoutubeLiveProbeStep> {
  try {
    await runner(getYtdlpCommand(), args, { timeoutMs: 120_000, idleTimeoutMs: 45_000 });
    return { ok: true, label };
  } catch (error) {
    const output = processErrorOutput(error);
    const failureKind = classifyYtdlpFailure(output);
    return {
      ok: false,
      label,
      failureKind,
      message: conciseYoutubeFailureMessage(failureKind, output)
    };
  }
}

async function probeYoutubeMediaStream(
  params: {
    url: string;
    cookiesPath?: string;
  },
  runner: typeof runProcess
): Promise<YoutubeLiveProbeStep> {
  const format = "bv*[height<=720]+ba/b[height<=720]/b";
  let lastFailure: YoutubeLiveProbeStep | undefined;

  for (const clientProfile of mediaClientProfiles) {
    try {
      await runner(
        getYtdlpCommand(),
        [
          "--get-url",
          "--no-playlist",
          "-f",
          format,
          ...youtubeChallengeArgs(clientProfile),
          ...(params.cookiesPath ? ["--cookies", params.cookiesPath] : []),
          params.url
        ],
        { timeoutMs: 120_000, idleTimeoutMs: 45_000 }
      );
      return {
        ok: true,
        label: "YouTube media download",
        clientProfile
      };
    } catch (error) {
      const output = processErrorOutput(error);
      const failureKind = classifyYtdlpFailure(output);
      lastFailure = {
        ok: false,
        label: "YouTube media download",
        clientProfile,
        failureKind,
        message: conciseYoutubeFailureMessage(failureKind, output)
      };
    }
  }

  return lastFailure ?? {
    ok: false,
    label: "YouTube media download",
    failureKind: "network_or_unknown",
    message: "YouTube media download probe failed without process output."
  };
}

async function resolveFallbackFfmpegCommands(primaryFfmpegCommand: string) {
  if (primaryFfmpegCommand === "ffmpeg" || process.platform === "win32") {
    return [];
  }

  try {
    await runProcess("ffmpeg", ["-version"], { timeoutMs: 10_000 });
    return ["ffmpeg"];
  } catch {
    return [];
  }
}

function processErrorOutput(error: unknown) {
  return error instanceof ProcessError
    ? truncateOutput(error.result.stderr || error.result.stdout)
    : error instanceof Error
      ? error.message
      : String(error);
}

export function classifyYtdlpFailure(output: string): YtdlpFailureKind {
  const normalized = output.toLowerCase();
  if (/cookies? (are )?no longer valid|rotated in the browser|cookie.*expired/.test(normalized)) {
    return "cookies_invalid";
  }
  if (/ffmpeg exited with code -?11|segmentation fault|signal 11|sigsegv/.test(normalized)) {
    return "ffmpeg_crash";
  }
  if (/sign in to confirm|not a bot|captcha|bot check|challenge|use --cookies-from-browser|use --cookies/.test(normalized)) {
    return "bot_challenge";
  }
  if (/po token|gvs po token/.test(normalized)) {
    return "po_token_required";
  }
  if (/requested format is not available|only images are available|no video formats found/.test(normalized)) {
    return "format_unavailable";
  }
  return "network_or_unknown";
}

function selectPrimaryFailureKind(attempts: DownloadAttemptResult[]): YtdlpFailureKind {
  const kinds = attempts.filter((attempt) => !attempt.ok).map((attempt) => attempt.failureKind);
  if (kinds.includes("cookies_invalid")) return "cookies_invalid";
  if (kinds.includes("bot_challenge")) return "bot_challenge";
  if (kinds.includes("ffmpeg_crash")) return "ffmpeg_crash";
  if (kinds.includes("po_token_required")) return "po_token_required";
  if (kinds.includes("format_unavailable")) return "format_unavailable";
  return "network_or_unknown";
}

function isFatalYoutubeAccessFailure(kind: YtdlpFailureKind) {
  return kind === "cookies_invalid";
}

function shouldSkipRemainingFormatsForClient(kind: YtdlpFailureKind) {
  return kind === "bot_challenge" || kind === "po_token_required";
}

function conciseYoutubeFailureMessage(kind: YtdlpFailureKind, output: string) {
  if (kind === "cookies_invalid") {
    return "YouTube cookies are expired or rotated. Export fresh cookies from the logged-in browser.";
  }
  if (kind === "bot_challenge") {
    return "YouTube blocked video download on this machine. Refresh cookies or run PaunClip on your local laptop.";
  }
  if (kind === "po_token_required") {
    return "YouTube requires a PO token for this media format/client.";
  }
  if (kind === "format_unavailable") {
    return "yt-dlp could not find a downloadable video format for this URL.";
  }
  if (kind === "ffmpeg_crash") {
    return "FFmpeg crashed while cutting a YouTube section. PaunClip will try a safer section fallback when possible.";
  }
  return truncateOutput(output || "yt-dlp failed without process output.", 500);
}

function buildYoutubeAdvice(kind: YtdlpFailureKind) {
  if (kind === "cookies_invalid") {
    return [
      "Export ulang cookies.txt dari browser yang sedang login YouTube.",
      "Jalankan `paunclip setup cookies --path <cookies.txt>`.",
      "Validasi ulang dengan `paunclip setup cookies validate-live <youtube-url>`."
    ];
  }
  if (kind === "bot_challenge") {
    return [
      "YouTube memblokir download video di mesin ini; VPS/datacenter IP lebih sering kena challenge.",
      "Refresh cookies dari browser laptop yang login YouTube.",
      "Jalankan `paunclip setup cookies --path <cookies.txt>`.",
      "Validasi ulang dengan `paunclip setup cookies validate-live <youtube-url>`.",
      "Kalau tetap gagal di VPS, jalankan render di aplikasi desktop/laptop lokal atau upload MP4 lokal."
    ];
  }
  if (kind === "ffmpeg_crash") {
    return [
      "Coba render ulang; PaunClip akan mencoba section cut tanpa force-keyframes dan fallback ffmpeg sistem jika ada.",
      "Kalau tetap gagal, gunakan full video/local upload sebagai fallback."
    ];
  }
  if (kind === "po_token_required") {
    return [
      "YouTube membatasi format client tertentu dengan PO token.",
      "Coba refresh cookies atau render dari laptop lokal."
    ];
  }
  return [
    "Jalankan `paunclip doctor --youtube-url <url>` untuk cek metadata, subtitle, dan media download.",
    "Pastikan koneksi stabil dan cookies masih fresh."
  ];
}

function createYoutubeDownloadError(attempts: DownloadAttemptResult[]) {
  const lastOutput = attempts
    .slice()
    .reverse()
    .find((attempt) => attempt.output)?.output;
  const primaryFailureKind = selectPrimaryFailureKind(attempts);
  const reason = conciseYoutubeFailureMessage(primaryFailureKind, lastOutput ?? "");
  const advice = buildYoutubeAdvice(primaryFailureKind);

  return new YoutubeDownloadError(
    reason,
    attempts,
    advice,
    primaryFailureKind
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
