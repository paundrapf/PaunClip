import { describe, expect, it } from "vitest";
import { buildProviderConfig, normalizeAISettings } from "@/shared/constants/ai-providers";

describe("buildProviderConfig", () => {
  it("uses a TTS model and voice for Groq Hook Maker", () => {
    const config = buildProviderConfig("groq", "hookMaker");

    expect(config.baseUrl).toBe("https://api.groq.com/openai/v1");
    expect(config.model).toBe("canopylabs/orpheus-v1-english");
    expect(config.ttsVoice).toBe("hannah");
    expect(config.ttsFormat).toBe("wav");
  });

  it("preserves an existing api key when switching provider defaults", () => {
    const config = buildProviderConfig("openai", "highlightFinder", {
      apiKey: "sk-test"
    });

    expect(config.apiKey).toBe("sk-test");
    expect(config.model).toBe("gpt-4.1");
  });

  it("migrates old Groq Hook Maker defaults to current Orpheus settings", () => {
    const settings = normalizeAISettings({
      highlightFinder: buildProviderConfig("groq", "highlightFinder"),
      captionMaker: buildProviderConfig("groq", "captionMaker"),
      hookMaker: {
        ...buildProviderConfig("groq", "hookMaker"),
        model: "orpheus-tts",
        ttsVoice: "tara",
        ttsFormat: "mp3"
      },
      youtubeTitleMaker: buildProviderConfig("groq", "youtubeTitleMaker")
    });

    expect(settings.hookMaker.model).toBe("canopylabs/orpheus-v1-english");
    expect(settings.hookMaker.ttsVoice).toBe("hannah");
    expect(settings.hookMaker.ttsFormat).toBe("wav");
  });
});
