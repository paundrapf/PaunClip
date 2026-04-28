import { z } from "zod";
import { clipLengthSchema } from "./primitives";
import { CONTENT_PRESETS, REFRAME_MODES } from "@/shared/reframe";

export const campaignContentTypeSchema = z.enum(["videos", "shorts", "all"]);

export const campaignBatchConfigSchema = z.object({
  clipsPerVideo: z.number().int().min(1).max(10).default(3),
  autoHook: z.boolean().default(true),
  captionStyleId: z.string().default("karaoke"),
  renderMode: z.enum(["auto", "review"]).default("review"),
  clipLength: clipLengthSchema.default("auto"),
  contentPreset: z.enum(CONTENT_PRESETS).default("auto"),
  reframeMode: z.enum(REFRAME_MODES).default("auto_fast"),
  language: z.string().default("id"),
  prompt: z.string().default("")
});

export type CampaignContentType = z.infer<typeof campaignContentTypeSchema>;
export type CampaignBatchConfig = z.infer<typeof campaignBatchConfigSchema>;
