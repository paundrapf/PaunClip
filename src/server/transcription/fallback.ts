import "server-only";
import type { Transcript, TranscriptSegment } from "@/shared/schemas/session";

export function createFallbackTranscript(params: {
  durationSeconds: number;
  language: string;
  label?: string;
}): Transcript {
  const duration = Math.max(1, Math.floor(params.durationSeconds || 60));
  const segmentLength = duration <= 45 ? duration : 30;
  const segments: TranscriptSegment[] = [];

  for (let start = 0; start < duration; start += segmentLength) {
    const end = Math.min(duration, start + segmentLength);
    const index = segments.length + 1;
    segments.push({
      start,
      end,
      text: `${params.label ?? "Fallback transcript"} segment ${index}. Configure a caption provider or upload SRT for real transcript text.`,
      words: []
    });
  }

  return {
    language: params.language,
    segments
  };
}
