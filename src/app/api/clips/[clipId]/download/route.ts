import { NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { createFileResponse } from "@/server/storage/serve-file";

export async function GET(
  request: Request,
  context: { params: Promise<{ clipId: string }> }
) {
  const { clipId } = await context.params;
  const inline = new URL(request.url).searchParams.get("inline") === "1";
  const clip = await db.clip.findUnique({ where: { id: clipId } });

  if (!clip?.masterPath) {
    return NextResponse.json({ error: "Clip video not found" }, { status: 404 });
  }

  return createFileResponse(clip.masterPath, {
    contentType: "video/mp4",
    downloadName: inline ? undefined : `${clip.title || clip.id}.mp4`
  });
}
