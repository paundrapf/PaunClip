import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { NextResponse } from "next/server";
import { ACCEPTED_VIDEO_EXTENSIONS } from "@/shared/constants/app";
import { createUploadId, createSessionFileName, uploadPath } from "@/server/storage/paths";

export async function POST(request: Request) {
  if (!request.body) {
    return NextResponse.json({ error: "Missing request body" }, { status: 400 });
  }

  const rawFileName = request.headers.get("x-file-name") ?? "source.mp4";
  const extension = path.extname(rawFileName).toLowerCase();
  if (!ACCEPTED_VIDEO_EXTENSIONS.includes(extension as (typeof ACCEPTED_VIDEO_EXTENSIONS)[number])) {
    return NextResponse.json({ error: "Unsupported video extension" }, { status: 400 });
  }

  const uploadId = createUploadId();
  const dir = uploadPath(uploadId);
  await mkdir(dir, { recursive: true });
  const fileName = createSessionFileName("source", extension);
  const destination = uploadPath(uploadId, fileName);

  const body = request.body as unknown as NodeReadableStream<Uint8Array>;
  await pipeline(Readable.fromWeb(body), createWriteStream(destination));

  return NextResponse.json({
    uploadId,
    fileName,
    storedPath: destination
  });
}
