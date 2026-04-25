import { z } from "zod";
import { aspectRatioSchema, secondsSchema } from "./primitives";

export const faceTrackingSchema = z.object({
  mode: z.enum(["center_crop", "mediapipe"]),
  cropPositions: z.array(z.number()).default([])
});

export const renderConfigSchema = z.object({
  aspectRatio: aspectRatioSchema.default("9:16"),
  resolution: z.tuple([z.number().int(), z.number().int()]).default([1080, 1920]),
  captionStyleId: z.string().default("karaoke"),
  faceTracking: faceTrackingSchema.default({ mode: "center_crop", cropPositions: [] }),
  hook: z
    .object({
      text: z.string(),
      ttsVoice: z.string().optional(),
      ttsAudioPath: z.string().optional()
    })
    .optional()
});

export const clipDataSchema = z.object({
  clipId: z.string(),
  highlightId: z.string(),
  title: z.string(),
  hookText: z.string().optional(),
  duration: secondsSchema,
  startTime: secondsSchema,
  endTime: secondsSchema,
  sourceSegment: z.object({
    start: secondsSchema,
    end: secondsSchema,
    transcript: z.string()
  }),
  renderConfig: renderConfigSchema,
  output: z.object({
    masterPath: z.string().optional(),
    thumbnailPath: z.string().optional(),
    fileSizeMb: z.number().optional()
  }),
  viralityAnalysis: z
    .object({
      score: z.number().int().min(0).max(100),
      factors: z.record(z.number()),
      aiReasoning: z.string().optional()
    })
    .optional()
});

export type RenderConfig = z.infer<typeof renderConfigSchema>;
export type ClipData = z.infer<typeof clipDataSchema>;
