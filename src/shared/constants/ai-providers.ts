import type { AIProviderConfig, AISettings } from "@/shared/schemas/settings";

export const AI_PROVIDER_TASKS = [
  "highlightFinder",
  "captionMaker",
  "hookMaker",
  "youtubeTitleMaker"
] as const;

export type AIProviderTask = (typeof AI_PROVIDER_TASKS)[number];

export type AIProviderPreset = {
  provider: AIProviderConfig["provider"];
  label: string;
  defaultBaseUrl: string;
  keyPlaceholder: string;
  docsUrl: string;
  supports: {
    chat: boolean;
    transcription: boolean;
    tts: boolean;
    modelList: boolean;
  };
  defaultsByTask: Partial<
    Record<
      AIProviderTask,
      {
        model: string;
        voice?: string;
        format?: NonNullable<AIProviderConfig["ttsFormat"]>;
      }
    >
  >;
  knownVoices?: string[];
};

export const AI_PROVIDER_PRESETS: Record<AIProviderConfig["provider"], AIProviderPreset> = {
  openai: {
    provider: "openai",
    label: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    keyPlaceholder: "sk-...",
    docsUrl: "https://platform.openai.com/api-keys",
    supports: { chat: true, transcription: true, tts: true, modelList: true },
    defaultsByTask: {
      highlightFinder: { model: "gpt-4.1" },
      captionMaker: { model: "whisper-1" },
      hookMaker: { model: "tts-1", voice: "alloy", format: "mp3" },
      youtubeTitleMaker: { model: "gpt-4.1" }
    },
    knownVoices: ["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"]
  },
  groq: {
    provider: "groq",
    label: "Groq",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    keyPlaceholder: "gsk_...",
    docsUrl: "https://console.groq.com/docs/text-to-speech",
    supports: { chat: true, transcription: true, tts: true, modelList: true },
    defaultsByTask: {
      highlightFinder: { model: "llama-3.3-70b-versatile" },
      captionMaker: { model: "whisper-large-v3-turbo" },
      hookMaker: { model: "orpheus-tts", voice: "tara", format: "mp3" },
      youtubeTitleMaker: { model: "llama-3.3-70b-versatile" }
    },
    knownVoices: ["tara", "leah", "jess", "leo", "dan", "mia", "zac", "zoe", "Fritz-PlayAI"]
  },
  anthropic: {
    provider: "anthropic",
    label: "Anthropic",
    defaultBaseUrl: "https://api.anthropic.com",
    keyPlaceholder: "sk-ant-...",
    docsUrl: "https://console.anthropic.com/",
    supports: { chat: true, transcription: false, tts: false, modelList: true },
    defaultsByTask: {
      highlightFinder: { model: "claude-3-5-sonnet-20241022" },
      youtubeTitleMaker: { model: "claude-3-5-sonnet-20241022" }
    }
  },
  gemini: {
    provider: "gemini",
    label: "Gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyPlaceholder: "AIza...",
    docsUrl: "https://aistudio.google.com/app/apikey",
    supports: { chat: true, transcription: false, tts: false, modelList: false },
    defaultsByTask: {
      highlightFinder: { model: "gemini-2.5-flash" },
      youtubeTitleMaker: { model: "gemini-2.5-flash" }
    }
  },
  custom: {
    provider: "custom",
    label: "Custom OpenAI-compatible",
    defaultBaseUrl: "http://localhost:8000/v1",
    keyPlaceholder: "optional",
    docsUrl: "https://platform.openai.com/docs/api-reference",
    supports: { chat: true, transcription: true, tts: true, modelList: true },
    defaultsByTask: {
      highlightFinder: { model: "custom-chat-model" },
      captionMaker: { model: "whisper-1" },
      hookMaker: { model: "tts-1", voice: "alloy", format: "mp3" },
      youtubeTitleMaker: { model: "custom-chat-model" }
    }
  }
};

export function getProviderPreset(provider: AIProviderConfig["provider"]) {
  return AI_PROVIDER_PRESETS[provider];
}

export function buildProviderConfig(
  provider: AIProviderConfig["provider"],
  task: AIProviderTask,
  previous?: Partial<AIProviderConfig>
): AIProviderConfig {
  const preset = getProviderPreset(provider);
  const defaults = preset.defaultsByTask[task];

  return {
    provider,
    baseUrl: previous?.baseUrl || preset.defaultBaseUrl,
    apiKey: previous?.apiKey ?? "",
    model: previous?.model || defaults?.model || "",
    systemMessage: previous?.systemMessage,
    ttsVoice: previous?.ttsVoice || defaults?.voice,
    ttsFormat: previous?.ttsFormat || defaults?.format,
    ttsSpeed: previous?.ttsSpeed ?? 1
  };
}

export function normalizeAISettings(settings: AISettings): AISettings {
  return Object.fromEntries(
    AI_PROVIDER_TASKS.map((task) => {
      const config = settings[task];
      const preset = getProviderPreset(config.provider);
      const defaults = preset.defaultsByTask[task];
      return [
        task,
        {
          ...config,
          baseUrl: config.baseUrl || preset.defaultBaseUrl,
          model: config.model || defaults?.model || "",
          ttsVoice: task === "hookMaker" ? config.ttsVoice || defaults?.voice : config.ttsVoice,
          ttsFormat:
            task === "hookMaker" ? config.ttsFormat || defaults?.format || "mp3" : config.ttsFormat,
          ttsSpeed: task === "hookMaker" ? config.ttsSpeed ?? 1 : config.ttsSpeed
        }
      ];
    })
  ) as AISettings;
}
