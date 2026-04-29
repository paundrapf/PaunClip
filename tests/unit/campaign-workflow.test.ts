import { describe, expect, it } from "vitest";
import { buildCampaignSessionConfig } from "@/server/campaign/config";
import { buildHighlightPromptMessages } from "@/server/ai/prompts/highlight-finder";
import { deriveYoutubeThumbnailUrl, normalizeYoutubeChannelTargets, youtubeThumbnailCandidates } from "@/server/media/ytdlp";
import { getCampaignVideoDisplayStatus, shouldSkipCampaignVideoStart } from "@/shared/campaign/status";
import { stringifyJson } from "@/shared/schemas/primitives";
import { sessionConfigSchema } from "@/shared/schemas/session";

describe("campaign workflow helpers", () => {
  it("normalizes channel handles to the latest videos tab by default", () => {
    expect(normalizeYoutubeChannelTargets("https://www.youtube.com/@creatorlynk")).toEqual([
      "https://www.youtube.com/@creatorlynk/videos"
    ]);
    expect(normalizeYoutubeChannelTargets("https://www.youtube.com/@creatorlynk/shorts", "videos")).toEqual([
      "https://www.youtube.com/@creatorlynk/videos"
    ]);
  });

  it("can fetch videos and shorts tabs for mixed campaign mode", () => {
    expect(normalizeYoutubeChannelTargets("youtube.com/channel/UC123", "all")).toEqual([
      "https://www.youtube.com/channel/UC123/videos",
      "https://www.youtube.com/channel/UC123/shorts"
    ]);
    expect(normalizeYoutubeChannelTargets("@creatorlynk", "videos")).toEqual([
      "https://www.youtube.com/@creatorlynk/videos"
    ]);
  });

  it("keeps playlist URLs intact", () => {
    expect(normalizeYoutubeChannelTargets("https://www.youtube.com/playlist?list=PL123", "shorts")).toEqual([
      "https://www.youtube.com/playlist?list=PL123"
    ]);
  });

  it("derives reliable thumbnail URLs from YouTube video ids", () => {
    expect(deriveYoutubeThumbnailUrl("abc123")).toBe("https://i.ytimg.com/vi/abc123/hqdefault.jpg");
    expect(deriveYoutubeThumbnailUrl("abc123", "https://cdn.example/thumb.jpg")).toBe("https://cdn.example/thumb.jpg");
    expect(youtubeThumbnailCandidates("abc123")).toEqual([
      "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
      "https://i.ytimg.com/vi/abc123/mqdefault.jpg"
    ]);
  });

  it("maps campaign video statuses for the workspace", () => {
    expect(getCampaignVideoDisplayStatus({ session: { status: "ready", stage: "ready_to_render", jobs: [] } })).toBe(
      "needs_review"
    );
    expect(getCampaignVideoDisplayStatus({ status: "queued", session: { jobs: [{ status: "queued", progress: 0 }] } })).toBe(
      "queued"
    );
    expect(getCampaignVideoDisplayStatus({ status: "running", session: { jobs: [{ status: "running", progress: 48 }] } })).toBe(
      "processing"
    );
    expect(getCampaignVideoDisplayStatus({ session: { status: "partially_failed", jobs: [] } })).toBe(
      "completed_with_warnings"
    );
    expect(getCampaignVideoDisplayStatus({ session: { status: "failed", jobs: [{ status: "failed" }] } })).toBe("failed");
  });

  it("skips campaign videos that already have a batch session", () => {
    expect(shouldSkipCampaignVideoStart({ status: "new" })).toBe(false);
    expect(shouldSkipCampaignVideoStart({ sessionId: "session_1", session: { status: "ready", stage: "ready_to_render" } })).toBe(
      true
    );
    expect(shouldSkipCampaignVideoStart({ sessionId: "session_2", session: { status: "failed" } })).toBe(true);
  });

  it("builds campaign session config with per-video target clip count", () => {
    const config = buildCampaignSessionConfig({
      campaignConfigJson: stringifyJson(sessionConfigSchema.parse({})),
      batchConfig: {
        clipsPerVideo: 5,
        autoHook: false,
        captionStyleId: "popline",
        renderMode: "review",
        clipLength: "60s_89s",
        language: "id",
        prompt: "Cari momen tentang bisnis"
      },
      targetClipCount: 7
    });

    expect(config.promptMode).toBe("campaign_batch");
    expect(config.targetClipCount).toBe(7);
    expect(config.autoHook).toBe(false);
    expect(config.captionStyleId).toBe("popline");
    expect(config.prompt).toContain("bisnis");
  });

  it("builds split system and user prompt messages for highlight finder", () => {
    const prompt = buildHighlightPromptMessages({
      transcript: {
        language: "id",
        segments: [{ start: 0, end: 12, text: "Ini cerita bisnis yang gagal dulu.", words: [] }]
      },
      userPrompt: "Cari momen kegagalan bisnis",
      targetCount: 3,
      scope: "final",
      promptMode: "campaign_batch"
    });

    expect(prompt.system).toContain("PaunClip");
    expect(prompt.user).toContain("Return exactly 3");
    expect(prompt.user).toContain("Do not start at 0.0");
    expect(prompt.user).toContain("campaign");
    expect(prompt.user).toContain("Cari momen kegagalan bisnis");
    expect(prompt.user).toContain('"highlights" array');
  });
});
