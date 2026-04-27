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
  supportedTtsFormats?: Array<NonNullable<AIProviderConfig["ttsFormat"]>>;
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
    knownVoices: ["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"],
    supportedTtsFormats: ["mp3", "wav", "opus"]
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
      hookMaker: { model: "canopylabs/orpheus-v1-english", voice: "hannah", format: "wav" },
      youtubeTitleMaker: { model: "llama-3.3-70b-versatile" }
    },
    knownVoices: ["autumn", "diana", "hannah", "austin", "daniel", "troy", "fahad", "sultan", "lulwa", "noura"],
    supportedTtsFormats: ["wav"]
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
    },
    supportedTtsFormats: ["mp3", "wav", "opus"]
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
  const supportedTtsFormats = preset.supportedTtsFormats ?? ["mp3", "wav", "opus"];
  const previousTtsFormat = previous?.ttsFormat;
  const ttsFormat = previousTtsFormat && supportedTtsFormats.includes(previousTtsFormat)
    ? previousTtsFormat
    : defaults?.format;

  return {
    provider,
    baseUrl: normalizeOpenAICompatibleBaseUrl(previous?.baseUrl || preset.defaultBaseUrl),
    apiKey: previous?.apiKey ?? "",
    model: previous?.model || defaults?.model || "",
    systemMessage: previous?.systemMessage,
    ttsVoice: previous?.ttsVoice || defaults?.voice,
    ttsFormat,
    ttsSpeed: previous?.ttsSpeed ?? 1
  };
}

export function normalizeAISettings(settings: AISettings): AISettings {
  return Object.fromEntries(
    AI_PROVIDER_TASKS.map((task) => {
      const config = settings[task];
      const preset = getProviderPreset(config.provider);
      const defaults = preset.defaultsByTask[task];
      const supportedTtsFormats = preset.supportedTtsFormats ?? ["mp3", "wav", "opus"];
      const ttsFormat = config.ttsFormat && supportedTtsFormats.includes(config.ttsFormat)
        ? config.ttsFormat
        : defaults?.format;
      const model =
        task === "hookMaker" && config.provider === "groq" && config.model === "orpheus-tts"
          ? defaults?.model ?? config.model
          : config.model || defaults?.model || "";
      const voice =
        task === "hookMaker" && config.provider === "groq" && isLegacyGroqTtsVoice(config.ttsVoice)
          ? defaults?.voice
          : config.ttsVoice || defaults?.voice;
      return [
        task,
        {
          ...config,
          baseUrl: normalizeOpenAICompatibleBaseUrl(config.baseUrl || preset.defaultBaseUrl),
          model,
          ttsVoice: task === "hookMaker" ? voice : config.ttsVoice,
          ttsFormat:
            task === "hookMaker" ? ttsFormat || "mp3" : config.ttsFormat,
          ttsSpeed: task === "hookMaker" ? config.ttsSpeed ?? 1 : config.ttsSpeed
        }
      ];
    })
  ) as AISettings;
}

export function normalizeOpenAICompatibleBaseUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed);
    url.search = "";
    url.hash = "";
    let pathname = url.pathname.replace(/\/+$/g, "");
    const endpointSuffixes = [
      "/chat/completions",
      "/completions",
      "/responses",
      "/audio/speech",
      "/audio/transcriptions",
      "/models"
    ];
    const lowerPathname = pathname.toLowerCase();
    const suffix = endpointSuffixes.find((candidate) => lowerPathname.endsWith(candidate));
    if (suffix) {
      pathname = pathname.slice(0, -suffix.length);
    }
    url.pathname = pathname || "/";
    return url.toString().replace(/\/$/g, "");
  } catch {
    return trimmed.replace(/\/+$/g, "");
  }
}

function isLegacyGroqTtsVoice(voice?: string) {
  return Boolean(
    voice &&
      ["tara", "leah", "jess", "leo", "dan", "mia", "zac", "zoe", "Fritz-PlayAI"].includes(voice)
  );
}
