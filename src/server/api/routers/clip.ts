import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/server/db/client";
import { getSettings } from "@/server/config/settings-store";
import { enqueueJob } from "@/server/jobs/runner";
import { registerPipelineJobs } from "@/server/pipeline/register";
import {
  readClipRenderMetadata,
  type ClipDraftMetadata
} from "@/server/rendering/render-signature";
import { sliceTranscript } from "@/server/transcription/srt";
import { parseJsonWithSchema, stringifyJson } from "@/shared/schemas/primitives";
import { sessionConfigSchema, transcriptSchema } from "@/shared/schemas/session";
import { createTRPCRouter, publicProcedure } from "../trpc";

const updateDraftInputSchema = z
  .object({
    clipId: z.string().min(1),
    title: z.string().min(1).max(120).optional(),
    startTime: z.number().min(0).optional(),
    endTime: z.number().min(0).optional(),
    hookText: z.string().max(240).optional(),
    captionStyleId: z.string().min(1).optional()
  })
  .refine(
    (value) =>
      value.startTime === undefined ||
      value.endTime === undefined ||
      value.endTime > value.startTime,
    "Clip end time must be greater than start time"
  );

export const clipRouter = createTRPCRouter({
  listBySession: publicProcedure.input(z.string().min(1)).query(async ({ input }) => {
    return db.clip.findMany({
      where: { sessionId: input },
      orderBy: [{ viralityScore: "desc" }, { createdAt: "desc" }]
    });
  }),

  byId: publicProcedure.input(z.string().min(1)).query(async ({ input }) => {
    return db.clip.findUnique({
      where: { id: input },
      include: { highlight: true, session: true }
    });
  }),

  editorData: publicProcedure.input(z.string().min(1)).query(async ({ input }) => {
    const [clip, settings] = await Promise.all([
      db.clip.findUnique({
        where: { id: input },
        include: { highlight: true, session: true }
      }),
      getSettings()
    ]);
    if (!clip) {
      throw new Error(`Clip not found: ${input}`);
    }

    const config = parseJsonWithSchema(sessionConfigSchema, clip.session.configJson, sessionConfigSchema.parse({}));
    const transcript = parseJsonWithSchema(transcriptSchema, clip.session.transcriptJson, {
      language: config.language,
      segments: []
    });
    const metadata = readClipRenderMetadata(clip.renderJson);
    const captionStyleId = metadata.draft?.captionStyleId ?? config.captionStyleId;

    return {
      clip,
      highlight: clip.highlight,
      session: clip.session,
      config,
      renderMetadata: metadata,
      captionPresets: settings.captionPresets,
      selectedCaptionStyleId: captionStyleId,
      transcriptSlice: sliceTranscript(transcript, clip.startTime, clip.endTime)
    };
  }),

  updateDraft: publicProcedure.input(updateDraftInputSchema).mutation(async ({ input }) => {
    const clip = await db.clip.findUnique({
      where: { id: input.clipId },
      include: { highlight: true }
    });
    if (!clip) {
      throw new Error(`Clip not found: ${input.clipId}`);
    }

    const nextTitle = input.title ?? clip.title;
    const nextStart = input.startTime ?? clip.startTime;
    const nextEnd = input.endTime ?? clip.endTime;
    if (nextEnd <= nextStart) {
      throw new Error("Clip end time must be greater than start time");
    }

    const metadata = readClipRenderMetadata(clip.renderJson);
    const draft: ClipDraftMetadata = {
      ...metadata.draft,
      title: nextTitle,
      startTime: nextStart,
      endTime: nextEnd,
      hookText: input.hookText ?? clip.highlight.hookText ?? undefined,
      captionStyleId: input.captionStyleId ?? metadata.draft?.captionStyleId,
      updatedAt: new Date().toISOString()
    };

    return db.$transaction(async (tx) => {
      await tx.highlight.update({
        where: { id: clip.highlightId },
        data: {
          title: nextTitle,
          startTime: nextStart,
          endTime: nextEnd,
          hookText: draft.hookText,
          status: "draft"
        }
      });

      return tx.clip.update({
        where: { id: clip.id },
        data: {
          title: nextTitle,
          startTime: nextStart,
          endTime: nextEnd,
          duration: Math.max(0.1, nextEnd - nextStart),
          status: "draft",
          renderJson: stringifyJson({
            ...metadata,
            draft
          })
        },
        include: { highlight: true, session: true }
      });
    });
  }),

  rerender: publicProcedure.input(z.string().min(1)).mutation(async ({ input }) => {
    registerPipelineJobs();
    const clip = await db.clip.findUnique({ where: { id: input } });
    if (!clip) {
      throw new Error(`Clip not found: ${input}`);
    }

    const job = await enqueueJob({
      type: "rerender_clip",
      sessionId: clip.sessionId,
      payload: { clipId: clip.id }
    });

    return { clip, job };
  }),

  duplicate: publicProcedure.input(z.string().min(1)).mutation(async ({ input }) => {
    const clip = await db.clip.findUnique({
      where: { id: input },
      include: { highlight: true }
    });
    if (!clip) {
      throw new Error(`Clip not found: ${input}`);
    }

    const duplicateTitle = `${clip.title} Copy`;
    return db.$transaction(async (tx) => {
      const highlight = await tx.highlight.create({
        data: {
          sessionId: clip.sessionId,
          startTime: clip.startTime,
          endTime: clip.endTime,
          title: duplicateTitle,
          description: clip.highlight.description,
          viralityScore: clip.viralityScore,
          selected: true,
          hookText: clip.highlight.hookText,
          status: "draft",
          analysisJson: clip.highlight.analysisJson
        }
      });

      return tx.clip.create({
        data: {
          id: `clip_${randomUUID()}`,
          title: duplicateTitle,
          duration: clip.duration,
          startTime: clip.startTime,
          endTime: clip.endTime,
          masterPath: clip.masterPath,
          thumbnailPath: clip.thumbnailPath,
          fileSizeMb: clip.fileSizeMb,
          status: "draft",
          viralityScore: clip.viralityScore,
          captionBurned: clip.captionBurned,
          hookAdded: clip.hookAdded,
          renderJson: clip.renderJson,
          sessionId: clip.sessionId,
          highlightId: highlight.id
        },
        include: { highlight: true, session: true }
      });
    });
  })
});
