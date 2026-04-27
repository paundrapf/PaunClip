import type { CaptionStyle } from "@/shared/schemas/caption-style";
import type { Highlight, Transcript } from "@/shared/schemas/session";
import type { AIProviderConfig } from "@/shared/schemas/settings";

export type RenderClipInput = {
  sessionId: string;
  jobId?: string;
  clipId?: string;
  versionId?: string;
  sourcePath: string;
  highlightId: string;
  highlight: Highlight;
  transcript: Transcript;
  captionStyle: CaptionStyle;
  captionConfig?: AIProviderConfig;
  captionOffsetMs?: number;
  language?: string;
  onLog?: (message: string, data?: Record<string, unknown>) => Promise<void>;
  hookAudioPath?: string;
};

export type RenderClipOutput = {
  clipId: string;
  masterPath: string;
  thumbnailPath: string;
  duration: number;
  fileSizeMb: number;
  captionBurned: boolean;
  hookAdded: boolean;
};

export interface ClipRenderer {
  render(input: RenderClipInput): Promise<RenderClipOutput>;
}
