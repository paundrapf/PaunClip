import { describe, expect, it } from "vitest";
import { parseSrt, transcriptToSrt } from "@/server/transcription/srt";

describe("srt parser", () => {
  it("parses and formats SRT segments", () => {
    const transcript = parseSrt(`1
00:00:01,000 --> 00:00:03,500
Halo semua

2
00:00:04,000 --> 00:00:05,000
Mulai sekarang
`);

    expect(transcript.segments).toHaveLength(2);
    expect(transcript.segments[0]?.start).toBe(1);
    expect(transcript.segments[0]?.end).toBe(3.5);
    expect(transcriptToSrt(transcript)).toContain("00:00:01,000 --> 00:00:03,500");
  });
});
