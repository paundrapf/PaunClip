import "server-only";
import type { AppSettings } from "@/shared/schemas/settings";
import { DEFAULT_CAPTION_PRESETS } from "@/shared/constants/caption-presets";
import { DEFAULT_LANGUAGE, DEFAULT_OUTPUT_DIR } from "@/shared/constants/app";

export const defaultAppSettings: AppSettings = {
  aiProviders: {
    highlightFinder: {
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "",
      model: "gpt-4.1",
      systemMessage:
        "You are an expert short-form video curator. Return only schema-valid highlights."
    },
    captionMaker: {
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "",
      model: "whisper-1"
    },
    hookMaker: {
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "",
      model: "gpt-4.1",
      ttsVoice: "alloy",
      ttsFormat: "mp3",
      ttsSpeed: 1
    },
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
    autoSave: true,
    autoImport: false
  }
};
