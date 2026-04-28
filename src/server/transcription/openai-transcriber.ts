import "server-only";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import OpenAI from "openai";
import type { AIProviderConfig } from "@/shared/schemas/settings";
import type { Transcript } from "@/shared/schemas/session";
import { normalizeOpenAICompatibleBaseUrl } from "@/shared/constants/ai-providers";
import { normalizeTranscriptForShorts } from "./normalize-transcript";
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
    baseURL: params.config.baseUrl ? normalizeOpenAICompatibleBaseUrl(params.config.baseUrl) : undefined
  });

  let verboseResponse: unknown;
  try {
    verboseResponse = await client.audio.transcriptions.create({
      file: createReadStream(params.audioPath),
      model: params.config.model || "whisper-1",
      language: params.language,
      response_format: "verbose_json",
      timestamp_granularities: ["word", "segment"]
    });
  } catch (error) {
    return transcribeWithSrtFallback({
      audioPath: params.audioPath,
      client,
      config: params.config,
      error,
      language: params.language,
      reason: "verbose_json transcription request failed"
    });
  }

  const transcript = transcriptFromVerboseJson(verboseResponse, params.language ?? "id");
  if (transcript.segments.length > 0) {
    return transcript;
  }

  return transcribeWithSrtFallback({
    audioPath: params.audioPath,
    client,
    config: params.config,
    language: params.language,
    reason: "verbose_json transcription did not include usable timestamps"
  });
}

async function transcribeWithSrtFallback(params: {
  audioPath: string;
  client: OpenAI;
  config: AIProviderConfig;
  error?: unknown;
  language?: string;
  reason: string;
}) {
  console.error("[PaunClip] Falling back to SRT transcription", {
    provider: params.config.provider,
    model: params.config.model,
    reason: params.reason,
    error: params.error instanceof Error ? params.error.message : params.error
  });

  const response = await params.client.audio.transcriptions.create({
    file: createReadStream(params.audioPath),
    model: params.config.model || "whisper-1",
    language: params.language,
    response_format: "srt"
  });

  return parseSrt(String(response), params.language ?? "id");
}

type VerboseTranscription = {
  text?: string;
  words?: Array<{ word?: string; start?: number; end?: number }>;
  segments?: Array<{
    text?: string;
    start?: number;
    end?: number;
    words?: Array<{ word?: string; start?: number; end?: number }>;
  }>;
};

export function transcriptFromVerboseJson(
  response: unknown,
  language: string
): Transcript {
  const data = response as VerboseTranscription;
  if (data.words?.length) {
    return normalizeTranscriptForShorts({
      language,
      segments: data.words
        .map((word) => ({
          start: Number(word.start ?? 0),
          end: Number(word.end ?? word.start ?? 0),
          text: String(word.word ?? "").trim(),
          words: [
            {
              word: String(word.word ?? "").trim(),
              start: Number(word.start ?? 0),
              end: Number(word.end ?? word.start ?? 0)
            }
          ]
        }))
        .filter((segment) => segment.text && segment.end > segment.start)
    });
  }

  const segments = (data.segments ?? [])
    .map((segment) => ({
      start: Number(segment.start ?? 0),
      end: Number(segment.end ?? segment.start ?? 0),
      text: String(segment.text ?? "").trim(),
      words: (segment.words ?? [])
        .map((word) => ({
          word: String(word.word ?? "").trim(),
          start: Number(word.start ?? 0),
          end: Number(word.end ?? word.start ?? 0)
        }))
        .filter((word) => word.word && word.end > word.start)
    }))
    .filter((segment) => segment.text && segment.end > segment.start);

  return normalizeTranscriptForShorts({
    language,
    segments
  });
}
