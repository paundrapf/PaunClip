import "server-only";
import type OpenAI from "openai";
import type Anthropic from "@anthropic-ai/sdk";
import { highlightSchema, type Highlight, type Transcript } from "@/shared/schemas/session";
import { AIProviderRouter, isOpenAIClient } from "@/server/ai/provider-router";

const highlightArraySchema = highlightSchema.array();

export async function findHighlights(params: {
  router: AIProviderRouter;
  transcript: Transcript;
  prompt?: string;
  targetCount?: number;
}): Promise<Highlight[]> {
  const config = params.router.getConfig("highlightFinder");
  const client = params.router.getClient("highlightFinder");
  const prompt = buildHighlightPrompt(params.transcript, params.prompt, params.targetCount ?? 8);

  if (!config.apiKey) {
    return fallbackHighlights(params.transcript, params.targetCount ?? 5);
  }

  const raw = isOpenAIClient(client)
    ? await callOpenAI(client, config.model, prompt)
    : await callAnthropic(client, config.model, prompt);

  return parseHighlights(raw, params.transcript, params.targetCount ?? 5);
}

function buildHighlightPrompt(transcript: Transcript, userPrompt = "", targetCount: number) {
  const compactTranscript = transcript.segments
    .map((segment) => `[${segment.start.toFixed(1)}-${segment.end.toFixed(1)}] ${segment.text}`)
    .join("\n")
    .slice(0, 80_000);

  return `You are an expert short-form video curator.

Find up to ${targetCount} standalone highlight clips from this transcript.
Return JSON only. The JSON must be an object with a "highlights" array.
Each highlight object must have:
startTime, endTime, title, description, viralityScore, selected, hookText.

Rules:
- startTime and endTime are seconds.
- Clip length should usually be 15-90 seconds unless the content strongly needs more.
- Titles are max 10 words.
- If transcript language is Indonesian, use Indonesian titles and hooks.
- User request: ${userPrompt || "No specific request"}.

Transcript:
${compactTranscript}`;
}

async function callOpenAI(client: OpenAI, model: string, prompt: string) {
  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "user",
        content: prompt
      }
    ],
    temperature: 0.2,
    response_format: { type: "json_object" }
  });

  return response.choices[0]?.message.content ?? "[]";
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

function parseHighlights(raw: string, transcript: Transcript, targetCount: number) {
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
    return fallbackHighlights(transcript, targetCount);
  }
}

function fallbackHighlights(transcript: Transcript, targetCount: number): Highlight[] {
  const duration = transcript.segments.at(-1)?.end ?? 0;
  if (!duration) {
    return [];
  }

  const clipLength = Math.min(60, Math.max(20, duration / Math.max(1, targetCount)));
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
