import { describe, expect, it } from "vitest";
import { ProcessError, type runProcess } from "@/server/media/process";
import {
  classifyYtdlpFailure,
  probeYoutubeAccess
} from "@/server/media/ytdlp";

describe("classifyYtdlpFailure", () => {
  it("detects YouTube bot challenges", () => {
    expect(
      classifyYtdlpFailure("ERROR: [youtube] abc: Sign in to confirm you’re not a bot. Use --cookies.")
    ).toBe("bot_challenge");
  });

  it("detects rotated cookies", () => {
    expect(
      classifyYtdlpFailure("The provided YouTube account cookies are no longer valid. They have likely been rotated.")
    ).toBe("cookies_invalid");
  });

  it("detects ffmpeg section crashes", () => {
    expect(classifyYtdlpFailure("ERROR: ffmpeg exited with code -11")).toBe("ffmpeg_crash");
  });

  it("detects PO token restrictions", () => {
    expect(classifyYtdlpFailure("android client https formats require a GVS PO Token")).toBe("po_token_required");
  });
});

describe("probeYoutubeAccess", () => {
  it("returns media blocked when get-url fails after metadata succeeds", async () => {
    const runner: typeof runProcess = async (_command, args) => {
      if (args.includes("--get-url")) {
        throw new ProcessError("yt-dlp", args, {
          stdout: "",
          stderr: "ERROR: [youtube] abc: Sign in to confirm you’re not a bot. Use --cookies.",
          exitCode: 1
        });
      }
      return { stdout: "{}", stderr: "", exitCode: 0 };
    };

    const result = await probeYoutubeAccess(
      {
        url: "https://www.youtube.com/watch?v=abc",
        cookiesPath: "/tmp/cookies.txt"
      },
      runner
    );

    expect(result.ok).toBe(false);
    expect(result.metadata.ok).toBe(true);
    expect(result.subtitles.ok).toBe(true);
    expect(result.media.ok).toBe(false);
    expect(result.media.failureKind).toBe("bot_challenge");
  });
});
