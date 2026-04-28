import { describe, expect, it } from "vitest";
import { buildFullFrameBlurFilter, buildPortraitCropFilter } from "@/server/media/ffmpeg";
import { analyzeRgbFramesForFaceCrop } from "@/server/vision/smart-face";
import { resolveReframeMode } from "@/shared/reframe";
import { sessionConfigSchema } from "@/shared/schemas/session";

describe("reframe config", () => {
  it("keeps older session config valid while defaulting new fields", () => {
    const config = sessionConfigSchema.parse({
      faceTrackingMode: "center_crop"
    });

    expect(config.contentPreset).toBe("auto");
    expect(config.reframeMode).toBe("auto_fast");
  });

  it("resolves auto framing by content preset", () => {
    expect(resolveReframeMode({ reframeMode: "auto_fast", contentPreset: "podcast" })).toBe("smart_face");
    expect(resolveReframeMode({ reframeMode: "auto_fast", contentPreset: "tutorial" })).toBe("full_frame_blur");
    expect(resolveReframeMode({ reframeMode: "auto_fast", contentPreset: "sports" })).toBe("center_crop");
  });

  it("builds fast ffmpeg filters", () => {
    expect(buildPortraitCropFilter({ mode: "left_subject" })).toContain(":0:");
    expect(buildPortraitCropFilter({ mode: "right_subject" })).toContain(":iw-ow:");
    expect(buildPortraitCropFilter({ mode: "center_crop", cropCenterRatio: 0.25 })).toContain("iw*0.2500");
    expect(buildFullFrameBlurFilter()).toContain("boxblur");
    expect(buildFullFrameBlurFilter()).toContain("overlay");
  });
});

describe("smart face crop analyzer", () => {
  it("returns a crop plan when a face-like region is visible", () => {
    const width = 64;
    const height = 36;
    const frame = Buffer.alloc(width * height * 3, 0);
    for (let y = 6; y < 26; y += 1) {
      for (let x = 8; x < 24; x += 1) {
        const offset = (y * width + x) * 3;
        frame[offset] = 190;
        frame[offset + 1] = 120;
        frame[offset + 2] = 85;
      }
    }

    const plan = analyzeRgbFramesForFaceCrop(frame, width, height);
    expect(plan.type).toBe("smart_face");
    if (plan.type === "smart_face") {
      expect(plan.cropCenterRatio).toBeLessThan(0.5);
      expect(plan.confidence).toBeGreaterThan(0);
    }
  });

  it("falls back when no face-like region exists", () => {
    const plan = analyzeRgbFramesForFaceCrop(Buffer.alloc(32 * 18 * 3, 0), 32, 18);
    expect(plan.type).toBe("fallback");
  });
});
