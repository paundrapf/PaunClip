import type { CaptionStyle } from "@/shared/schemas/caption-style";
import type { Highlight, Transcript } from "@/shared/schemas/session";

export type RenderClipInput = {
  sessionId: string;
  jobId?: string;
  sourcePath: string;
  highlightId: string;
  highlight: Highlight;
  transcript: Transcript;
  captionStyle: CaptionStyle;
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
