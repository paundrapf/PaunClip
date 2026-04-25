import { existsSync } from "node:fs";
import path from "node:path";
import { db } from "../src/server/db/client";
import { runSingleVideoPipeline } from "../src/server/pipeline/single-video-pipeline";
import { sessionConfigSchema } from "../src/shared/schemas/session";
import { stringifyJson } from "../src/shared/schemas/primitives";

async function main() {
  const fixture = path.resolve(process.cwd(), "tests/fixtures/smoke.mp4");
  if (!existsSync(fixture)) {
    throw new Error(`Missing fixture video: ${fixture}`);
  }

  const session = await db.session.create({
    data: {
      sourceType: "upload",
      sourceTitle: "Smoke test video",
      downloadedPath: fixture,
      status: "created",
      stage: "pending",
      configJson: stringifyJson(
        sessionConfigSchema.parse({
          captionStyleId: "karaoke",
          language: "id"
        })
      )
    }
  });

  const job = await db.job.create({
    data: {
      type: "single_video_pipeline",
      status: "running",
      sessionId: session.id,
      payloadJson: stringifyJson({ smoke: true }),
      progress: 0
    }
  });

  await runSingleVideoPipeline({
    jobId: job.id,
    sessionId: session.id,
    payload: { smoke: true },
    progress: async (progress, message) => {
      console.log(`[${progress}%] ${message}`);
    },
    log: async (message) => {
      console.log(message);
    }
  });

  const clips = await db.clip.findMany({ where: { sessionId: session.id } });
  if (clips.length === 0) {
    throw new Error("Smoke pipeline did not create clips");
  }

  for (const clip of clips) {
    if (!clip.masterPath || !existsSync(clip.masterPath)) {
      throw new Error(`Missing rendered clip for ${clip.id}`);
    }
  }

  console.log(`Smoke pipeline passed: ${clips.length} clip(s) rendered for ${session.id}`);
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
