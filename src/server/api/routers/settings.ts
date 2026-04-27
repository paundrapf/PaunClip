import "server-only";
import { z } from "zod";
import { loadAIProviderModels, validateAIProviderConfig } from "@/server/ai/provider-router";
import { getSettings, maskSettings, saveSettings } from "@/server/config/settings-store";
import { getSystemHealth } from "@/server/system/health";
import {
  AI_PROVIDER_PRESETS,
  AI_PROVIDER_TASKS,
  getProviderPreset
} from "@/shared/constants/ai-providers";
import { aiProviderConfigSchema, appSettingsSchema, aiSettingsSchema } from "@/shared/schemas/settings";
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
