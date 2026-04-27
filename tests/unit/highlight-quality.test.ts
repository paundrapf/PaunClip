import { describe, expect, it } from "vitest";
import { improveHighlights, normalizeViralityScore } from "@/server/ai/tasks/highlight-quality";
import type { Highlight, Transcript } from "@/shared/schemas/session";

describe("highlight quality", () => {
  const transcript: Transcript = {
    language: "id",
    segments: Array.from({ length: 180 }).map((_, index) => ({
      start: index * 2,
      end: index * 2 + 1.8,
      text: index % 5 === 4 ? `kalimat selesai ${index}.` : `potongan konteks ${index}`,
      words: []
    }))
  };

  it("normalizes 1-10 score values into 0-100 scale", () => {
    expect(normalizeViralityScore(9)).toBe(90);
    expect(normalizeViralityScore(87)).toBe(87);
  });

  it("expands short podcast highlights so they do not cut context too early", () => {
    const highlights: Highlight[] = [
      {
        startTime: 21,
        endTime: 28,
        title: "Mid thought",
        viralityScore: 9,
        selected: true,
        hookText: "Kenapa ini penting banget buat bisnis?"
      }
    ];

    const [highlight] = improveHighlights(highlights, transcript, 1);

    expect(highlight?.viralityScore).toBe(90);
    expect((highlight?.endTime ?? 0) - (highlight?.startTime ?? 0)).toBeGreaterThanOrEqual(24);
    expect(highlight?.startTime).toBeLessThanOrEqual(21);
  });
});
