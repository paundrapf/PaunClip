import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { runProcess } from "@/server/media/process";
import { getFfmpegCommand } from "@/server/media/tool-resolver";
import { sessionPath } from "@/server/storage/paths";

const FRAME_WIDTH = 320;
const FRAME_HEIGHT = 180;
const SAMPLE_FPS = 2;
const MAX_SAMPLE_SECONDS = 90;

export type SmartFaceCropPlan =
  | {
      type: "smart_face";
      cropCenterRatio: number;
      confidence: number;
      skinRatio: number;
      spreadRatio: number;
      sampledFrames: number;
      detector: "skin_tone_fast_v1";
      fallback?: false;
    }
  | {
      type: "fallback";
      mode: "full_frame_blur";
      reason: string;
      confidence?: number;
      sampledFrames?: number;
      detector: "skin_tone_fast_v1";
      fallback: true;
    };

export async function buildSmartFaceCropPlan(input: {
  sessionId: string;
  sourcePath: string;
  startTime: number;
  endTime: number;
  clipId?: string;
  jobId?: string;
  onLog?: (message: string, data?: Record<string, unknown>) => Promise<void>;
}): Promise<SmartFaceCropPlan> {
  const duration = Math.max(0.1, input.endTime - input.startTime);
  const sampleDuration = Math.min(MAX_SAMPLE_SECONDS, duration);
  const analysisId = (input.clipId ?? randomUUID()).replace(/[^a-zA-Z0-9_-]/g, "_");
  const tempDir = sessionPath(input.sessionId, "temp", "vision", analysisId);
  const rawPath = path.join(tempDir, "frames.rgb");

  await mkdir(tempDir, { recursive: true });

  try {
    await runProcess(
      getFfmpegCommand(),
      [
        "-y",
        "-ss",
        String(Math.max(0, input.startTime)),
        "-t",
        String(sampleDuration),
        "-i",
        input.sourcePath,
        "-an",
        "-vf",
        `fps=${SAMPLE_FPS},scale=${FRAME_WIDTH}:${FRAME_HEIGHT}:force_original_aspect_ratio=decrease,pad=${FRAME_WIDTH}:${FRAME_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black`,
        "-pix_fmt",
        "rgb24",
        "-f",
        "rawvideo",
        rawPath
      ],
      { jobId: input.jobId, timeoutMs: 120_000 }
    );

    const frames = await readFile(rawPath);
    const plan = analyzeRgbFramesForFaceCrop(frames, FRAME_WIDTH, FRAME_HEIGHT);
    if (plan.type === "fallback") {
      await input.onLog?.("Smart face tracking unavailable; using full-frame fallback", {
        reason: plan.reason,
        confidence: plan.confidence,
        sampledFrames: plan.sampledFrames
      });
    } else {
      await input.onLog?.("Smart face crop planned", {
        cropCenterRatio: plan.cropCenterRatio,
        confidence: plan.confidence,
        sampledFrames: plan.sampledFrames
      });
    }
    return plan;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await input.onLog?.("Smart face tracking unavailable; using full-frame fallback", {
      reason: message
    });
    return {
      type: "fallback",
      mode: "full_frame_blur",
      reason: message,
      detector: "skin_tone_fast_v1",
      fallback: true
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function analyzeRgbFramesForFaceCrop(
  frames: Buffer,
  width: number,
  height: number
): SmartFaceCropPlan {
  const frameBytes = width * height * 3;
  const frameCount = Math.floor(frames.length / frameBytes);
  if (!frameCount) {
    return fallback("No sample frames were generated.", undefined, 0);
  }

  const bins = new Array(32).fill(0) as number[];
  let sampledPixels = 0;
  let skinPixels = 0;
  const yStart = Math.floor(height * 0.08);
  const yEnd = Math.floor(height * 0.78);

  for (let frame = 0; frame < frameCount; frame += 1) {
    const frameOffset = frame * frameBytes;
    for (let y = yStart; y < yEnd; y += 4) {
      for (let x = 0; x < width; x += 4) {
        const offset = frameOffset + (y * width + x) * 3;
        const r = frames[offset] ?? 0;
        const g = frames[offset + 1] ?? 0;
        const b = frames[offset + 2] ?? 0;
        sampledPixels += 1;
        if (!isSkinLikePixel(r, g, b)) {
          continue;
        }
        skinPixels += 1;
        const bin = Math.min(bins.length - 1, Math.floor((x / width) * bins.length));
        bins[bin] += 1;
      }
    }
  }

  const skinRatio = sampledPixels ? skinPixels / sampledPixels : 0;
  const totalWeight = bins.reduce((sum, value) => sum + value, 0);
  if (skinRatio < 0.004 || totalWeight < frameCount * 8) {
    return fallback("No reliable face-like region was detected.", skinRatio, frameCount);
  }

  const weightedX = bins.reduce((sum, value, index) => {
    const center = ((index + 0.5) / bins.length) * width;
    return sum + center * value;
  }, 0);
  const centerX = weightedX / totalWeight;
  const variance = bins.reduce((sum, value, index) => {
    const center = ((index + 0.5) / bins.length) * width;
    return sum + (center - centerX) ** 2 * value;
  }, 0) / totalWeight;
  const spreadRatio = Math.sqrt(variance) / width;

  if (spreadRatio > 0.24) {
    return fallback("Detected subjects are too spread out for a safe crop.", skinRatio, frameCount);
  }

  const cropCenterRatio = Math.min(0.85, Math.max(0.15, centerX / width));
  const confidence = Math.min(0.98, Math.max(0.05, skinRatio * 12 + (0.24 - spreadRatio)));

  return {
    type: "smart_face",
    cropCenterRatio,
    confidence: Number(confidence.toFixed(4)),
    skinRatio: Number(skinRatio.toFixed(4)),
    spreadRatio: Number(spreadRatio.toFixed(4)),
    sampledFrames: frameCount,
    detector: "skin_tone_fast_v1"
  };
}

function fallback(reason: string, confidence: number | undefined, sampledFrames?: number): SmartFaceCropPlan {
  return {
    type: "fallback",
    mode: "full_frame_blur",
    reason,
    confidence,
    sampledFrames,
    detector: "skin_tone_fast_v1",
    fallback: true
  };
}

function isSkinLikePixel(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

  return (
    y > 35 &&
    r > 55 &&
    g > 35 &&
    b > 18 &&
    max - min > 12 &&
    r >= g &&
    r > b &&
    cr >= 133 &&
    cr <= 183 &&
    cb >= 77 &&
    cb <= 142
  );
}
