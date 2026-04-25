import "server-only";
import type { Transcript, TranscriptSegment } from "@/shared/schemas/session";

export function parseSrt(input: string, language = "id"): Transcript {
  const blocks = input
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const segments: TranscriptSegment[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").filter(Boolean);
    const timingLine = lines.find((line) => line.includes("-->"));
    if (!timingLine) {
      continue;
    }

    const [rawStart, rawEnd] = timingLine.split("-->").map((value) => value.trim());
    const text = lines
      .slice(lines.indexOf(timingLine) + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .trim();

    segments.push({
      start: parseSrtTime(rawStart),
      end: parseSrtTime(rawEnd),
      text,
      words: []
    });
  }

  return { language, segments };
}

export function transcriptToSrt(transcript: Transcript) {
  return transcript.segments
    .map((segment, index) =>
      [
        String(index + 1),
        `${formatSrtTime(segment.start)} --> ${formatSrtTime(segment.end)}`,
        segment.text,
        ""
      ].join("\n")
    )
    .join("\n");
}

export function sliceTranscript(transcript: Transcript, start: number, end: number) {
  return {
    ...transcript,
    segments: transcript.segments
      .filter((segment) => segment.end >= start && segment.start <= end)
      .map((segment) => ({
        ...segment,
        start: Math.max(0, segment.start - start),
        end: Math.max(0, segment.end - start),
        words: segment.words.map((word) => ({
          ...word,
          start: Math.max(0, word.start - start),
          end: Math.max(0, word.end - start)
        }))
      }))
  };
}

function parseSrtTime(value: string) {
  const [hours, minutes, rest] = value.split(":");
  const [seconds, millis = "0"] = rest.replace(",", ".").split(".");
  return (
    Number(hours) * 3600 +
    Number(minutes) * 60 +
    Number(seconds) +
    Number(millis.padEnd(3, "0").slice(0, 3)) / 1000
  );
}

function formatSrtTime(value: number) {
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = Math.floor(value % 60);
  const millis = Math.round((value - Math.floor(value)) * 1000);
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${String(millis).padStart(3, "0")}`;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
