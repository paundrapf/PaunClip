import "server-only";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { AIProviderConfig, AISettings } from "@/shared/schemas/settings";

export type AIClients = {
  highlightFinder: OpenAI | Anthropic;
  captionMaker: OpenAI | Anthropic;
  hookMaker: OpenAI | Anthropic;
  youtubeTitleMaker: OpenAI | Anthropic;
};

export class AIProviderRouter {
  private clients: AIClients;

  constructor(private settings: AISettings) {
    this.clients = {
      highlightFinder: this.createClient(settings.highlightFinder),
      captionMaker: this.createClient(settings.captionMaker),
      hookMaker: this.createClient(settings.hookMaker),
      youtubeTitleMaker: this.createClient(settings.youtubeTitleMaker)
    };
  }

  getClient(task: keyof AIClients) {
    return this.clients[task];
  }

  getConfig(task: keyof AIClients) {
    return this.settings[task];
  }

  async validate(task: keyof AIClients) {
    const config = this.getConfig(task);
    const client = this.getClient(task);

    if (!config.apiKey) {
      return { ok: false, message: "API key is empty" };
    }

    if (client instanceof OpenAI) {
      await client.models.list();
      return { ok: true, message: "OpenAI-compatible provider reachable" };
    }

    await client.models.list({ limit: 1 });
    return { ok: true, message: "Anthropic provider reachable" };
  }

  private createClient(config: AIProviderConfig) {
    if (config.provider === "anthropic") {
      return new Anthropic({
        apiKey: config.apiKey
      });
    }

    return new OpenAI({
      apiKey: config.apiKey || "missing-key",
      baseURL: config.baseUrl || undefined
    });
  }
}

export function isOpenAIClient(client: OpenAI | Anthropic): client is OpenAI {
  return client instanceof OpenAI;
}
