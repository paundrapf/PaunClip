import "server-only";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import OpenAI from "openai";
import type { AIProviderConfig } from "@/shared/schemas/settings";
import type { Transcript } from "@/shared/schemas/session";
import { parseSrt } from "./srt";

const MAX_DIRECT_UPLOAD_BYTES = 25 * 1024 * 1024;

export async function transcribeAudioWithOpenAICompatible(params: {
  audioPath: string;
  config: AIProviderConfig;
  language?: string;
}): Promise<Transcript> {
  const info = await stat(params.audioPath);
  if (info.size > MAX_DIRECT_UPLOAD_BYTES) {
    throw new Error(
      "Audio file is larger than the direct transcription limit. Chunking must run before transcription."
    );
  }

  const client = new OpenAI({
    apiKey: params.config.apiKey || "missing-key",
    baseURL: params.config.baseUrl || undefined
  });

  const response = await client.audio.transcriptions.create({
    file: createReadStream(params.audioPath),
    model: params.config.model || "whisper-1",
    language: params.language,
    response_format: "srt"
  });

  return parseSrt(String(response), params.language ?? "id");
}
