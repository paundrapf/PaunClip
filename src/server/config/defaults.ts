import "server-only";
import type { AppSettings } from "@/shared/schemas/settings";
import { DEFAULT_CAPTION_PRESETS } from "@/shared/constants/caption-presets";
import { DEFAULT_LANGUAGE, DEFAULT_OUTPUT_DIR } from "@/shared/constants/app";
import { buildProviderConfig } from "@/shared/constants/ai-providers";
import { DEFAULT_HIGHLIGHT_SYSTEM_PROMPT } from "@/server/ai/prompts/highlight-finder";

export const defaultAppSettings: AppSettings = {
  aiProviders: {
    highlightFinder: {
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "",
      model: "gpt-4.1",
      systemMessage: DEFAULT_HIGHLIGHT_SYSTEM_PROMPT
    },
    captionMaker: buildProviderConfig("openai", "captionMaker"),
    hookMaker: buildProviderConfig("openai", "hookMaker"),
    youtubeTitleMaker: {
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "",
      model: "gpt-4.1"
    }
  },
  captionPresets: DEFAULT_CAPTION_PRESETS,
  cookies: {
    youtubePath: null,
    lastUpdated: null
  },
  outputDirectory: DEFAULT_OUTPUT_DIR,
  preferences: {
    defaultLanguage: DEFAULT_LANGUAGE,
    defaultAspectRatio: "9:16",
    defaultClipModel: "auto",
    defaultContentPreset: "auto",
    defaultReframeMode: "auto_fast",
    autoSave: true,
    autoImport: false
  }
};
