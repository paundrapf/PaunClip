import "server-only";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { absoluteStorageRoot } from "@/server/config/env";

export async function createFileResponse(filePath: string, options: {
  downloadName?: string;
  contentType?: string;
} = {}) {
  assertInsideStorage(filePath);
  const info = await stat(filePath);
  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>;
  const headers = new Headers({
    "Content-Length": String(info.size),
    "Content-Type": options.contentType ?? "application/octet-stream",
    "Cache-Control": "private, max-age=60"
  });

  if (options.downloadName) {
    headers.set("Content-Disposition", `attachment; filename="${sanitizeFileName(options.downloadName)}"`);
  }

  return new Response(stream, { headers });
}

function assertInsideStorage(filePath: string) {
  const resolved = path.resolve(filePath).toLowerCase();
  const root = path.resolve(absoluteStorageRoot).toLowerCase();
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("File path escapes storage root");
  }
}

function sanitizeFileName(value: string) {
  return value.replace(/[^a-z0-9._-]/gi, "_");
}
