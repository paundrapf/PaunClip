import "server-only";
import { z } from "zod";
import { db } from "@/server/db/client";
import { getSettings } from "@/server/config/settings-store";
import { fetchChannelVideos } from "@/server/media/ytdlp";
import { parseJsonWithSchema, stringifyJson } from "@/shared/schemas/primitives";
import { sessionConfigSchema } from "@/shared/schemas/session";
import { enqueueJob } from "@/server/jobs/runner";
import { registerPipelineJobs } from "@/server/pipeline/register";
import { createTRPCRouter, publicProcedure } from "../trpc";

export const campaignRouter = createTRPCRouter({
  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        channelUrl: z.string().url().optional(),
        config: sessionConfigSchema.optional()
      })
    )
    .mutation(async ({ input }) => {
      return db.campaign.create({
        data: {
          name: input.name,
          channelUrl: input.channelUrl,
          configJson: stringifyJson(input.config ?? sessionConfigSchema.parse({}))
        }
      });
    }),

  fetchVideos: publicProcedure
    .input(
      z.object({
        campaignId: z.string().min(1),
        limit: z.number().int().min(1).max(50).default(10)
      })
    )
    .mutation(async ({ input }) => {
      const campaign = await db.campaign.findUnique({ where: { id: input.campaignId } });
      if (!campaign?.channelUrl) {
        throw new Error("Campaign has no channel URL");
      }

      const settings = await getSettings();
      const videos = await fetchChannelVideos({
        channelUrl: campaign.channelUrl,
        limit: input.limit,
        cookiesPath: settings.cookies.youtubePath ?? undefined
      });

      for (const video of videos) {
        await db.campaignVideo.upsert({
          where: {
            campaignId_videoId: {
              campaignId: campaign.id,
              videoId: video.videoId
            }
          },
          update: video,
          create: {
            ...video,
            campaignId: campaign.id
          }
        });
      }

      return db.campaign.findUnique({
        where: { id: campaign.id },
        include: { videos: true }
      });
    }),

  list: publicProcedure.query(async () => {
    return db.campaign.findMany({
      orderBy: { createdAt: "desc" },
      include: { videos: true, sessions: true }
    });
  }),

  startBatch: publicProcedure.input(z.string().min(1)).mutation(async ({ input }) => {
    registerPipelineJobs();
    const campaign = await db.campaign.findUnique({
      where: { id: input },
      include: { videos: true }
    });
    if (!campaign) {
      throw new Error("Campaign not found");
    }

    const config = parseJsonWithSchema(sessionConfigSchema, campaign.configJson, {});
    const videos = campaign.videos.filter((video) => video.selected || campaign.videos.every((item) => !item.selected));
    const sessions = [];

    for (const video of videos) {
      const session = await db.session.create({
        data: {
          sourceType: "youtube",
          sourceUrl: video.videoUrl,
          sourceTitle: video.title,
          thumbnailPath: video.thumbnailUrl,
          campaignId: campaign.id,
          status: "created",
          stage: "pending",
          configJson: stringifyJson(config)
        }
      });
      await db.campaignVideo.update({
        where: { id: video.id },
        data: { sessionId: session.id, status: "queued" }
      });
      const job = await enqueueJob({
        type: "single_video_pipeline",
        sessionId: session.id,
        payload: { sourceType: "youtube", campaignId: campaign.id, videoId: video.id }
      });
      sessions.push({ session, job });
    }

    return sessions;
  })
});
