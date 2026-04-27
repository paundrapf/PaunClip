import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createAIClient } from "@/server/ai/provider-router";
import type { AIProviderConfig } from "@/shared/schemas/settings";

export async function generateHookSpeech(params: {
  text: string;
  config: AIProviderConfig;
  outputPath: string;
}) {
  if (!params.config.apiKey && params.config.provider !== "custom") {
    throw new Error("Hook Maker API key is empty.");
  }
  if (!params.config.model) {
    throw new Error("Hook Maker model is empty.");
  }
  if (!params.config.ttsVoice) {
    throw new Error("Hook Maker voice is empty.");
  }

  const client = createAIClient(params.config);
  if (!("audio" in client)) {
    throw new Error("Hook Maker provider does not support OpenAI-compatible TTS.");
  }

  const response = await client.audio.speech.create({
    model: params.config.model,
    voice: params.config.ttsVoice as never,
    input: params.text,
    response_format: params.config.ttsFormat ?? "mp3",
    speed: params.config.ttsSpeed
  });

  const bytes = Buffer.from(await response.arrayBuffer());
  await mkdir(path.dirname(params.outputPath), { recursive: true });
  await writeFile(params.outputPath, bytes);

  return {
    audioPath: params.outputPath,
    voice: params.config.ttsVoice,
    model: params.config.model,
    format: params.config.ttsFormat ?? "mp3"
  };
}
