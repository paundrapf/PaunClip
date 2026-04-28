import "server-only";
import type { Transcript } from "@/shared/schemas/session";

export type HighlightPromptMode = "single_video" | "campaign_batch";
export type HighlightPromptScope = "chunk" | "final";

export type HighlightPromptMessages = {
  system: string;
  user: string;
};

export const DEFAULT_HIGHLIGHT_SYSTEM_PROMPT =
  "You are PaunClip's expert short-form video curator. Find complete, high-retention moments and return only schema-valid JSON.";

export function buildHighlightPromptMessages(input: {
  transcript: Transcript;
  userPrompt?: string;
  targetCount: number;
  scope: HighlightPromptScope;
  promptMode?: HighlightPromptMode;
  systemMessage?: string;
}): HighlightPromptMessages {
  const compactTranscript = input.transcript.segments
    .map((segment) => `[${segment.start.toFixed(1)}-${segment.end.toFixed(1)}] ${segment.text}`)
    .join("\n");
  const scopeInstruction =
    input.scope === "chunk"
      ? "This is one transcript chunk. Return only moments that are self-contained inside this chunk."
      : "Return the best final moments across the whole transcript.";
  const modeInstruction =
    input.promptMode === "campaign_batch"
      ? "This video is part of a batch campaign. Follow the campaign intent and choose moments that can stand alone without extra context from other videos."
      : "This is a single source video. Choose the strongest standalone moments from this source.";

  return {
    system: input.systemMessage?.trim() || DEFAULT_HIGHLIGHT_SYSTEM_PROMPT,
    user: `${modeInstruction}

${scopeInstruction}
Find up to ${input.targetCount} standalone highlight clips from this transcript.
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
- User intent: ${input.userPrompt?.trim() || "No specific request"}.

Transcript:
${compactTranscript}`
  };
}
