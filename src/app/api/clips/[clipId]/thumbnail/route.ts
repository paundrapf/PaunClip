import { NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { createFileResponse } from "@/server/storage/serve-file";

export async function GET(
  _request: Request,
  context: { params: Promise<{ clipId: string }> }
) {
  const { clipId } = await context.params;
  const clip = await db.clip.findUnique({ where: { id: clipId } });

  if (!clip?.thumbnailPath) {
    return NextResponse.json({ error: "Clip thumbnail not found" }, { status: 404 });
  }

  return createFileResponse(clip.thumbnailPath, {
    contentType: "image/jpeg"
  });
}
