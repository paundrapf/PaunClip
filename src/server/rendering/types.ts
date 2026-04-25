import type { CaptionStyle } from "@/shared/schemas/caption-style";
import type { Highlight, Transcript } from "@/shared/schemas/session";

export type RenderClipInput = {
  sessionId: string;
  sourcePath: string;
  highlightId: string;
  highlight: Highlight;
  transcript: Transcript;
  captionStyle: CaptionStyle;
};

export type RenderClipOutput = {
  clipId: string;
  masterPath: string;
  thumbnailPath: string;
  duration: number;
  fileSizeMb: number;
};

export interface ClipRenderer {
  render(input: RenderClipInput): Promise<RenderClipOutput>;
}
