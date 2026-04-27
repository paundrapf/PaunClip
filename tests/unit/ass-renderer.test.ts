import { describe, expect, it } from "vitest";
import { buildAssSubtitles } from "@/server/captions/ass-renderer";
import { DEFAULT_CAPTION_PRESETS } from "@/shared/constants/caption-presets";

describe("buildAssSubtitles", () => {
  it("renders karaoke captions as word-timed dialogue events", () => {
    const style = DEFAULT_CAPTION_PRESETS[0]!.config;
    const ass = buildAssSubtitles(
      {
        language: "id",
        segments: [
          {
            start: 0.5,
            end: 1.4,
            text: "halo semua",
            words: [
              { word: "halo", start: 0.5, end: 0.8 },
              { word: "semua", start: 0.82, end: 1.4 }
            ]
          }
        ]
      },
      { width: 1080, height: 1920, style }
    );

    expect(ass).toContain("Dialogue: 1,0:00:00.50,0:00:00.82");
    expect(ass).toContain("Dialogue: 1,0:00:00.82,0:00:01.40");
  });

  it("applies caption offset without moving before zero", () => {
    const style = DEFAULT_CAPTION_PRESETS[0]!.config;
    const ass = buildAssSubtitles(
      {
        language: "id",
        segments: [
          {
            start: 0.2,
            end: 0.8,
            text: "halo",
            words: [{ word: "halo", start: 0.2, end: 0.8 }]
          }
        ]
      },
      { width: 1080, height: 1920, style, captionOffsetMs: -300 }
    );

    expect(ass).toContain("Dialogue: 1,0:00:00.00,0:00:00.50");
  });
});
