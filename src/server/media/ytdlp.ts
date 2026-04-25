import "server-only";
import { readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { env } from "@/server/config/env";
import { ACCEPTED_VIDEO_EXTENSIONS } from "@/shared/constants/app";
import { ProcessError, runProcess, truncateOutput } from "./process";

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

type DownloadLog = (message: string, data?: Record<string, unknown>) => Promise<void> | void;

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
  const result = await runProcess(env.YTDLP_PATH, args, { timeoutMs: 120_000 });
  return JSON.parse(result.stdout) as YoutubeMetadata;
}

export async function downloadYoutubeVideo(params: {
  url: string;
  outputDir: string;
  cookiesPath?: string;
  onLog?: DownloadLog;
}) {
  const outputTemplate = path.join(params.outputDir, "source.%(ext)s");
  const attempts: DownloadAttempt[] = [
    {
      label: "1080p merged video/audio",
      format: "bv*[height<=1080]+ba/b[height<=1080]/b"
    },
    {
      label: "best merged video/audio",
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
      await runProcess(
        env.YTDLP_PATH,
        [
          "--no-playlist",
          "--no-progress",
          ...youtubeChallengeArgs,
          "-f",
          attempt.format,
          "--merge-output-format",
          "mp4",
          "--remux-video",
          "mp4",
          "-o",
          outputTemplate,
          ...(params.cookiesPath ? ["--cookies", params.cookiesPath] : []),
          params.url
        ],
        { timeoutMs: 30 * 60_000 }
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

export async function fetchChannelVideos(params: {
  channelUrl: string;
  limit: number;
  cookiesPath?: string;
}) {
  const result = await runProcess(
    env.YTDLP_PATH,
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

async function findDownloadedSource(outputDir: string) {
  const files = await readdir(outputDir);
  const source = files.find((file) => {
    const parsed = path.parse(file);
    return parsed.name === "source" && videoExtensions.has(parsed.ext.toLowerCase());
  });
  return source ? path.join(outputDir, source) : null;
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
