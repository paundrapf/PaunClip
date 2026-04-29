import "server-only";
import { readdir } from "node:fs/promises";
import { z } from "zod";
import { db } from "@/server/db/client";
import { enqueueJob, resumeQueuedJobs } from "@/server/jobs/runner";
import { registerPipelineJobs } from "@/server/pipeline/register";
import { uploadPath } from "@/server/storage/paths";
import { assertPreflightReady } from "@/server/system/preflight";
import { createSessionInputSchema, sessionConfigSchema } from "@/shared/schemas/session";
import { parseJsonWithSchema, sourceTypeSchema, stringifyJson } from "@/shared/schemas/primitives";
import { createTRPCRouter, publicProcedure } from "../trpc";

const highlightSelectionSchema = z.object({
  sessionId: z.string().min(1),
  highlightIds: z.array(z.string().min(1)).max(25)
});

export const sessionRouter = createTRPCRouter({
  create: publicProcedure.input(createSessionInputSchema).mutation(async ({ input }) => {
    registerPipelineJobs();
    await assertPreflightReady({
      sourceType: input.sourceType,
      operation: "create",
      config: input.config,
      hasTranscript: Boolean(input.config.manualTranscriptSrt)
    });

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

  retry: publicProcedure.input(z.string().min(1)).mutation(async ({ input }) => {
    registerPipelineJobs();

    const existing = await db.session.findUnique({ where: { id: input } });
    if (!existing) {
      throw new Error(`Session not found: ${input}`);
    }
    const config = parseJsonWithSchema(sessionConfigSchema, existing.configJson, sessionConfigSchema.parse({}));
    await assertPreflightReady({
      sourceType: sourceTypeSchema.parse(existing.sourceType),
      operation: "create",
      config,
      hasTranscript: Boolean(existing.transcriptJson)
    });

    const session = await db.session.update({
      where: { id: input },
      data: {
        status: "created",
        stage: "pending"
      }
    });

    const job = await enqueueJob({
      type: "single_video_pipeline",
      sessionId: session.id,
      payload: {
        sourceType: session.sourceType,
        retry: true
      }
    });

    return { session, job };
  }),

  setHighlightSelection: publicProcedure
    .input(highlightSelectionSchema)
    .mutation(async ({ input }) => {
      return setSelectedHighlights(input.sessionId, input.highlightIds);
    }),

  renderSelected: publicProcedure
    .input(
      z.object({
        sessionId: z.string().min(1),
        highlightIds: z.array(z.string().min(1)).max(25).optional()
      })
    )
    .mutation(async ({ input }) => {
      registerPipelineJobs();

      const existing = await db.session.findUnique({ where: { id: input.sessionId } });
      if (!existing) {
        throw new Error(`Session not found: ${input.sessionId}`);
      }
      const config = parseJsonWithSchema(sessionConfigSchema, existing.configJson, sessionConfigSchema.parse({}));
      await assertPreflightReady({
        sourceType: sourceTypeSchema.parse(existing.sourceType),
        operation: "render",
        config,
        hasTranscript: Boolean(existing.transcriptJson)
      });

      if (input.highlightIds) {
        await setSelectedHighlights(input.sessionId, input.highlightIds);
      }

      const selectedCount = await db.highlight.count({
        where: { sessionId: input.sessionId, selected: true }
      });
      if (selectedCount === 0) {
        throw new Error("Select at least one highlight before rendering clips.");
      }

      const session = await db.session.update({
        where: { id: input.sessionId },
        data: {
          status: "created",
          stage: "rendering"
        }
      });

      const job = await enqueueJob({
        type: "render_selected_clips",
        sessionId: input.sessionId,
        payload: {
          highlightIds: input.highlightIds
        }
      });

      return { session, job };
    }),

  list: publicProcedure.query(async () => {
    registerPipelineJobs();
    await resumeQueuedJobs();

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
    registerPipelineJobs();
    await resumeQueuedJobs();

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

async function setSelectedHighlights(sessionId: string, highlightIds: string[]) {
  const session = await db.session.findUnique({ where: { id: sessionId } });
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  return db.$transaction(async (tx) => {
    await tx.highlight.updateMany({
      where: { sessionId },
      data: { selected: false }
    });

    if (highlightIds.length > 0) {
      await tx.highlight.updateMany({
        where: { sessionId, id: { in: highlightIds } },
        data: { selected: true }
      });
    }

    return tx.highlight.findMany({
      where: { sessionId },
      orderBy: [{ viralityScore: "desc" }, { createdAt: "asc" }]
    });
  });
}
