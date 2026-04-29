import "server-only";
import { z } from "zod";
import { db } from "@/server/db/client";
import { getSettings } from "@/server/config/settings-store";
import { buildCampaignSessionConfig } from "@/server/campaign/config";
import { fetchChannelVideos } from "@/server/media/ytdlp";
import { stringifyJson } from "@/shared/schemas/primitives";
import { campaignBatchConfigSchema, campaignContentTypeSchema } from "@/shared/schemas/campaign";
import { sessionConfigSchema } from "@/shared/schemas/session";
import { shouldSkipCampaignVideoStart } from "@/shared/campaign/status";
import { enqueueJob, resumeQueuedJobs } from "@/server/jobs/runner";
import { registerPipelineJobs } from "@/server/pipeline/register";
import { assertPreflightReady } from "@/server/system/preflight";
import { createTRPCRouter, publicProcedure } from "../trpc";

export const campaignRouter = createTRPCRouter({
  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        channelUrl: z.string().trim().min(1).optional(),
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

  update: publicProcedure
    .input(
      z.object({
        campaignId: z.string().min(1),
        name: z.string().trim().min(1).optional(),
        channelUrl: z.string().trim().min(1).optional(),
        config: sessionConfigSchema.optional()
      })
    )
    .mutation(async ({ input }) => {
      return db.campaign.update({
        where: { id: input.campaignId },
        data: {
          ...(input.name ? { name: input.name } : {}),
          ...(input.channelUrl ? { channelUrl: input.channelUrl } : {}),
          ...(input.config ? { configJson: stringifyJson(input.config) } : {})
        }
      });
    }),

  fetchVideos: publicProcedure
    .input(
      z.object({
        campaignId: z.string().min(1),
        limit: z.number().int().min(1).max(50).default(10),
        contentType: campaignContentTypeSchema.default("videos")
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
        contentType: input.contentType,
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
    registerPipelineJobs();
    await resumeQueuedJobs();

    return db.campaign.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        videos: {
          orderBy: { createdAt: "desc" },
          include: {
            session: {
              include: {
                jobs: {
                  orderBy: { createdAt: "desc" },
                  take: 1
                }
              }
            }
          }
        },
        sessions: true
      }
    });
  }),

  getById: publicProcedure.input(z.string().min(1)).query(async ({ input }) => {
    registerPipelineJobs();
    await resumeQueuedJobs();

    return db.campaign.findUnique({
      where: { id: input },
      include: {
        videos: {
          orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
          include: {
            session: {
              include: {
                _count: {
                  select: {
                    clips: true,
                    highlights: true
                  }
                },
                jobs: {
                  orderBy: { createdAt: "desc" },
                  take: 1
                }
              }
            }
          }
        },
        sessions: {
          include: {
            jobs: {
              orderBy: { createdAt: "desc" },
              take: 1
            }
          }
        }
      }
    });
  }),

  setVideoSelection: publicProcedure
    .input(
      z.object({
        campaignId: z.string().min(1),
        videoIds: z.array(z.string().min(1)).max(100)
      })
    )
    .mutation(async ({ input }) => {
      return db.$transaction(async (tx) => {
        await tx.campaignVideo.updateMany({
          where: { campaignId: input.campaignId },
          data: { selected: false }
        });
        if (input.videoIds.length > 0) {
          await tx.campaignVideo.updateMany({
            where: { campaignId: input.campaignId, id: { in: input.videoIds } },
            data: { selected: true }
          });
        }
        return tx.campaign.findUnique({
          where: { id: input.campaignId },
          include: { videos: true }
        });
      });
    }),

  startBatch: publicProcedure
    .input(
      z.object({
        campaignId: z.string().min(1),
        videoIds: z.array(z.string().min(1)).max(100).optional(),
        batchConfig: campaignBatchConfigSchema.partial().optional(),
        perVideoClipCounts: z.record(z.string(), z.number().int().min(1).max(10)).optional()
      })
    )
    .mutation(async ({ input }) => {
      registerPipelineJobs();
      const campaign = await db.campaign.findUnique({
        where: { id: input.campaignId },
        include: {
          videos: {
            include: {
              session: {
                include: {
                  jobs: {
                    orderBy: { createdAt: "desc" },
                    take: 1
                  }
                }
              }
            }
          }
        }
      });
      if (!campaign) {
        throw new Error("Campaign not found");
      }

      const batchConfig = campaignBatchConfigSchema.parse(input.batchConfig ?? {});
      const preflightConfig = buildCampaignSessionConfig({
        campaignConfigJson: campaign.configJson,
        batchConfig,
        targetClipCount: batchConfig.clipsPerVideo
      });
      await assertPreflightReady({
        sourceType: "youtube",
        operation: "campaign",
        config: preflightConfig,
        hasTranscript: Boolean(preflightConfig.manualTranscriptSrt)
      });
      const selectedIds = new Set(
        input.videoIds ?? campaign.videos.filter((video) => video.selected).map((video) => video.id)
      );
      const videos = campaign.videos.filter((video) => selectedIds.has(video.id));
      if (videos.length === 0) {
        throw new Error("Select at least one campaign video before starting batch.");
      }
      const sessions = [];
      let skippedCount = 0;

      await db.campaign.update({
        where: { id: campaign.id },
        data: {
          configJson: stringifyJson(
            buildCampaignSessionConfig({
              campaignConfigJson: campaign.configJson,
              batchConfig,
              targetClipCount: batchConfig.clipsPerVideo
            })
          )
        }
      });

      for (const video of videos) {
        if (shouldSkipCampaignVideoStart(video)) {
          skippedCount += 1;
          continue;
        }

        const targetClipCount =
          input.perVideoClipCounts?.[video.id] ?? input.perVideoClipCounts?.[video.videoId] ?? batchConfig.clipsPerVideo;
        const config = buildCampaignSessionConfig({
          campaignConfigJson: campaign.configJson,
          batchConfig,
          targetClipCount
        });
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
          payload: {
            sourceType: "youtube",
            campaignId: campaign.id,
            videoId: video.id,
            targetClipCount
          }
        });
        sessions.push({ session, job });
      }

      return {
        campaignId: campaign.id,
        queuedCount: sessions.length,
        skippedCount,
        sessionIds: sessions.map(({ session }) => session.id),
        jobs: sessions
      };
    })
});
