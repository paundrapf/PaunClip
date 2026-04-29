import type { CaptionStyle } from "@/shared/schemas/caption-style";
import type { Highlight, Transcript } from "@/shared/schemas/session";
import type { AIProviderConfig } from "@/shared/schemas/settings";
import type { ContentPreset, ReframeMode } from "@/shared/reframe";

export type RenderClipInput = {
  sessionId: string;
  jobId?: string;
  clipId?: string;
  versionId?: string;
  sourcePath: string;
  sourceMode?: "full" | "section";
  sourceTimeOffsetSeconds?: number;
  highlightId: string;
  highlight: Highlight;
  transcript: Transcript;
  captionStyle: CaptionStyle;
  captionConfig?: AIProviderConfig;
  captionOffsetMs?: number;
  language?: string;
  onLog?: (message: string, data?: Record<string, unknown>) => Promise<void>;
  hookAudioPath?: string;
  contentPreset?: ContentPreset;
  reframeMode?: ReframeMode;
};

export type RenderClipOutput = {
  clipId: string;
  masterPath: string;
  thumbnailPath: string;
  duration: number;
  fileSizeMb: number;
  captionBurned: boolean;
  hookAdded: boolean;
  cropPlan?: Record<string, unknown>;
};

export interface ClipRenderer {
  render(input: RenderClipInput): Promise<RenderClipOutput>;
}
