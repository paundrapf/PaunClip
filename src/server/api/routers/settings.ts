import "server-only";
import { z } from "zod";
import { AIProviderRouter } from "@/server/ai/provider-router";
import { getSettings, maskSettings, saveSettings } from "@/server/config/settings-store";
import { aiProviderConfigSchema, appSettingsSchema, aiSettingsSchema } from "@/shared/schemas/settings";
import { createTRPCRouter, publicProcedure } from "../trpc";

export const settingsRouter = createTRPCRouter({
  get: publicProcedure.query(async () => {
    return maskSettings(await getSettings());
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
        task: z.enum(["highlightFinder", "captionMaker", "hookMaker", "youtubeTitleMaker"]),
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
        task: z.enum(["highlightFinder", "captionMaker", "hookMaker", "youtubeTitleMaker"])
      })
    )
    .mutation(async ({ input }) => {
      const settings = await getSettings();
      const router = new AIProviderRouter(settings.aiProviders);
      return router.validate(input.task);
    })
});
