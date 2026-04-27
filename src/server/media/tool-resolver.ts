import "server-only";
import ffmpegStatic from "ffmpeg-static";
import { existsSync } from "node:fs";
import path from "node:path";
import { env } from "@/server/config/env";
import { runProcess } from "./process";

type ResolvedTool = {
  command: string;
  source: "env" | "package" | "path" | "fallback";
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
  const ffmpegCommand = getFfmpegCommand();
  const ffmpegSibling =
    path.isAbsolute(ffmpegCommand) || ffmpegCommand.includes(path.sep)
      ? path.join(path.dirname(ffmpegCommand), process.platform === "win32" ? "ffprobe.exe" : "ffprobe")
      : undefined;

  return resolveTool({
    envValue: env.FFPROBE_PATH,
    packageValue: ffmpegSibling,
    fallback: "ffprobe",
    binaryNames: process.platform === "win32" ? ["ffprobe.exe", "ffprobe"] : ["ffprobe"]
  }).command;
}

export function getYtdlpCommand() {
  return resolveTool({
    envValue: env.YTDLP_PATH,
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

function resolveTool(params: {
  envValue?: string;
  packageValue?: string;
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

  const pathCommand = findOnPath(params.binaryNames);
  if (pathCommand) {
    return { command: pathCommand, source: "path" };
  }

  return { command: envValue || params.fallback, source: "fallback" };
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
