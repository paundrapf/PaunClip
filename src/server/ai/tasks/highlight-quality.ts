import "server-only";
import type { Highlight, Transcript, TranscriptSegment } from "@/shared/schemas/session";

const MIN_PODCAST_CLIP_SECONDS = 24;
const MIN_SHORT_CLIP_SECONDS = 16;
const MAX_CLIP_SECONDS = 90;

export function improveHighlights(
  highlights: Highlight[],
  transcript: Transcript,
  targetCount: number
): Highlight[] {
  const duration = getTranscriptDuration(transcript);
  const improved = highlights
    .map((highlight) => normalizeHighlight(highlight, duration))
    .filter((highlight): highlight is Highlight => Boolean(highlight))
    .map((highlight) => expandHighlightBoundaries(highlight, transcript))
    .sort((a, b) => (b.viralityScore ?? 0) - (a.viralityScore ?? 0));

  return dedupeHighlights(improved).slice(0, targetCount);
}

export function normalizeViralityScore(score: number | undefined) {
  if (score === undefined || Number.isNaN(score)) {
    return undefined;
  }

  const normalized = score <= 10 ? score * 10 : score;
  return Math.max(0, Math.min(100, Math.round(normalized)));
}

function normalizeHighlight(highlight: Highlight, duration: number): Highlight | null {
  const startTime = clamp(Math.min(highlight.startTime, highlight.endTime), 0, duration);
  const endTime = clamp(Math.max(highlight.startTime, highlight.endTime), 0, duration);
  if (endTime - startTime < 2) {
    return null;
  }

  return {
    ...highlight,
    startTime,
    endTime,
    title: highlight.title.trim().slice(0, 120) || "Untitled clip",
    description: highlight.description?.trim(),
    hookText: compactText(highlight.hookText, 12),
    viralityScore: normalizeViralityScore(highlight.viralityScore),
    selected: highlight.selected
  };
}

function expandHighlightBoundaries(highlight: Highlight, transcript: Transcript): Highlight {
  const segments = transcript.segments.filter((segment) => segment.end > segment.start);
  if (segments.length === 0) {
    return highlight;
  }

  const duration = getTranscriptDuration(transcript);
  const minDuration = duration >= 300 ? MIN_PODCAST_CLIP_SECONDS : MIN_SHORT_CLIP_SECONDS;
  let startIndex = segments.findIndex((segment) => segment.end >= highlight.startTime);
  if (startIndex < 0) {
    startIndex = 0;
  }
  let endIndex = segments.findIndex((segment) => segment.end >= highlight.endTime);
  if (endIndex < 0) {
    endIndex = segments.length - 1;
  }

  startIndex = findNaturalStartIndex(segments, startIndex);
  endIndex = findNaturalEndIndex(segments, endIndex, startIndex, minDuration);

  const startTime = Math.max(0, segments[startIndex]!.start - 0.8);
  let endTime = Math.min(duration, segments[endIndex]!.end + 1.1);

  while (endTime - startTime < minDuration && endIndex < segments.length - 1) {
    endIndex += 1;
    endTime = Math.min(duration, segments[endIndex]!.end + 1.1);
  }

  if (endTime - startTime > MAX_CLIP_SECONDS) {
    endTime = startTime + MAX_CLIP_SECONDS;
    const boundedEndIndex = segments.findIndex((segment) => segment.end >= endTime);
    if (boundedEndIndex >= 0) {
      endTime = Math.max(startTime + minDuration, segments[boundedEndIndex]!.end);
    }
  }

  return {
    ...highlight,
    startTime: roundTime(startTime),
    endTime: roundTime(Math.min(duration, Math.max(endTime, startTime + 2)))
  };
}

function findNaturalStartIndex(segments: TranscriptSegment[], startIndex: number) {
  let candidate = startIndex;
  for (let index = startIndex - 1; index >= 0; index -= 1) {
    const previous = segments[index]!;
    const current = segments[candidate]!;
    if (current.start - previous.start > 12) {
      break;
    }
    if (endsLikeSentence(previous.text)) {
      break;
    }
    candidate = index;
  }
  return candidate;
}

function findNaturalEndIndex(
  segments: TranscriptSegment[],
  endIndex: number,
  startIndex: number,
  minDuration: number
) {
  let candidate = endIndex;
  while (candidate < segments.length - 1) {
    const duration = segments[candidate]!.end - segments[startIndex]!.start;
    if (duration >= minDuration && endsLikeSentence(segments[candidate]!.text)) {
      break;
    }
    if (duration >= MAX_CLIP_SECONDS) {
      break;
    }
    candidate += 1;
  }
  return candidate;
}

function dedupeHighlights(highlights: Highlight[]) {
  const selected: Highlight[] = [];
  for (const highlight of highlights) {
    const overlapsExisting = selected.some((existing) => overlapRatio(existing, highlight) > 0.55);
    if (!overlapsExisting) {
      selected.push(highlight);
    }
  }
  return selected;
}

function overlapRatio(a: Highlight, b: Highlight) {
  const overlap = Math.max(0, Math.min(a.endTime, b.endTime) - Math.max(a.startTime, b.startTime));
  const shorter = Math.min(a.endTime - a.startTime, b.endTime - b.startTime);
  return shorter > 0 ? overlap / shorter : 0;
}

function getTranscriptDuration(transcript: Transcript) {
  return transcript.segments.at(-1)?.end ?? 0;
}

function endsLikeSentence(text: string) {
  return /[.!?…]$/.test(text.trim());
}

function compactText(value: string | undefined, maxWords: number) {
  if (!value) {
    return undefined;
  }
  return value.replace(/\s+/g, " ").trim().split(/\s+/).slice(0, maxWords).join(" ");
}

function roundTime(value: number) {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
