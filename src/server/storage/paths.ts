import "server-only";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { absoluteStorageRoot } from "@/server/config/env";
import { STORAGE_DIRS } from "@/shared/constants/app";

export function storagePath(...segments: string[]) {
  return safeJoin(absoluteStorageRoot, ...segments);
}

export function sessionPath(sessionId: string, ...segments: string[]) {
  return storagePath(STORAGE_DIRS.sessions, sessionId, ...segments);
}

export function uploadPath(uploadId: string, ...segments: string[]) {
  return storagePath(STORAGE_DIRS.uploads, uploadId, ...segments);
}

export function tempPath(...segments: string[]) {
  return storagePath(STORAGE_DIRS.temp, ...segments);
}

export function configPath(...segments: string[]) {
  return storagePath(STORAGE_DIRS.config, ...segments);
}

export function outputPath(...segments: string[]) {
  return storagePath(STORAGE_DIRS.output, ...segments);
}

export async function ensureStorageLayout() {
  await Promise.all(
    Object.values(STORAGE_DIRS).map((dir) => mkdir(storagePath(dir), { recursive: true }))
  );
}

export async function ensureSessionLayout(sessionId: string) {
  const root = sessionPath(sessionId);
  await Promise.all([
    mkdir(root, { recursive: true }),
    mkdir(sessionPath(sessionId, "clips"), { recursive: true }),
    mkdir(sessionPath(sessionId, "logs"), { recursive: true }),
    mkdir(sessionPath(sessionId, "temp"), { recursive: true })
  ]);
  return root;
}

export function createUploadId() {
  return `upload_${randomUUID()}`;
}

export function createSessionFileName(base: string, extension: string) {
  const cleanBase = base.replace(/[^a-z0-9_-]/gi, "_").slice(0, 80) || "file";
  const cleanExt = extension.startsWith(".") ? extension : `.${extension}`;
  return `${cleanBase}${cleanExt}`;
}

export function safeJoin(root: string, ...segments: string[]) {
  const resolvedRoot = path.resolve(root);
  const candidate = path.resolve(resolvedRoot, ...segments);
  const normalizedRoot = withTrailingSeparator(resolvedRoot).toLowerCase();
  const normalizedCandidate = candidate.toLowerCase();

  if (
    normalizedCandidate !== resolvedRoot.toLowerCase() &&
    !normalizedCandidate.startsWith(normalizedRoot)
  ) {
    throw new Error("Resolved path escapes storage root");
  }

  return candidate;
}

function withTrailingSeparator(value: string) {
  return value.endsWith(path.sep) ? value : `${value}${path.sep}`;
}
