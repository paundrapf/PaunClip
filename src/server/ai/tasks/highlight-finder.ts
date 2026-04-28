import "server-only";
import type OpenAI from "openai";
import type Anthropic from "@anthropic-ai/sdk";
import type { AIProviderConfig } from "@/shared/schemas/settings";
import { highlightSchema, type Highlight, type Transcript } from "@/shared/schemas/session";
import { AIProviderRouter, isOpenAIClient } from "@/server/ai/provider-router";
import {
  buildHighlightPromptMessages,
  type HighlightPromptMessages,
  type HighlightPromptMode
} from "@/server/ai/prompts/highlight-finder";
import { improveHighlights } from "./highlight-quality";

const highlightArraySchema = highlightSchema.array();

export type HighlightFinderFailureReason =
  | "missing_api_key"
  | "provider_error"
  | "prompt_too_large"
  | "invalid_json"
  | "empty_result";

export class HighlightFinderError extends Error {
  constructor(
    message: string,
    public readonly reason: HighlightFinderFailureReason,
    public readonly provider: AIProviderConfig["provider"],
    public readonly model: string,
    public readonly causeMessage?: string,
    public readonly responsePreview?: string
  ) {
    super(message);
    this.name = "HighlightFinderError";
  }
}

type AIClient = OpenAI | Anthropic;

type Chunk = {
  transcript: Transcript;
  tokenEstimate: number;
};

export async function findHighlights(params: {
  router: AIProviderRouter;
  transcript: Transcript;
  prompt?: string;
  promptMode?: HighlightPromptMode;
  targetCount?: number;
}): Promise<Highlight[]> {
  const targetCount = params.targetCount ?? 8;
  const config = params.router.getConfig("highlightFinder");
  const client = params.router.getClient("highlightFinder");

  if (!config.apiKey && config.provider !== "custom") {
    throw new HighlightFinderError(
      "Highlight Finder API key is missing.",
      "missing_api_key",
      config.provider,
      config.model
    );
  }

  try {
    const highlights = await findHighlightsWithAI({
      client,
      config,
      transcript: params.transcript,
      userPrompt: params.prompt,
      promptMode: params.promptMode,
      targetCount
    });
    if (highlights.length === 0) {
      throw new HighlightFinderError(
        "No usable highlights returned by Highlight Finder.",
        "empty_result",
        config.provider,
        config.model
      );
    }
    const improved = improveHighlights(highlights, params.transcript, targetCount);
    if (improved.length === 0) {
      throw new HighlightFinderError(
        "Highlight Finder returned highlights, but none survived quality checks.",
        "empty_result",
        config.provider,
        config.model
      );
    }
    return improved;
  } catch (error) {
    if (error instanceof HighlightFinderError) {
      throw error;
    }

    throw new HighlightFinderError(
      "Highlight Finder failed.",
      classifyHighlightFinderError(error),
      config.provider,
      config.model,
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function findHighlightsWithAI(params: {
  client: AIClient;
  config: AIProviderConfig;
  transcript: Transcript;
  userPrompt?: string;
  promptMode?: HighlightPromptMode;
  targetCount: number;
}) {
  const budget = getPromptTokenBudget(params.config);
  const transcriptTokens = estimateTranscriptTokens(params.transcript);
  if (transcriptTokens <= budget) {
    try {
      const prompt = buildHighlightPromptMessages({
        transcript: params.transcript,
        userPrompt: params.userPrompt,
        targetCount: params.targetCount,
        scope: "final",
        promptMode: params.promptMode,
        systemMessage: params.config.systemMessage
      });
      const raw = await callAI(params.client, params.config.model, prompt);
      return parseHighlights(raw, params.transcript, params.targetCount, false, params.config);
    } catch (error) {
      if (!isPromptTooLargeError(error)) {
        throw error;
      }
    }
  }

  return findHighlightsByChunks({
    ...params,
    chunkBudget: Math.max(1800, Math.floor(budget * 0.55))
  });
}

async function findHighlightsByChunks(params: {
  client: AIClient;
  config: AIProviderConfig;
  transcript: Transcript;
  userPrompt?: string;
  promptMode?: HighlightPromptMode;
  targetCount: number;
  chunkBudget: number;
}) {
  const chunks = splitTranscriptIntoChunks(params.transcript, params.chunkBudget);
  const candidates: Highlight[] = [];
  let firstError: unknown;
  const perChunkTarget = Math.max(3, Math.ceil((params.targetCount * 1.5) / Math.max(1, chunks.length)));

  for (const chunk of chunks) {
    try {
      const prompt = buildHighlightPromptMessages({
        transcript: chunk.transcript,
        userPrompt: params.userPrompt,
        targetCount: perChunkTarget,
        scope: "chunk",
        promptMode: params.promptMode,
        systemMessage: params.config.systemMessage
      });
      const raw = await callAI(params.client, params.config.model, prompt);
      candidates.push(...parseHighlights(raw, chunk.transcript, perChunkTarget, false, params.config));
    } catch (error) {
      if (isPromptTooLargeError(error) && chunk.tokenEstimate > 1800) {
        const smallerChunks = splitTranscriptIntoChunks(chunk.transcript, Math.floor(chunk.tokenEstimate / 2));
        for (const smallerChunk of smallerChunks) {
          try {
            const prompt = buildHighlightPromptMessages({
              transcript: smallerChunk.transcript,
              userPrompt: params.userPrompt,
              targetCount: Math.max(2, perChunkTarget - 1),
              scope: "chunk",
              promptMode: params.promptMode,
              systemMessage: params.config.systemMessage
            });
            const raw = await callAI(params.client, params.config.model, prompt);
            candidates.push(...parseHighlights(raw, smallerChunk.transcript, perChunkTarget, false, params.config));
          } catch (nestedError) {
            firstError ??= nestedError;
          }
        }
      } else {
        firstError ??= error;
      }
    }
  }

  if (candidates.length === 0) {
    if (firstError) {
      throw firstError;
    }

    throw new HighlightFinderError(
      "No usable highlights returned by Highlight Finder.",
      "empty_result",
      params.config.provider,
      params.config.model
    );
  }

  return candidates;
}

async function callAI(client: AIClient, model: string, prompt: HighlightPromptMessages) {
  return isOpenAIClient(client)
    ? callOpenAI(client, model, prompt)
    : callAnthropic(client, model, prompt);
}

async function callOpenAI(client: OpenAI, model: string, prompt: HighlightPromptMessages) {
  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user }
      ],
      temperature: 0.2,
      response_format: { type: "json_object" }
    });

    return response.choices[0]?.message.content ?? "[]";
  } catch (error) {
    if (!isResponseFormatError(error)) {
      throw error;
    }

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user }
      ],
      temperature: 0.2
    });
    return response.choices[0]?.message.content ?? "[]";
  }
}

async function callAnthropic(client: Anthropic, model: string, prompt: HighlightPromptMessages) {
  const response = await client.messages.create({
    model,
    max_tokens: 4000,
    temperature: 0.2,
    system: prompt.system,
    messages: [{ role: "user", content: prompt.user }]
  });
  const block = response.content[0];
  return block?.type === "text" ? block.text : "[]";
}

function parseHighlights(
  raw: string,
  transcript: Transcript,
  targetCount: number,
  fallbackOnError: boolean,
  config: AIProviderConfig
) {
  try {
    const parsed = JSON.parse(extractJson(raw));
    const maybeArray = Array.isArray(parsed) ? parsed : parsed.highlights;
    const normalized = (maybeArray ?? []).map((item: Record<string, unknown>) => ({
      startTime: Number(item.startTime ?? item.start_time),
      endTime: Number(item.endTime ?? item.end_time),
      title: String(item.title ?? "Untitled clip"),
      description: item.description ? String(item.description) : undefined,
      viralityScore: item.viralityScore
        ? Number(item.viralityScore)
        : item.virality_score
          ? Number(item.virality_score)
          : undefined,
      selected: item.selected === undefined ? true : Boolean(item.selected),
      hookText: item.hookText ? String(item.hookText) : item.hook_text ? String(item.hook_text) : undefined
    }));
    return highlightArraySchema.parse(normalized);
  } catch (error) {
    if (fallbackOnError) {
      return buildEqualIntervalFallbackHighlights(transcript, targetCount);
    }

    throw new HighlightFinderError(
      "Highlight Finder returned invalid JSON.",
      "invalid_json",
      config.provider,
      config.model,
      error instanceof Error ? error.message : String(error),
      raw.slice(0, 500)
    );
  }
}

export function buildEqualIntervalFallbackHighlights(
  transcript: Transcript,
  targetCount: number
): Highlight[] {
  const duration = transcript.segments.at(-1)?.end ?? 0;
  if (!duration) {
    return [];
  }

  const clipLength = Math.min(60, Math.max(24, duration / Math.max(1, targetCount)));
  return Array.from({ length: Math.min(targetCount, Math.ceil(duration / clipLength)) }).map(
    (_, index) => {
      const startTime = Math.round(index * clipLength);
      const endTime = Math.min(duration, startTime + clipLength);
      return {
        startTime,
        endTime,
        title: `Clip ${index + 1}`,
        description: "Fallback equal-interval segment because AI highlight detection was unavailable.",
        viralityScore: Math.max(50, 80 - index * 5),
        selected: true,
        hookText: undefined
      };
    }
  );
}

function splitTranscriptIntoChunks(transcript: Transcript, tokenBudget: number): Chunk[] {
  const chunks: Chunk[] = [];
  let current = emptyTranscript(transcript);
  let currentTokens = 0;

  for (const segment of transcript.segments) {
    const segmentTokens = estimateTextTokens(segment.text) + 10;
    if (current.segments.length > 0 && currentTokens + segmentTokens > tokenBudget) {
      chunks.push({ transcript: current, tokenEstimate: currentTokens });
      current = emptyTranscript(transcript);
      currentTokens = 0;
    }
    current.segments.push(segment);
    currentTokens += segmentTokens;
  }

  if (current.segments.length > 0) {
    chunks.push({ transcript: current, tokenEstimate: currentTokens });
  }

  return chunks;
}

function emptyTranscript(transcript: Transcript): Transcript {
  return {
    ...transcript,
    segments: []
  };
}

function getPromptTokenBudget(config: AIProviderConfig) {
  if (config.provider === "groq") {
    return 7600;
  }
  if (config.provider === "gemini" || config.provider === "anthropic") {
    return 30_000;
  }
  if (config.provider === "custom") {
    return 18_000;
  }
  return 24_000;
}

function estimateTranscriptTokens(transcript: Transcript) {
  return transcript.segments.reduce(
    (total, segment) => total + estimateTextTokens(segment.text) + 10,
    0
  );
}

function estimateTextTokens(text: string) {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(Math.max(wordCount * 1.35, text.length / 4));
}

function isPromptTooLargeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /request too large|tokens per minute|context_length|maximum context|413|too many tokens/i.test(
    message
  );
}

function classifyHighlightFinderError(error: unknown): HighlightFinderFailureReason {
  return isPromptTooLargeError(error) ? "prompt_too_large" : "provider_error";
}

function isResponseFormatError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /response_format|json_object|not support.*json|unsupported.*format/i.test(message);
}

function extractJson(value: string) {
  const first = value.indexOf("{");
  const arrayFirst = value.indexOf("[");
  if (arrayFirst >= 0 && (first < 0 || arrayFirst < first)) {
    const last = value.lastIndexOf("]");
    return value.slice(arrayFirst, last + 1);
  }
  const last = value.lastIndexOf("}");
  return first >= 0 && last >= 0 ? value.slice(first, last + 1) : value;
}
