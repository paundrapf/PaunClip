import { z } from "zod";
import {
  aspectRatioSchema,
  clipLengthSchema,
  clipModelSchema,
  genreSchema,
  secondsSchema,
  sourceTypeSchema
} from "./primitives";

export const sessionConfigSchema = z
  .object({
    clipModel: clipModelSchema.default("auto"),
    genre: genreSchema.default("auto"),
    clipLength: clipLengthSchema.default("auto"),
    autoHook: z.boolean().default(true),
    prompt: z.string().default(""),
    captionStyleId: z.string().default("karaoke"),
    aspectRatio: aspectRatioSchema.default("9:16"),
    processingStart: secondsSchema.default(0),
    processingEnd: secondsSchema.optional(),
    faceTrackingMode: z.enum(["center_crop", "mediapipe"]).default("center_crop"),
    language: z.string().default("id"),
    manualTranscriptSrt: z.string().optional()
  })
  .refine(
    (value) =>
      value.processingEnd === undefined ||
      value.processingEnd > value.processingStart,
    "Processing end must be greater than processing start"
  );

export const createSessionInputSchema = z.object({
  sourceType: sourceTypeSchema,
  sourceUrl: z.string().url().optional(),
  uploadId: z.string().optional(),
  campaignId: z.string().optional(),
  config: sessionConfigSchema
});

export const transcriptWordSchema = z.object({
  word: z.string(),
  start: secondsSchema,
  end: secondsSchema
});

export const transcriptSegmentSchema = z.object({
  start: secondsSchema,
  end: secondsSchema,
  text: z.string(),
  words: z.array(transcriptWordSchema).default([])
});

export const transcriptSchema = z.object({
  language: z.string(),
  segments: z.array(transcriptSegmentSchema),
  srtPath: z.string().optional()
});

export const highlightSchema = z.object({
  startTime: secondsSchema,
  endTime: secondsSchema,
  title: z.string().min(1).max(120),
  description: z.string().optional(),
  viralityScore: z.number().int().min(0).max(100).optional(),
  selected: z.boolean().default(true),
  hookText: z.string().optional()
});

export type SessionConfig = z.output<typeof sessionConfigSchema>;
export type CreateSessionInput = z.output<typeof createSessionInputSchema>;
export type Transcript = z.output<typeof transcriptSchema>;
export type TranscriptSegment = z.output<typeof transcriptSegmentSchema>;
export type Highlight = z.output<typeof highlightSchema>;
