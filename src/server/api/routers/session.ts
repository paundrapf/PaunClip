import "server-only";
import { readdir } from "node:fs/promises";
import { z } from "zod";
import { db } from "@/server/db/client";
import { enqueueJob } from "@/server/jobs/runner";
import { registerPipelineJobs } from "@/server/pipeline/register";
import { uploadPath } from "@/server/storage/paths";
import { createSessionInputSchema, sessionConfigSchema } from "@/shared/schemas/session";
import { parseJsonWithSchema, stringifyJson } from "@/shared/schemas/primitives";
import { createTRPCRouter, publicProcedure } from "../trpc";

export const sessionRouter = createTRPCRouter({
  create: publicProcedure.input(createSessionInputSchema).mutation(async ({ input }) => {
    registerPipelineJobs();

    const downloadedPath =
      input.sourceType === "upload" && input.uploadId
        ? await resolveUploadedSource(input.uploadId)
        : undefined;

    const session = await db.session.create({
      data: {
        sourceType: input.sourceType,
        sourceUrl: input.sourceUrl,
        campaignId: input.campaignId,
        downloadedPath,
        status: "created",
        stage: "pending",
        configJson: stringifyJson(sessionConfigSchema.parse(input.config))
      }
    });

    const job = await enqueueJob({
      type: "single_video_pipeline",
      sessionId: session.id,
      payload: {
        sourceType: input.sourceType
      }
    });

    return { session, job };
  }),

  list: publicProcedure.query(async () => {
    return db.session.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        clips: true,
        highlights: true,
        jobs: {
          orderBy: { createdAt: "desc" },
          take: 1
        }
      }
    });
  }),

  getById: publicProcedure.input(z.string().min(1)).query(async ({ input }) => {
    const session = await db.session.findUnique({
      where: { id: input },
      include: {
        clips: true,
        highlights: true,
        jobs: {
          orderBy: { createdAt: "desc" },
          include: { steps: true, events: { take: 30, orderBy: { createdAt: "desc" } } }
        }
      }
    });

    if (!session) {
      return null;
    }

    return {
      ...session,
      config: parseJsonWithSchema(sessionConfigSchema, session.configJson, sessionConfigSchema.parse({}))
    };
  })
});

async function resolveUploadedSource(uploadId: string) {
  const dir = uploadPath(uploadId);
  const files = await readdir(dir);
  const source = files.find((file) => file.startsWith("source."));
  if (!source) {
    throw new Error(`Uploaded source not found: ${uploadId}`);
  }
  return uploadPath(uploadId, source);
}
