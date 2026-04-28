import "server-only";
import type { Transcript, TranscriptSegment } from "@/shared/schemas/session";

type TimedWord = {
  word: string;
  start: number;
  end: number;
};

type NormalizeTranscriptOptions = {
  language?: string;
  maxWordsPerSegment?: number;
  maxSegmentDuration?: number;
  minWordsBeforeBreak?: number;
  lookbackWords?: number;
};

const DEFAULT_MAX_WORDS = 6;
const DEFAULT_MAX_DURATION = 1.9;
const DEFAULT_MIN_WORDS_BEFORE_BREAK = 3;
const DEFAULT_LOOKBACK_WORDS = 18;
const OVERLAP_TOLERANCE_S = 0.05;

export function normalizeTranscriptForShorts(
  transcript: Transcript,
  options: NormalizeTranscriptOptions = {}
): Transcript {
  const words = buildMonotonicWordStream(transcript, options);
  if (words.length === 0) {
    return {
      ...transcript,
      language: options.language ?? transcript.language,
      segments: []
    };
  }

  return {
    ...transcript,
    language: options.language ?? transcript.language,
    segments: buildPhraseSegments(words, options)
  };
}

function buildMonotonicWordStream(
  transcript: Transcript,
  options: NormalizeTranscriptOptions
): TimedWord[] {
  const lookbackWords = options.lookbackWords ?? DEFAULT_LOOKBACK_WORDS;
  const stream: TimedWord[] = [];
  const sorted = transcript.segments
    .map((segment) => ({
      ...segment,
      text: cleanCaptionText(segment.text)
    }))
    .filter((segment) => segment.text && segment.end > segment.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  for (const segment of sorted) {
    const segmentWords = getSegmentWords(segment);
    if (segmentWords.length === 0) {
      continue;
    }

    const recent = stream.slice(-lookbackWords).map((word) => normalizeToken(word.word));
    const current = segmentWords.map((word) => normalizeToken(word.word));
    const overlap = longestSuffixPrefixOverlap(recent, current);
    const candidateWords = segmentWords.slice(overlap);
    if (candidateWords.length === 0) {
      continue;
    }

    for (const word of candidateWords) {
      const previous = stream.at(-1);
      const duration = Math.max(0.08, word.end - word.start);
      const start =
        previous && word.start < previous.end - OVERLAP_TOLERANCE_S
          ? previous.end + 0.01
          : word.start;
      stream.push({
        word: word.word,
        start,
        end: Math.max(start + 0.08, start + duration)
      });
    }
  }

  return collapseAdjacentDuplicates(stream);
}

function getSegmentWords(segment: TranscriptSegment): TimedWord[] {
  const words =
    segment.words.length > 0
      ? segment.words
          .map((word) => ({
            word: cleanWord(word.word),
            start: word.start,
            end: word.end
          }))
          .filter((word) => word.word && word.end > word.start)
      : estimateWords(segment.text, segment.start, segment.end);

  if (words.length === 0) {
    return estimateWords(segment.text, segment.start, segment.end);
  }

  return words;
}

function estimateWords(text: string, start: number, end: number): TimedWord[] {
  const tokens = splitWords(text);
  if (tokens.length === 0) {
    return [];
  }

  const duration = Math.max(0.35, end - start);
  const wordDuration = Math.max(0.08, duration / tokens.length);
  return tokens.map((word, index) => ({
    word,
    start: start + index * wordDuration,
    end: Math.min(end, start + (index + 1) * wordDuration)
  }));
}

function buildPhraseSegments(
  words: TimedWord[],
  options: NormalizeTranscriptOptions
): TranscriptSegment[] {
  const maxWords = options.maxWordsPerSegment ?? DEFAULT_MAX_WORDS;
  const maxDuration = options.maxSegmentDuration ?? DEFAULT_MAX_DURATION;
  const minWordsBeforeBreak =
    options.minWordsBeforeBreak ?? DEFAULT_MIN_WORDS_BEFORE_BREAK;
  const segments: TranscriptSegment[] = [];
  let current: TimedWord[] = [];

  const flush = () => {
    if (current.length === 0) {
      return;
    }

    const text = current.map((word) => word.word).join(" ");
    segments.push({
      start: current[0]!.start,
      end: current.at(-1)!.end,
      text,
      words: current.map((word) => ({ ...word }))
    });
    current = [];
  };

  for (const word of words) {
    if (current.length > 0) {
      const candidateDuration = word.end - current[0]!.start;
      const previous = current.at(-1)!;
      const shouldBreakBefore =
        current.length >= maxWords ||
        candidateDuration > maxDuration ||
        (current.length >= minWordsBeforeBreak && isStrongPhraseBreak(previous.word));

      if (shouldBreakBefore) {
        flush();
      }
    }

    current.push(word);

    if (
      current.length >= minWordsBeforeBreak &&
      (isStrongPhraseBreak(word.word) || current.length >= maxWords)
    ) {
      flush();
    }
  }

  flush();

  return segments.map((segment, index) => {
    const next = segments[index + 1];
    return {
      ...segment,
      end: next ? Math.min(segment.end, next.start - 0.01) : segment.end
    };
  });
}

function collapseAdjacentDuplicates(words: TimedWord[]) {
  const collapsed: TimedWord[] = [];
  for (const word of words) {
    const previous = collapsed.at(-1);
    if (
      previous &&
      normalizeToken(previous.word) === normalizeToken(word.word) &&
      word.start - previous.end < 0.7
    ) {
      previous.end = Math.max(previous.end, word.end);
      continue;
    }
    collapsed.push({ ...word });
  }
  return collapsed;
}

function longestSuffixPrefixOverlap(previous: string[], current: string[]) {
  const max = Math.min(previous.length, current.length);
  for (let length = max; length > 0; length -= 1) {
    const previousSlice = previous.slice(previous.length - length);
    const currentSlice = current.slice(0, length);
    if (previousSlice.every((word, index) => word && word === currentSlice[index])) {
      return length;
    }
  }
  return 0;
}

function splitWords(text: string) {
  return cleanCaptionText(text)
    .split(/\s+/)
    .map(cleanWord)
    .filter(Boolean);
}

function cleanCaptionText(text: string) {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanWord(word: string) {
  return word.replace(/\s+/g, " ").trim();
}

function normalizeToken(word: string) {
  return word
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function isStrongPhraseBreak(word: string) {
  return /[.!?…:]$/.test(word);
}
