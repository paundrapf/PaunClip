import { describe, expect, it } from "vitest";
import { buildHookFreezeIntroArgs } from "@/server/media/ffmpeg";

describe("buildHookFreezeIntroArgs", () => {
  it("prepends hook audio and freezes the first video frame instead of mixing audio", () => {
    const args = buildHookFreezeIntroArgs({
      inputPath: "captioned.mp4",
      hookAudioPath: "hook.wav",
      outputPath: "master.mp4",
      clipDurationSeconds: 60,
      hookDurationSeconds: 4.8,
      inputHasAudio: true
    });
    const filter = args[args.indexOf("-filter_complex") + 1] ?? "";

    expect(filter).toContain("tpad=start_duration=4.800:start_mode=clone");
    expect(filter).toContain("[hook][clip]concat=n=2:v=0:a=1[a]");
    expect(filter).not.toContain("amix");
    expect(args).toContain("libx264");
  });

  it("creates silent clip audio when the input video has no audio stream", () => {
    const args = buildHookFreezeIntroArgs({
      inputPath: "captioned.mp4",
      hookAudioPath: "hook.wav",
      outputPath: "master.mp4",
      clipDurationSeconds: 12.3456,
      hookDurationSeconds: 2,
      inputHasAudio: false
    });
    const filter = args[args.indexOf("-filter_complex") + 1] ?? "";

    expect(filter).toContain("anullsrc=r=48000:cl=stereo");
    expect(filter).toContain("atrim=0:12.346");
    expect(filter).toContain("tpad=start_duration=2.000:start_mode=clone");
  });
});
