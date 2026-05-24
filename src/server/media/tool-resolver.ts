import "server-only";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { existsSync } from "node:fs";
import path from "node:path";
import { env } from "@/server/config/env";
import { runProcess } from "./process";

type ResolvedTool = {
  command: string;
  source: "env" | "package" | "bundled" | "path" | "fallback";
};

export function getFfmpegCommand() {
  return resolveTool({
    envValue: env.FFMPEG_PATH,
    packageValue: ffmpegStatic || undefined,
    fallback: "ffmpeg",
    binaryNames: process.platform === "win32" ? ["ffmpeg.exe", "ffmpeg"] : ["ffmpeg"]
  }).command;
}

export function getFfprobeCommand() {
  const packageFfprobe =
    typeof ffprobeStatic === "string" ? ffprobeStatic : ffprobeStatic.path;
  const ffmpegCommand = getFfmpegCommand();
  const ffmpegSibling =
    path.isAbsolute(ffmpegCommand) || ffmpegCommand.includes(path.sep)
      ? path.join(path.dirname(ffmpegCommand), process.platform === "win32" ? "ffprobe.exe" : "ffprobe")
      : undefined;

  return resolveTool({
    envValue: env.FFPROBE_PATH,
    packageValue: packageFfprobe || ffmpegSibling,
    fallback: "ffprobe",
    binaryNames: process.platform === "win32" ? ["ffprobe.exe", "ffprobe"] : ["ffprobe"]
  }).command;
}

export function getYtdlpCommand() {
  return resolveTool({
    envValue: env.YTDLP_PATH,
    bundledValues: getYtdlpBundleCandidates(),
    fallback: "yt-dlp",
    binaryNames: process.platform === "win32" ? ["yt-dlp.exe", "yt-dlp"] : ["yt-dlp"]
  }).command;
}

export async function checkTool(command: string, args: string[] = ["--version"]) {
  try {
    const result = await runProcess(command, args, { timeoutMs: 20_000 });
    return {
      ok: true,
      command,
      version: (result.stdout || result.stderr).trim().split(/\r?\n/)[0] ?? ""
    };
  } catch (error) {
    return {
      ok: false,
      command,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function checkYtdlpCommand(command = getYtdlpCommand()) {
  const version = await checkTool(command, ["--version"]);
  if (!version.ok) {
    return {
      ...version,
      supportsJsRuntimes: false,
      message: version.error ?? "yt-dlp could not run."
    };
  }

  try {
    const result = await runProcess(command, ["--help"], { timeoutMs: 20_000 });
    const helpText = `${result.stdout}\n${result.stderr}`;
    const support = parseYtdlpFeatureSupport(helpText);
    if (!support.jsRuntimes) {
      return {
        ...version,
        ok: false,
        supportsJsRuntimes: false,
        message:
          "yt-dlp is too old for PaunClip's YouTube challenge solver. Re-run the installer so bundled yt-dlp is used."
      };
    }

    return {
      ...version,
      supportsJsRuntimes: true,
      message: version.version
    };
  } catch (error) {
    return {
      ...version,
      ok: false,
      supportsJsRuntimes: false,
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

export function parseYtdlpFeatureSupport(helpText: string) {
  return {
    jsRuntimes: helpText.includes("--js-runtimes")
  };
}

export function resolveTool(params: {
  envValue?: string;
  packageValue?: string;
  bundledValues?: Array<string | undefined>;
  fallback: string;
  binaryNames: string[];
}): ResolvedTool {
  const envValue = params.envValue?.trim();
  if (envValue) {
    if (looksLikePath(envValue) && existsSync(envValue)) {
      return { command: envValue, source: "env" };
    }
    if (!looksLikePath(envValue) && findOnPath([envValue])) {
      return { command: envValue, source: "env" };
    }
  }

  if (params.packageValue && looksUsablePath(params.packageValue)) {
    return { command: params.packageValue, source: "package" };
  }

  for (const bundledValue of params.bundledValues ?? []) {
    if (bundledValue && looksUsablePath(bundledValue)) {
      return { command: bundledValue, source: "bundled" };
    }
  }

  const pathCommand = findOnPath(params.binaryNames);
  if (pathCommand) {
    return { command: pathCommand, source: "path" };
  }

  return { command: envValue || params.fallback, source: "fallback" };
}

export function getBundledYtdlpPath(input: {
  root?: string;
  resourcesPath?: string;
  platform?: NodeJS.Platform;
  arch?: string;
} = {}) {
  const platform = input.platform ?? process.platform;
  const arch = input.arch ?? process.arch;
  const binaryName = platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
  const root = input.root ?? process.cwd();
  const resourcesPath =
    input.resourcesPath ??
    (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;

  return {
    source: path.resolve(root, "vendor", "bin", platform, arch, binaryName),
    desktop: resourcesPath
      ? path.resolve(resourcesPath, "bin", platform, arch, binaryName)
      : undefined
  };
}

function getYtdlpBundleCandidates() {
  const bundled = getBundledYtdlpPath();
  return [bundled.source, bundled.desktop];
}

function looksUsablePath(value: string) {
  return !value.startsWith("\\ROOT\\") && existsSync(value);
}

function looksLikePath(value: string) {
  return path.isAbsolute(value) || value.includes("/") || value.includes("\\");
}

function findOnPath(binaryNames: string[]) {
  const paths = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const dir of paths) {
    for (const binary of binaryNames) {
      const candidate = path.join(dir, binary);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}
