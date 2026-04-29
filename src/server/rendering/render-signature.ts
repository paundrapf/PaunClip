import "server-only";
import { createHash } from "node:crypto";
import type { CaptionStyle } from "@/shared/schemas/caption-style";
import type { Highlight, Transcript } from "@/shared/schemas/session";
import type { ContentPreset, ReframeMode } from "@/shared/reframe";

export type ClipRenderSignatureInput = {
  sourcePath: string;
  sourceMode?: "full" | "section";
  sourceTimeOffsetSeconds?: number;
  sourceSection?: {
    startTime: number;
    endTime: number;
  };
  highlight: Highlight;
  transcript: Transcript;
  captionStyle: CaptionStyle;
  captionOffsetMs?: number;
  captionModel?: string;
  captionProvider?: string;
  aspectRatio: string;
  rendererVersion?: string;
  reframe?: {
    mode?: ReframeMode;
    contentPreset?: ContentPreset;
    faceTrackingMode?: "center_crop" | "mediapipe";
  };
  hook?: {
    enabled?: boolean;
    text?: string;
    provider?: string;
    model?: string;
    voice?: string;
    format?: string;
    introMode?: string;
  };
};

export type ClipRenderMetadata = {
  signature: string;
  versionId?: string;
  renderedAt?: string;
  draft?: ClipDraftMetadata;
  cacheHit?: boolean;
  cropPlan?: unknown;
  error?: unknown;
};

export type ClipDraftMetadata = {
  title?: string;
  startTime?: number;
  endTime?: number;
  hookText?: string;
  captionStyleId?: string;
  updatedAt: string;
};

export function buildClipRenderSignature(input: ClipRenderSignatureInput) {
  return createHash("sha256").update(stableStringify(input)).digest("hex");
}

export function readClipRenderMetadata(renderJson?: string | null): ClipRenderMetadata {
  if (!renderJson) {
    return { signature: "" };
  }

  try {
    const parsed = JSON.parse(renderJson) as Partial<ClipRenderMetadata>;
    return {
      signature: typeof parsed.signature === "string" ? parsed.signature : "",
      versionId: typeof parsed.versionId === "string" ? parsed.versionId : undefined,
      renderedAt: typeof parsed.renderedAt === "string" ? parsed.renderedAt : undefined,
      draft: isDraftMetadata(parsed.draft) ? parsed.draft : undefined,
      cacheHit: typeof parsed.cacheHit === "boolean" ? parsed.cacheHit : undefined,
      cropPlan: parsed.cropPlan,
      error: parsed.error
    };
  } catch {
    return { signature: "" };
  }
}

export function buildClipRenderMetadata(input: {
  signature: string;
  versionId?: string;
  draft?: ClipDraftMetadata;
  cacheHit?: boolean;
  cropPlan?: unknown;
}) {
  return {
    signature: input.signature,
    versionId: input.versionId,
    renderedAt: new Date().toISOString(),
    draft: input.draft,
    cacheHit: input.cacheHit,
    cropPlan: input.cropPlan
  } satisfies ClipRenderMetadata;
}

function isDraftMetadata(value: unknown): value is ClipDraftMetadata {
  if (!value || typeof value !== "object") {
    return false;
  }
  const draft = value as Partial<ClipDraftMetadata>;
  return typeof draft.updatedAt === "string";
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
