import "server-only";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { absoluteStorageRoot } from "@/server/config/env";
import { db } from "@/server/db/client";
import { ensureStorageLayout, outputPath, safeJoin, sessionPath, storagePath, tempPath } from "./paths";

export type CleanupOptions = {
  temp?: boolean;
  failedArtifacts?: boolean;
  sourceVideos?: boolean;
};

export async function getStorageStats() {
  await ensureStorageLayout();
  const [storageBytes, tempBytes, outputBytes, sessionCount, clipCount] = await Promise.all([
    directorySize(absoluteStorageRoot),
    directorySize(tempPath()),
    directorySize(outputPath()),
    db.session.count(),
    db.clip.count()
  ]);

  return {
    storageRoot: absoluteStorageRoot,
    storageBytes,
    tempBytes,
    outputBytes,
    sessionCount,
    clipCount,
    storageLabel: formatBytes(storageBytes),
    tempLabel: formatBytes(tempBytes),
    outputLabel: formatBytes(outputBytes)
  };
}

export async function cleanupStorage(options: CleanupOptions) {
  await ensureStorageLayout();
  let removedBytes = 0;
  const removedPaths: string[] = [];

  if (options.temp) {
    removedBytes += await removeContents(tempPath(), removedPaths);
    const sessions = await db.session.findMany({ select: { id: true } });
    for (const session of sessions) {
      removedBytes += await removeContents(sessionPath(session.id, "temp"), removedPaths);
    }
  }

  if (options.failedArtifacts) {
    const failedSessions = await db.session.findMany({
      where: { status: { in: ["failed", "cancelled"] } },
      select: { id: true }
    });
    for (const session of failedSessions) {
      removedBytes += await removeContents(sessionPath(session.id, "clips"), removedPaths);
    }
  }

  if (options.sourceVideos) {
    const sessions = await db.session.findMany({
      where: { status: { in: ["completed", "partially_failed", "failed"] } },
      select: { id: true, downloadedPath: true }
    });
    for (const session of sessions) {
      const files = await readdir(sessionPath(session.id)).catch(() => []);
      for (const file of files.filter((item) => /^source\.|^audio\./i.test(item))) {
        const target = sessionPath(session.id, file);
        removedBytes += await removePath(target, removedPaths);
      }
      if (session.downloadedPath) {
        await db.session.update({
          where: { id: session.id },
          data: { downloadedPath: null }
        });
      }
    }
  }

  return {
    removedBytes,
    removedLabel: formatBytes(removedBytes),
    removedPaths
  };
}

export async function openOutputDirectory(outputDirectory: string) {
  const target = path.resolve(/* turbopackIgnore: true */ process.cwd(), outputDirectory);
  await mkdir(target, { recursive: true });

  const command =
    process.platform === "win32" ? "explorer.exe" : process.platform === "darwin" ? "open" : "xdg-open";
  const child = spawn(command, [target], {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
  return { path: target };
}

async function directorySize(root: string): Promise<number> {
  const safeRoot = safeJoin(absoluteStorageRoot, path.relative(absoluteStorageRoot, root));
  const entries = await readdir(safeRoot, { withFileTypes: true }).catch(() => []);
  let total = 0;

  for (const entry of entries) {
    const fullPath = safeJoin(safeRoot, entry.name);
    if (entry.isDirectory()) {
      total += await directorySize(fullPath);
    } else {
      total += (await stat(fullPath).catch(() => ({ size: 0 }))).size;
    }
  }

  return total;
}

async function removeContents(root: string, removedPaths: string[]) {
  const safeRoot = safeJoin(absoluteStorageRoot, path.relative(absoluteStorageRoot, root));
  const entries = await readdir(safeRoot, { withFileTypes: true }).catch(() => []);
  let removedBytes = 0;

  for (const entry of entries) {
    removedBytes += await removePath(path.join(safeRoot, entry.name), removedPaths);
  }

  return removedBytes;
}

async function removePath(target: string, removedPaths: string[]) {
  const safeTarget = safeJoin(absoluteStorageRoot, path.relative(absoluteStorageRoot, target));
  const size = await directorySizeOrFileSize(safeTarget);
  await rm(safeTarget, { recursive: true, force: true });
  removedPaths.push(path.relative(storagePath(), safeTarget));
  return size;
}

async function directorySizeOrFileSize(target: string) {
  const info = await stat(target).catch(() => null);
  if (!info) {
    return 0;
  }
  if (!info.isDirectory()) {
    return info.size;
  }
  return directorySize(target);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`;
}
