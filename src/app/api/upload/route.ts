import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { NextResponse } from "next/server";
import { env } from "@/server/config/env";
import { probeMedia } from "@/server/media/ffmpeg";
import { ACCEPTED_VIDEO_EXTENSIONS } from "@/shared/constants/app";
import { createUploadId, createSessionFileName, uploadPath } from "@/server/storage/paths";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!request.body) {
    return NextResponse.json({ error: "Missing request body" }, { status: 400 });
  }

  const rawFileName = request.headers.get("x-file-name") ?? "source.mp4";
  const extension = path.extname(rawFileName).toLowerCase();
  if (!ACCEPTED_VIDEO_EXTENSIONS.includes(extension as (typeof ACCEPTED_VIDEO_EXTENSIONS)[number])) {
    return NextResponse.json({ error: "Unsupported video extension" }, { status: 400 });
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > env.MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `Upload is too large. Max size is ${formatBytes(env.MAX_UPLOAD_BYTES)}.` },
      { status: 413 }
    );
  }

  const uploadId = createUploadId();
  const dir = uploadPath(uploadId);
  await mkdir(dir, { recursive: true });
  const fileName = createSessionFileName("source", extension);
  const destination = uploadPath(uploadId, fileName);

  const body = request.body as unknown as NodeReadableStream<Uint8Array>;
  try {
    await pipeline(
      Readable.fromWeb(body),
      createByteLimitTransform(env.MAX_UPLOAD_BYTES),
      createWriteStream(destination, { flags: "wx" })
    );
    const probe = await probeMedia(destination);
    if (!probe.width || !probe.height || probe.durationSeconds <= 0) {
      throw new Error("Uploaded file is not a readable video.");
    }
  } catch (error) {
    await unlink(destination).catch(() => undefined);
    const message = error instanceof Error ? error.message : "Upload failed";
    const status = message.includes("too large") ? 413 : 400;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({
    uploadId,
    fileName,
    storedPath: destination
  });
}

function createByteLimitTransform(maxBytes: number) {
  let seenBytes = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      seenBytes += chunk.byteLength;
      if (seenBytes > maxBytes) {
        callback(new Error(`Upload is too large. Max size is ${formatBytes(maxBytes)}.`));
        return;
      }
      callback(null, chunk);
    }
  });
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${Math.round(bytes / 1024 / 1024)}MB`;
  }
  return `${bytes}B`;
}
