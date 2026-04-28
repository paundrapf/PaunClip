import { z } from "zod";
import { clipLengthSchema } from "./primitives";

export const campaignContentTypeSchema = z.enum(["videos", "shorts", "all"]);

export const campaignBatchConfigSchema = z.object({
  clipsPerVideo: z.number().int().min(1).max(10).default(3),
  autoHook: z.boolean().default(true),
  captionStyleId: z.string().default("karaoke"),
  renderMode: z.enum(["auto", "review"]).default("review"),
  clipLength: clipLengthSchema.default("auto"),
  language: z.string().default("id"),
  prompt: z.string().default("")
});

export type CampaignContentType = z.infer<typeof campaignContentTypeSchema>;
export type CampaignBatchConfig = z.infer<typeof campaignBatchConfigSchema>;
