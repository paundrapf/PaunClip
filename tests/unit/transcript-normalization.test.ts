import { describe, expect, it } from "vitest";
import { normalizeTranscriptForShorts } from "@/server/transcription/normalize-transcript";
import type { Transcript } from "@/shared/schemas/session";

describe("normalizeTranscriptForShorts", () => {
  it("deduplicates rolling YouTube subtitle windows", () => {
    const transcript: Transcript = {
      language: "id",
      segments: [
        { start: 0, end: 1.5, text: "halo semua", words: [] },
        { start: 0.8, end: 2.4, text: "semua hari ini", words: [] },
        { start: 1.7, end: 3.4, text: "hari ini kita bahas", words: [] }
      ]
    };

    const normalized = normalizeTranscriptForShorts(transcript);
    const text = normalized.segments.map((segment) => segment.text).join(" ");

    expect(text).toBe("halo semua hari ini kita bahas");
    expect(normalized.segments.every((segment) => segment.words.length > 0)).toBe(true);
  });

  it("keeps caption phrases short for phone-safe rendering", () => {
    const transcript: Transcript = {
      language: "id",
      segments: [
        {
          start: 0,
          end: 8,
          text: "ini cerita panjang yang harus dipotong menjadi caption pendek biar tidak menutupi muka",
          words: []
        }
      ]
    };

    const normalized = normalizeTranscriptForShorts(transcript);

    expect(normalized.segments.length).toBeGreaterThan(1);
    expect(
      normalized.segments.every((segment) => segment.text.split(/\s+/).length <= 6)
    ).toBe(true);
  });

  it("preserves small provider word overlaps to avoid caption drift", () => {
    const transcript: Transcript = {
      language: "id",
      segments: [
        {
          start: 0,
          end: 1,
          text: "aku mau",
          words: [
            { word: "aku", start: 0, end: 0.5 },
            { word: "mau", start: 0.47, end: 0.8 }
          ]
        }
      ]
    };

    const normalized = normalizeTranscriptForShorts(transcript);

    expect(normalized.segments[0]?.words[1]?.start).toBeCloseTo(0.47);
  });
});
