import "server-only";
import type OpenAI from "openai";
import type Anthropic from "@anthropic-ai/sdk";
import type { AIProviderConfig } from "@/shared/schemas/settings";
import { highlightSchema, type Highlight, type Transcript } from "@/shared/schemas/session";
import { AIProviderRouter, isOpenAIClient } from "@/server/ai/provider-router";
import { improveHighlights } from "./highlight-quality";

const highlightArraySchema = highlightSchema.array();

type AIClient = OpenAI | Anthropic;

type Chunk = {
  transcript: Transcript;
  tokenEstimate: number;
};

export async function findHighlights(params: {
  router: AIProviderRouter;
  transcript: Transcript;
  prompt?: string;
  targetCount?: number;
}): Promise<Highlight[]> {
  const targetCount = params.targetCount ?? 8;
  const config = params.router.getConfig("highlightFinder");
  const client = params.router.getClient("highlightFinder");

  if (!config.apiKey) {
    return improveHighlights(fallbackHighlights(params.transcript, targetCount), params.transcript, targetCount);
  }

  try {
    const highlights = await findHighlightsWithAI({
      client,
      config,
      transcript: params.transcript,
      userPrompt: params.prompt,
      targetCount
    });
    if (highlights.length === 0) {
      return improveHighlights(fallbackHighlights(params.transcript, targetCount), params.transcript, targetCount);
    }
    return improveHighlights(highlights, params.transcript, targetCount);
  } catch {
    return improveHighlights(fallbackHighlights(params.transcript, targetCount), params.transcript, targetCount);
  }
}

async function findHighlightsWithAI(params: {
  client: AIClient;
  config: AIProviderConfig;
  transcript: Transcript;
  userPrompt?: string;
  targetCount: number;
}) {
  const budget = getPromptTokenBudget(params.config);
  const transcriptTokens = estimateTranscriptTokens(params.transcript);
  if (transcriptTokens <= budget) {
    try {
      const prompt = buildHighlightPrompt(
        params.transcript,
        params.userPrompt,
        params.targetCount,
        "final"
      );
      const raw = await callAI(params.client, params.config.model, prompt);
      return parseHighlights(raw, params.transcript, params.targetCount, false);
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
  targetCount: number;
  chunkBudget: number;
}) {
  const chunks = splitTranscriptIntoChunks(params.transcript, params.chunkBudget);
  const candidates: Highlight[] = [];
  const perChunkTarget = Math.max(3, Math.ceil((params.targetCount * 1.5) / Math.max(1, chunks.length)));

  for (const chunk of chunks) {
    try {
      const prompt = buildHighlightPrompt(
        chunk.transcript,
        params.userPrompt,
        perChunkTarget,
        "chunk"
      );
      const raw = await callAI(params.client, params.config.model, prompt);
      candidates.push(...parseHighlights(raw, chunk.transcript, perChunkTarget, false));
    } catch (error) {
      if (isPromptTooLargeError(error) && chunk.tokenEstimate > 1800) {
        const smallerChunks = splitTranscriptIntoChunks(chunk.transcript, Math.floor(chunk.tokenEstimate / 2));
        for (const smallerChunk of smallerChunks) {
          try {
            const prompt = buildHighlightPrompt(
              smallerChunk.transcript,
              params.userPrompt,
              Math.max(2, perChunkTarget - 1),
              "chunk"
            );
            const raw = await callAI(params.client, params.config.model, prompt);
            candidates.push(...parseHighlights(raw, smallerChunk.transcript, perChunkTarget, false));
          } catch {
            // Skip a noisy chunk instead of failing the whole session.
          }
        }
      }
    }
  }

  if (candidates.length === 0) {
    return fallbackHighlights(params.transcript, params.targetCount);
  }

  return candidates;
}

function buildHighlightPrompt(
  transcript: Transcript,
  userPrompt = "",
  targetCount: number,
  mode: "chunk" | "final"
) {
  const compactTranscript = transcript.segments
    .map((segment) => `[${segment.start.toFixed(1)}-${segment.end.toFixed(1)}] ${segment.text}`)
    .join("\n");

  const modeInstruction =
    mode === "chunk"
      ? "This is one transcript chunk. Return only moments that are self-contained inside this chunk."
      : "Return the best final moments across the whole transcript.";

  return `You are an expert short-form podcast clip curator.

${modeInstruction}
Find up to ${targetCount} standalone highlight clips from this transcript.
Return JSON only. The JSON must be an object with a "highlights" array.
Each highlight object must have:
startTime, endTime, title, description, viralityScore, selected, hookText.

Rules:
- startTime and endTime are seconds from the original video.
- Prefer complete thoughts with setup, core point, and payoff/reaction.
- Avoid clips that start in the middle of a sentence or end before the speaker finishes.
- Podcast/story clips should usually be 24-75 seconds.
- Short punchline clips can be shorter only when the joke is complete.
- viralityScore is 0-100.
- Titles are max 10 words.
- hookText is max 12 words and should make the first second understandable.
- If transcript language is Indonesian, use Indonesian titles and hooks.
- User request: ${userPrompt || "No specific request"}.

Transcript:
${compactTranscript}`;
}

async function callAI(client: AIClient, model: string, prompt: string) {
  return isOpenAIClient(client)
    ? callOpenAI(client, model, prompt)
    : callAnthropic(client, model, prompt);
}

async function callOpenAI(client: OpenAI, model: string, prompt: string) {
  try {
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
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
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2
    });
    return response.choices[0]?.message.content ?? "[]";
  }
}

async function callAnthropic(client: Anthropic, model: string, prompt: string) {
  const response = await client.messages.create({
    model,
    max_tokens: 4000,
    temperature: 0.2,
    messages: [{ role: "user", content: prompt }]
  });
  const block = response.content[0];
  return block?.type === "text" ? block.text : "[]";
}

function parseHighlights(
  raw: string,
  transcript: Transcript,
  targetCount: number,
  fallbackOnError: boolean
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
  } catch {
    return fallbackOnError ? fallbackHighlights(transcript, targetCount) : [];
  }
}

function fallbackHighlights(transcript: Transcript, targetCount: number): Highlight[] {
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
