import "server-only";
import type { Highlight, SessionConfig, Transcript, TranscriptSegment } from "@/shared/schemas/session";

const BOUNDARY_SCORER_VERSION = "boundary_scorer_v2";
const DEFAULT_START_BACKTRACK_SECONDS = 5.5;
const SENTENCE_BACKTRACK_SECONDS = 8;
const MAX_REPAIR_CANDIDATES = 32;

type ClipLength = SessionConfig["clipLength"];

export type HighlightQualityOptions = {
  targetCount: number;
  clipLength?: ClipLength;
  processingStart?: number;
  processingEnd?: number;
  allowRepair?: boolean;
};

export type HighlightQualityDiagnostics = {
  version: string;
  targetCount: number;
  inputCount: number;
  normalizedCount: number;
  expandedCount: number;
  dedupedCount: number;
  repairCandidateCount: number;
  repairAddedCount: number;
  rejected: Array<{
    title: string;
    reason: string;
    startTime?: number;
    endTime?: number;
  }>;
};

type DurationPolicy = {
  min: number;
  preferred: number;
  max: number;
};

type NormalizedHighlight = Highlight & {
  qualitySource?: "ai" | "repair";
};

export function improveHighlights(
  highlights: Highlight[],
  transcript: Transcript,
  targetCount: number
): Highlight[] {
  return improveHighlightsWithDiagnostics(highlights, transcript, { targetCount }).highlights;
}

export function improveHighlightsWithDiagnostics(
  highlights: Highlight[],
  transcript: Transcript,
  options: HighlightQualityOptions
): { highlights: Highlight[]; diagnostics: HighlightQualityDiagnostics } {
  const policy = getDurationPolicy(options.clipLength, transcript);
  const bounds = getProcessingBounds(transcript, options);
  const diagnostics: HighlightQualityDiagnostics = {
    version: BOUNDARY_SCORER_VERSION,
    targetCount: options.targetCount,
    inputCount: highlights.length,
    normalizedCount: 0,
    expandedCount: 0,
    dedupedCount: 0,
    repairCandidateCount: 0,
    repairAddedCount: 0,
    rejected: []
  };

  const normalized = highlights
    .map((highlight) => normalizeHighlight(highlight, bounds, diagnostics))
    .filter((highlight): highlight is NormalizedHighlight => Boolean(highlight));
  diagnostics.normalizedCount = normalized.length;

  const expanded = normalized.map((highlight) =>
    expandHighlightBoundaries(highlight, transcript, policy, bounds, diagnostics)
  );
  diagnostics.expandedCount = expanded.length;

  const deduped = dedupeHighlights(expanded, diagnostics);
  diagnostics.dedupedCount = deduped.length;

  let finalHighlights = deduped.slice(0, options.targetCount);
  if (options.allowRepair !== false && finalHighlights.length < options.targetCount) {
    const repairCandidates = buildTranscriptRepairCandidates(transcript, finalHighlights, options, policy, bounds);
    diagnostics.repairCandidateCount = repairCandidates.length;
    const repaired = dedupeHighlights([...finalHighlights, ...repairCandidates], diagnostics).slice(
      0,
      options.targetCount
    );
    diagnostics.repairAddedCount = Math.max(0, repaired.length - finalHighlights.length);
    finalHighlights = repaired;
  }

  return {
    highlights: finalHighlights.map(stripQualitySource),
    diagnostics
  };
}

export function normalizeViralityScore(score: number | undefined) {
  if (score === undefined || Number.isNaN(score)) {
    return undefined;
  }

  const normalized = score <= 10 ? score * 10 : score;
  return Math.max(0, Math.min(100, Math.round(normalized)));
}

export function getHighlightBoundaryScorerVersion() {
  return BOUNDARY_SCORER_VERSION;
}

function normalizeHighlight(
  highlight: Highlight,
  bounds: { start: number; end: number },
  diagnostics: HighlightQualityDiagnostics
): NormalizedHighlight | null {
  const rawStart = Number(highlight.startTime);
  const rawEnd = Number(highlight.endTime);
  if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) {
    diagnostics.rejected.push({
      title: highlight.title || "Untitled clip",
      reason: "non_finite_timestamp",
      startTime: rawStart,
      endTime: rawEnd
    });
    return null;
  }

  const startTime = clamp(Math.min(rawStart, rawEnd), bounds.start, bounds.end);
  const endTime = clamp(Math.max(rawStart, rawEnd), bounds.start, bounds.end);
  if (endTime - startTime < 2) {
    diagnostics.rejected.push({
      title: highlight.title || "Untitled clip",
      reason: "too_short_after_clamp",
      startTime,
      endTime
    });
    return null;
  }

  return {
    ...highlight,
    startTime,
    endTime,
    title: compactTitle(highlight.title),
    description: highlight.description?.trim(),
    hookText: compactText(highlight.hookText, 12),
    viralityScore: normalizeViralityScore(highlight.viralityScore),
    selected: highlight.selected
  };
}

function expandHighlightBoundaries(
  highlight: NormalizedHighlight,
  transcript: Transcript,
  policy: DurationPolicy,
  bounds: { start: number; end: number },
  diagnostics: HighlightQualityDiagnostics
): NormalizedHighlight {
  const segments = transcript.segments
    .filter((segment) => segment.end > segment.start)
    .filter((segment) => segment.end >= bounds.start && segment.start <= bounds.end)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  if (segments.length === 0) {
    return highlight;
  }

  let startIndex = segments.findIndex((segment) => segment.end >= highlight.startTime);
  if (startIndex < 0) {
    startIndex = 0;
  }
  let endIndex = segments.findIndex((segment) => segment.end >= highlight.endTime);
  if (endIndex < 0) {
    endIndex = segments.length - 1;
  }

  const earliestAllowed = Math.max(bounds.start, highlight.startTime - DEFAULT_START_BACKTRACK_SECONDS);
  startIndex = findNaturalStartIndex(segments, startIndex, earliestAllowed);
  endIndex = findNaturalEndIndex(segments, endIndex, startIndex, policy, bounds.end);

  let startTime = Math.max(bounds.start, segments[startIndex]!.start - 0.5);
  if (startTime <= bounds.start + 0.05 && highlight.startTime > bounds.start + 8) {
    startTime = Math.max(bounds.start, highlight.startTime - 1.2);
    diagnostics.rejected.push({
      title: highlight.title,
      reason: "prevented_unjustified_zero_start",
      startTime: highlight.startTime,
      endTime: highlight.endTime
    });
  }

  let endTime = Math.min(bounds.end, segments[endIndex]!.end + 0.8);
  while (endTime - startTime < policy.min && endIndex < segments.length - 1) {
    endIndex += 1;
    endTime = Math.min(bounds.end, segments[endIndex]!.end + 0.8);
  }

  if (endTime - startTime > policy.max) {
    endTime = findBoundedEnd(segments, startTime, endTime, policy.max, policy.min, bounds.end);
  }

  return {
    ...highlight,
    startTime: roundTime(startTime),
    endTime: roundTime(Math.min(bounds.end, Math.max(endTime, startTime + 2)))
  };
}

function findNaturalStartIndex(
  segments: TranscriptSegment[],
  startIndex: number,
  earliestAllowed: number
) {
  let candidate = startIndex;
  for (let index = startIndex - 1; index >= 0; index -= 1) {
    const previous = segments[index]!;
    const current = segments[candidate]!;
    if (previous.start < earliestAllowed) {
      break;
    }
    if (current.start - previous.start > SENTENCE_BACKTRACK_SECONDS) {
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
  policy: DurationPolicy,
  maxEnd: number
) {
  let candidate = endIndex;
  while (candidate < segments.length - 1) {
    const duration = segments[candidate]!.end - segments[startIndex]!.start;
    if (duration >= policy.min && endsLikeSentence(segments[candidate]!.text)) {
      break;
    }
    if (duration >= policy.preferred && hasSoftBoundary(segments[candidate]!, segments[candidate + 1])) {
      break;
    }
    if (duration >= policy.max || segments[candidate]!.end >= maxEnd) {
      break;
    }
    candidate += 1;
  }
  return candidate;
}

function findBoundedEnd(
  segments: TranscriptSegment[],
  startTime: number,
  currentEnd: number,
  maxDuration: number,
  minDuration: number,
  maxEnd: number
) {
  const hardMax = Math.min(maxEnd, startTime + maxDuration);
  const minEnd = startTime + minDuration;
  const candidates = segments
    .filter((segment) => segment.end >= minEnd && segment.end <= hardMax)
    .sort((a, b) => {
      const sentenceDelta = Number(endsLikeSentence(b.text)) - Number(endsLikeSentence(a.text));
      return sentenceDelta || Math.abs(b.end - hardMax) - Math.abs(a.end - hardMax);
    });
  return candidates[0]?.end ?? Math.min(currentEnd, hardMax);
}

function dedupeHighlights(
  highlights: NormalizedHighlight[],
  diagnostics: HighlightQualityDiagnostics
) {
  const selected: NormalizedHighlight[] = [];
  const ordered = [...highlights].sort((a, b) => {
    const scoreDelta = (b.viralityScore ?? 0) - (a.viralityScore ?? 0);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
    return a.startTime - b.startTime;
  });

  for (const highlight of ordered) {
    const overlap = selected.find((existing) => overlapRatio(existing, highlight) > 0.55);
    if (overlap) {
      diagnostics.rejected.push({
        title: highlight.title,
        reason: "overlaps_existing_highlight",
        startTime: highlight.startTime,
        endTime: highlight.endTime
      });
      continue;
    }
    selected.push(highlight);
  }
  return selected;
}

function buildTranscriptRepairCandidates(
  transcript: Transcript,
  existing: Highlight[],
  options: HighlightQualityOptions,
  policy: DurationPolicy,
  bounds: { start: number; end: number }
): NormalizedHighlight[] {
  const segments = transcript.segments
    .filter((segment) => segment.end > segment.start)
    .filter((segment) => segment.end >= bounds.start && segment.start <= bounds.end)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  if (segments.length === 0) {
    return [];
  }

  const candidates: NormalizedHighlight[] = [];
  for (let index = 0; index < segments.length; index += Math.max(1, Math.floor(segments.length / MAX_REPAIR_CANDIDATES))) {
    const startSegment = segments[index]!;
    if (startSegment.start <= bounds.start + 3 && segments.length > 6) {
      continue;
    }
    const window = buildWindowFromSegment(segments, index, policy, bounds.end);
    if (!window || window.endTime - window.startTime < policy.min) {
      continue;
    }
    if (existing.some((highlight) => overlapRatio(highlight, window) > 0.45)) {
      continue;
    }
    candidates.push(window);
  }

  return candidates
    .sort((a, b) => repairScore(b) - repairScore(a))
    .slice(0, Math.max(0, options.targetCount - existing.length) * 3);
}

function buildWindowFromSegment(
  segments: TranscriptSegment[],
  startIndex: number,
  policy: DurationPolicy,
  maxEnd: number
): NormalizedHighlight | null {
  const start = segments[startIndex]!.start;
  let endIndex = startIndex;
  while (endIndex < segments.length - 1 && segments[endIndex]!.end - start < policy.preferred) {
    if (segments[endIndex]!.end - start >= policy.min && endsLikeSentence(segments[endIndex]!.text)) {
      break;
    }
    endIndex += 1;
  }

  const end = Math.min(maxEnd, segments[endIndex]!.end);
  const text = segments
    .slice(startIndex, endIndex + 1)
    .map((segment) => segment.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) {
    return null;
  }

  return {
    startTime: roundTime(start),
    endTime: roundTime(end),
    title: buildTitleFromText(text),
    description: compactText(text, 24),
    viralityScore: Math.max(52, Math.min(78, Math.round(50 + repairTextScore(text)))),
    selected: true,
    hookText: compactText(text, 10),
    qualitySource: "repair"
  };
}

function repairScore(highlight: Highlight) {
  const text = `${highlight.title} ${highlight.description ?? ""}`;
  const duration = highlight.endTime - highlight.startTime;
  return (highlight.viralityScore ?? 50) + repairTextScore(text) - Math.abs(duration - 45) * 0.08;
}

function repairTextScore(text: string) {
  const normalized = text.toLowerCase();
  let score = Math.min(16, text.split(/\s+/).filter(Boolean).length * 0.25);
  if (/[?!]/.test(text)) score += 5;
  if (/\b(kenapa|gimana|ternyata|akhirnya|juta|rahasia|penting|masalah|solusi|cerita|bukti)\b/i.test(normalized)) {
    score += 7;
  }
  if (/\d/.test(text)) score += 4;
  return score;
}

function getDurationPolicy(clipLength: ClipLength | undefined, transcript: Transcript): DurationPolicy {
  const duration = getTranscriptDuration(transcript);
  const isShortSource = duration > 0 && duration < 180;
  switch (clipLength) {
    case "lt_30s":
      return { min: 12, preferred: 24, max: 29 };
    case "30s_59s":
      return { min: 30, preferred: 45, max: 59 };
    case "60s_89s":
      return { min: 60, preferred: 72, max: 89 };
    case "90s_3m":
      return { min: 90, preferred: 120, max: 180 };
    case "3m_5m":
      return { min: 180, preferred: 240, max: 300 };
    case "5m_10m":
      return { min: 300, preferred: 420, max: 600 };
    case "10m_15m":
      return { min: 600, preferred: 720, max: 900 };
    default:
      return isShortSource ? { min: 16, preferred: 34, max: 45 } : { min: 24, preferred: 52, max: 75 };
  }
}

function getProcessingBounds(transcript: Transcript, options: HighlightQualityOptions) {
  const duration = getTranscriptDuration(transcript);
  const start = clamp(options.processingStart ?? 0, 0, duration);
  const end = clamp(options.processingEnd ?? duration, start + 0.1, duration || start + 0.1);
  return { start, end };
}

function getTranscriptDuration(transcript: Transcript) {
  return transcript.segments.at(-1)?.end ?? 0;
}

function endsLikeSentence(text: string) {
  return /[.!?:;\u2026]$/.test(text.trim());
}

function hasSoftBoundary(segment: TranscriptSegment, next?: TranscriptSegment) {
  if (!next) {
    return true;
  }
  return next.start - segment.end > 0.45 || endsLikeSentence(segment.text);
}

function overlapRatio(a: Pick<Highlight, "startTime" | "endTime">, b: Pick<Highlight, "startTime" | "endTime">) {
  const overlap = Math.max(0, Math.min(a.endTime, b.endTime) - Math.max(a.startTime, b.startTime));
  const shorter = Math.min(a.endTime - a.startTime, b.endTime - b.startTime);
  return shorter > 0 ? overlap / shorter : 0;
}

function stripQualitySource(highlight: NormalizedHighlight): Highlight {
  const { qualitySource, ...stripped } = highlight;
  void qualitySource;
  return stripped;
}

function buildTitleFromText(text: string) {
  const words = text.replace(/\s+/g, " ").trim().split(/\s+/).slice(0, 8);
  const title = words.join(" ").replace(/[,.!?;:]+$/g, "");
  return compactTitle(title || "Recovered Moment");
}

function compactTitle(value: string | undefined) {
  return (value?.replace(/\s+/g, " ").trim() || "Untitled clip").slice(0, 120);
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
