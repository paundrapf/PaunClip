import { describe, expect, it } from "vitest";
import { transcriptFromVerboseJson } from "@/server/transcription/openai-transcriber";

describe("transcriptFromVerboseJson", () => {
  it("preserves provider word timestamps for realtime captions", () => {
    const transcript = transcriptFromVerboseJson(
      {
        words: [
          { word: "halo", start: 1.1, end: 1.32 },
          { word: "semua", start: 1.34, end: 1.72 },
          { word: "ya", start: 1.8, end: 1.95 }
        ]
      },
      "id"
    );

    expect(transcript.segments[0]?.words[0]?.start).toBe(1.1);
    expect(transcript.segments[0]?.words.at(-1)?.end).toBe(1.95);
  });
});
