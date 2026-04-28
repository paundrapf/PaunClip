import { describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import {
  findHighlights,
  HighlightFinderError
} from "@/server/ai/tasks/highlight-finder";
import type { AIProviderRouter } from "@/server/ai/provider-router";
import type { AIProviderConfig } from "@/shared/schemas/settings";
import type { Transcript } from "@/shared/schemas/session";

const transcript: Transcript = {
  language: "id",
  segments: [
    {
      start: 0,
      end: 8,
      text: "Ini pembuka obrolan yang menjelaskan konteks bisnis.",
      words: []
    },
    {
      start: 8,
      end: 28,
      text: "Lalu narasumber memberi contoh konkret tentang peluang yang bisa dicoba.",
      words: []
    }
  ]
};

const baseConfig: AIProviderConfig = {
  provider: "openai",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "test-key",
  model: "gpt-test"
};

describe("highlight finder", () => {
  it("fails instead of creating equal-interval clips when the API key is missing", async () => {
    await expect(
      findHighlights({
        router: createRouter({ ...baseConfig, apiKey: "" }),
        transcript,
        targetCount: 8
      })
    ).rejects.toMatchObject({
      name: "HighlightFinderError",
      reason: "missing_api_key"
    });
  });

  it("fails when the provider returns no usable highlights", async () => {
    const client = createOpenAIClientWithResponse('{"highlights":[]}');

    await expect(
      findHighlights({
        router: createRouter(baseConfig, client),
        transcript,
        targetCount: 8
      })
    ).rejects.toMatchObject({
      name: "HighlightFinderError",
      reason: "empty_result"
    });
  });

  it("surfaces invalid JSON instead of falling back silently", async () => {
    const client = createOpenAIClientWithResponse("not json");

    await expect(
      findHighlights({
        router: createRouter(baseConfig, client),
        transcript,
        targetCount: 8
      })
    ).rejects.toBeInstanceOf(HighlightFinderError);
  });
});

function createRouter(config: AIProviderConfig, client = new OpenAI({ apiKey: "test-key" })) {
  return {
    getConfig: () => config,
    getClient: () => client
  } as unknown as AIProviderRouter;
}

function createOpenAIClientWithResponse(content: string) {
  const client = new OpenAI({ apiKey: "test-key" });
  vi.spyOn(client.chat.completions, "create").mockResolvedValue({
    choices: [
      {
        message: {
          content
        }
      }
    ]
  } as Awaited<ReturnType<typeof client.chat.completions.create>>);
  return client;
}
