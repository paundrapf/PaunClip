import "server-only";
import path from "node:path";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import {
  absoluteLogDir,
  absoluteOutputDir,
  absoluteStorageRoot,
  env,
  isDesktopRuntime
} from "@/server/config/env";
import { DEFAULT_OUTPUT_DIR } from "@/shared/constants/app";

const legacyOutputValues = new Set([
  DEFAULT_OUTPUT_DIR.replace(/\\/g, "/"),
  "./storage/output",
  "storage/output"
]);

export function resolveOutputDirectory(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed || isLegacyOutputDirectory(trimmed)) {
    return absoluteOutputDir;
  }
  if (path.isAbsolute(trimmed)) {
    return path.normalize(trimmed);
  }
  return path.resolve(absoluteStorageRoot, trimmed);
}

export function normalizeOutputDirectorySetting(value?: string | null) {
  return resolveOutputDirectory(value);
}

export function isLegacyOutputDirectory(value: string) {
  const normalized = value.replace(/\\/g, "/").replace(/\/+$/g, "");
  return legacyOutputValues.has(normalized);
}

export function getRuntimeInfo() {
  return {
    mode: isDesktopRuntime ? "desktop" : "development",
    storageRoot: absoluteStorageRoot,
    outputDirectory: absoluteOutputDir,
    logDirectory: absoluteLogDir,
    databasePath: resolveDatabasePath(env.DATABASE_URL),
    desktop: isDesktopRuntime
  };
}

export async function ensureDirectoryWritable(directory: string) {
  await mkdir(directory, { recursive: true });
  const probePath = path.join(directory, `.paunclip-write-test-${Date.now()}`);
  await writeFile(probePath, "ok", "utf8");
  await unlink(probePath).catch(() => undefined);
  return directory;
}

function resolveDatabasePath(databaseUrl: string) {
  if (!databaseUrl.startsWith("file:")) {
    return databaseUrl;
  }
  const value = databaseUrl.slice("file:".length);
  const normalized = value.replace(/\//g, path.sep);
  return path.isAbsolute(normalized)
    ? path.normalize(normalized)
    : path.resolve(process.cwd(), normalized);
}
