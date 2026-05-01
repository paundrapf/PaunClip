import {
  AI_PROVIDER_TASKS,
  buildProviderConfig,
  normalizeOpenAICompatibleBaseUrl,
  providerSupportsCapability,
  type AIProviderTask
} from "@/shared/constants/ai-providers";
import {
  aiProviderConfigSchema,
  type AIProviderConfig,
  type AppSettings
} from "@/shared/schemas/settings";

export type SetupProviderChoice = "groq" | "openai" | "custom" | "skip";

export type SetupAIResult = {
  settings: AppSettings;
  configuredTasks: AIProviderTask[];
  skippedTasks: AIProviderTask[];
};

export function isSetupProviderChoice(value: string): value is SetupProviderChoice {
  return ["groq", "openai", "custom", "skip"].includes(value);
}

export function buildSingleProviderAISettings(
  settings: AppSettings,
  input: {
    provider: Extract<AIProviderConfig["provider"], "groq" | "openai">;
    apiKey: string;
  }
): SetupAIResult {
  const aiProviders = { ...settings.aiProviders };
  const configuredTasks: AIProviderTask[] = [];

  for (const task of AI_PROVIDER_TASKS) {
    const previous = settings.aiProviders[task];
    const next = buildProviderConfig(input.provider, task);
    aiProviders[task] = aiProviderConfigSchema.parse({
      ...next,
      apiKey: input.apiKey,
      systemMessage: previous.systemMessage
    });
    configuredTasks.push(task);
  }

  return {
    settings: { ...settings, aiProviders },
    configuredTasks,
    skippedTasks: []
  };
}

export function buildCustomAISettings(
  settings: AppSettings,
  input: {
    baseUrl: string;
    apiKey: string;
    chatModel: string;
    transcriptionModel?: string;
    ttsModel?: string;
    ttsVoice?: string;
    ttsFormat?: AIProviderConfig["ttsFormat"];
  }
): SetupAIResult {
  const baseUrl = normalizeOpenAICompatibleBaseUrl(input.baseUrl);
  const aiProviders = { ...settings.aiProviders };
  const configuredTasks: AIProviderTask[] = [];
  const skippedTasks: AIProviderTask[] = [];

  for (const task of ["highlightFinder", "youtubeTitleMaker"] as const) {
    const previous = settings.aiProviders[task];
    aiProviders[task] = aiProviderConfigSchema.parse({
      ...buildProviderConfig("custom", task),
      baseUrl,
      apiKey: input.apiKey,
      model: input.chatModel,
      systemMessage: previous.systemMessage
    });
    configuredTasks.push(task);
  }

  if (input.transcriptionModel && providerSupportsCapability({ provider: "custom", baseUrl }, "transcription")) {
    const previous = settings.aiProviders.captionMaker;
    aiProviders.captionMaker = aiProviderConfigSchema.parse({
      ...buildProviderConfig("custom", "captionMaker"),
      baseUrl,
      apiKey: input.apiKey,
      model: input.transcriptionModel,
      systemMessage: previous.systemMessage
    });
    configuredTasks.push("captionMaker");
  } else {
    skippedTasks.push("captionMaker");
  }

  if (input.ttsModel && providerSupportsCapability({ provider: "custom", baseUrl }, "tts")) {
    const previous = settings.aiProviders.hookMaker;
    aiProviders.hookMaker = aiProviderConfigSchema.parse({
      ...buildProviderConfig("custom", "hookMaker"),
      baseUrl,
      apiKey: input.apiKey,
      model: input.ttsModel,
      ttsVoice: input.ttsVoice || "alloy",
      ttsFormat: input.ttsFormat || "mp3",
      systemMessage: previous.systemMessage
    });
    configuredTasks.push("hookMaker");
  } else {
    skippedTasks.push("hookMaker");
  }

  return {
    settings: { ...settings, aiProviders },
    configuredTasks,
    skippedTasks
  };
}
