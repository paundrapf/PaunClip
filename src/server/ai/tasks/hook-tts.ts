import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createAIClient } from "@/server/ai/provider-router";
import { getProviderPreset } from "@/shared/constants/ai-providers";
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

  const preset = getProviderPreset(params.config.provider);
  const supportedFormats = preset.supportedTtsFormats ?? ["mp3", "wav", "opus"];
  const responseFormat = params.config.ttsFormat && supportedFormats.includes(params.config.ttsFormat)
    ? params.config.ttsFormat
    : supportedFormats[0];
  const input = params.config.provider === "groq"
    ? params.text.slice(0, 200)
    : params.text;

  const response = await client.audio.speech.create({
    model: params.config.model,
    voice: params.config.ttsVoice as never,
    input,
    response_format: responseFormat,
    speed: params.config.ttsSpeed
  });

  const bytes = Buffer.from(await response.arrayBuffer());
  await mkdir(path.dirname(params.outputPath), { recursive: true });
  await writeFile(params.outputPath, bytes);

  return {
    audioPath: params.outputPath,
    voice: params.config.ttsVoice,
    model: params.config.model,
    format: responseFormat
  };
}
