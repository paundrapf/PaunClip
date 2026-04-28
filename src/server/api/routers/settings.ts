import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { loadAIProviderModels, validateAIProviderConfig } from "@/server/ai/provider-router";
import { getSettings, maskSettings, saveSettings } from "@/server/config/settings-store";
import { cleanupStorage, getStorageStats, openOutputDirectory } from "@/server/storage/maintenance";
import { getSystemHealth } from "@/server/system/health";
import {
  AI_PROVIDER_PRESETS,
  AI_PROVIDER_TASKS,
  getProviderPreset
} from "@/shared/constants/ai-providers";
import { DEFAULT_CAPTION_PRESETS } from "@/shared/constants/caption-presets";
import { captionPresetSchema } from "@/shared/schemas/caption-style";
import {
  aiProviderConfigSchema,
  aiSettingsSchema,
  appPreferencesSchema,
  appSettingsSchema
} from "@/shared/schemas/settings";
import { createTRPCRouter, publicProcedure } from "../trpc";

const taskSchema = z.enum(AI_PROVIDER_TASKS);

export const settingsRouter = createTRPCRouter({
  get: publicProcedure.query(async () => {
    return maskSettings(await getSettings());
  }),

  presets: publicProcedure.query(() => AI_PROVIDER_PRESETS),

  health: publicProcedure.query(async () => {
    return getSystemHealth();
  }),

  storageStats: publicProcedure.query(async () => {
    return getStorageStats();
  }),

  update: publicProcedure.input(appSettingsSchema).mutation(async ({ input }) => {
    return maskSettings(await saveSettings(input));
  }),

  updateAI: publicProcedure.input(aiSettingsSchema).mutation(async ({ input }) => {
    const current = await getSettings();
    return maskSettings(
      await saveSettings({
        ...current,
        aiProviders: input
      })
    );
  }),

  updatePreferences: publicProcedure.input(appPreferencesSchema).mutation(async ({ input }) => {
    const current = await getSettings();
    return maskSettings(
      await saveSettings({
        ...current,
        preferences: input
      })
    );
  }),

  updateProvider: publicProcedure
    .input(
      z.object({
        task: taskSchema,
        config: aiProviderConfigSchema
      })
    )
    .mutation(async ({ input }) => {
      const current = await getSettings();
      const previous = current.aiProviders[input.task];
      const nextApiKey =
        input.config.apiKey === "********" ? previous.apiKey : input.config.apiKey;

      return maskSettings(
        await saveSettings({
          ...current,
          aiProviders: {
            ...current.aiProviders,
            [input.task]: {
              ...input.config,
              apiKey: nextApiKey
            }
          }
        })
      );
    }),

  updateOutputDirectory: publicProcedure.input(z.string().min(1)).mutation(async ({ input }) => {
    const current = await getSettings();
    return maskSettings(
      await saveSettings({
        ...current,
        outputDirectory: input
      })
    );
  }),

  openOutputDirectory: publicProcedure.mutation(async () => {
    const settings = await getSettings();
    return openOutputDirectory(settings.outputDirectory);
  }),

  cleanupStorage: publicProcedure
    .input(
      z.object({
        temp: z.boolean().default(false),
        failedArtifacts: z.boolean().default(false),
        sourceVideos: z.boolean().default(false)
      })
    )
    .mutation(async ({ input }) => {
      return cleanupStorage(input);
    }),

  updateCaptionPreset: publicProcedure.input(captionPresetSchema).mutation(async ({ input }) => {
    const current = await getSettings();
    const existingIndex = current.captionPresets.findIndex((preset) => preset.id === input.id);
    const captionPresets =
      existingIndex >= 0
        ? current.captionPresets.map((preset) => (preset.id === input.id ? input : preset))
        : [...current.captionPresets, input];

    return maskSettings(
      await saveSettings({
        ...current,
        captionPresets
      })
    );
  }),

  duplicateCaptionPreset: publicProcedure.input(z.string().min(1)).mutation(async ({ input }) => {
    const current = await getSettings();
    const source =
      current.captionPresets.find((preset) => preset.id === input) ??
      DEFAULT_CAPTION_PRESETS.find((preset) => preset.id === input);
    if (!source) {
      throw new Error(`Caption preset not found: ${input}`);
    }

    const id = `${source.id}-${randomUUID().slice(0, 8)}`;
    const duplicate = captionPresetSchema.parse({
      ...source,
      id,
      name: `${source.name} Copy`,
      isDefault: false,
      isCustom: true,
      config: {
        ...source.config,
        id,
        name: `${source.name} Copy`
      }
    });

    return maskSettings(
      await saveSettings({
        ...current,
        captionPresets: [...current.captionPresets, duplicate]
      })
    );
  }),

  validateProvider: publicProcedure
    .input(
      z.object({
        task: taskSchema,
        config: aiProviderConfigSchema
      })
    )
    .mutation(async ({ input }) => {
      const settings = await getSettings();
      return validateAIProviderConfig(
        input.task,
        mergeMaskedApiKey(input.config, settings.aiProviders[input.task].apiKey)
      );
    }),

  loadProviderModels: publicProcedure
    .input(
      z.object({
        task: taskSchema,
        config: aiProviderConfigSchema
      })
    )
    .mutation(async ({ input }) => {
      const settings = await getSettings();
      return loadAIProviderModels(
        mergeMaskedApiKey(input.config, settings.aiProviders[input.task].apiKey)
      );
    }),

  providerVoices: publicProcedure
    .input(
      z.object({
        provider: aiProviderConfigSchema.shape.provider
      })
    )
    .query(({ input }) => {
      return getProviderPreset(input.provider).knownVoices ?? [];
    })
});

function mergeMaskedApiKey(config: z.infer<typeof aiProviderConfigSchema>, previousKey: string) {
  return {
    ...config,
    apiKey: config.apiKey === "********" ? previousKey : config.apiKey
  };
}
