import { describe, expect, it } from "vitest";
import { buildProviderConfig } from "@/shared/constants/ai-providers";
import type { AppSettings } from "@/shared/schemas/settings";
import {
  buildTaskProviderAISettings,
  buildCustomAISettings,
  buildSingleProviderAISettings,
  getProviderChoicesForTask,
  isSetupProviderChoice
} from "@/cli/setup-config";

function baseSettings(): AppSettings {
  return {
    aiProviders: {
      highlightFinder: buildProviderConfig("openai", "highlightFinder", {
        systemMessage: "keep this prompt"
      }),
      captionMaker: buildProviderConfig("openai", "captionMaker"),
      hookMaker: buildProviderConfig("openai", "hookMaker"),
      youtubeTitleMaker: buildProviderConfig("openai", "youtubeTitleMaker")
    },
    captionPresets: [],
    cookies: { youtubePath: null, lastUpdated: null },
    outputDirectory: "./storage/output",
    preferences: {
      defaultLanguage: "id",
      defaultAspectRatio: "9:16",
      defaultClipModel: "auto",
      defaultContentPreset: "auto",
      defaultReframeMode: "auto_fast",
      autoSave: true,
      autoImport: false
    }
  };
}

describe("CLI setup config helpers", () => {
  it("recognizes setup provider choices", () => {
    expect(isSetupProviderChoice("groq")).toBe(true);
    expect(isSetupProviderChoice("openai")).toBe(true);
    expect(isSetupProviderChoice("custom")).toBe(true);
    expect(isSetupProviderChoice("anthropic")).toBe(false);
  });

  it("configures all AI tasks from one Groq API key", () => {
    const result = buildSingleProviderAISettings(baseSettings(), {
      provider: "groq",
      apiKey: "gsk-secret"
    });

    expect(result.configuredTasks).toEqual([
      "highlightFinder",
      "captionMaker",
      "hookMaker",
      "youtubeTitleMaker"
    ]);
    expect(result.skippedTasks).toEqual([]);
    expect(result.settings.aiProviders.highlightFinder.provider).toBe("groq");
    expect(result.settings.aiProviders.captionMaker.model).toBe("whisper-large-v3-turbo");
    expect(result.settings.aiProviders.hookMaker.ttsVoice).toBe("hannah");
    expect(result.settings.aiProviders.highlightFinder.systemMessage).toBe("keep this prompt");
    expect(result.settings.aiProviders.youtubeTitleMaker.apiKey).toBe("gsk-secret");
  });

  it("keeps known chat-only custom providers away from transcription and TTS", () => {
    const result = buildCustomAISettings(baseSettings(), {
      baseUrl: "https://opencode.ai/zen/go/v1/chat/completions",
      apiKey: "sk-hidden",
      chatModel: "MiMo-V2-Pro",
      transcriptionModel: "whisper-1",
      ttsModel: "tts-1"
    });

    expect(result.configuredTasks).toEqual(["highlightFinder", "youtubeTitleMaker"]);
    expect(result.skippedTasks).toEqual(["captionMaker", "hookMaker"]);
    expect(result.settings.aiProviders.highlightFinder.baseUrl).toBe("https://opencode.ai/zen/go/v1");
    expect(result.settings.aiProviders.highlightFinder.model).toBe("MiMo-V2-Pro");
  });

  it("filters provider choices by task capability", () => {
    expect(getProviderChoicesForTask("highlightFinder")).toContain("anthropic");
    expect(getProviderChoicesForTask("youtubeTitleMaker")).toContain("gemini");
    expect(getProviderChoicesForTask("captionMaker")).toEqual(["groq", "openai", "custom"]);
    expect(getProviderChoicesForTask("hookMaker")).toEqual(["groq", "openai", "custom"]);
    expect(
      getProviderChoicesForTask("captionMaker", {
        baseUrl: "https://opencode.ai/zen/go/v1/chat/completions"
      })
    ).toEqual(["groq", "openai"]);
  });

  it("configures one AI task without rewriting other task providers", () => {
    const result = buildTaskProviderAISettings(baseSettings(), {
      task: "captionMaker",
      provider: "groq",
      apiKey: "gsk-secret",
      model: "whisper-large-v3-turbo"
    });

    expect(result.configuredTasks).toEqual(["captionMaker"]);
    expect(result.settings.aiProviders.captionMaker.provider).toBe("groq");
    expect(result.settings.aiProviders.captionMaker.apiKey).toBe("gsk-secret");
    expect(result.settings.aiProviders.highlightFinder.provider).toBe("openai");
    expect(result.settings.aiProviders.highlightFinder.systemMessage).toBe("keep this prompt");
  });
});
