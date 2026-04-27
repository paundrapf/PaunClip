import "server-only";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { AIProviderConfig, AISettings } from "@/shared/schemas/settings";
import {
  AI_PROVIDER_TASKS,
  getProviderPreset,
  type AIProviderTask
} from "@/shared/constants/ai-providers";

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

  async validate(task: AIProviderTask) {
    const config = this.getConfig(task);
    return validateAIProviderConfig(task, config);
  }

  private createClient(config: AIProviderConfig) {
    return createAIClient(config);
  }
}

export async function validateAIProviderConfig(
  task: AIProviderTask,
  config: AIProviderConfig
) {
  const preset = getProviderPreset(config.provider);
  const capability =
    task === "captionMaker" ? "transcription" : task === "hookMaker" ? "tts" : "chat";

  if (!AI_PROVIDER_TASKS.includes(task)) {
    return { ok: false, message: "Unknown AI task" };
  }

  if (!preset.supports[capability]) {
    return {
      ok: false,
      message: `${preset.label} belum mendukung ${capability} untuk task ini.`
    };
  }

  if (!config.apiKey && config.provider !== "custom") {
    return { ok: false, message: "API key masih kosong." };
  }

  if (!config.model) {
    return { ok: false, message: "Model masih kosong." };
  }

  if (task === "hookMaker" && !config.ttsVoice) {
    return { ok: false, message: "Hook Maker butuh voice untuk TTS." };
  }

  if (
    task === "hookMaker" &&
    preset.supportedTtsFormats?.length &&
    config.ttsFormat &&
    !preset.supportedTtsFormats.includes(config.ttsFormat)
  ) {
    return {
      ok: false,
      message: `${preset.label} Hook Maker hanya mendukung format ${preset.supportedTtsFormats.join(", ")}.`
    };
  }

  const client = createAIClient(config);

  if (client instanceof Anthropic) {
    await client.models.list({ limit: 1 });
    return { ok: true, message: "Anthropic reachable dan model list bisa diakses." };
  }

  if (task === "hookMaker") {
    await client.audio.speech.create({
      model: config.model,
      voice: config.ttsVoice!,
      input: "PaunClip test",
      response_format: config.ttsFormat ?? "mp3",
      speed: config.ttsSpeed
    });
    return {
      ok: true,
      message: `Hook Maker TTS valid. Model ${config.model}, voice ${config.ttsVoice}.`
    };
  }

  await client.models.list();
  return { ok: true, message: `${preset.label} reachable dan model list bisa diakses.` };
}

export async function loadAIProviderModels(config: AIProviderConfig) {
  const preset = getProviderPreset(config.provider);
  if (!preset.supports.modelList) {
    return Object.values(preset.defaultsByTask).map((item) => item.model);
  }

  const client = createAIClient(config);

  if (client instanceof Anthropic) {
    const models = await client.models.list({ limit: 100 });
    return models.data.map((model) => model.id).sort();
  }

  const models = await client.models.list();
  return models.data.map((model) => model.id).sort();
}

export function isOpenAIClient(client: OpenAI | Anthropic): client is OpenAI {
  return client instanceof OpenAI;
}

export function createAIClient(config: AIProviderConfig) {
  if (config.provider === "anthropic") {
    return new Anthropic({
      apiKey: config.apiKey || "missing-key"
    });
  }

  return new OpenAI({
    apiKey: config.apiKey || "missing-key",
    baseURL: config.baseUrl || undefined
  });
}
