import { describe, expect, it } from "vitest";
import { buildProviderConfig } from "@/shared/constants/ai-providers";

describe("buildProviderConfig", () => {
  it("uses a TTS model and voice for Groq Hook Maker", () => {
    const config = buildProviderConfig("groq", "hookMaker");

    expect(config.baseUrl).toBe("https://api.groq.com/openai/v1");
    expect(config.model).toBe("orpheus-tts");
    expect(config.ttsVoice).toBe("tara");
    expect(config.ttsFormat).toBe("mp3");
  });

  it("preserves an existing api key when switching provider defaults", () => {
    const config = buildProviderConfig("openai", "highlightFinder", {
      apiKey: "sk-test"
    });

    expect(config.apiKey).toBe("sk-test");
    expect(config.model).toBe("gpt-4.1");
  });
});
