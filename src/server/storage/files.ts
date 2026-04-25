import "server-only";
import { stat, rm, readdir } from "node:fs/promises";
import path from "node:path";
import { ensureStorageLayout, safeJoin } from "./paths";
import { absoluteStorageRoot } from "@/server/config/env";

export async function fileExists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function removeFileIfExists(filePath: string) {
  if (await fileExists(filePath)) {
    await rm(filePath, { force: true });
  }
}

export async function cleanupExpiredFiles(root: string, maxAgeMs: number) {
  await ensureStorageLayout();
  const safeRoot = safeJoin(absoluteStorageRoot, path.relative(absoluteStorageRoot, root));
  const entries = await readdir(safeRoot, { withFileTypes: true });
  const now = Date.now();

  await Promise.all(
    entries.map(async (entry) => {
      const fullPath = safeJoin(safeRoot, entry.name);
      const info = await stat(fullPath);
      if (now - info.mtimeMs < maxAgeMs) {
        return;
      }

      await rm(fullPath, { recursive: entry.isDirectory(), force: true });
    })
  );
}

export async function getFileSizeMb(filePath: string) {
  const info = await stat(filePath);
  return Math.round((info.size / 1024 / 1024) * 100) / 100;
}
