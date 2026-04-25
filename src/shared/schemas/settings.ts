import { z } from "zod";
import { DEFAULT_LANGUAGE, DEFAULT_OUTPUT_DIR } from "@/shared/constants/app";
import { aspectRatioSchema, clipModelSchema } from "./primitives";
import { captionPresetSchema } from "./caption-style";

export const aiProviderConfigSchema = z.object({
  provider: z.enum(["openai", "anthropic", "groq", "gemini", "custom"]),
  baseUrl: z.string().url().or(z.literal("")),
  apiKey: z.string(),
  model: z.string(),
  systemMessage: z.string().optional(),
  ttsVoice: z.string().optional(),
  ttsFormat: z.enum(["mp3", "wav", "opus"]).optional(),
  ttsSpeed: z.number().min(0.25).max(4).optional()
});

export const aiSettingsSchema = z.object({
  highlightFinder: aiProviderConfigSchema,
  captionMaker: aiProviderConfigSchema,
  hookMaker: aiProviderConfigSchema,
  youtubeTitleMaker: aiProviderConfigSchema
});

export const appPreferencesSchema = z.object({
  defaultLanguage: z.string().default(DEFAULT_LANGUAGE),
  defaultAspectRatio: aspectRatioSchema.default("9:16"),
  defaultClipModel: clipModelSchema.default("auto"),
  autoSave: z.boolean().default(true),
  autoImport: z.boolean().default(false)
});

export const cookieSettingsSchema = z.object({
  youtubePath: z.string().nullable().default(null),
  lastUpdated: z.string().datetime().nullable().default(null)
});

export const appSettingsSchema = z.object({
  aiProviders: aiSettingsSchema,
  captionPresets: z.array(captionPresetSchema).default([]),
  cookies: cookieSettingsSchema,
  outputDirectory: z.string().default(DEFAULT_OUTPUT_DIR),
  preferences: appPreferencesSchema
});

export type AIProviderConfig = z.infer<typeof aiProviderConfigSchema>;
export type AISettings = z.infer<typeof aiSettingsSchema>;
export type AppSettings = z.infer<typeof appSettingsSchema>;
